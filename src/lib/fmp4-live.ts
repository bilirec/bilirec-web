import { PREVIEW_KEEP_SECONDS } from "@/lib/preview-dvr"

export function attachFmp4Live(
  video: HTMLVideoElement,
  url: string,
  onGone: () => void
): () => void {
  const ac = new AbortController()
  let stopped = false
  const mediaSource = new MediaSource()
  const objectUrl = URL.createObjectURL(mediaSource)
  video.src = objectUrl

  const stop = () => {
    if (stopped) return
    stopped = true
    ac.abort()
    video.removeAttribute("src")
    video.load()
    URL.revokeObjectURL(objectUrl)
    if (mediaSource.readyState === "open") {
      try {
        mediaSource.endOfStream()
      } catch {
        /* already ended */
      }
    }
  }

  void play(video, url, mediaSource, ac.signal)
    .then(() => {
      if (!stopped) onGone()
    })
    .catch(() => {
      if (!stopped) onGone()
    })

  return stop
}

async function play(
  video: HTMLVideoElement,
  url: string,
  mediaSource: MediaSource,
  signal: AbortSignal
): Promise<void> {
  const sourceOpen = new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      mediaSource.removeEventListener("sourceopen", onOpen)
      resolve()
    }
    mediaSource.addEventListener("sourceopen", onOpen)
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
  })
  await sourceOpen

  const res = await fetch(url, { credentials: "include", signal })
  if (!res.ok || !res.body) {
    throw new Error(`preview media ${res.status}`)
  }

  const reader = res.body.getReader()
  let buf = new Uint8Array(0)
  let init: Uint8Array | null = null
  let sb: SourceBuffer | null = null
  let timescale = 0
  let offsetApplied = false
  let pending: Uint8Array[] = []

  const flush = async () => {
    if (!sb || pending.length === 0) return
    while (pending.length > 0) {
      const next = pending.shift()!
      await append(sb, next)
      trim(video, sb)
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value || value.byteLength === 0) continue
    buf = concat(buf, value)

    if (!init) {
      const size = initSize(buf)
      if (size <= 0 || size > buf.byteLength) continue
      init = buf.subarray(0, size)
      buf = buf.subarray(size)
      timescale = mdhdTimescale(init)
      const mime = `video/mp4; codecs="${codecsFromInit(init)}"`
      sb = mediaSource.addSourceBuffer(mime)
      pending.push(init.slice())
      await flush()
      if (video.paused) {
        void video.play().catch(() => {})
      }
    }

    while (sb) {
      const frag = nextFragment(buf)
      if (!frag) break
      if (!offsetApplied) {
        const tfdt = firstTfdt(frag)
        if (timescale > 0 && tfdt > 0) {
          sb.timestampOffset = -tfdt / timescale
        }
        offsetApplied = true
      }
      pending.push(frag.slice())
      buf = buf.subarray(frag.byteLength)
      await flush()
      if (video.paused) {
        void video.play().catch(() => {})
      }
    }
  }
}

function append(sb: SourceBuffer, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const onUpdate = () => {
      sb.removeEventListener("updateend", onUpdate)
      sb.removeEventListener("error", onError)
      resolve()
    }
    const onError = () => {
      sb.removeEventListener("updateend", onUpdate)
      sb.removeEventListener("error", onError)
      reject(new Error("SourceBuffer error"))
    }
    sb.addEventListener("updateend", onUpdate)
    sb.addEventListener("error", onError)
    sb.appendBuffer(data.slice())
  })
}

function trim(video: HTMLVideoElement, sb: SourceBuffer) {
  if (sb.updating) return
  if (sb.buffered.length === 0) return
  const start = sb.buffered.start(0)
  const end = sb.buffered.end(sb.buffered.length - 1)
  const cut = Math.min(video.currentTime - 1, end - PREVIEW_KEEP_SECONDS)
  if (cut - start < 2) return
  try {
    sb.remove(start, cut)
  } catch {
    /* ignore */
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength)
  out.set(a, 0)
  out.set(b, a.byteLength)
  return out
}

function readU32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
}

function boxType(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7])
}

function walkTop(
  data: Uint8Array,
  start: number,
  end: number,
  fn: (type: string, body: number, next: number) => boolean
): void {
  let o = start
  while (o + 8 <= end) {
    let size = readU32(data, o)
    let header = 8
    if (size === 1) {
      if (o + 16 > end) break
      const hi = readU32(data, o + 8)
      const lo = readU32(data, o + 12)
      size = hi * 0x100000000 + lo
      header = 16
    } else if (size === 0) {
      size = end - o
    }
    if (size < header || o + size > end) break
    if (!fn(boxType(data, o), o + header, o + size)) return
    o += size
  }
}

function initSize(data: Uint8Array): number {
  let end = 0
  let sawMoov = false
  walkTop(data, 0, data.byteLength, (type, _body, next) => {
    if (type === "moov") {
      end = next
      sawMoov = true
      return false
    }
    if (type === "moof" || type === "mdat" || type === "styp") {
      return false
    }
    end = next
    return true
  })
  return sawMoov ? end : 0
}

function nextFragment(data: Uint8Array): Uint8Array | null {
  if (data.byteLength < 8) return null
  let start = 0
  const first = boxType(data, 0)
  if (first === "styp") {
    const size = readU32(data, 0)
    if (size < 8 || size > data.byteLength) return null
    start = size
  }
  if (start + 8 > data.byteLength) return null
  if (boxType(data, start) !== "moof") return null
  const moofSize = readU32(data, start)
  const mdatAt = start + moofSize
  if (mdatAt + 8 > data.byteLength) return null
  if (boxType(data, mdatAt) !== "mdat") return null
  const mdatSize = readU32(data, mdatAt)
  const end = mdatAt + mdatSize
  if (end > data.byteLength) return null
  return data.subarray(0, end)
}

function mdhdTimescale(init: Uint8Array): number {
  const mdhd = findBox(init, "mdhd")
  if (!mdhd || mdhd.byteLength < 16) return 0
  return mdhd[0] === 1 ? readU32(mdhd, 20) : readU32(mdhd, 12)
}

function firstTfdt(frag: Uint8Array): number {
  const tfdt = findBox(frag, "tfdt")
  if (!tfdt || tfdt.byteLength < 8) return 0
  if (tfdt[0] === 1 && tfdt.byteLength >= 12) {
    return readU32(tfdt, 4) * 0x100000000 + readU32(tfdt, 8)
  }
  return readU32(tfdt, 4)
}

function codecsFromInit(init: Uint8Array): string {
  const found: string[] = []
  const avcC = findBox(init, "avcC")
  if (avcC && avcC.byteLength >= 4) {
    found.push(`avc1.${hex2(avcC[1])}${hex2(avcC[2])}${hex2(avcC[3])}`)
  }
  if (findBox(init, "hvcC") || findBox(init, "hev1")) {
    found.push(findBox(init, "hvc1") ? "hvc1.1.6.L93.B0" : "hev1.1.6.L93.B0")
  }
  if (findBox(init, "mp4a") || findBox(init, "esds")) {
    found.push("mp4a.40.2")
  }
  return found.join(", ") || "avc1.64001f,mp4a.40.2"
}

function findBox(data: Uint8Array, want: string): Uint8Array | null {
  for (let i = 0; i + 8 <= data.byteLength; i++) {
    if (boxType(data, i) !== want) continue
    let size = readU32(data, i)
    let header = 8
    if (size === 1) {
      if (i + 16 > data.byteLength) return null
      size = readU32(data, i + 8) * 0x100000000 + readU32(data, i + 12)
      header = 16
    }
    if (size < header || i + size > data.byteLength) return null
    return data.subarray(i + header, i + size)
  }
  return null
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0")
}

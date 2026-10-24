import { warnPreviewSessionEnd } from "@/lib/preview-debug"
import { trimPreviewMseBuffer } from "@/lib/preview-mse-trim"
import { PREVIEW_KEEP_SECONDS_DEFAULT } from "@/lib/preview-settings"

export function attachFmp4Live(
  video: HTMLVideoElement,
  url: string,
  onGone: () => void,
  keepSeconds: number = PREVIEW_KEEP_SECONDS_DEFAULT
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

  void play(video, url, mediaSource, ac.signal, keepSeconds)
    .then(() => {
      if (!stopped) {
        warnPreviewSessionEnd("fmp4_stream_end", video)
        onGone()
      }
    })
    .catch((err: unknown) => {
      if (stopped) return
      const name = err instanceof DOMException ? err.name : undefined
      if (name === "AbortError") return
      warnPreviewSessionEnd("fmp4_append_fail", video, {
        error: err instanceof Error ? err.message : String(err),
      })
      onGone()
    })

  return stop
}

async function play(
  video: HTMLVideoElement,
  url: string,
  mediaSource: MediaSource,
  signal: AbortSignal,
  keepSeconds: number
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
  let initialPlayDone = false

  const tryInitialPlay = () => {
    if (initialPlayDone || !video.paused) return
    initialPlayDone = true
    void video.play().catch(() => {})
  }

  const flush = async () => {
    if (!sb || pending.length === 0) return
    while (pending.length > 0) {
      const next = pending.shift()!
      await append(sb, next)
      await trimPreviewMseBuffer(video, sb, keepSeconds)
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
      tryInitialPlay()
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
      tryInitialPlay()
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

/** AV1CodecConfigurationRecord (av1C) → `av01.P.LLT.DD` for MSE. */
function av1CodecString(av1c: Uint8Array): string | null {
  if (av1c.byteLength < 3) return null
  let o = 0
  if (av1c[0] === 1 && av1c[1] === 0 && av1c[2] === 0 && av1c[3] === 0) {
    o = 4
  }
  if (o >= av1c.byteLength) return null
  if (av1c[o]! & 0x80) {
    o += 1
  }
  if (o + 2 > av1c.byteLength) return null
  const b1 = av1c[o]!
  const b2 = av1c[o + 1]!
  const profile = (b1 >> 5) & 0x07
  const level = b1 & 0x1f
  const tier = (b2 >> 7) & 1
  const highBitdepth = (b2 >> 6) & 1
  const twelveBit = (b2 >> 5) & 1
  const bitDepth = highBitdepth ? (twelveBit ? 12 : 10) : 8
  const levelStr = `${level.toString(10).padStart(2, "0")}${tier === 0 ? "M" : "H"}`
  return `av01.${profile}.${levelStr}.${bitDepth.toString(10).padStart(2, "0")}`
}

function codecsFromInit(init: Uint8Array): string {
  const found: string[] = []
  const av1c = findBox(init, "av1C")
  if (av1c) {
    const av1 = av1CodecString(av1c)
    if (av1) found.push(av1)
  }
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
  if (found.length > 0) return found.join(", ")
  return "avc1.64001f, mp4a.40.2"
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

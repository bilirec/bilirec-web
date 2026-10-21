import { useEffect, useRef, type RefObject } from "react"
import { apiClient } from "@/lib/api"
import { attachFmp4Live } from "@/lib/fmp4-live"

export type PreviewFormat = "flv" | "ts" | "fmp4"

export type PreviewSource = {
  roomId: number
  format: PreviewFormat
}

/** Narrows a stream format string to a preview-supported format, or null. */
export function previewFormatOf(format: string | null | undefined): PreviewFormat | null {
  switch (format) {
    case "flv":
    case "ts":
    case "fmp4":
      return format
    default:
      return null
  }
}

export function previewSseType(raw: string): string | undefined {
  try {
    return (JSON.parse(raw) as { type?: string }).type ?? ""
  } catch {
    return undefined
  }
}

/** Attaches the matching playback engine (dynamically imported); returns its cleanup. */
async function attachEngine(
  video: HTMLVideoElement,
  source: PreviewSource,
  onEngineGone: () => void
): Promise<() => void> {
  const url = apiClient.previewMediaUrl(source.roomId)
  if (source.format === "fmp4") {
    return attachFmp4Live(video, url, onEngineGone)
  }

  if (source.format === "flv") {
    const { default: flvjs } = await import("flv.js")
    const player = flvjs.createPlayer(
      {
        type: "flv",
        url,
        isLive: true,
        hasAudio: true,
        hasVideo: true,
        cors: true,
        withCredentials: true,
      },
      {
        enableStashBuffer: false,
        lazyLoad: false,
      }
    )
    player.on(flvjs.Events.ERROR, () => {
      onEngineGone()
    })
    player.attachMediaElement(video)
    player.load()
    void player.play()
    return () => {
      player.pause()
      player.unload()
      player.detachMediaElement()
      player.destroy()
    }
  }

  const mpegts = (await import("mpegts.js")).default
  const player = mpegts.createPlayer(
    {
      type: "mpegts",
      url,
      isLive: true,
      hasAudio: true,
      hasVideo: true,
      cors: true,
      withCredentials: true,
    },
    {
      enableStashBuffer: false,
      lazyLoad: false,
    }
  )
  player.on(mpegts.Events.ERROR, () => {
    onEngineGone()
  })
  player.attachMediaElement(video)
  player.load()
  void player.play()
  return () => {
    player.pause()
    player.unload()
    player.detachMediaElement()
    player.destroy()
  }
}

export function usePreview(
  videoRef: RefObject<HTMLVideoElement | null>,
  source: PreviewSource | null,
  onEvent: (raw: string) => void
): void {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const roomId = source?.roomId
  const format = source?.format

  useEffect(() => {
    if (roomId == null || !format) return
    const video = videoRef.current
    if (!video) return

    const previewSource: PreviewSource = { roomId, format }
    video.removeAttribute("src")
    video.load()

    let engineCleanup: (() => void) | undefined
    let attachTimer = 0
    let retryTimer = 0
    let disposed = false
    let attachSeq = 0

    const attach = async () => {
      if (disposed) return
      const seq = ++attachSeq
      engineCleanup?.()
      engineCleanup = undefined
      const el = videoRef.current
      if (!el) return
      const cleanup = await attachEngine(el, previewSource, () => {
        window.clearTimeout(retryTimer)
        retryTimer = window.setTimeout(() => void attach(), 400)
      })
      if (disposed || seq !== attachSeq) {
        cleanup()
        return
      }
      engineCleanup = cleanup
    }

    const scheduleAttach = () => {
      window.clearTimeout(attachTimer)
      attachTimer = window.setTimeout(() => void attach(), 250)
    }

    const eventsUrl = apiClient.previewEventsUrl(roomId)
    const es = new EventSource(eventsUrl, { withCredentials: true })
    es.onopen = () => scheduleAttach()
    es.onmessage = (msg) => {
      const raw = msg.data as string
      const type = previewSseType(raw)
      if (type === "segment") {
        engineCleanup?.()
        engineCleanup = undefined
        onEventRef.current(raw)
        scheduleAttach()
        return
      }
      onEventRef.current(raw)
    }

    return () => {
      disposed = true
      window.clearTimeout(attachTimer)
      window.clearTimeout(retryTimer)
      es.close()
      engineCleanup?.()
    }
  }, [roomId, format, videoRef])
}

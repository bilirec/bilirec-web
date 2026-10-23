import { useEffect, useRef, type RefObject } from "react"
import { apiClient } from "@/lib/api"
import { attachFmp4Live } from "@/lib/fmp4-live"
function liveEngineConfig(keepSeconds: number) {
  return {
    enableStashBuffer: false,
    lazyLoad: false,
    liveBufferLatencyChasing: false,
    liveSync: false,
    autoCleanupSourceBuffer: true,
    autoCleanupMaxBackwardDuration: keepSeconds + 15,
    autoCleanupMinBackwardDuration: keepSeconds,
  }
}

export type PreviewFormat = "flv" | "ts" | "fmp4"

export type PreviewSource = {
  roomId: number
  format: PreviewFormat
  audioOnly?: boolean
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

/** Backend returns 409 when the room has no active previewable recording segment. */
async function isPreviewMediaUnavailable(roomId: number): Promise<boolean> {
  try {
    const res = await fetch(`${apiClient.previewMediaUrl(roomId)}?t=${Date.now()}`, {
      credentials: "include",
    })
    if (res.status === 409) {
      await res.body?.cancel()
      return true
    }
    await res.body?.cancel()
    return false
  } catch {
    return false
  }
}

/** Attaches the matching playback engine (dynamically imported); returns its cleanup. */
async function attachEngine(
  video: HTMLVideoElement,
  source: PreviewSource,
  keepSeconds: number,
  onEngineGone: () => void
): Promise<() => void> {
  const url = `${apiClient.previewMediaUrl(source.roomId)}?t=${Date.now()}`
  if (source.format === "fmp4") {
    return attachFmp4Live(video, url, onEngineGone, keepSeconds)
  }

  const engineConfig = liveEngineConfig(keepSeconds)

  const hasVideo = !source.audioOnly

  if (source.format === "flv") {
    const { default: flvjs } = await import("flv.js")
    const player = flvjs.createPlayer(
      {
        type: "flv",
        url,
        isLive: true,
        hasAudio: true,
        hasVideo,
        cors: true,
        withCredentials: true,
      },
      engineConfig
    )
    let stopped = false
    const gone = () => {
      if (!stopped) onEngineGone()
    }
    player.on(flvjs.Events.ERROR, gone)
    player.on(flvjs.Events.LOADING_COMPLETE, gone)
    video.addEventListener("ended", gone)
    player.attachMediaElement(video)
    player.load()
    void player.play()
    return () => {
      stopped = true
      video.removeEventListener("ended", gone)
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
      hasVideo,
      cors: true,
      withCredentials: true,
    },
    engineConfig
  )
  let stopped = false
  const gone = () => {
    if (!stopped) onEngineGone()
  }
  player.on(mpegts.Events.ERROR, gone)
  player.on(mpegts.Events.LOADING_COMPLETE, gone)
  video.addEventListener("ended", gone)
  player.attachMediaElement(video)
  player.load()
  void player.play()
  return () => {
    stopped = true
    video.removeEventListener("ended", gone)
    player.pause()
    player.unload()
    player.detachMediaElement()
    player.destroy()
  }
}

export function usePreview(
  videoRef: RefObject<HTMLVideoElement | null>,
  source: PreviewSource | null,
  keepSeconds: number,
  onEvent: (raw: string) => void,
  onPreviewEnded?: () => void
): void {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const onPreviewEndedRef = useRef(onPreviewEnded)
  onPreviewEndedRef.current = onPreviewEnded
  const roomId = source?.roomId
  const format = source?.format

  useEffect(() => {
    if (roomId == null || !format) return
    const video = videoRef.current
    if (!video) return

    const previewSource: PreviewSource = {
      roomId,
      format,
      audioOnly: source?.audioOnly,
    }
    video.removeAttribute("src")
    video.load()

    let engineCleanup: (() => void) | undefined
    let attachTimer = 0
    let retryTimer = 0
    let disposed = false
    let sessionEnded = false
    let attachSeq = 0
    let eventSource: EventSource | undefined

    const endPreviewSession = () => {
      if (sessionEnded) return
      sessionEnded = true
      window.clearTimeout(attachTimer)
      window.clearTimeout(retryTimer)
      engineCleanup?.()
      engineCleanup = undefined
      eventSource?.close()
      onPreviewEndedRef.current?.()
    }

    const retryAttach = async () => {
      if (disposed || sessionEnded) return
      if (await isPreviewMediaUnavailable(roomId)) {
        endPreviewSession()
        return
      }
      void attach()
    }

    const attach = async () => {
      if (disposed || sessionEnded) return
      const seq = ++attachSeq
      engineCleanup?.()
      engineCleanup = undefined
      const el = videoRef.current
      if (!el) return
      const cleanup = await attachEngine(el, previewSource, keepSeconds, () => {
        window.clearTimeout(retryTimer)
        retryTimer = window.setTimeout(() => void retryAttach(), 400)
      })
      if (disposed || sessionEnded || seq !== attachSeq) {
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
    eventSource = es
    let opened = false
    es.onopen = () => {
      if (opened) return
      opened = true
      scheduleAttach()
    }
    es.onerror = () => {
      void (async () => {
        if (disposed || sessionEnded) return
        if (await isPreviewMediaUnavailable(roomId)) {
          endPreviewSession()
        }
      })()
    }
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
  }, [roomId, format, keepSeconds, videoRef])
}

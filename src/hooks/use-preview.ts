import { useEffect, useRef, type RefObject } from "react"
import { apiClient } from "@/lib/api"
import {
  isAtLiveEdge,
  isSegmentEventType,
  pinnedPlayheadAfterBuffer,
  previewEventTypeOf,
} from "@/lib/preview-sync"

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

/** Attaches the matching playback engine (dynamically imported); returns its cleanup. */
async function attachEngine(
  video: HTMLVideoElement,
  source: PreviewSource,
  onEngineGone: () => void
): Promise<() => void> {
  if (source.format === "flv") {
    const { default: flvjs } = await import("flv.js")
    const player = flvjs.createPlayer(
      {
        type: "flv",
        url: apiClient.previewMediaUrl(source.roomId),
        isLive: true,
        hasAudio: true,
        hasVideo: true,
        cors: true,
        withCredentials: true,
      },
      {
        enableStashBuffer: false,
        lazyLoad: false,
        seekType: "range",
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

  const { default: Hls } = await import("hls.js")
  const hls = new Hls({
    liveDurationInfinity: true,
    startPosition: -1,
    backBufferLength: 180,
    maxLiveSyncPlaybackRate: 1,
    xhrSetup(xhr) {
      xhr.withCredentials = true
    },
  })
  hls.loadSource(apiClient.previewPlaylistUrl(source.roomId))
  hls.attachMedia(video)
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    void video.play()
  })
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (data.fatal) {
      onEngineGone()
    }
  })
  return () => {
    hls.destroy()
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
    let pinnedTime: number | null = null

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
      const type = previewEventTypeOf(raw)
      if (type !== undefined && isSegmentEventType(type)) {
        engineCleanup?.()
        engineCleanup = undefined
        onEventRef.current(raw)
        scheduleAttach()
        return
      }
      onEventRef.current(raw)
    }

    const onSeeking = () => {
      const el = videoRef.current
      if (!el || el.seekable.length === 0) return
      const end = el.seekable.end(el.seekable.length - 1)
      pinnedTime = isAtLiveEdge(el.currentTime, end) ? null : el.currentTime
    }
    const followBuffer = () => {
      const el = videoRef.current
      if (!el || el.seekable.length === 0) return
      const end = el.seekable.end(el.seekable.length - 1)
      const next = pinnedPlayheadAfterBuffer(el.currentTime, pinnedTime, end)
      if (next !== el.currentTime) {
        el.currentTime = next
      }
    }
    video.addEventListener("seeking", onSeeking)
    video.addEventListener("progress", followBuffer)
    video.addEventListener("durationchange", followBuffer)

    return () => {
      disposed = true
      window.clearTimeout(attachTimer)
      window.clearTimeout(retryTimer)
      video.removeEventListener("seeking", onSeeking)
      video.removeEventListener("progress", followBuffer)
      video.removeEventListener("durationchange", followBuffer)
      es.close()
      engineCleanup?.()
    }
  }, [roomId, format, videoRef])
}

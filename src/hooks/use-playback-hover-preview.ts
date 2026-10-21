import { useEffect, useState, type RefObject } from "react"

const PREVIEW_W = 160
const PREVIEW_H = 90
const SEEK_CATCHUP_SEC = 0.5
const PREVIEW_REQUEST = "mediapreviewrequest"

type PreviewRequestDetail = number | null

function isPreviewTime(detail: unknown): detail is number {
  return typeof detail === "number" && Number.isFinite(detail)
}

function sizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(PREVIEW_W * dpr)
  const h = Math.round(PREVIEW_H * dpr)
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function drawFrame(canvas: HTMLCanvasElement | null, video: HTMLVideoElement): boolean {
  if (!canvas || video.videoWidth <= 0 || video.videoHeight <= 0) return false
  const ctx = sizeCanvas(canvas)
  if (!ctx) return false
  try {
    ctx.drawImage(video, 0, 0, PREVIEW_W, PREVIEW_H)
    return true
  } catch {
    return false
  }
}

function releaseVideo(video: HTMLVideoElement | null) {
  if (!video) return
  video.removeAttribute("src")
  video.load()
}

/**
 * Hover-lazy playback preview: a hidden <video> seeks via 206 Range on
 * media-chrome's mediapreviewrequest, then paints the decoded frame to canvas.
 */
export function usePlaybackHoverPreview({
  hostRef,
  canvasRef,
  src,
  enabled,
  crossOrigin,
}: {
  hostRef: RefObject<HTMLElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  src: string
  enabled: boolean
  crossOrigin: "anonymous" | "use-credentials"
}): { loading: boolean; hasFrame: boolean } {
  const [loading, setLoading] = useState(false)
  const [hasFrame, setHasFrame] = useState(false)

  useEffect(() => {
    if (!enabled || !src) {
      setLoading(false)
      return
    }

    const host = hostRef.current
    if (!host) return

    let video: HTMLVideoElement | null = null
    let hovering = false
    let seeking = false
    let targetTime = 0
    let disposed = false

    const ensureVideo = () => {
      if (video) return video
      const el = document.createElement("video")
      el.muted = true
      el.defaultMuted = true
      el.playsInline = true
      el.preload = "auto"
      el.crossOrigin = crossOrigin
      el.disablePictureInPicture = true
      el.addEventListener("seeked", onSeeked)
      el.addEventListener("loadeddata", onLoadedData)
      el.addEventListener("error", onError)
      el.src = src
      video = el
      return el
    }

    const seekToTarget = () => {
      if (disposed || !hovering) {
        seeking = false
        setLoading(false)
        return
      }
      const el = ensureVideo()
      if (el.readyState < HTMLMediaElement.HAVE_METADATA) {
        seeking = true
        setLoading(true)
        return
      }
      seeking = true
      setLoading(true)
      if (
        Math.abs(el.currentTime - targetTime) < 0.04 &&
        el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        onSeeked()
        return
      }
      el.currentTime = targetTime
    }

    const onSeeked = () => {
      if (disposed) return
      seeking = false
      if (!hovering) {
        setLoading(false)
        return
      }
      const el = video
      if (!el) {
        setLoading(false)
        return
      }
      if (drawFrame(canvasRef.current, el)) {
        setHasFrame(true)
      }
      if (Math.abs(el.currentTime - targetTime) > SEEK_CATCHUP_SEC) {
        seekToTarget()
        return
      }
      setLoading(false)
    }

    const onLoadedData = () => {
      if (disposed || !hovering) return
      seekToTarget()
    }

    const onError = () => {
      seeking = false
      setLoading(false)
    }

    const onPreviewRequest = (evt: Event) => {
      const detail = (evt as CustomEvent<PreviewRequestDetail>).detail
      if (detail == null) {
        hovering = false
        setLoading(false)
        return
      }
      if (!isPreviewTime(detail)) return
      hovering = true
      targetTime = Math.max(0, detail)
      setLoading(true)
      if (seeking) return
      seekToTarget()
    }

    host.addEventListener(PREVIEW_REQUEST, onPreviewRequest)

    return () => {
      disposed = true
      host.removeEventListener(PREVIEW_REQUEST, onPreviewRequest)
      if (video) {
        video.removeEventListener("seeked", onSeeked)
        video.removeEventListener("loadeddata", onLoadedData)
        video.removeEventListener("error", onError)
      }
      releaseVideo(video)
      video = null
      setLoading(false)
    }
  }, [canvasRef, crossOrigin, enabled, hostRef, src])

  useEffect(() => {
    if (!enabled) setHasFrame(false)
  }, [enabled])

  return { loading, hasFrame }
}

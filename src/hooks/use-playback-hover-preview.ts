import { getObjectFitContentBox } from "@/lib/playback-layout"
import { useEffect, useState, type RefObject } from "react"

const PREVIEW_W = 160
const PREVIEW_H = 90
const SEEK_CATCHUP_SEC = 0.5
const TIME_EPS = 0.04
const SEEK_STALL_MS = 12_000
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
    const { left, top, width, height } = getObjectFitContentBox(
      {
        clientWidth: PREVIEW_W,
        clientHeight: PREVIEW_H,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      },
      "contain"
    )
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H)
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, left, top, width, height)
    return true
  } catch {
    return false
  }
}

function createHiddenVideo(crossOrigin: "anonymous" | "use-credentials"): HTMLVideoElement {
  const el = document.createElement("video")
  el.muted = true
  el.defaultMuted = true
  el.playsInline = true
  el.preload = "auto"
  el.crossOrigin = crossOrigin
  el.disablePictureInPicture = true
  el.setAttribute("aria-hidden", "true")
  el.tabIndex = -1
  Object.assign(el.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
    left: "0",
    top: "0",
    zIndex: "-1",
  })
  document.body.appendChild(el)
  return el
}

function destroyVideo(video: HTMLVideoElement | null) {
  if (!video) return
  video.pause()
  video.removeAttribute("src")
  video.load()
  video.remove()
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

    let disposed = false
    let host: HTMLElement | null = null
    let video: HTMLVideoElement | null = null
    let hovering = false
    let seeking = false
    let targetTime = 0
    let stallTimer: ReturnType<typeof setTimeout> | null = null
    let hostRetryRaf = 0

    const clearStallTimer = () => {
      if (stallTimer != null) {
        clearTimeout(stallTimer)
        stallTimer = null
      }
    }

    const armStallTimer = () => {
      clearStallTimer()
      stallTimer = setTimeout(() => {
        if (disposed || !seeking) return
        resetVideo()
        if (hovering) seekToTarget()
      }, SEEK_STALL_MS)
    }

    const resetVideo = () => {
      clearStallTimer()
      seeking = false
      if (video) {
        video.removeEventListener("seeked", onSeeked)
        video.removeEventListener("loadeddata", onLoadedData)
        video.removeEventListener("error", onError)
        destroyVideo(video)
        video = null
      }
    }

    const ensureVideo = () => {
      if (video) return video
      const el = createHiddenVideo(crossOrigin)
      el.addEventListener("seeked", onSeeked)
      el.addEventListener("loadeddata", onLoadedData)
      el.addEventListener("error", onError)
      el.src = src
      video = el
      return el
    }

    const finishSeekCycle = () => {
      clearStallTimer()
      seeking = false
      setLoading(false)
    }

    const seekToTarget = () => {
      if (disposed || !hovering) {
        finishSeekCycle()
        return
      }
      const el = ensureVideo()
      if (el.readyState < HTMLMediaElement.HAVE_METADATA) {
        seeking = true
        setLoading(true)
        armStallTimer()
        return
      }
      seeking = true
      setLoading(true)
      if (
        Math.abs(el.currentTime - targetTime) < TIME_EPS &&
        el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        onSeeked()
        return
      }
      armStallTimer()
      el.currentTime = targetTime
    }

    const onSeeked = () => {
      if (disposed) return
      if (!hovering) {
        finishSeekCycle()
        return
      }
      const el = video
      if (!el) {
        finishSeekCycle()
        return
      }
      if (drawFrame(canvasRef.current, el)) {
        setHasFrame(true)
      }
      if (Math.abs(el.currentTime - targetTime) > SEEK_CATCHUP_SEC) {
        seekToTarget()
        return
      }
      finishSeekCycle()
    }

    const onLoadedData = () => {
      if (disposed || !hovering) return
      seekToTarget()
    }

    const onError = () => {
      resetVideo()
      setLoading(false)
      if (hovering) seekToTarget()
    }

    const onPreviewRequest = (evt: Event) => {
      const detail = (evt as CustomEvent<PreviewRequestDetail>).detail
      if (detail == null) {
        hovering = false
        finishSeekCycle()
        return
      }
      if (!isPreviewTime(detail)) return
      hovering = true
      targetTime = Math.max(0, detail)
      if (!seeking) setLoading(true)
      if (seeking) return
      seekToTarget()
    }

    const bindHost = (node: HTMLElement) => {
      host = node
      node.addEventListener(PREVIEW_REQUEST, onPreviewRequest)
    }

    const unbindHost = () => {
      if (!host) return
      host.removeEventListener(PREVIEW_REQUEST, onPreviewRequest)
      host = null
    }

    const tryBindHost = () => {
      const node = hostRef.current
      if (!node) return false
      if (host === node) return true
      unbindHost()
      bindHost(node)
      return true
    }

    if (!tryBindHost()) {
      hostRetryRaf = requestAnimationFrame(() => {
        if (!disposed) tryBindHost()
      })
    }

    return () => {
      disposed = true
      if (hostRetryRaf) cancelAnimationFrame(hostRetryRaf)
      unbindHost()
      resetVideo()
      setLoading(false)
    }
  }, [canvasRef, crossOrigin, enabled, hostRef, src])

  useEffect(() => {
    if (!enabled) setHasFrame(false)
  }, [enabled])

  return { loading, hasFrame }
}

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import {
  PREVIEW_KEEP_SECONDS,
  jumpPreviewToLive,
  previewBufferedWindow,
  previewLiveHysteresis,
  previewSliderFromBehind,
  seekPreviewFromSlider,
} from "@/lib/preview-dvr"

export type PreviewDvrState = {
  slider: number
  behind: number
  nearLive: boolean
  seek: (slider: number) => void
  goLive: () => void
}

const LIVE: Omit<PreviewDvrState, "seek" | "goLive"> = {
  slider: PREVIEW_KEEP_SECONDS,
  behind: 0,
  nearLive: true,
}

export function usePreviewDvr(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean
): PreviewDvrState {
  const [snap, setSnap] = useState(LIVE)
  const snapRef = useRef(snap)
  snapRef.current = snap
  const liveRef = useRef(true)

  const sync = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    const w = previewBufferedWindow(el)
    const behind = w ? Math.max(0, w.end - el.currentTime) : 0
    const nearLive = previewLiveHysteresis(behind, liveRef.current)
    liveRef.current = nearLive
    const displayBehind = nearLive ? 0 : behind
    const slider = previewSliderFromBehind(displayBehind, nearLive)
    const prev = snapRef.current
    if (nearLive && prev.nearLive) return
    if (!nearLive && prev.nearLive === nearLive && Math.abs(prev.behind - displayBehind) < 0.2) {
      return
    }
    setSnap({ slider, behind: displayBehind, nearLive })
  }, [videoRef])

  useEffect(() => {
    if (!enabled) return
    const el = videoRef.current
    if (!el) return
    liveRef.current = true
    setSnap(LIVE)
    el.addEventListener("timeupdate", sync)
    el.addEventListener("seeked", sync)
    sync()
    return () => {
      el.removeEventListener("timeupdate", sync)
      el.removeEventListener("seeked", sync)
    }
  }, [enabled, sync, videoRef])

  const seek = useCallback(
    (slider: number) => {
      const el = videoRef.current
      if (!el) return
      liveRef.current = false
      const next = Math.min(PREVIEW_KEEP_SECONDS, Math.max(0, slider))
      setSnap({
        slider: next,
        behind: PREVIEW_KEEP_SECONDS - next,
        nearLive: false,
      })
      seekPreviewFromSlider(el, next)
    },
    [videoRef]
  )

  const goLive = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    liveRef.current = true
    setSnap(LIVE)
    jumpPreviewToLive(el)
    void el.play().catch(() => {})
  }, [videoRef])

  return { ...snap, seek, goLive }
}

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import {
  jumpPreviewToLive,
  previewBehindFromSlider,
  previewDvrWindow,
  previewDvrWindowForUi,
  previewLiveHysteresis,
  previewRewindDepthSec,
  previewSliderFromBehind,
  resetPreviewPlaybackRate,
  seekPreviewFromSlider,
} from "@/lib/preview-dvr"

export type PreviewDvrState = {
  slider: number
  behind: number
  /** Decoded rewind span in whole seconds (grows toward configured max). */
  bufferDepthSec: number
  nearLive: boolean
  seek: (slider: number) => void
  goLive: () => void
  /** Call after any preview seek outside this hook (e.g. media-chrome). */
  leaveLiveSync: () => void
}

function liveSnap(keepSeconds: number): Omit<PreviewDvrState, "seek" | "goLive" | "leaveLiveSync"> {
  return { slider: keepSeconds, behind: 0, bufferDepthSec: 0, nearLive: true }
}

export function usePreviewDvr(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  keepSeconds: number
): PreviewDvrState {
  const [snap, setSnap] = useState(() => liveSnap(keepSeconds))
  const snapRef = useRef(snap)
  snapRef.current = snap
  const liveRef = useRef(true)
  const sessionStartedRef = useRef(false)
  /** Snapshot at pause; stops slider / behind drifting as the live edge advances. */
  const pausedWindowRef = useRef<{ start: number; end: number } | null>(null)

  const leaveLiveSync = useCallback(() => {
    liveRef.current = false
  }, [])

  const applySnap = useCallback(
    (displayBehind: number, nearLive: boolean, depth: number) => {
      const slider = previewSliderFromBehind(displayBehind, nearLive, depth, keepSeconds)
      const bufferDepthSec = Math.floor(depth)
      const prev = snapRef.current
      if (nearLive && prev.nearLive && prev.bufferDepthSec === bufferDepthSec) return
      if (
        !nearLive &&
        prev.nearLive === nearLive &&
        Math.abs(prev.behind - displayBehind) < 0.2 &&
        prev.bufferDepthSec === bufferDepthSec
      ) {
        return
      }
      setSnap({ slider, behind: displayBehind, bufferDepthSec, nearLive })
    },
    [keepSeconds]
  )

  const sync = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    const w = previewDvrWindowForUi(el, pausedWindowRef.current)
    const depth = previewRewindDepthSec(w, keepSeconds)
    const behind = w ? Math.max(0, w.end - el.currentTime) : 0

    if (el.paused) {
      // Never show LIVE while paused — edge seeks stay scrubbable; avoids LIVE + spinner confusion.
      applySnap(behind, false, depth)
      return
    }

    const nearLive = previewLiveHysteresis(behind, liveRef.current)
    if (nearLive) {
      resetPreviewPlaybackRate(el)
    }
    liveRef.current = nearLive
    const displayBehind = nearLive ? 0 : behind
    applySnap(displayBehind, nearLive, depth)
  }, [videoRef, keepSeconds, applySnap])

  const syncRef = useRef(sync)
  syncRef.current = sync

  const onPause = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    const w = previewDvrWindow(el)
    if (w) {
      pausedWindowRef.current = { start: w.start, end: w.end }
    }
    syncRef.current()
  }, [videoRef])

  const onPlay = useCallback(() => {
    pausedWindowRef.current = null
    syncRef.current()
  }, [])

  useEffect(() => {
    if (!enabled) {
      sessionStartedRef.current = false
      pausedWindowRef.current = null
      return
    }
    const el = videoRef.current
    if (!el) return

    if (!sessionStartedRef.current) {
      sessionStartedRef.current = true
      liveRef.current = true
      pausedWindowRef.current = null
      setSnap(liveSnap(keepSeconds))
    }

    const onTimeUpdate = () => syncRef.current()
    const onSeeked = () => syncRef.current()
    el.addEventListener("timeupdate", onTimeUpdate)
    el.addEventListener("seeked", onSeeked)
    el.addEventListener("pause", onPause)
    el.addEventListener("play", onPlay)
    syncRef.current()

    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate)
      el.removeEventListener("seeked", onSeeked)
      el.removeEventListener("pause", onPause)
      el.removeEventListener("play", onPlay)
    }
  }, [enabled, onPause, onPlay, videoRef, keepSeconds])

  const seek = useCallback(
    (slider: number) => {
      const el = videoRef.current
      if (!el) return
      liveRef.current = false
      const next = Math.min(keepSeconds, Math.max(0, slider))
      const w = previewDvrWindowForUi(el, pausedWindowRef.current)
      const depth = previewRewindDepthSec(w, keepSeconds)
      const behind = previewBehindFromSlider(next, depth, keepSeconds)
      setSnap({
        slider: next,
        behind,
        bufferDepthSec: Math.floor(depth),
        nearLive: false,
      })
      const stayPaused = el.paused
      seekPreviewFromSlider(el, next, keepSeconds, w)
      if (stayPaused) {
        el.pause()
      }
    },
    [videoRef, keepSeconds]
  )

  const goLive = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    pausedWindowRef.current = null
    liveRef.current = true
    setSnap(liveSnap(keepSeconds))
    resetPreviewPlaybackRate(el)
    jumpPreviewToLive(el)
    void el.play().catch(() => {})
  }, [videoRef, keepSeconds])

  return { ...snap, seek, goLive, leaveLiveSync }
}

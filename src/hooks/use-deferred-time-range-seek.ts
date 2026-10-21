import { useEffect, type RefObject } from "react"

const SEEK_REQUEST = "mediaseekrequest"

function isSeekTime(detail: unknown): detail is number {
  return typeof detail === "number" && Number.isFinite(detail)
}

function eventTouchesTimeRange(event: Event): boolean {
  return event.composedPath().some(
    (node) => node instanceof HTMLElement && node.localName === "media-time-range"
  )
}

/**
 * While the user drags media-time-range, block mediaseekrequest until pointerup
 * so playback only jumps once on release (preview can still update while dragging).
 */
export function useDeferredTimeRangeSeek({
  hostRef,
  videoRef,
  enabled,
}: {
  hostRef: RefObject<HTMLElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  enabled: boolean
}) {
  useEffect(() => {
    if (!enabled) return

    let scrubbing = false
    let pendingTime: number | null = null

    const commit = () => {
      if (!scrubbing) return
      scrubbing = false
      const video = videoRef.current
      const time = pendingTime
      pendingTime = null
      if (!video || time == null) return
      const duration = video.duration
      const max = Number.isFinite(duration) && duration > 0 ? duration : time
      video.currentTime = Math.max(0, Math.min(max, time))
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!eventTouchesTimeRange(event)) return
      scrubbing = true
      pendingTime = null
    }

    const onSeekRequest = (event: Event) => {
      if (!scrubbing) return
      const detail = (event as CustomEvent<unknown>).detail
      if (isSeekTime(detail)) pendingTime = detail
      event.stopImmediatePropagation()
      event.preventDefault()
    }

    const onPointerEnd = () => {
      commit()
    }

    const attach = (host: HTMLElement) => {
      host.addEventListener("pointerdown", onPointerDown, true)
      host.addEventListener(SEEK_REQUEST, onSeekRequest, true)
    }

    const detach = (host: HTMLElement) => {
      host.removeEventListener("pointerdown", onPointerDown, true)
      host.removeEventListener(SEEK_REQUEST, onSeekRequest, true)
    }

    let host = hostRef.current
    let raf = 0
    if (host) {
      attach(host)
    } else {
      raf = requestAnimationFrame(() => {
        host = hostRef.current
        if (host) attach(host)
      })
    }

    window.addEventListener("pointerup", onPointerEnd)
    window.addEventListener("pointercancel", onPointerEnd)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (host) detach(host)
      window.removeEventListener("pointerup", onPointerEnd)
      window.removeEventListener("pointercancel", onPointerEnd)
      scrubbing = false
      pendingTime = null
    }
  }, [enabled, hostRef, videoRef])
}

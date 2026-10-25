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

function pointerWindowForHost(host: HTMLElement | null): Window {
  return host?.ownerDocument?.defaultView ?? window
}

/**
 * While the user drags media-time-range, block mediaseekrequest until pointerup
 * so playback only jumps once on release (preview can still update while dragging).
 */
export function useDeferredTimeRangeSeek({
  hostRef,
  videoRef,
  enabled,
  /** Re-bind when the controls host moves to another document (document PiP). */
  hostDocumentKey = false,
}: {
  hostRef: RefObject<HTMLElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  enabled: boolean
  hostDocumentKey?: boolean
}) {
  useEffect(() => {
    if (!enabled) return

    let scrubbing = false
    let pendingTime: number | null = null
    let unbindPointerEnd = () => {}

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
      const win = pointerWindowForHost(host)
      unbindPointerEnd()
      win.addEventListener("pointerup", onPointerEnd)
      win.addEventListener("pointercancel", onPointerEnd)
      unbindPointerEnd = () => {
        win.removeEventListener("pointerup", onPointerEnd)
        win.removeEventListener("pointercancel", onPointerEnd)
      }
    }

    const detach = (host: HTMLElement) => {
      host.removeEventListener("pointerdown", onPointerDown, true)
      host.removeEventListener(SEEK_REQUEST, onSeekRequest, true)
      unbindPointerEnd()
      unbindPointerEnd = () => {}
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

    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (host) detach(host)
      scrubbing = false
      pendingTime = null
    }
  }, [enabled, hostRef, videoRef, hostDocumentKey])
}

import { useEffect, useState, type RefObject } from "react"

/**
 * Subscribe to `<video>` playback time without re-rendering the whole player shell.
 *
 * Polls `videoRef.current` instead of relying solely on element events: if the
 * media element is ever remounted/replaced (media-chrome re-keying etc.), an
 * event listener captured on the old element would silently freeze the clock,
 * leaving overlay cards hanging past their TTL. Polling always reads the
 * current element, and no-ops (setState bail-out) while the time is unchanged.
 */
export function useVideoPlaybackTime(
  videoRef: RefObject<HTMLVideoElement | null>
): number {
  const [time, setTime] = useState(0)

  useEffect(() => {
    const sync = () => {
      const video = videoRef.current
      if (!video) return
      setTime((prev) => (prev === video.currentTime ? prev : video.currentTime))
    }
    sync()
    const id = window.setInterval(sync, 250)
    return () => window.clearInterval(id)
  }, [videoRef])

  return time
}
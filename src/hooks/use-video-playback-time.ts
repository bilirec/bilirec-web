import { useEffect, useState, type RefObject } from "react"

/** Subscribe to `<video>` playback time without re-rendering the whole player shell. */
export function useVideoPlaybackTime(
  videoRef: RefObject<HTMLVideoElement | null>
): number {
  const [time, setTime] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const sync = () => {
      setTime(video.currentTime)
    }
    sync()
    video.addEventListener("timeupdate", sync)
    video.addEventListener("seeked", sync)
    return () => {
      video.removeEventListener("timeupdate", sync)
      video.removeEventListener("seeked", sync)
    }
  }, [videoRef])

  return time
}

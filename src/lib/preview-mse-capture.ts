import { trimPreviewMseBuffer } from "@/lib/preview-mse-trim"

const TRIM_POLL_MS = 400

/**
 * Intercept MediaSource.addSourceBuffer while flv.js / mpegts.js attach so we can run
 * preview sliding-window trims without enabling their bulk autoCleanup.
 */
export function installPreviewMseCapture(
  video: HTMLVideoElement,
  keepSeconds: number
): () => void {
  const sourceBuffers: SourceBuffer[] = []
  const proto = MediaSource.prototype
  const original = proto.addSourceBuffer

  proto.addSourceBuffer = function addSourceBufferCapture(this: MediaSource, mime: string) {
    const sb = original.call(this, mime)
    sourceBuffers.push(sb)
    const onUpdateEnd = () => {
      void trimPreviewMseBuffer(video, sb, keepSeconds)
    }
    sb.addEventListener("updateend", onUpdateEnd)
    return sb
  }

  const trimTimer = window.setInterval(() => {
    for (const sb of sourceBuffers) {
      void trimPreviewMseBuffer(video, sb, keepSeconds)
    }
  }, TRIM_POLL_MS)

  return () => {
    window.clearInterval(trimTimer)
    proto.addSourceBuffer = original
    sourceBuffers.length = 0
  }
}

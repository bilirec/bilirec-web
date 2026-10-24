import { debugPreviewPlayheadClamp, debugPreviewTrim } from "@/lib/preview-debug"

/** Slack beyond configured rewind window (matches prior flv.js autoCleanupMaxBackwardDuration). */
export const PREVIEW_TRIM_MAX_BACKWARD_SLACK_SEC = 15

/** Max media timeline removed per trim pass — keeps MSE read path unblocked. */
export const PREVIEW_TRIM_STEP_SEC = 2

export function previewMseMaxSpanSec(keepSeconds: number): number {
  return keepSeconds + PREVIEW_TRIM_MAX_BACKWARD_SLACK_SEC
}

/**
 * Sliding live-edge window: drop oldest buffered media in small steps so HTTP ingest
 * does not stall behind a single large SourceBuffer.remove.
 */
export async function trimPreviewMseBuffer(
  video: HTMLVideoElement,
  sb: SourceBuffer,
  keepSeconds: number
): Promise<void> {
  if (sb.updating) return
  const buffered = sb.buffered
  if (buffered.length === 0) return

  const i = buffered.length - 1
  const rangeStart = buffered.start(i)
  const rangeEnd = buffered.end(i)
  const span = rangeEnd - rangeStart
  const maxSpan = previewMseMaxSpanSec(keepSeconds)
  if (span <= maxSpan) return

  const excess = span - maxSpan
  const removeLen = Math.min(PREVIEW_TRIM_STEP_SEC, excess)
  const removeEnd = rangeStart + removeLen
  if (removeEnd - rangeStart < 0.25) return

  const playheadBefore = video.currentTime
  const playheadInRemoved = playheadBefore < removeEnd

  try {
    if (sb.updating) await waitSourceBufferIdle(sb)
    await removeSourceBufferRange(sb, rangeStart, removeEnd)
  } catch {
    return
  }

  debugPreviewTrim(video, {
    removeStart: rangeStart,
    removeEnd,
    spanBefore: span,
    maxSpan,
    playheadInRemoved,
  })

  if (playheadInRemoved) {
    const after = sb.buffered
    if (after.length > 0) {
      const newStart = after.start(0)
      const target = Math.min(Math.max(newStart + 0.05, newStart), rangeEnd)
      if (Math.abs(video.currentTime - target) > 0.01) {
        video.currentTime = target
        debugPreviewPlayheadClamp(video, playheadBefore, target)
      }
    }
  }
}

export function waitSourceBufferIdle(sb: SourceBuffer): Promise<void> {
  if (!sb.updating) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onUpdate = () => {
      sb.removeEventListener("updateend", onUpdate)
      sb.removeEventListener("error", onError)
      resolve()
    }
    const onError = () => {
      sb.removeEventListener("updateend", onUpdate)
      sb.removeEventListener("error", onError)
      reject(new Error("SourceBuffer error"))
    }
    sb.addEventListener("updateend", onUpdate)
    sb.addEventListener("error", onError)
  })
}

export function removeSourceBufferRange(
  sb: SourceBuffer,
  start: number,
  end: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onUpdate = () => {
      sb.removeEventListener("updateend", onUpdate)
      sb.removeEventListener("error", onError)
      resolve()
    }
    const onError = () => {
      sb.removeEventListener("updateend", onUpdate)
      sb.removeEventListener("error", onError)
      reject(new Error("SourceBuffer remove error"))
    }
    sb.addEventListener("updateend", onUpdate)
    sb.addEventListener("error", onError)
    sb.remove(start, end)
  })
}

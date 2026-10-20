/** True when the playhead is close enough to the live edge that new data should follow. */
export function isAtLiveEdge(currentTime: number, seekableEnd: number, slackSec = 1.5): boolean {
  if (!Number.isFinite(currentTime) || !Number.isFinite(seekableEnd)) {
    return true
  }
  return seekableEnd - currentTime <= slackSec
}

/** Nudge the playhead only when it falls further behind the live edge than this. */
export const LIVE_EDGE_MAX_LAG_SEC = 3

/** Land this far before the buffered end; the exact end has no decodable frame. */
export const LIVE_EDGE_MARGIN_SEC = 0.5

/**
 * Live chasing: the buffer grows at real-time speed, so a playhead left alone
 * never catches up and the timeline keeps expanding ahead of it. When the lag
 * exceeds the threshold, jump to just before the buffered end (seeking to the
 * exact end lands on data with no frames and stalls). Small lags are left alone
 * so playback is not interrupted by constant seeks. When rewound by the user,
 * keep the pinned time as the range grows.
 */
export function pinnedPlayheadAfterBuffer(
  currentTime: number,
  pinnedTime: number | null,
  seekableEnd: number
): number {
  if (pinnedTime != null && !isAtLiveEdge(pinnedTime, seekableEnd)) {
    return Math.abs(currentTime - pinnedTime) > 1 ? pinnedTime : currentTime
  }
  if (seekableEnd - currentTime > LIVE_EDGE_MAX_LAG_SEC) {
    return Math.max(0, seekableEnd - LIVE_EDGE_MARGIN_SEC)
  }
  return currentTime
}

export function isSegmentEventType(type: string): boolean {
  return type === "segment"
}

/** Extracts the SSE payload's "type" field; undefined when the payload is not JSON. */
export function previewEventTypeOf(raw: string): string | undefined {
  try {
    return (JSON.parse(raw) as { type?: string }).type ?? ""
  } catch {
    return undefined
  }
}

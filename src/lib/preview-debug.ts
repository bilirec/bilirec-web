/** Console diagnostics for live recording preview (grep DevTools for `[preview]`). */

export type PreviewSessionEndReason =
  | "flv_error"
  | "flv_loading_complete"
  | "mpegts_error"
  | "mpegts_loading_complete"
  | "fmp4_stream_end"
  | "fmp4_append_fail"
  | "video_ended"
  | "sse_segment"
  | "session_409"
  | "reconnect_cleanup"

export function snapshotPreviewVideo(video: HTMLVideoElement | null | undefined) {
  if (!video) return { video: null }
  const buffered: { start: number; end: number }[] = []
  const b = video.buffered
  for (let i = 0; i < b.length; i++) {
    buffered.push({ start: b.start(i), end: b.end(i) })
  }
  return {
    currentTime: video.currentTime,
    playbackRate: video.playbackRate,
    paused: video.paused,
    readyState: video.readyState,
    buffered,
  }
}

export function warnPreviewSessionEnd(
  reason: PreviewSessionEndReason,
  video: HTMLVideoElement | null | undefined,
  extra?: Record<string, unknown>
) {
  console.warn("[preview] session end", {
    reason,
    ...snapshotPreviewVideo(video),
    ...extra,
  })
}

export function debugPreviewTrim(
  video: HTMLVideoElement,
  detail: Record<string, unknown>
) {
  console.debug("[preview] mse trim", {
    ...snapshotPreviewVideo(video),
    ...detail,
  })
}

export function debugPreviewPlayheadClamp(
  video: HTMLVideoElement,
  from: number,
  to: number
) {
  console.debug("[preview] playhead clamped to window", {
    from,
    to,
    ...snapshotPreviewVideo(video),
  })
}

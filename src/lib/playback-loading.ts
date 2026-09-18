export type DanmakuPipelineStatus =
  | "fetching"
  | "parsing"
  | "injecting"
  | "ready"
  | "none"
  | "xml"
  | "error"

export const DANMAKU_LOAD_TIMEOUT_MS = 20_000

export function getDanmakuStageProgress(ratio: number): number {
  return Math.min(100, Math.max(0, Math.round(ratio * 100)))
}

export function isDanmakuPipelineBusy(status: DanmakuPipelineStatus): boolean {
  return status === "fetching" || status === "parsing" || status === "injecting"
}

export function shouldBlockPlayback({
  videoMetadataReady,
  danmakuStatus,
  danmakuLoadTimedOut,
}: {
  videoMetadataReady: boolean
  danmakuStatus: DanmakuPipelineStatus
  danmakuLoadTimedOut: boolean
}): boolean {
  return (
    !videoMetadataReady ||
    (isDanmakuPipelineBusy(danmakuStatus) && !danmakuLoadTimedOut)
  )
}

export function hasDanmakuLoadTimedOut(
  now: number,
  activityStartedAt: number,
  status: DanmakuPipelineStatus,
  timeoutMs = DANMAKU_LOAD_TIMEOUT_MS
): boolean {
  return isDanmakuPipelineBusy(status) && now - activityStartedAt >= timeoutMs
}

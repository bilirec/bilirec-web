import type { StreamIoHealth } from './types'

/** Below this download rate the stream is too quiet for ratio checks to mean anything. */
export const MIN_MEANINGFUL_READ_BPS = 32 * 1024
/** Write rate below this fraction of the read rate counts as a lagging window. */
export const LAG_RATIO_THRESHOLD = 0.75
/** Consecutive lagging windows required before reporting backpressure (rides out rotate pauses). */
export const LAG_STREAK_THRESHOLD = 2
/** Unflushed buffer must exceed this before a lagging window counts (noise gate). */
export const LAG_BYTES_FLOOR = 512 * 1024

/** Web UI thresholds for disk / queue / timeline (independent of backend metrics filters). */
export const FLUSH_WARNING_MS = 3000
export const SYNC_WARNING_MS = 1200
export const ENQUEUE_UNHEALTHY_MS = 1000
export const ENQUEUE_WARNING_MS = 100
export const TIMELINE_WARNING_MS = 2000

export interface StreamIoLagSample {
  readBps?: number
  lagBytes?: number
}

export interface StreamIoHealthInput {
  backpressure: boolean
  lagStreak: number
  /** Window delta ms; omit when backend does not expose pipeline stats. */
  flushMs?: number
  syncMs?: number
  enqueueWaitMs?: number
  timelineGapMs?: number
}

export function isRateLagging(readBps: number, writeBps: number): boolean {
  return readBps >= MIN_MEANINGFUL_READ_BPS && writeBps < readBps * LAG_RATIO_THRESHOLD
}

export function isPipelineStalled(
  readBps: number,
  writeBps: number,
  lagBytes: number,
  prev: StreamIoLagSample,
): boolean {
  const hadMeaningfulRead = (prev.readBps ?? 0) >= MIN_MEANINGFUL_READ_BPS
  const bothQuiet =
    readBps < MIN_MEANINGFUL_READ_BPS && writeBps < MIN_MEANINGFUL_READ_BPS
  const lagNotDraining = lagBytes >= (prev.lagBytes ?? 0)
  return hadMeaningfulRead && bothQuiet && lagNotDraining
}

/** Same basis as the 75% lag threshold — not cumulative bytes_written / bytes_read. */
export function computeHealthScorePercent(
  read: number,
  written: number,
  readBps: number,
  writeBps: number,
): number {
  if (readBps >= MIN_MEANINGFUL_READ_BPS) {
    return Math.min(100, (writeBps / readBps) * 100)
  }
  const lagBytes = Math.max(0, read - written)
  if (
    readBps < MIN_MEANINGFUL_READ_BPS &&
    writeBps < MIN_MEANINGFUL_READ_BPS &&
    lagBytes > LAG_BYTES_FLOOR
  ) {
    return 0
  }
  if (read > 0) {
    return Math.min(100, (written / read) * 100)
  }
  return 100
}

/** Health from sustained write lag and optional pipeline window deltas. */
export function computeStreamIoHealth(input: StreamIoHealthInput): StreamIoHealth {
  const enqueueWaitMs = input.enqueueWaitMs ?? 0
  const flushMs = input.flushMs ?? 0
  const syncMs = input.syncMs ?? 0
  const timelineGapMs = input.timelineGapMs ?? 0

  if (input.backpressure || enqueueWaitMs >= ENQUEUE_UNHEALTHY_MS) {
    return 'unhealthy'
  }

  if (
    input.lagStreak >= 1 ||
    flushMs >= FLUSH_WARNING_MS ||
    syncMs >= SYNC_WARNING_MS ||
    enqueueWaitMs >= ENQUEUE_WARNING_MS ||
    timelineGapMs >= TIMELINE_WARNING_MS
  ) {
    return 'warning'
  }

  return 'healthy'
}

export function streamHealthIconClass(health: StreamIoHealth): string {
  switch (health) {
    case 'healthy':
      return 'text-green-600 dark:text-green-500'
    case 'warning':
      return 'text-amber-600 dark:text-amber-400'
    case 'unhealthy':
      return 'text-red-600 dark:text-red-400'
  }
}

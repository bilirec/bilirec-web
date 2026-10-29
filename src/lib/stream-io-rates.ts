import {
  computeHealthScorePercent,
  computeStreamIoHealth,
  isPipelineStalled,
  isRateLagging,
  LAG_BYTES_FLOOR,
  LAG_STREAK_THRESHOLD,
} from './stream-io-health'
import type { RecordTask, StreamIoRate } from './types'

/**
 * Samples per-room stream byte counters across stats polls and derives recent
 * download/write rates as delta bytes / delta wall-clock time.
 */

interface IoSample {
  ts: number
  read: number
  written: number
  startTime?: string | number
  lagStreak: number
  readBps?: number
  lagBytes?: number
  flushCount?: number
  flushMs?: number
  syncCount?: number
  syncMs?: number
  enqueueWaits?: number
  enqueueWaitMs?: number
  timelineGaps?: number
  timelineGapMs?: number
}

/** Ignore poll windows shorter than this (seconds) to avoid noisy double-fetches. */
const MIN_WINDOW_SECONDS = 1

const samples = new Map<number, IoSample>()

function pipelineTotals(task: RecordTask) {
  if (
    task.flushCount === undefined ||
    task.syncCount === undefined ||
    task.enqueueWaits === undefined ||
    task.timelineGaps === undefined
  ) {
    return undefined
  }
  return {
    flushCount: task.flushCount,
    flushMs: task.flushMs ?? 0,
    syncCount: task.syncCount,
    syncMs: task.syncMs ?? 0,
    enqueueWaits: task.enqueueWaits,
    enqueueWaitMs: task.enqueueWaitMs ?? 0,
    timelineGaps: task.timelineGaps,
    timelineGapMs: task.timelineGapMs ?? 0,
  }
}

function counterSessionChanged(
  prev: IoSample,
  totals: NonNullable<ReturnType<typeof pipelineTotals>>,
): boolean {
  if (totals.flushCount < (prev.flushCount ?? 0)) return true
  if (totals.syncCount < (prev.syncCount ?? 0)) return true
  if (totals.enqueueWaits < (prev.enqueueWaits ?? 0)) return true
  if (totals.timelineGaps < (prev.timelineGaps ?? 0)) return true
  return false
}

function deltaCounter(current: number, prev: number | undefined): number {
  if (prev === undefined) return 0
  return Math.max(0, current - prev)
}

function computeStreamIoWindow(
  task: RecordTask,
  prev: IoSample | undefined,
  now: number,
): { rate?: StreamIoRate; sample: IoSample } {
  const read = task.bytesRead ?? 0
  const written = task.fileSize ?? 0
  const totals = pipelineTotals(task)

  const sample: IoSample = {
    ts: now,
    read,
    written,
    startTime: task.startTime,
    lagStreak: 0,
    flushCount: totals?.flushCount,
    flushMs: totals?.flushMs,
    syncCount: totals?.syncCount,
    syncMs: totals?.syncMs,
    enqueueWaits: totals?.enqueueWaits,
    enqueueWaitMs: totals?.enqueueWaitMs,
    timelineGaps: totals?.timelineGaps,
    timelineGapMs: totals?.timelineGapMs,
  }

  if (!prev) {
    return { sample }
  }

  const sessionChanged =
    prev.startTime !== task.startTime ||
    read < prev.read ||
    written < prev.written ||
    (totals !== undefined && counterSessionChanged(prev, totals))

  const dt = (now - prev.ts) / 1000
  if (sessionChanged || dt < MIN_WINDOW_SECONDS) {
    sample.lagStreak = sessionChanged ? 0 : prev.lagStreak
    if (!sessionChanged) {
      sample.readBps = prev.readBps
      sample.lagBytes = prev.lagBytes
    }
    return { sample }
  }

  const readBps = Math.max(0, (read - prev.read) / dt)
  const writeBps = Math.max(0, (written - prev.written) / dt)
  const lagBytes = Math.max(0, read - written)

  const signal =
    isRateLagging(readBps, writeBps) || isPipelineStalled(readBps, writeBps, lagBytes, prev)
  const lagging = signal && lagBytes > LAG_BYTES_FLOOR
  sample.lagStreak = lagging ? prev.lagStreak + 1 : 0
  sample.readBps = readBps
  sample.lagBytes = lagBytes

  const backpressure = sample.lagStreak >= LAG_STREAK_THRESHOLD

  const windowFlushMs =
    totals !== undefined ? deltaCounter(totals.flushMs, prev.flushMs) : undefined
  const windowSyncMs =
    totals !== undefined ? deltaCounter(totals.syncMs, prev.syncMs) : undefined
  const windowEnqueueWaitMs =
    totals !== undefined ? deltaCounter(totals.enqueueWaitMs, prev.enqueueWaitMs) : undefined
  const windowTimelineGapMs =
    totals !== undefined ? deltaCounter(totals.timelineGapMs, prev.timelineGapMs) : undefined

  const rate: StreamIoRate = {
    readBps,
    writeBps,
    lagBytes,
    backpressure,
    health: computeStreamIoHealth({
      backpressure,
      lagStreak: sample.lagStreak,
      flushMs: windowFlushMs,
      syncMs: windowSyncMs,
      enqueueWaitMs: windowEnqueueWaitMs,
      timelineGapMs: windowTimelineGapMs,
    }),
    healthScorePercent: computeHealthScorePercent(read, written, readBps, writeBps),
    lagStreak: sample.lagStreak,
    flushMs: windowFlushMs,
    syncMs: windowSyncMs,
    enqueueWaitMs: windowEnqueueWaitMs,
    timelineGapMs: windowTimelineGapMs,
  }

  return { rate, sample }
}

export function applyStreamIoRates(tasks: RecordTask[], now: number = Date.now()): RecordTask[] {
  const seen = new Set<number>()

  const result = tasks.map((task) => {
    if (task.status !== 'recording' || task.bytesRead === undefined || task.fileSize === undefined) {
      samples.delete(task.roomId)
      return task
    }
    seen.add(task.roomId)
    const { rate, sample } = computeStreamIoWindow(task, samples.get(task.roomId), now)
    samples.set(task.roomId, sample)
    return rate ? { ...task, ioRate: rate } : task
  })

  for (const roomId of samples.keys()) {
    if (!seen.has(roomId)) {
      samples.delete(roomId)
    }
  }

  return result
}

export function canComputeStreamIoRate(task: RecordTask): boolean {
  return (
    task.status === 'recording' &&
    task.bytesRead !== undefined &&
    task.fileSize !== undefined
  )
}

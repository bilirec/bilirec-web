import { computeStreamIoHealth } from './stream-io-health'
import type { RecordTask, StreamIoRate } from './types'

/**
 * Samples per-room stream byte counters across stats polls and derives recent
 * download/write rates as delta bytes / delta wall-clock time.
 *
 * Why deltas instead of `bytes / elapsed_seconds`:
 * - `bytes_read` / `bytes_written` are session-cumulative counters that keep
 *   growing across segment rotations, so deltas stay correct during rotate.
 * - Dividing by elapsed_seconds yields a lifetime average that hides current
 *   slowdowns (e.g. disk backpressure) and drifts after every rotate pause.
 */

interface IoSample {
  /** Wall-clock time of the sample (ms). */
  ts: number
  read: number
  written: number
  /** Session identity from the backend; a change means a new recording session. */
  startTime?: string | number
  /** Consecutive windows where write clearly lagged read or the pipeline stalled. */
  lagStreak: number
  /** Last window's download rate (bytes/sec), for stall detection. */
  readBps?: number
  /** Last window's unflushed buffer (bytes_read - bytes_written). */
  lagBytes?: number
}

/** Below this download rate the stream is too quiet for ratio checks to mean anything. */
const MIN_MEANINGFUL_READ_BPS = 32 * 1024
/** Write rate below this fraction of the read rate counts as a lagging window. */
const LAG_RATIO_THRESHOLD = 0.75
/** Consecutive lagging windows required before reporting backpressure (rides out rotate pauses). */
const LAG_STREAK_THRESHOLD = 2
/** Unflushed buffer must exceed this before a lagging window counts (noise gate). */
const LAG_BYTES_FLOOR = 512 * 1024
/** Ignore poll windows shorter than this (seconds) to avoid noisy double-fetches. */
const MIN_WINDOW_SECONDS = 1

const samples = new Map<number, IoSample>()

function isRateLagging(readBps: number, writeBps: number): boolean {
  return readBps >= MIN_MEANINGFUL_READ_BPS && writeBps < readBps * LAG_RATIO_THRESHOLD
}

/** Same basis as the 75% lag threshold — not cumulative bytes_written / bytes_read. */
function computeHealthScorePercent(
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

function isPipelineStalled(
  readBps: number,
  writeBps: number,
  lagBytes: number,
  prev: IoSample,
): boolean {
  const hadMeaningfulRead = (prev.readBps ?? 0) >= MIN_MEANINGFUL_READ_BPS
  const bothQuiet =
    readBps < MIN_MEANINGFUL_READ_BPS && writeBps < MIN_MEANINGFUL_READ_BPS
  const lagNotDraining = lagBytes >= (prev.lagBytes ?? 0)
  return hadMeaningfulRead && bothQuiet && lagNotDraining
}

function computeStreamIoWindow(
  task: RecordTask,
  prev: IoSample | undefined,
  now: number,
): { rate?: StreamIoRate; sample: IoSample } {
  const read = task.bytesRead ?? 0
  const written = task.fileSize ?? 0
  const sample: IoSample = {
    ts: now,
    read,
    written,
    startTime: task.startTime,
    lagStreak: 0,
  }

  if (!prev) {
    return { sample }
  }

  const sessionChanged =
    prev.startTime !== task.startTime || read < prev.read || written < prev.written
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
  const rate: StreamIoRate = {
    readBps,
    writeBps,
    lagBytes,
    backpressure,
    health: computeStreamIoHealth(backpressure, sample.lagStreak),
    healthScorePercent: computeHealthScorePercent(read, written, readBps, writeBps),
  }

  return { rate, sample }
}

/**
 * Attaches recent I/O rates to recording tasks. Call once per stats poll with the
 * freshly fetched tasks; returns new task objects. Rooms that disappeared from the
 * list (stopped/removed) are dropped from the sampler so a later session starts clean.
 */
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

/** Whether a task can eventually receive sampled I/O rates (second poll onward). */
export function canComputeStreamIoRate(task: RecordTask): boolean {
  return (
    task.status === 'recording' &&
    task.bytesRead !== undefined &&
    task.fileSize !== undefined
  )
}

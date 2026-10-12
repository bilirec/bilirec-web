import type { PlaybackChatItem } from "@/lib/danmaku-parse"

/** Fixed bucket count so short VODs and long streams both span the full bar. */
export const DANMAKU_HEATMAP_BUCKET_COUNT = 100

/** SVG viewBox height; waveform is drawn from the bottom edge upward. */
const VIEW_HEIGHT = 30
const PEAK_HEIGHT = 28

function smoothBuckets(raw: number[]): number[] {
  const n = raw.length
  if (n === 0) return []
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const left = i > 0 ? raw[i - 1] : raw[i]
    const mid = raw[i]
    const right = i < n - 1 ? raw[i + 1] : raw[i]
    out[i] = (left + mid + right) / 3
  }
  return out
}

/**
 * Build a filled SVG path for danmaku density (danmaku rows only).
 * Returns null when duration is invalid or there are no danmaku rows.
 */
export function buildDanmakuHeatmapPath(
  items: PlaybackChatItem[],
  durationSec: number,
  bucketCount: number = DANMAKU_HEATMAP_BUCKET_COUNT
): string | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || bucketCount < 2) {
    return null
  }

  const buckets = new Array<number>(bucketCount).fill(0)
  let danmakuCount = 0

  for (const item of items) {
    if (item.kind !== "danmaku") continue
    const ts = item.ts
    if (!Number.isFinite(ts) || ts < 0) continue
    // Drop rows past the video end instead of clamping them into the last
    // bucket, which would pile them up into a single spike at the right edge.
    if (ts > durationSec) continue
    const idx = Math.min(bucketCount - 1, Math.floor((ts / durationSec) * bucketCount))
    buckets[idx] += 1
    danmakuCount += 1
  }

  if (danmakuCount === 0) return null

  const smoothed = smoothBuckets(buckets)
  // Normalize by the 95th percentile so one burst cannot flatten everything else.
  const sorted = [...smoothed].sort((a, b) => a - b)
  const max = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  if (max <= 0) return null

  const n = bucketCount
  const parts: string[] = [`M 0 ${VIEW_HEIGHT}`]

  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * 100
    const norm = Math.min(1, smoothed[i] / max)
    const y = VIEW_HEIGHT - norm * PEAK_HEIGHT
    parts.push(`L ${x.toFixed(3)} ${y.toFixed(3)}`)
  }

  parts.push(`L 100 ${VIEW_HEIGHT}`, "Z")
  return parts.join(" ")
}

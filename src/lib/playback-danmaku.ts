import type { OverlayCorner } from "@/lib/playback-settings"

/** Default n-danmaku font is ~width/36; desktop playback stays a bit smaller than live. */
export const DANMAKU_SCALE_DESKTOP = 0.63
/** Narrow / phone picture boxes need a larger scale or bullets become unreadable. */
export const DANMAKU_SCALE_NARROW = 1.55
/** Keep the base danmaku motion at half of n-danmaku's default speed. */
const DANMAKU_DEFAULT_LIFE_MS = 5000
const DANMAKU_BASE_SPEED = 0.5
/** Small look-ahead window; the RAF ticker prevents dense bursts on each tick. */
export const DANMAKU_TICK_UNCERTAINTY_MS = 120
/** n-danmaku must not be ticked for every animation frame; its ranges overlap. */
export const DANMAKU_TICK_INTERVAL_MS = 160
export const DANMAKU_LOAD_CHUNK_SIZE = 1000

export function danmakuLifeForRate(rate: number): number {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1
  return DANMAKU_DEFAULT_LIFE_MS / (safeRate * DANMAKU_BASE_SPEED)
}

export function danmakuScaleForWidth(width: number): number {
  if (width > 0 && width < 520) return DANMAKU_SCALE_NARROW
  if (width > 0 && width < 900) return 0.95
  return DANMAKU_SCALE_DESKTOP
}

export function sameNumberList(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function cornerLabelKey(corner: OverlayCorner): string {
  switch (corner) {
    case "top-right":
      return "overlayCornerTopRight"
    case "bottom-left":
      return "overlayCornerBottomLeft"
    case "bottom-right":
      return "overlayCornerBottomRight"
    case "top-left":
    default:
      return "overlayCornerTopLeft"
  }
}

import type { DanmakuType } from "n-danmaku"
import {
  clampDanmakuSize,
  DEFAULT_DANMAKU_SIZE,
  type OverlayCorner,
} from "@/lib/playback-settings"

/** Default n-danmaku font is ~width/36; desktop playback stays a bit smaller than live. */
export const DANMAKU_SCALE_DESKTOP = 0.63
/** Narrow / phone picture: a bit above n-danmaku's width formula so text stays readable. */
export const DANMAKU_SCALE_NARROW = 1.25
/** Keep the base danmaku motion at half of n-danmaku's default speed. */
const DANMAKU_SCROLL_LIFE_MS = 5000
const DANMAKU_BASE_SPEED = 0.5
/** Top/bottom hang duration at 1x. Independent of scroll travel time. */
const DANMAKU_HANG_LIFE_MS = 4000
/**
 * n-danmaku ranges are % of host height.
 * Bottom/top are measured from their stack origin (bottom up / top down).
 */
export const DANMAKU_RANGES = {
  scroll: [2, 85] as [number, number],
  top: [2, 35] as [number, number],
  bottom: [2, 58] as [number, number],
  random: [2, 85] as [number, number],
}
/** Small look-ahead window; the RAF ticker prevents dense bursts on each tick. */
export const DANMAKU_TICK_UNCERTAINTY_MS = 120
/** n-danmaku must not be ticked for every animation frame; its ranges overlap. */
export const DANMAKU_TICK_INTERVAL_MS = 160
export const DANMAKU_LOAD_CHUNK_SIZE = 1000

function isHangType(type: DanmakuType | undefined): boolean {
  return type === "top" || type === "bottom" || type === "midhang"
}

export function danmakuLifeForRate(rate: number, type?: DanmakuType): number {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1
  if (isHangType(type)) {
    return DANMAKU_HANG_LIFE_MS / safeRate
  }
  return DANMAKU_SCROLL_LIFE_MS / (safeRate * DANMAKU_BASE_SPEED)
}

export function danmakuScaleForWidth(width: number): number {
  if (width > 0 && width < 520) return DANMAKU_SCALE_NARROW
  if (width > 0 && width < 900) return 0.95
  return DANMAKU_SCALE_DESKTOP
}

/** Same formula n-danmaku uses when `size` is null: (width / 180) * 5, min 5px. */
export function danmakuAutoFontPx(width: number): number {
  const auto = (Math.max(0, width) / 180) * 5
  return auto > 5 ? auto : 5
}

/**
 * Follow-off 100% matches n-danmaku auto size at this picture width.
 * Typical desktop player; independent of the current / fullscreen width.
 */
export const DANMAKU_FIXED_REF_WIDTH = 1600

export type ResolvedDanmakuFont = {
  scale: number
  /** Absolute CSS font-size. Null lets n-danmaku size from the container width. */
  size: string | null
}

/**
 * Follow-on: font tracks picture width via scale.
 * Follow-off: fixed CSS px from size percent, same in windowed and fullscreen.
 */
export function resolveDanmakuFont(
  width: number,
  followScreen: boolean,
  sizePercent: number
): ResolvedDanmakuFont {
  if (followScreen) {
    return {
      scale: danmakuScaleForWidth(width),
      size: null,
    }
  }
  const size = Number.isFinite(sizePercent) ? sizePercent : DEFAULT_DANMAKU_SIZE
  const sizeMult = clampDanmakuSize(size) / 100
  const px =
    Math.round(
      danmakuAutoFontPx(DANMAKU_FIXED_REF_WIDTH) * DANMAKU_SCALE_DESKTOP * sizeMult * 10
    ) / 10
  return {
    scale: 1,
    size: `${px}px`,
  }
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
    case "hidden":
      return "overlayCornerHidden"
    case "top-left":
    default:
      return "overlayCornerTopLeft"
  }
}

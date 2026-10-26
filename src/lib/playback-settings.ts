const RATES_KEY = "bilirec.playback.rates"
const FRAME_STEP_KEY = "bilirec.playback.frameStepMs"
const SEEK_OFFSET_KEY = "bilirec.playback.seekOffsetSec"
const DANMAKU_OPACITY_KEY = "bilirec.playback.danmakuOpacity"
const DANMAKU_SIZE_KEY = "bilirec.playback.danmakuSize"
const DANMAKU_FOLLOW_SCREEN_KEY = "bilirec.playback.danmakuFollowScreen"
const DANMAKU_SPEED_KEY = "bilirec.playback.danmakuSpeed"
const DANMAKU_AREA_KEY = "bilirec.playback.danmakuArea"
const DANMAKU_PREVENT_OVERLAP_KEY = "bilirec.playback.danmakuPreventOverlap"
const DANMAKU_OVERLAP_MODE_KEY = "bilirec.playback.danmakuOverlapMode"
const SCREEN_DANMAKU_VISIBLE_KEY = "bilirec.playback.screenDanmakuVisible"
const OVERLAY_CORNER_KEY = "bilirec.playback.overlayCorner"
const SUBTITLE_OFFSET_KEY = "bilirec.playback.subtitleOffset"

export const DEFAULT_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3]
/** ~1 frame at 30fps */
export const DEFAULT_FRAME_STEP_MS = Math.round(1000 / 30)
export const DEFAULT_SEEK_OFFSET_SEC = 5
/** n-danmaku opacity 0–100 */
export const DEFAULT_DANMAKU_OPACITY = 100
/** Relative danmaku size 50–150 (% of the fixed desktop base). Used only when follow-screen is off. */
export const DEFAULT_DANMAKU_SIZE = 85
export const DANMAKU_SIZE_MIN = 50
export const DANMAKU_SIZE_MAX = 150
export const DEFAULT_DANMAKU_FOLLOW_SCREEN = false
export const DEFAULT_SCREEN_DANMAKU_VISIBLE = true

/** Danmaku scrolling speed percent (50–200%, 100% is 1x normal speed). */
export const DEFAULT_DANMAKU_SPEED = 85
export const DANMAKU_SPEED_MIN = 50
export const DANMAKU_SPEED_MAX = 200

export type DanmakuArea = "quarter" | "half" | "three-quarters" | "full"
export const DANMAKU_AREAS: readonly DanmakuArea[] = [
  "quarter",
  "half",
  "three-quarters",
  "full",
]
export const DEFAULT_DANMAKU_AREA: DanmakuArea = "full"
/** When no lane fits after empty-first allocation, drop or queue instead of stacking. */
export const DEFAULT_DANMAKU_PREVENT_OVERLAP = true

/** Overflow when prevent-overlap is on and no lane fits. */
export type DanmakuOverlapMode = "drop" | "queue"
export const DANMAKU_OVERLAP_MODES: readonly DanmakuOverlapMode[] = ["drop", "queue"]
export const DEFAULT_DANMAKU_OVERLAP_MODE: DanmakuOverlapMode = "drop"

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "hidden"
export const OVERLAY_CORNERS: readonly OverlayCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "hidden",
]
export const DEFAULT_OVERLAY_CORNER: OverlayCorner = "bottom-left"

/** Normalized center of the subtitle pill within the picture box (0–1). */
export type SubtitleOffset = { x: number; y: number }
export const DEFAULT_SUBTITLE_OFFSET: SubtitleOffset = { x: 0.5, y: 0.92 }

/** Desktop (windowed) playback chat side panel visibility; hidden by default.
 *  Deliberately not persisted — every new playback starts with it closed. */
export const DEFAULT_DESKTOP_CHAT_PANEL = false

/** How the desktop chat panel is presented when open. */
export type DesktopChatLayout = "auto" | "overlay" | "extend"
export const DESKTOP_CHAT_LAYOUTS: readonly DesktopChatLayout[] = [
  "auto",
  "overlay",
  "extend",
]
export const DEFAULT_DESKTOP_CHAT_LAYOUT: DesktopChatLayout = "auto"

const DESKTOP_CHAT_LAYOUT_KEY = "bilirec.playback.desktopChatLayout"

export type PlaybackSettingsValue = {
  rates: number[]
  frameStepMs: number
  seekOffsetSec: number
  danmakuOpacity: number
  danmakuFollowScreen: boolean
  danmakuSize: number
  danmakuSpeed: number
  danmakuArea: DanmakuArea
  danmakuPreventOverlap: boolean
  danmakuOverlapMode: DanmakuOverlapMode
  overlayCorner: OverlayCorner
  desktopChatLayout: DesktopChatLayout
}

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettingsValue = {
  rates: DEFAULT_PLAYBACK_RATES,
  frameStepMs: DEFAULT_FRAME_STEP_MS,
  seekOffsetSec: DEFAULT_SEEK_OFFSET_SEC,
  danmakuOpacity: DEFAULT_DANMAKU_OPACITY,
  danmakuFollowScreen: DEFAULT_DANMAKU_FOLLOW_SCREEN,
  danmakuSize: DEFAULT_DANMAKU_SIZE,
  danmakuSpeed: DEFAULT_DANMAKU_SPEED,
  danmakuArea: DEFAULT_DANMAKU_AREA,
  danmakuPreventOverlap: DEFAULT_DANMAKU_PREVENT_OVERLAP,
  danmakuOverlapMode: DEFAULT_DANMAKU_OVERLAP_MODE,
  overlayCorner: DEFAULT_OVERLAY_CORNER,
  desktopChatLayout: DEFAULT_DESKTOP_CHAT_LAYOUT,
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null || raw === "") return fallback
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : fallback
  } catch {
    return fallback
  }
}

function writeNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadPlaybackRates(): number[] {
  try {
    const raw = localStorage.getItem(RATES_KEY)
    if (!raw) return [...DEFAULT_PLAYBACK_RATES]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_PLAYBACK_RATES]
    const rates = parsed
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 16)
    return rates.length > 0 ? rates : [...DEFAULT_PLAYBACK_RATES]
  } catch {
    return [...DEFAULT_PLAYBACK_RATES]
  }
}

export function savePlaybackRates(rates: number[]) {
  try {
    localStorage.setItem(RATES_KEY, JSON.stringify(rates))
  } catch {
    /* ignore */
  }
}

export function loadFrameStepMs(): number {
  return readNumber(FRAME_STEP_KEY, DEFAULT_FRAME_STEP_MS)
}

export function saveFrameStepMs(ms: number) {
  writeNumber(FRAME_STEP_KEY, ms)
}

export function loadSeekOffsetSec(): number {
  return readNumber(SEEK_OFFSET_KEY, DEFAULT_SEEK_OFFSET_SEC)
}

export function saveSeekOffsetSec(sec: number) {
  writeNumber(SEEK_OFFSET_KEY, sec)
}

export function loadDanmakuOpacity(): number {
  try {
    const raw = localStorage.getItem(DANMAKU_OPACITY_KEY)
    if (raw == null || raw === "") return DEFAULT_DANMAKU_OPACITY
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_DANMAKU_OPACITY
    return Math.min(100, Math.max(0, Math.round(n)))
  } catch {
    return DEFAULT_DANMAKU_OPACITY
  }
}

export function saveDanmakuOpacity(opacity: number) {
  writeNumber(DANMAKU_OPACITY_KEY, Math.min(100, Math.max(0, Math.round(opacity))))
}

export function clampDanmakuSize(size: number): number {
  return Math.min(DANMAKU_SIZE_MAX, Math.max(DANMAKU_SIZE_MIN, Math.round(size)))
}

export function clampDanmakuSpeed(speed: number): number {
  return Math.min(DANMAKU_SPEED_MAX, Math.max(DANMAKU_SPEED_MIN, Math.round(speed)))
}

export function loadDanmakuSpeed(): number {
  try {
    const raw = localStorage.getItem(DANMAKU_SPEED_KEY)
    if (raw == null || raw === "") return DEFAULT_DANMAKU_SPEED
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_DANMAKU_SPEED
    return clampDanmakuSpeed(n)
  } catch {
    return DEFAULT_DANMAKU_SPEED
  }
}

export function saveDanmakuSpeed(speed: number) {
  writeNumber(DANMAKU_SPEED_KEY, clampDanmakuSpeed(speed))
}

export function loadDanmakuArea(): DanmakuArea {
  try {
    const raw = localStorage.getItem(DANMAKU_AREA_KEY)
    if (raw && (DANMAKU_AREAS as readonly string[]).includes(raw)) {
      return raw as DanmakuArea
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_DANMAKU_AREA
}

export function saveDanmakuArea(area: DanmakuArea) {
  try {
    localStorage.setItem(DANMAKU_AREA_KEY, area)
  } catch {
    /* ignore */
  }
}

export function loadDanmakuPreventOverlap(): boolean {
  try {
    const raw = localStorage.getItem(DANMAKU_PREVENT_OVERLAP_KEY)
    if (raw == null || raw === "") return DEFAULT_DANMAKU_PREVENT_OVERLAP
    return raw !== "false"
  } catch {
    return DEFAULT_DANMAKU_PREVENT_OVERLAP
  }
}

export function saveDanmakuPreventOverlap(prevent: boolean) {
  try {
    localStorage.setItem(DANMAKU_PREVENT_OVERLAP_KEY, String(prevent))
  } catch {
    /* ignore */
  }
}

export function loadDanmakuOverlapMode(): DanmakuOverlapMode {
  try {
    const raw = localStorage.getItem(DANMAKU_OVERLAP_MODE_KEY)
    if (raw && (DANMAKU_OVERLAP_MODES as readonly string[]).includes(raw)) {
      return raw as DanmakuOverlapMode
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_DANMAKU_OVERLAP_MODE
}

export function saveDanmakuOverlapMode(mode: DanmakuOverlapMode) {
  try {
    localStorage.setItem(DANMAKU_OVERLAP_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function loadDanmakuSize(): number {
  try {
    const raw = localStorage.getItem(DANMAKU_SIZE_KEY)
    if (raw == null || raw === "") return DEFAULT_DANMAKU_SIZE
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_DANMAKU_SIZE
    return clampDanmakuSize(n)
  } catch {
    return DEFAULT_DANMAKU_SIZE
  }
}

export function saveDanmakuSize(size: number) {
  writeNumber(DANMAKU_SIZE_KEY, clampDanmakuSize(size))
}

export function loadDanmakuFollowScreen(): boolean {
  try {
    const raw = localStorage.getItem(DANMAKU_FOLLOW_SCREEN_KEY)
    if (raw == null || raw === "") return DEFAULT_DANMAKU_FOLLOW_SCREEN
    return raw !== "false"
  } catch {
    return DEFAULT_DANMAKU_FOLLOW_SCREEN
  }
}

export function saveDanmakuFollowScreen(follow: boolean) {
  try {
    localStorage.setItem(DANMAKU_FOLLOW_SCREEN_KEY, String(follow))
  } catch {
    /* ignore */
  }
}

export function loadScreenDanmakuVisible(): boolean {
  try {
    const raw = localStorage.getItem(SCREEN_DANMAKU_VISIBLE_KEY)
    if (raw == null || raw === "") return DEFAULT_SCREEN_DANMAKU_VISIBLE
    return raw !== "false"
  } catch {
    return DEFAULT_SCREEN_DANMAKU_VISIBLE
  }
}

export function saveScreenDanmakuVisible(visible: boolean) {
  try {
    localStorage.setItem(SCREEN_DANMAKU_VISIBLE_KEY, String(visible))
  } catch {
    /* ignore */
  }
}

export function loadOverlayCorner(): OverlayCorner {
  try {
    const raw = localStorage.getItem(OVERLAY_CORNER_KEY)
    if (raw && (OVERLAY_CORNERS as readonly string[]).includes(raw)) {
      return raw as OverlayCorner
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_OVERLAY_CORNER
}

export function saveOverlayCorner(corner: OverlayCorner) {
  try {
    localStorage.setItem(OVERLAY_CORNER_KEY, corner)
  } catch {
    /* ignore */
  }
}

function clampSubtitleFraction(n: number): number {
  if (!Number.isFinite(n)) return 0.5
  return Math.min(1, Math.max(0, n))
}

export function loadSubtitleOffset(): SubtitleOffset {
  try {
    const raw = localStorage.getItem(SUBTITLE_OFFSET_KEY)
    if (!raw) return { ...DEFAULT_SUBTITLE_OFFSET }
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown }
    return {
      x: clampSubtitleFraction(Number(parsed.x)),
      y: clampSubtitleFraction(Number(parsed.y)),
    }
  } catch {
    return { ...DEFAULT_SUBTITLE_OFFSET }
  }
}

export function saveSubtitleOffset(offset: SubtitleOffset) {
  try {
    localStorage.setItem(
      SUBTITLE_OFFSET_KEY,
      JSON.stringify({
        x: clampSubtitleFraction(offset.x),
        y: clampSubtitleFraction(offset.y),
      })
    )
  } catch {
    /* ignore */
  }
}

export function loadDesktopChatLayout(): DesktopChatLayout {
  try {
    const raw = localStorage.getItem(DESKTOP_CHAT_LAYOUT_KEY)
    if (raw && (DESKTOP_CHAT_LAYOUTS as readonly string[]).includes(raw)) {
      return raw as DesktopChatLayout
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_DESKTOP_CHAT_LAYOUT
}

export function saveDesktopChatLayout(layout: DesktopChatLayout) {
  try {
    localStorage.setItem(DESKTOP_CHAT_LAYOUT_KEY, layout)
  } catch {
    /* ignore */
  }
}

/** Parse "0.25, 0.5, 1, 2" style input into sorted unique rates.
 * Returns null if empty or any token is not a valid rate. */
export function parseRatesInput(input: string): number[] | null {
  const parts = input
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const rates: number[] = []
  for (const part of parts) {
    // Reject non-numeric tokens like "wsad" instead of silently dropping them
    if (!/^\d+(\.\d+)?$/.test(part)) return null
    const n = Number(part)
    if (!Number.isFinite(n) || n <= 0 || n > 16) return null
    rates.push(n)
  }
  return Array.from(new Set(rates)).sort((a, b) => a - b)
}

export function parsePositiveNumber(
  input: string,
  opts: { min: number; max: number }
): number | null {
  const trimmed = input.trim()
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < opts.min || n > opts.max) return null
  return n
}

export function ratesToAttr(rates: number[]): string {
  return rates.join(" ")
}

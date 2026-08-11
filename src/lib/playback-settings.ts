const RATES_KEY = "bilirec.playback.rates"
const FRAME_STEP_KEY = "bilirec.playback.frameStepMs"
const SEEK_OFFSET_KEY = "bilirec.playback.seekOffsetSec"
const DANMAKU_OPACITY_KEY = "bilirec.playback.danmakuOpacity"
const SCREEN_DANMAKU_VISIBLE_KEY = "bilirec.playback.screenDanmakuVisible"
const OVERLAY_CORNER_KEY = "bilirec.playback.overlayCorner"

export const DEFAULT_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3]
/** ~1 frame at 30fps */
export const DEFAULT_FRAME_STEP_MS = Math.round(1000 / 30)
export const DEFAULT_SEEK_OFFSET_SEC = 5
/** n-danmaku opacity 0–100 */
export const DEFAULT_DANMAKU_OPACITY = 80
export const DEFAULT_SCREEN_DANMAKU_VISIBLE = true

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right"
export const OVERLAY_CORNERS: readonly OverlayCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]
export const DEFAULT_OVERLAY_CORNER: OverlayCorner = "bottom-left"

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

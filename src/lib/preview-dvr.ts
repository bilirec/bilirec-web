/**
 * Hysteresis for the LIVE badge / slider pin.
 * - LEAVE: while already LIVE, stay on the LIVE badge only within this delay; ~1s lag shows `-0:01`.
 * - ENTER: after the user seeks away, only snap back to LIVE when this close to the buffer edge
 *   (keeps -0:01 ~ -0:02 scrub positions stable instead of treating them as LIVE).
 */
export const PREVIEW_LIVE_ENTER_SEC = 0.4
export const PREVIEW_LIVE_LEAVE_SEC = 0.9

/** Keep the playhead off the live buffer edge while paused (avoids endless waiting/spinner). */
export const PREVIEW_EDGE_PAD_PLAYING_SEC = 0.08
export const PREVIEW_EDGE_PAD_PAUSED_SEC = 0.45

/** At the live edge, pull fast-forward back to 1x; slower-than-real-time speeds are kept. */
export function resetPreviewPlaybackRate(el: HTMLMediaElement): void {
  if (el.playbackRate > 1) {
    el.playbackRate = 1
  }
}

/** Live-edge DVR window (last MSE range): rewind start → current buffer end. */
export function previewDvrWindow(el: HTMLMediaElement): { start: number; end: number } | null {
  const b = el.buffered
  if (b.length === 0) return null
  const i = b.length - 1
  return { start: b.start(i), end: b.end(i) }
}

/**
 * While paused, the live buffer edge keeps moving; freeze the DVR window for UI + seek mapping.
 */
export function previewDvrWindowForUi(
  el: HTMLMediaElement,
  frozenWhilePaused: { start: number; end: number } | null
): { start: number; end: number } | null {
  const w = previewDvrWindow(el)
  if (!w) return null
  if (el.paused && frozenWhilePaused) {
    return frozenWhilePaused
  }
  return w
}

export function previewRewindDepthSec(
  window: { start: number; end: number } | null,
  keepSec: number
): number {
  if (!window) return 0
  return Math.min(keepSec, Math.max(0, window.end - window.start))
}

export function previewBehindFromSlider(
  slider: number,
  depthSec: number,
  keepSec: number
): number {
  if (depthSec <= 0 || keepSec <= 0) return 0
  const s = Math.min(keepSec, Math.max(0, slider))
  return depthSec * (1 - s / keepSec)
}

export function clampPreviewTime(
  el: HTMLMediaElement,
  t: number,
  edgePadSec = PREVIEW_EDGE_PAD_PLAYING_SEC
): number {
  const w = previewDvrWindow(el)
  if (!w) return el.currentTime
  const pad = Math.max(0, edgePadSec)
  return Math.min(Math.max(t, w.start), Math.max(w.start, w.end - pad))
}

export function previewLiveHysteresis(behind: number, wasLive: boolean): boolean {
  return behind <= (wasLive ? PREVIEW_LIVE_LEAVE_SEC : PREVIEW_LIVE_ENTER_SEC)
}

export function previewSliderFromBehind(
  behind: number,
  nearLive: boolean,
  depthSec: number,
  keepSec: number
): number {
  if (nearLive) return keepSec
  const depth = Math.max(0.001, depthSec)
  const b = Math.min(depth, Math.max(0, behind))
  return keepSec * (1 - b / depth)
}

export function seekPreview(el: HTMLMediaElement, t: number, edgePadSec?: number): void {
  const pad =
    edgePadSec ??
    (el.paused ? PREVIEW_EDGE_PAD_PAUSED_SEC : PREVIEW_EDGE_PAD_PLAYING_SEC)
  el.currentTime = clampPreviewTime(el, t, pad)
}

export function seekPreviewFromSlider(
  el: HTMLMediaElement,
  slider: number,
  keepSec: number,
  windowForUi: { start: number; end: number } | null = null
): void {
  const w = windowForUi ?? previewDvrWindow(el)
  if (!w) return
  const depth = previewRewindDepthSec(w, keepSec)
  const behind = previewBehindFromSlider(slider, depth, keepSec)
  seekPreview(el, w.end - behind)
}

export function jumpPreviewToLive(el: HTMLMediaElement): void {
  const w = previewDvrWindow(el)
  if (!w) return
  el.currentTime = Math.max(w.start, w.end - 0.2)
}

function formatPreviewClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`
}

export function formatPreviewDelay(behindSec: number): string {
  return `-${formatPreviewClock(behindSec)}`
}

/** Elapsed rewindable buffer length (0 → configured max), same style as delay. */
export function formatPreviewBufferDepth(depthSec: number): string {
  return formatPreviewDelay(depthSec)
}

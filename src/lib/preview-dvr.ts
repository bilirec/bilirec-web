/** How much already-received preview media to keep for local rewind. */
export const PREVIEW_KEEP_SECONDS = 60

/** Stay on LIVE until delay exceeds this; re-enter LIVE below the enter threshold. */
export const PREVIEW_LIVE_ENTER_SEC = 2.5
export const PREVIEW_LIVE_LEAVE_SEC = 4

export function previewBufferedWindow(
  el: HTMLMediaElement
): { start: number; end: number } | null {
  const b = el.buffered
  if (b.length === 0) return null
  const t = el.currentTime
  for (let i = 0; i < b.length; i++) {
    if (t >= b.start(i) - 0.25 && t <= b.end(i) + 0.5) {
      return { start: b.start(i), end: b.end(i) }
    }
  }
  const i = b.length - 1
  return { start: b.start(i), end: b.end(i) }
}

export function clampPreviewTime(el: HTMLMediaElement, t: number): number {
  const w = previewBufferedWindow(el)
  if (!w) return el.currentTime
  const pad = 0.08
  return Math.min(Math.max(t, w.start), Math.max(w.start, w.end - pad))
}

export function previewLiveHysteresis(behind: number, wasLive: boolean): boolean {
  return behind <= (wasLive ? PREVIEW_LIVE_LEAVE_SEC : PREVIEW_LIVE_ENTER_SEC)
}

export function previewSliderFromBehind(behind: number, nearLive: boolean): number {
  if (nearLive) return PREVIEW_KEEP_SECONDS
  return Math.min(PREVIEW_KEEP_SECONDS, Math.max(0, PREVIEW_KEEP_SECONDS - behind))
}

export function seekPreview(el: HTMLMediaElement, t: number): void {
  el.currentTime = clampPreviewTime(el, t)
}

export function seekPreviewFromSlider(el: HTMLMediaElement, slider: number): void {
  const w = previewBufferedWindow(el)
  if (!w) return
  seekPreview(el, w.end - (PREVIEW_KEEP_SECONDS - slider))
}

export function jumpPreviewToLive(el: HTMLMediaElement): void {
  const w = previewBufferedWindow(el)
  if (!w) return
  el.currentTime = Math.max(w.start, w.end - 0.2)
}

export function formatPreviewDelay(behindSec: number): string {
  const s = Math.max(0, Math.floor(behindSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `-${m}:${r.toString().padStart(2, "0")}`
}

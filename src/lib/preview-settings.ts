/** Default live-recording preview rewind window (seconds). */
export const PREVIEW_KEEP_SECONDS_DEFAULT = 60

/** Minimum rewind window (seconds). */
export const PREVIEW_KEEP_SECONDS_MIN = 15

/**
 * Upper bound for browser-side preview buffer (seconds).
 * ~120s at 6 Mbps 1080p ≈ 90 MB compressed; beyond this, tabs and mobile devices often struggle.
 */
export const PREVIEW_KEEP_SECONDS_MAX = 120

/** Show a memory warning in settings when the chosen value is at or above this (seconds). */
export const PREVIEW_KEEP_SECONDS_WARN_FROM = 90

const STORAGE_KEY = "bilirec.preview.keepSeconds"

export function clampPreviewKeepSeconds(seconds: number): number {
  const n = Math.round(seconds)
  if (!Number.isFinite(n)) return PREVIEW_KEEP_SECONDS_DEFAULT
  return Math.min(PREVIEW_KEEP_SECONDS_MAX, Math.max(PREVIEW_KEEP_SECONDS_MIN, n))
}

export function loadPreviewKeepSeconds(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null || raw === "") return PREVIEW_KEEP_SECONDS_DEFAULT
    const n = Number(raw)
    if (!Number.isFinite(n)) return PREVIEW_KEEP_SECONDS_DEFAULT
    return clampPreviewKeepSeconds(n)
  } catch {
    return PREVIEW_KEEP_SECONDS_DEFAULT
  }
}

export function savePreviewKeepSeconds(seconds: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampPreviewKeepSeconds(seconds)))
  } catch {
    /* ignore quota / private mode */
  }
}

export function shouldWarnPreviewKeepSeconds(seconds: number): boolean {
  return clampPreviewKeepSeconds(seconds) >= PREVIEW_KEEP_SECONDS_WARN_FROM
}

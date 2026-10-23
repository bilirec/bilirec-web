const DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** `datetime-local` value without seconds (YYYY-MM-DDTHH:mm). */
export function parseRecordingBrowseDatetimeLocal(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = DATETIME_LOCAL_RE.exec(trimmed)
  if (!match) return null
  const [, y, mo, d, h, mi] = match
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatRecordingBrowseDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function recordingBrowseDefaultTime(kind: 'start' | 'end'): string {
  return kind === 'end' ? '23:59' : '00:00'
}

export function mergeRecordingBrowseDateAndTime(date: Date, timeHHmm: string): Date {
  const [h, m] = timeHHmm.split(':').map((part) => Number.parseInt(part, 10))
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0)
  return next
}

export function recordingBrowseTimeHHmm(value: string, kind: 'start' | 'end'): string {
  const parsed = parseRecordingBrowseDatetimeLocal(value)
  if (!parsed) return recordingBrowseDefaultTime(kind)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function stripToLocalDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Calendar range selection (date-only; times live in separate fields). */
export function recordingBrowseCalendarRangeFromValues(
  startValue: string,
  endValue: string,
): { from: Date; to?: Date } | undefined {
  const from = parseRecordingBrowseDatetimeLocal(startValue)
  const to = parseRecordingBrowseDatetimeLocal(endValue)
  if (!from && !to) return undefined
  const rangeFrom = from ? stripToLocalDate(from) : to ? stripToLocalDate(to) : undefined
  if (!rangeFrom) return undefined
  return {
    from: rangeFrom,
    to: to ? stripToLocalDate(to) : undefined,
  }
}

/** API query format for /files/browse start and end (matches recording filename stamp). */
export function recordingBrowseStampFromDatetimeLocal(value: string, kind: 'start' | 'end'): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (!match) return null

  const [, y, mo, d, h, mi, secRaw] = match
  const sec = secRaw ?? (kind === 'end' ? '59' : '00')
  return `${y}${mo}${d}_${h}${mi}${sec}`
}

export function isRecordingBrowseRangeInvalid(startInput: string, endInput: string): boolean {
  const start = recordingBrowseStampFromDatetimeLocal(startInput, 'start')
  const end = recordingBrowseStampFromDatetimeLocal(endInput, 'end')
  if (!start || !end) return false
  return start > end
}

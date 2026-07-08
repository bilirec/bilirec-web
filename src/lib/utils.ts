import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { i18n } from '@/i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Video container extensions that bilirec can convert to MP4 (excludes mp4 itself). */
const CONVERTIBLE_VIDEO_EXTENSIONS = new Set(['ts', 'fmp4', 'flv'])

export function isConvertibleVideoFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext ? CONVERTIBLE_VIDEO_EXTENSIONS.has(ext) : false
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''

  return formatRelativeTimeLabel(date)
}

export function isValidServerUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase()
  return trimmed.startsWith('http://') || trimmed.startsWith('https://')
}

export function normalizeText(value?: string): string {
  if (!value) return ''

  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface LiveTimeMeta {
  relativeLabel: string
  title: string
}

function formatRelativeTimeLabel(date: Date): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))

  if (diffSeconds < 1) return i18n.t('time.justNow')
  if (diffSeconds < 60) return i18n.t('time.secondsAgo', { count: diffSeconds })

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return i18n.t('time.minutesAgo', { count: diffMinutes })

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return i18n.t('time.hoursAgo', { count: diffHours })

  const diffDays = Math.floor(diffHours / 24)
  return i18n.t('time.daysAgo', { count: diffDays })
}

export function getLiveTimeMeta(liveTime?: string): LiveTimeMeta | null {
  if (!liveTime) return null

  const startedAt = new Date(liveTime)
  if (Number.isNaN(startedAt.getTime())) return null

  const title = startedAt.toLocaleString(i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  return {
    relativeLabel: formatRelativeTimeLabel(startedAt),
    title,
  }
}


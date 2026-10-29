import { useTranslation } from 'react-i18next'
import {
  ENQUEUE_UNHEALTHY_MS,
  ENQUEUE_WARNING_MS,
  FLUSH_WARNING_MS,
  SYNC_WARNING_MS,
  TIMELINE_WARNING_MS,
  streamHealthIconClass,
} from '@/lib/stream-io-health'
import { cn, formatFileSize, formatHealthScorePercent } from '@/lib/utils'
import type { StreamIoRate } from '@/lib/types'

interface StreamHealthDetailsProps {
  ioRate: StreamIoRate
  compact?: boolean
}

function formatWindowMs(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)} s`
  }
  return `${Math.round(ms)} ms`
}

export function StreamHealthDetails({
  ioRate,
  compact = true,
}: StreamHealthDetailsProps) {
  const { t } = useTranslation()
  const healthClass = streamHealthIconClass(ioRate.health)

  const flushMs = ioRate.flushMs ?? 0
  const syncMs = ioRate.syncMs ?? 0
  const enqueueWaitMs = ioRate.enqueueWaitMs ?? 0
  const timelineGapMs = ioRate.timelineGapMs ?? 0

  const showSlowFlush = flushMs >= FLUSH_WARNING_MS
  const showSlowSync = syncMs >= SYNC_WARNING_MS
  const showEnqueue = enqueueWaitMs >= ENQUEUE_WARNING_MS
  const showTimelineGap = timelineGapMs >= TIMELINE_WARNING_MS

  return (
    <div className={cn('flex flex-col gap-1.5', compact ? 'text-[11px]' : 'text-sm')}>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">{t('recordCard.readRate')}</span>
        <span className="font-mono">{formatFileSize(ioRate.readBps)}/s</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">{t('recordCard.writeRate')}</span>
        <span className="font-mono">{formatFileSize(ioRate.writeBps)}/s</span>
      </div>
      {ioRate.lagBytes > 0 && (
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">{t('recordCard.writeLag')}</span>
          <span className="font-mono text-muted-foreground">
            {formatFileSize(ioRate.lagBytes)}
          </span>
        </div>
      )}
      {showSlowFlush && (
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">{t('recordCard.slowFlush')}</span>
          <span className={cn('font-mono', streamHealthIconClass('warning'))}>
            {formatWindowMs(flushMs)}
          </span>
        </div>
      )}
      {showSlowSync && (
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">{t('recordCard.slowSync')}</span>
          <span className={cn('font-mono', streamHealthIconClass('warning'))}>
            {formatWindowMs(syncMs)}
          </span>
        </div>
      )}
      {showEnqueue && (
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">{t('recordCard.enqueueWait')}</span>
          <span
            className={cn(
              'font-mono',
              streamHealthIconClass(
                enqueueWaitMs >= ENQUEUE_UNHEALTHY_MS ? 'unhealthy' : 'warning',
              ),
            )}
          >
            {formatWindowMs(enqueueWaitMs)}
          </span>
        </div>
      )}
      {showTimelineGap && (
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">{t('recordCard.timelineGap')}</span>
          <span className={cn('font-mono', streamHealthIconClass('warning'))}>
            {formatWindowMs(timelineGapMs)}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">{t('recordCard.streamHealthScore')}</span>
        <span className={cn('font-mono', healthClass)}>
          {formatHealthScorePercent(ioRate.healthScorePercent)}
        </span>
      </div>
      {ioRate.health === 'warning' && (ioRate.lagStreak ?? 0) >= 1 && (
        <p className={cn('leading-snug', streamHealthIconClass('warning'))}>
          {t('recordCard.streamHealthWarningHint')}
        </p>
      )}
      {ioRate.health === 'unhealthy' && ioRate.backpressure && (
        <p className={cn('leading-snug', streamHealthIconClass('unhealthy'))}>
          {t('recordCard.backpressureHint')}
        </p>
      )}
      {ioRate.health === 'unhealthy' &&
        !ioRate.backpressure &&
        enqueueWaitMs >= ENQUEUE_UNHEALTHY_MS && (
          <p className={cn('leading-snug', streamHealthIconClass('unhealthy'))}>
            {t('recordCard.enqueueUnhealthyHint')}
          </p>
        )}
      {showSlowFlush && (
        <p className={cn('leading-snug', streamHealthIconClass('warning'))}>
          {t('recordCard.slowFlushHint')}
        </p>
      )}
      {showSlowSync && (
        <p className={cn('leading-snug', streamHealthIconClass('warning'))}>
          {t('recordCard.slowSyncHint')}
        </p>
      )}
      {showEnqueue && enqueueWaitMs >= ENQUEUE_WARNING_MS && enqueueWaitMs < ENQUEUE_UNHEALTHY_MS && (
        <p className={cn('leading-snug', streamHealthIconClass('warning'))}>
          {t('recordCard.enqueueWarningHint')}
        </p>
      )}
      {showTimelineGap && (
        <p className={cn('leading-snug', streamHealthIconClass('warning'))}>
          {t('recordCard.timelineGapHint')}
        </p>
      )}
    </div>
  )
}

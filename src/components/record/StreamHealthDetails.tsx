import { useTranslation } from 'react-i18next'
import { streamHealthIconClass } from '@/lib/stream-io-health'
import { cn, formatFileSize, formatHealthScorePercent } from '@/lib/utils'
import type { StreamIoRate } from '@/lib/types'

interface StreamHealthDetailsProps {
  ioRate: StreamIoRate
  compact?: boolean
}

export function StreamHealthDetails({
  ioRate,
  compact = true,
}: StreamHealthDetailsProps) {
  const { t } = useTranslation()
  const healthClass = streamHealthIconClass(ioRate.health)

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
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">{t('recordCard.streamHealthScore')}</span>
        <span className={cn('font-mono', healthClass)}>
          {formatHealthScorePercent(ioRate.healthScorePercent)}
        </span>
      </div>
      {ioRate.health === 'warning' && (
        <p className={cn('leading-snug', streamHealthIconClass('warning'))}>
          {t('recordCard.streamHealthWarningHint')}
        </p>
      )}
      {ioRate.health === 'unhealthy' && (
        <p className={cn('leading-snug', streamHealthIconClass('unhealthy'))}>
          {t('recordCard.backpressureHint')}
        </p>
      )}
    </div>
  )
}

import { useState } from 'react'
import { CircleNotchIcon, PulseIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StreamHealthDetails } from '@/components/record/StreamHealthDetails'
import { useIsMobile } from '@/hooks/use-mobile'
import { streamHealthIconClass, streamHealthUsesFillIcon } from '@/lib/stream-io-health'
import { cn } from '@/lib/utils'
import type { StreamIoRate } from '@/lib/types'

interface StreamHealthIndicatorProps {
  ioRate: StreamIoRate
}

export function StreamHealthLoading() {
  const { t } = useTranslation()

  return (
    <span
      className="inline-flex shrink-0 rounded-full p-0.5 text-muted-foreground"
      aria-label={t('recordCard.streamHealthLoadingAria')}
      aria-busy="true"
    >
      <CircleNotchIcon size={16} className="animate-spin" aria-hidden />
    </span>
  )
}

export function StreamHealthIndicator({ ioRate }: StreamHealthIndicatorProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  const iconClass = cn('shrink-0', streamHealthIconClass(ioRate.health))
  const filled = streamHealthUsesFillIcon(ioRate.health)

  const triggerClass =
    'rounded-full p-0.5 transition-colors hover:bg-secondary active:bg-secondary'

  const icon = (
    <PulseIcon
      size={16}
      weight={filled ? 'fill' : 'regular'}
      className={cn(iconClass, ioRate.health === 'unhealthy' && 'animate-pulse')}
    />
  )

  const panelHeader = (
    <div className="flex items-center gap-1.5 font-semibold leading-none">
      <PulseIcon size={14} weight={filled ? 'fill' : 'regular'} className={iconClass} />
      <span>{t('recordCard.streamHealthTitle')}</span>
    </div>
  )

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          className={triggerClass}
          aria-label={t('recordCard.streamHealthAria')}
          onClick={() => setOpen(true)}
        >
          {icon}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="w-[90vw] max-w-sm">
            <DialogHeader className="text-left">
              <DialogTitle className="inline-flex items-center gap-1.5 self-start text-left leading-snug">
                <PulseIcon size={20} weight={filled ? 'fill' : 'regular'} className={iconClass} />
                <span>{t('recordCard.streamHealthTitle')}</span>
              </DialogTitle>
            </DialogHeader>
            <StreamHealthDetails ioRate={ioRate} compact={false} />
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={triggerClass}
          aria-label={t('recordCard.streamHealthAria')}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        arrowClassName="bg-popover fill-popover"
        className="max-w-72 rounded-lg border border-border bg-popover p-3 text-left text-popover-foreground shadow-lg"
      >
        <div className="flex flex-col gap-2">
          {panelHeader}
          <StreamHealthDetails ioRate={ioRate} compact />
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

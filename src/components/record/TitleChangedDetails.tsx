import { FolderIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface TitleChangedDetailsProps {
  sessionTitle: string
  compact?: boolean
}

export function TitleChangedDetails({
  sessionTitle,
  compact = true,
}: TitleChangedDetailsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <p
        className={cn(
          'leading-snug text-muted-foreground',
          compact ? 'text-[11px]' : 'text-sm',
        )}
      >
        {t('recordCard.titleChangedHint')}
      </p>
      <div
        className={cn(
          'flex items-center rounded-md border border-border/60 bg-secondary/50',
          compact ? 'gap-1.5 px-2 py-1.5' : 'gap-2 px-3 py-2',
        )}
      >
        <FolderIcon
          size={compact ? 12 : 18}
          className="shrink-0 text-muted-foreground"
        />
        <span
          className={cn(
            'min-w-0 break-all font-medium leading-snug',
            !compact && 'text-sm',
          )}
        >
          {sessionTitle}
        </span>
      </div>
    </div>
  )
}

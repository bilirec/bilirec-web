import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { QUALITY_OPTIONS, type RecordStartPrefs } from '@/lib/record-prefs'
import { useTranslation } from 'react-i18next'

interface RecordStartOptionsProps {
  value: RecordStartPrefs
  onChange: (value: RecordStartPrefs) => void
  disabled?: boolean
}

export function RecordStartOptions({ value, onChange, disabled = false }: RecordStartOptionsProps) {
  const { t } = useTranslation()

  const selectedQn = value.qn

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
        <div className="space-y-1">
          <Label>{t('recordStartOptions.quality')}</Label>
          <p className="text-sm text-muted-foreground">{t('recordStartOptions.qualityHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUALITY_OPTIONS.map((option) => {
            const isDefaultOriginal = option.qn === undefined
            const isSelected = isDefaultOriginal
              ? selectedQn === undefined
              : selectedQn === option.qn
            return (
              <Button
                key={isDefaultOriginal ? 'original' : option.qn}
                type="button"
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                className="flex-1 sm:flex-none border"
                disabled={disabled}
                onClick={() => onChange({ ...value, qn: option.qn })}
              >
                {t(`recordStartOptions.${option.labelKey}`)}
              </Button>
            )
          })}
        </div>
        {(selectedQn === 20000 || selectedQn === 30000) && (
          <p className="text-xs text-destructive/70 dark:text-destructive/55">
            {t('recordStartOptions.qualityHighBitrateHint')}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3">
        <div className="space-y-1">
          <Label htmlFor="record-only-audio">{t('recordStartOptions.onlyAudio')}</Label>
          <p className="text-sm text-muted-foreground">{t('recordStartOptions.onlyAudioHint')}</p>
        </div>
        <Switch
          id="record-only-audio"
          checked={value.onlyAudio ?? false}
          onCheckedChange={(checked) => onChange({ ...value, onlyAudio: checked })}
          disabled={disabled}
        />
      </div>
    </div>
  )
}

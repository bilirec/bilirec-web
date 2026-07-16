import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  normalizeStreamProfiles,
  type RecordStartConfig,
  type StreamProfileValue,
} from '@/lib/room-config'
import { useTranslation } from 'react-i18next'

interface QualityOption {
  qn?: number
  labelKey: string
}

const QUALITY_OPTIONS: QualityOption[] = [
  { labelKey: 'qualityOriginal' },
  { qn: 80, labelKey: 'qualitySmooth' },
  { qn: 150, labelKey: 'qualityHigh' },
  { qn: 250, labelKey: 'qualitySuper' },
  { qn: 400, labelKey: 'qualityBluRay' },
  { qn: 20000, labelKey: 'quality4k' },
  { qn: 30000, labelKey: 'qualityDolby' },
]

interface StreamProfileOption {
  value: StreamProfileValue
  labelKey: string
}

const STREAM_PROFILE_OPTIONS: StreamProfileOption[] = [
  { value: 'http-flv', labelKey: 'streamProfileFlv' },
  { value: 'hls-fmp4', labelKey: 'streamProfileHlsFmp4' },
  { value: 'hls-ts', labelKey: 'streamProfileHlsTs' },
]

interface RecordStartOptionsProps {
  value: RecordStartConfig
  onChange: (value: RecordStartConfig) => void
  disabled?: boolean
  durationHintKey?: string
}

export function RecordStartOptions({
  value,
  onChange,
  disabled = false,
  durationHintKey = 'recordsView.durationHint',
}: RecordStartOptionsProps) {
  const { t } = useTranslation()

  const recordDuration = value.record_duration_minutes ?? 0
  const selectedQn = value.qn === 0 ? undefined : value.qn
  const selectedStreamProfiles = normalizeStreamProfiles(value.stream_profiles)

  const toggleStreamProfile = (profile: StreamProfileValue) => {
    const next = selectedStreamProfiles.includes(profile)
      ? selectedStreamProfiles.filter((item) => item !== profile)
      : [...selectedStreamProfiles, profile]
    onChange({ ...value, stream_profiles: next })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
        <div className="space-y-1">
          <Label>{t('roomConfig.recordDuration')}</Label>
          <p className="text-sm text-muted-foreground">{t(durationHintKey)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={recordDuration === 0 ? 'default' : 'outline'}
            size="sm"
            className="flex-1 sm:flex-none border"
            disabled={disabled}
            onClick={() => onChange({ ...value, record_duration_minutes: 0 })}
          >
            {t('roomConfig.recordDurationDefault')}
          </Button>
          <Button
            type="button"
            variant={recordDuration === -1 ? 'default' : 'outline'}
            size="sm"
            className="flex-1 sm:flex-none border"
            disabled={disabled}
            onClick={() => onChange({ ...value, record_duration_minutes: -1 })}
          >
            {t('roomConfig.recordDurationUnlimited')}
          </Button>
          {[60, 180, 300, 600].map((n) => (
            <Button
              key={n}
              type="button"
              variant={recordDuration === n ? 'default' : 'outline'}
              size="sm"
              className="flex-1 sm:flex-none border"
              disabled={disabled}
              onClick={() => onChange({ ...value, record_duration_minutes: n })}
            >
              {t('roomConfig.recordDurationHours', { n: n / 60 })}
            </Button>
          ))}
        </div>
      </div>

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
                onClick={() => onChange({ ...value, qn: option.qn ?? 0 })}
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

      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
        <div className="space-y-1">
          <Label>{t('recordStartOptions.streamProfile')}</Label>
          <p className="text-sm text-muted-foreground">{t('recordStartOptions.streamProfileHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STREAM_PROFILE_OPTIONS.map((option) => {
            const isSelected = selectedStreamProfiles.includes(option.value)
            return (
              <Button
                key={option.value}
                type="button"
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                className="flex-1 sm:flex-none border"
                disabled={disabled}
                onClick={() => toggleStreamProfile(option.value)}
              >
                {t(`recordStartOptions.${option.labelKey}`)}
              </Button>
            )
          })}
        </div>
        {selectedStreamProfiles.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('recordStartOptions.streamProfileAutoHint')}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3">
        <div className="space-y-1">
          <Label htmlFor="record-only-audio">{t('recordStartOptions.onlyAudio')}</Label>
          <p className="text-sm text-muted-foreground">{t('recordStartOptions.onlyAudioHint')}</p>
        </div>
        <Switch
          id="record-only-audio"
          checked={value.only_audio ?? false}
          onCheckedChange={(checked) => onChange({ ...value, only_audio: checked })}
          disabled={disabled}
        />
      </div>
    </div>
  )
}

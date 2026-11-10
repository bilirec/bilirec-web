import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  normalizeStreamProfiles,
  type RecordStartConfig,
  type RecordStartOptionsView,
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

const DURATION_MIN_HOURS = 1
const DURATION_MAX_HOURS = 24
const DURATION_FALLBACK_HOURS = 3

interface RecordDurationSelectorProps {
  /** 0 = system default, -1 = unlimited, > 0 = custom minutes. */
  value: number
  onChange: (minutes: number) => void
  disabled?: boolean
}

export function RecordDurationSelector({ value, onChange, disabled = false }: RecordDurationSelectorProps) {
  const { t } = useTranslation()
  const isCustom = value > 0
  const isUnlimited = value === -1
  const clampedHours = (hours: number) =>
    Math.min(DURATION_MAX_HOURS, Math.max(DURATION_MIN_HOURS, Math.round(hours)))
  /** Remembered slider position so re-entering "custom" restores the last chosen hours. */
  const [customHours, setCustomHours] = useState(() =>
    isCustom ? clampedHours(value / 60) : DURATION_FALLBACK_HOURS
  )

  useEffect(() => {
    if (isCustom) {
      setCustomHours(clampedHours(value / 60))
    }
  }, [isCustom, value])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={!isCustom && !isUnlimited ? 'default' : 'outline'}
          size="sm"
          className="flex-1 sm:flex-none border"
          disabled={disabled}
          onClick={() => onChange(0)}
        >
          {t('roomConfig.recordDurationDefault')}
        </Button>
        <Button
          type="button"
          variant={isUnlimited ? 'default' : 'outline'}
          size="sm"
          className="flex-1 sm:flex-none border"
          disabled={disabled}
          onClick={() => onChange(-1)}
        >
          {t('roomConfig.recordDurationUnlimited')}
        </Button>
        <Button
          type="button"
          variant={isCustom ? 'default' : 'outline'}
          size="sm"
          className="flex-1 sm:flex-none border"
          disabled={disabled}
          onClick={() => onChange(customHours * 60)}
        >
          {t('roomConfig.recordDurationCustom')}
        </Button>
      </div>

      {isCustom && (
        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <div className="flex items-center justify-between text-sm font-medium tabular-nums">
            <span>{t('roomConfig.recordDuration')}</span>
            <span>
              {value % 60 === 0
                ? t('roomConfig.recordDurationHours', { n: value / 60 })
                : t('roomConfig.recordDurationMinutes', { n: value })}
            </span>
          </div>
          <Slider
            min={DURATION_MIN_HOURS}
            max={DURATION_MAX_HOURS}
            step={1}
            value={[customHours]}
            disabled={disabled}
            onValueChange={(next) => {
              setCustomHours(next[0])
              onChange(next[0] * 60)
            }}
            aria-label={t('roomConfig.recordDuration')}
          />
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{t('roomConfig.recordDurationHours', { n: DURATION_MIN_HOURS })}</span>
            <span>{t('roomConfig.recordDurationHours', { n: DURATION_MAX_HOURS })}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t('roomConfig.recordDurationCustomHint')}</p>
        </div>
      )}
    </div>
  )
}

interface RecordStartOptionsProps {
  value: RecordStartConfig
  onChange: (value: RecordStartConfig) => void
  view: RecordStartOptionsView
  disabled?: boolean
  durationHintKey?: string
}

export function RecordStartOptions({
  value,
  onChange,
  view,
  disabled = false,
  durationHintKey = 'recordsView.durationHint',
}: RecordStartOptionsProps) {
  const { t } = useTranslation()
  const showDeleteOldestOnLowDisk = view !== 'records'

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
        <RecordDurationSelector
          value={value.record_duration_minutes ?? 0}
          onChange={(minutes) => onChange({ ...value, record_duration_minutes: minutes })}
          disabled={disabled}
        />
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

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3">
        <div className="space-y-1">
          <Label htmlFor="record-danmaku">{t('recordStartOptions.recordDanmaku')}</Label>
          <p className="text-sm text-muted-foreground">{t('recordStartOptions.recordDanmakuHint')}</p>
        </div>
        <Switch
          id="record-danmaku"
          checked={value.record_danmaku ?? false}
          onCheckedChange={(checked) => onChange({ ...value, record_danmaku: checked })}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3">
        <div className="space-y-1">
          <Label htmlFor="record-subtitle">{t('recordStartOptions.recordSubtitle')}</Label>
          <p className="text-sm text-muted-foreground">{t('recordStartOptions.recordSubtitleHint')}</p>
        </div>
        <Switch
          id="record-subtitle"
          checked={value.record_subtitle ?? false}
          onCheckedChange={(checked) => onChange({ ...value, record_subtitle: checked })}
          disabled={disabled}
        />
      </div>

      {showDeleteOldestOnLowDisk && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3">
          <div className="space-y-1">
            <Label htmlFor="record-delete-oldest">{t('recordStartOptions.deleteOldestOnLowDisk')}</Label>
            <p className="text-sm text-muted-foreground">{t('recordStartOptions.deleteOldestOnLowDiskHint')}</p>
          </div>
          <Switch
            id="record-delete-oldest"
            checked={value.delete_oldest_on_low_disk ?? false}
            onCheckedChange={(checked) => onChange({ ...value, delete_oldest_on_low_disk: checked })}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}

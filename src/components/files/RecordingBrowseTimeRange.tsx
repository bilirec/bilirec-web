import { useMemo } from 'react'
import { format } from 'date-fns'
import type { Locale as DateFnsLocale } from 'date-fns'
import { CalendarBlankIcon } from '@phosphor-icons/react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  formatRecordingBrowseDatetimeLocal,
  mergeRecordingBrowseDateAndTime,
  parseRecordingBrowseDatetimeLocal,
  recordingBrowseCalendarRangeFromValues,
  recordingBrowseTimeHHmm,
} from '@/lib/recording-browse-time'
import { useAppDateLocales } from '@/lib/app-date-locale'
import { useTranslation } from 'react-i18next'

type RecordingBrowseTimeRangeProps = {
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onClear: () => void
}

function formatRangeLabel(startValue: string, endValue: string, locale: DateFnsLocale): string {
  const from = parseRecordingBrowseDatetimeLocal(startValue)
  const to = parseRecordingBrowseDatetimeLocal(endValue)
  if (!from) return ''
  const fromLabel = format(from, 'PPP', { locale })
  if (!to) return fromLabel
  const toLabel = format(to, 'PPP', { locale })
  return `${fromLabel} - ${toLabel}`
}

function TimeRangePickerPanel({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  onClear,
  numberOfMonths,
}: {
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onClear: () => void
  numberOfMonths: number
}) {
  const { t } = useTranslation()
  const { dayPicker: dayLocale } = useAppDateLocales()
  const selected = useMemo(
    () => recordingBrowseCalendarRangeFromValues(startValue, endValue),
    [startValue, endValue],
  )
  const startTime = recordingBrowseTimeHHmm(startValue, 'start')
  const endTime = recordingBrowseTimeHHmm(endValue, 'end')
  const hasRange = Boolean(startValue.trim() || endValue.trim())

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from) {
      return
    }
    onStartChange(
      formatRecordingBrowseDatetimeLocal(
        mergeRecordingBrowseDateAndTime(range.from, startTime),
      ),
    )
    if (range.to) {
      onEndChange(
        formatRecordingBrowseDatetimeLocal(
          mergeRecordingBrowseDateAndTime(range.to, endTime),
        ),
      )
    } else {
      onEndChange('')
    }
  }

  const handleStartTime = (hhmm: string) => {
    if (!hhmm) return
    const day =
      selected?.from ??
      selected?.to ??
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    onStartChange(formatRecordingBrowseDatetimeLocal(mergeRecordingBrowseDateAndTime(day, hhmm)))
  }

  const handleEndTime = (hhmm: string) => {
    if (!hhmm) return
    const day =
      selected?.to ??
      selected?.from ??
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    onEndChange(formatRecordingBrowseDatetimeLocal(mergeRecordingBrowseDateAndTime(day, hhmm)))
  }

  return (
    <div className="flex flex-col">
      <div className="flex justify-center overflow-x-auto">
        <Calendar
          mode="range"
          locale={dayLocale}
          defaultMonth={selected?.from ?? selected?.to}
          selected={selected}
          onSelect={handleRangeSelect}
          numberOfMonths={numberOfMonths}
          className="[--cell-size:2.25rem]"
        />
      </div>
      <div className="flex flex-col gap-3 border-t p-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="files-range-start-time" className="text-xs text-muted-foreground">
              {t('filesView.timeRangeStart')}
            </Label>
            <Input
              id="files-range-start-time"
              type="time"
              value={startTime}
              onChange={(e) => handleStartTime(e.target.value)}
              className="h-9 bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="files-range-end-time" className="text-xs text-muted-foreground">
              {t('filesView.timeRangeEnd')}
            </Label>
            <Input
              id="files-range-end-time"
              type="time"
              value={endTime}
              onChange={(e) => handleEndTime(e.target.value)}
              className="h-9 bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            />
          </div>
        </div>
        {hasRange ? (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={onClear}>
            {t('filesView.timeRangeClear')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function RecordingBrowseTimeRange({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  onClear,
}: RecordingBrowseTimeRangeProps) {
  const { t } = useTranslation()
  const hasRange = Boolean(startValue.trim() || endValue.trim())
  const triggerLabel = t('filesView.timeRangeLabel')
  const { dateFns } = useAppDateLocales()
  const rangeSummary = formatRangeLabel(startValue, endValue, dateFns)
  const triggerAria = hasRange && rangeSummary ? `${triggerLabel}: ${rangeSummary}` : triggerLabel
  const tooltipText = hasRange && rangeSummary ? rangeSummary : t('filesView.timeRangePick')

  const rangeActiveDot = hasRange ? (
    <span
      className="pointer-events-none absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary"
      aria-hidden
    />
  ) : null

  return (
    <>
      <div className="sm:hidden">
        <Dialog>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative size-8 shrink-0"
              aria-label={triggerAria}
            >
              <CalendarBlankIcon className="size-4" />
              {rangeActiveDot}
            </Button>
          </DialogTrigger>
          <DialogContent className="flex max-h-[min(90dvh,720px)] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b px-4 py-3 text-left">
              <DialogTitle>{triggerLabel}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto">
              <TimeRangePickerPanel
                startValue={startValue}
                endValue={endValue}
                onStartChange={onStartChange}
                onEndChange={onEndChange}
                onClear={onClear}
                numberOfMonths={1}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 sm:flex sm:gap-2">
        <Label className="cursor-default text-xs text-muted-foreground sm:text-sm whitespace-nowrap">
          {triggerLabel}
        </Label>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="relative size-8 shrink-0"
                  aria-label={triggerAria}
                >
                  <CalendarBlankIcon className="size-4" />
                  {rangeActiveDot}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{tooltipText}</TooltipContent>
          </Tooltip>
          <PopoverContent
            align="end"
            className="w-auto max-w-[calc(100vw-1rem)] overflow-x-auto p-0"
          >
            <TimeRangePickerPanel
              startValue={startValue}
              endValue={endValue}
              onStartChange={onStartChange}
              onEndChange={onEndChange}
              onClear={onClear}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>
    </>
  )
}

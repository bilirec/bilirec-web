import type { RoomConfig, StartRecordRequest } from './types'

/** qn omitted = backend default (原画 / 10000) */
export interface RecordStartPrefs {
  qn?: number
  onlyAudio?: boolean
}

export interface QualityOption {
  qn?: number
  labelKey: string
}

export const QUALITY_OPTIONS: QualityOption[] = [
  { labelKey: 'qualityOriginal' },
  { qn: 80, labelKey: 'qualitySmooth' },
  { qn: 150, labelKey: 'qualityHigh' },
  { qn: 250, labelKey: 'qualitySuper' },
  { qn: 400, labelKey: 'qualityBluRay' },
  { qn: 20000, labelKey: 'quality4k' },
  { qn: 30000, labelKey: 'qualityDolby' },
]

export function defaultRecordStartPrefs(): RecordStartPrefs {
  return { onlyAudio: false }
}

export function buildStartRecordParams(
  roomId: number,
  config: Pick<RoomConfig, 'record_duration_minutes'> | null | undefined,
  sessionPrefs?: RecordStartPrefs
): StartRecordRequest {
  const params: StartRecordRequest = { roomId }

  const duration = config?.record_duration_minutes
  if (duration !== undefined && duration !== null) {
    params.durationMinutes = duration
  }

  if (sessionPrefs?.qn !== undefined) {
    params.qn = sessionPrefs.qn
  }
  if (sessionPrefs?.onlyAudio) {
    params.onlyAudio = true
  }

  return params
}

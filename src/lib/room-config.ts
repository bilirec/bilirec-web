import type { RoomConfig, StartRecordRequest } from './types'

export type RecordStartConfig = Pick<RoomConfig, 'record_duration_minutes' | 'qn' | 'only_audio'>

export function defaultRecordStartConfig(): RecordStartConfig {
  return { record_duration_minutes: 0, qn: 0, only_audio: false }
}

export function recordStartConfigFromRoomConfig(config: RoomConfig): RecordStartConfig {
  return {
    record_duration_minutes: config.record_duration_minutes ?? 0,
    qn: config.qn ?? 0,
    only_audio: config.only_audio ?? false,
  }
}

export function buildStartRecordParams(
  roomId: number,
  config: Pick<RoomConfig, 'record_duration_minutes' | 'qn' | 'only_audio'> | null | undefined,
): StartRecordRequest {
  const params: StartRecordRequest = { roomId }

  const duration = config?.record_duration_minutes
  if (duration !== undefined && duration !== null) {
    params.durationMinutes = duration
  }

  const qn = config?.qn
  if (qn !== undefined && qn !== 0) {
    params.qn = qn
  }
  if (config?.only_audio) {
    params.onlyAudio = true
  }

  return params
}

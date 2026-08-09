import type { RoomConfig, StartRecordRequest } from './types'

export type RecordStartConfig = Pick<
  RoomConfig,
  'record_duration_minutes' | 'qn' | 'only_audio' | 'record_danmaku' | 'stream_profiles'
>

export const STREAM_PROFILE_VALUES = ['http-flv', 'hls-fmp4', 'hls-ts'] as const
export type StreamProfileValue = (typeof STREAM_PROFILE_VALUES)[number]

export function normalizeStreamProfiles(
  raw: readonly string[] | null | undefined,
): StreamProfileValue[] {
  if (!raw?.length) {
    return []
  }
  const allowed = new Set<string>(STREAM_PROFILE_VALUES)
  const seen = new Set<StreamProfileValue>()
  const out: StreamProfileValue[] = []
  for (const part of raw) {
    const value = part.trim()
    if (!allowed.has(value) || seen.has(value as StreamProfileValue)) {
      continue
    }
    seen.add(value as StreamProfileValue)
    out.push(value as StreamProfileValue)
  }
  return out
}

export function defaultRecordStartConfig(): RecordStartConfig {
  return {
    record_duration_minutes: 0,
    qn: 0,
    only_audio: false,
    record_danmaku: false,
    stream_profiles: [],
  }
}

export function recordStartConfigFromRoomConfig(config: RoomConfig): RecordStartConfig {
  return {
    record_duration_minutes: config.record_duration_minutes ?? 0,
    qn: config.qn ?? 0,
    only_audio: config.only_audio ?? false,
    record_danmaku: config.record_danmaku ?? false,
    stream_profiles: normalizeStreamProfiles(config.stream_profiles),
  }
}

export function buildStartRecordParams(
  roomId: number,
  config:
    | Pick<RoomConfig, 'record_duration_minutes' | 'qn' | 'only_audio' | 'record_danmaku' | 'stream_profiles'>
    | null
    | undefined,
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
  if (config?.record_danmaku) {
    params.recordDanmaku = true
  }
  const streamProfiles = normalizeStreamProfiles(config?.stream_profiles)
  if (streamProfiles.length > 0) {
    params.streamProfiles = streamProfiles
  }

  return params
}

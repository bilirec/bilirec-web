export interface LoginRequest {
  user: string
  pass: string
}

export interface LoginResponse {
  user: string
  role: string
}

export interface RoomInfo {
  room_id: number
  uid: number
  area_id: number
  live_status: number
  live_url: string
  parent_area_id: number
  title: string
  parent_area_name: string
  area_name: string
  live_time: string
  description: string
  tags: string
  attention: number
  online: number
  short_id: number
  uname: string
  cover: string
  background: string
  join_slide: number
  live_id: number
  live_id_str: string
  lock_status: number
  hidden_status: number
  is_encrypted: boolean
}

export interface RecordTask {
  roomId: number
  status: 'recording' | 'recovering' | 'idle'
  fileName?: string
  fileSize?: number
  recordedTime?: number
  startTime?: string | number
  actualQn?: number
  isAudioOnly?: boolean
  error?: string
  roomInfo?: RoomInfo
}

export interface RecorderStats {
  bytes_written: number
  elapsed_seconds: number
  start_time: number
  status: string
  output_path: string
  actual_qn?: number
  is_audio_only?: boolean
}

export type RecordStatus = 'recording' | 'recovering' | 'idle'
// Response from /record/{room}/info
export interface RecordInfo {
  room_id: number
  status: RecordStatus
}

export interface RecordFile {
  name: string
  size: number
  path: string
  is_dir: boolean
  is_recording: boolean
}

export interface RecordFileListResponse {
  total: number
  items: RecordFile[]
}

export interface ShareFileInfo {
  url: string
  expires_in: number
}

export interface StartRecordRequest {
  roomId: number
  durationMinutes?: number
  qn?: number
  onlyAudio?: boolean
}

export interface ConvertQueue {
  provider?: 'ffmpeg' | 'cloudconvert'
  task_id: string
  input_path: string
  input_file_size?: number
  output_path: string
  input_format: string
  output_format: string
  delete_source: boolean
}

export interface SubscriptionStatus {
  room_id: number
  is_subscribed: boolean
}

export interface SubscribedRooms {
  room_ids: number[]
}

export interface LiveStatus {
  live_status: number
}

export interface RoomConfig {
  room_id: number
  auto_record: boolean
  notify: boolean
  record_duration_minutes?: number
  qn?: number
  only_audio?: boolean
}

export interface UpdateRoomConfigRequest {
  auto_record: boolean
  notify: boolean
  record_duration_minutes?: number
  qn?: number
  only_audio?: boolean
}

export interface DiskUsage {
  total: number
  used: number
  free: number
}

export interface WebPushKeys {
  auth: string
  p256dh: string
}

export interface WebPushPublicKeyResponse {
  enabled: boolean
  public_key: string
}

export interface WebPushSubscriptionRequest {
  endpoint: string
  keys: WebPushKeys
}

export interface WebPushUnsubscribeRequest {
  endpoint: string
}

export interface BilibiliAuthAccount {
  mid: number
  uname: string
}

export interface BilibiliAuthQr {
  url: string
}

export type AuthState = 'idle' | 'preloaded' | 'awaiting_qr' | 'authenticating' | 'authenticated' | 'failed' | 'qr_expired'

export interface BilibiliAuthInitResponse {
  qr?: BilibiliAuthQr
  error?: string
}

export interface BilibiliAuthStatus {
  authenticated: boolean
  state: AuthState
  account?: BilibiliAuthAccount
  qr?: BilibiliAuthQr
  lastError?: string
}
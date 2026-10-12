import type { RoomInfo } from '@/lib/types'

const KEY = 'subscribe:lastLiveStart:v1'
let cache: Record<string, string> | null = null

function load(): Record<string, string> {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    cache = {}
  }
  return cache
}

export function rememberLiveStarts(
  rooms: Iterable<Pick<RoomInfo, 'room_id' | 'live_status' | 'live_time'>>,
) {
  const map = load()
  let changed = false
  for (const room of rooms) {
    if (room.live_status !== 1) continue
    const liveTime = room.live_time
    if (!liveTime || liveTime === '0000-00-00 00:00:00') continue
    const id = String(room.room_id)
    if (map[id] === liveTime) continue
    map[id] = liveTime
    changed = true
  }
  if (!changed) return
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // private mode or quota — in-memory cache still serves badges this session
  }
}

export function getLastLiveStart(roomId: number): string | undefined {
  return load()[String(roomId)]
}

import type { DanmakuAttrs, DanmakuListItem, DanmakuType } from "n-danmaku"

export type OverlayKind = "super_chat" | "gift" | "guard"

export type PreviewChatKind = "danmaku" | OverlayKind

/** Unified timeline row for portrait chat-list mode. */
export interface PreviewChatItem {
  id: string
  kind: PreviewChatKind
  /** Seconds from segment start */
  ts: number
  user: string
  text: string
  /** Danmaku text color (css). */
  color?: string
  price?: number
  lifeSec?: number
  backgroundColor?: string
  backgroundBottomColor?: string
  backgroundPriceColor?: string
  messageFontColor?: string
  backgroundImage?: string
  nameColor?: string
  face?: string
  giftName?: string
  giftCount?: number
  level?: number
}

export interface DanmakuMeta {
  roomId?: number
  shortId?: number
  name?: string
  title?: string
  startTime?: string
}

export interface OverlayEvent {
  id: string
  kind: OverlayKind
  /** Seconds from segment start */
  ts: number
  user: string
  /** Display body (message / gift line / guard line) */
  text: string
  price?: number
  /** Super Chat hang duration from JSONL `time` (seconds). */
  lifeSec?: number
  /** Official Bilibili SC palette (from WS / JSONL; aligned with blivedm-go). */
  backgroundColor?: string
  backgroundBottomColor?: string
  backgroundPriceColor?: string
  messageFontColor?: string
  backgroundImage?: string
  nameColor?: string
  face?: string
  giftName?: string
  giftCount?: number
  level?: number
}

export interface ParsedDanmaku {
  meta?: DanmakuMeta
  bullets: DanmakuListItem[]
  overlays: OverlayEvent[]
  chatItems: PreviewChatItem[]
}

function colorIntToCss(color: number | undefined): string {
  const n = typeof color === "number" && Number.isFinite(color) ? color >>> 0 : 0xffffff
  return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`
}

function modeToType(mode: number | undefined): { type: DanmakuType; reverse: boolean } {
  const m = typeof mode === "number" ? mode : 1
  if (m === 4) return { type: "bottom", reverse: false }
  if (m === 5) return { type: "top", reverse: false }
  if (m === 6) return { type: "scroll", reverse: true }
  return { type: "scroll", reverse: false }
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

const GIFT_COALESCE_MS = 500

/** Drop near-duplicate gifts (same user + gift within window) to limit DOM storms. */
function coalesceGifts<T extends { kind: string; user: string; giftName?: string; ts: number }>(items: T[]): T[] {
  const out: T[] = []
  const lastKey = new Map<string, number>()
  for (const ev of items) {
    if (ev.kind !== "gift") {
      out.push(ev)
      continue
    }
    const key = `${ev.user}\0${ev.giftName ?? ""}`
    const prev = lastKey.get(key)
    const tMs = ev.ts * 1000
    if (prev != null && tMs - prev < GIFT_COALESCE_MS) continue
    lastKey.set(key, tMs)
    out.push(ev)
  }
  return out
}

export function parseJsonlDanmaku(text: string): ParsedDanmaku {
  const bullets: DanmakuListItem[] = []
  const overlays: OverlayEvent[] = []
  const chatItems: PreviewChatItem[] = []
  let meta: DanmakuMeta | undefined
  let lineNo = 0

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    lineNo += 1
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    const type = asString(obj.type)
    if (type === "meta") {
      meta = {
        roomId: asNumber(obj.room_id),
        shortId: asNumber(obj.short_id),
        name: asString(obj.name),
        title: asString(obj.title),
        startTime: asString(obj.start_time),
      }
      continue
    }

    const ts = asNumber(obj.ts)
    const timeMs = Math.max(0, Math.round(ts * 1000))
    const userInfo =
      obj.user_info && typeof obj.user_info === "object"
        ? (obj.user_info as Record<string, unknown>)
        : undefined
    const user =
      asString(obj.user) ||
      asString(userInfo?.uname) ||
      asString(obj.uname) ||
      asString(obj.username)

    if (type === "danmaku") {
      const textBody = asString(obj.text)
      const color = colorIntToCss(asNumber(obj.color, 0xffffff))
      const { type: dmType, reverse } = modeToType(asNumber(obj.mode, 1))
      const styles: DanmakuAttrs = {
        color,
        opacity: 80,
        scale: 0.63,
        weight: "bold",
        type: dmType,
        reverse,
        outline: true,
        pointer_events: false,
        custom_css: { "text-shadow": "1px 0 1px #000000" },
      }
      bullets.push({
        time: timeMs,
        text: textBody,
        reset_styles: true,
        styles,
      })
      chatItems.push({
        id: `dm-${lineNo}-${timeMs}`,
        kind: "danmaku",
        ts,
        user,
        text: textBody,
        color,
      })
      continue
    }

    if (type === "super_chat") {
      const sc: OverlayEvent = {
        id: `sc-${lineNo}-${timeMs}`,
        kind: "super_chat",
        ts,
        user,
        text: asString(obj.message),
        price: asNumber(obj.price),
        lifeSec: asNumber(obj.time),
        backgroundColor: asString(obj.background_color) || undefined,
        backgroundBottomColor: asString(obj.background_bottom_color) || undefined,
        backgroundPriceColor: asString(obj.background_price_color) || undefined,
        messageFontColor: asString(obj.message_font_color) || undefined,
        backgroundImage: asString(obj.background_image) || undefined,
        nameColor: asString(obj.name_color) || asString(userInfo?.name_color) || undefined,
        face: asString(obj.face) || asString(userInfo?.face) || undefined,
      }
      overlays.push(sc)
      chatItems.push({ ...sc })
      continue
    }

    if (type === "gift") {
      const gift: OverlayEvent = {
        id: `gift-${lineNo}-${timeMs}`,
        kind: "gift",
        ts,
        user,
        text: "",
        giftName: asString(obj.gift_name) || asString(obj.giftName),
        giftCount: asNumber(obj.gift_count, asNumber(obj.num, 1)),
        face: asString(obj.face) || undefined,
        nameColor: asString(obj.name_color) || undefined,
      }
      overlays.push(gift)
      chatItems.push({ ...gift })
      continue
    }

    if (type === "guard") {
      const guard: OverlayEvent = {
        id: `guard-${lineNo}-${timeMs}`,
        kind: "guard",
        ts,
        user,
        text: "",
        level: asNumber(obj.level, asNumber(obj.guard_level)),
        giftCount: asNumber(obj.count, asNumber(obj.num, 1)),
      }
      overlays.push(guard)
      chatItems.push({ ...guard })
    }
  }

  const coalescedOverlays = coalesceGifts(overlays)
  const coalescedChat = coalesceGifts(chatItems)
  coalescedChat.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id))
  coalescedOverlays.sort((a, b) => a.ts - b.ts)
  return { meta, bullets, overlays: coalescedOverlays, chatItems: coalescedChat }
}

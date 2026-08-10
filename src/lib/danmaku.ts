import type { DanmakuListItem } from "n-danmaku"
import { apiClient } from "@/lib/api"
import {
  parseJsonlDanmaku,
  type DanmakuMeta,
  type OverlayEvent,
  type ParsedDanmaku,
  type PreviewChatItem,
} from "./danmaku-parse"

export { parseJsonlDanmaku } from "./danmaku-parse"
export type {
  DanmakuMeta,
  OverlayEvent,
  OverlayKind,
  ParsedDanmaku,
  PreviewChatItem,
  PreviewChatKind,
} from "./danmaku-parse"

interface DanmakuWorkerRequest {
  id: number
  text: string
}

interface DanmakuWorkerResponse {
  id: number
  result?: ParsedDanmaku
  error?: string
}

interface PendingDanmakuParse {
  resolve: (result: ParsedDanmaku) => void
  reject: (error: Error) => void
}

class DanmakuWorkerUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DanmakuWorkerUnavailableError"
  }
}

let danmakuWorker: Worker | null = null
let danmakuWorkerRequestId = 0
const pendingDanmakuParses = new Map<number, PendingDanmakuParse>()

function getDanmakuWorker(): Worker {
  if (typeof Worker === "undefined") {
    throw new DanmakuWorkerUnavailableError("Web Workers are unavailable")
  }
  if (danmakuWorker) return danmakuWorker

  let worker: Worker
  try {
    worker = new Worker(new URL("./danmaku-worker.ts", import.meta.url), { type: "module" })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new DanmakuWorkerUnavailableError(message)
  }

  worker.onmessage = (event: MessageEvent<DanmakuWorkerResponse>) => {
    const pending = pendingDanmakuParses.get(event.data.id)
    if (!pending) return
    pendingDanmakuParses.delete(event.data.id)
    if (event.data.error) {
      pending.reject(new Error(event.data.error))
      return
    }
    if (!event.data.result) {
      pending.reject(new Error("Danmaku worker returned no result"))
      return
    }
    pending.resolve(event.data.result)
  }

  worker.onerror = (event) => {
    const error = new Error(event.message || "Danmaku worker failed")
    for (const pending of pendingDanmakuParses.values()) {
      pending.reject(error)
    }
    pendingDanmakuParses.clear()
    worker.terminate()
    if (danmakuWorker === worker) danmakuWorker = null
  }

  danmakuWorker = worker
  return worker
}

function parseJsonlInWorker(text: string): Promise<ParsedDanmaku> {
  const worker = getDanmakuWorker()
  const id = ++danmakuWorkerRequestId
  return new Promise((resolve, reject) => {
    pendingDanmakuParses.set(id, { resolve, reject })
    try {
      worker.postMessage({ id, text } satisfies DanmakuWorkerRequest)
    } catch (error) {
      pendingDanmakuParses.delete(id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

/** Resolved colors for Super Chat card (enhancer-style two-tone). */
export interface SuperChatTheme {
  header: string
  body: string
  price: string
  message: string
  name: string
  backgroundImage?: string
}

/** Fallback tiers when JSONL has no official colors (older recordings). */
function superChatThemeByPrice(price: number): SuperChatTheme {
  // Approx. live-room palette by CNY tier
  if (price >= 2000) {
    return { header: "#FFF1F0", body: "#AB3B2E", price: "#E2B5B1", message: "#FFFFFF", name: "#3B2E2C" }
  }
  if (price >= 1000) {
    return { header: "#FFF0F0", body: "#E54D4D", price: "#E2B5B1", message: "#FFFFFF", name: "#4A2C2C" }
  }
  if (price >= 500) {
    return { header: "#FFF8E6", body: "#E5A500", price: "#E2C880", message: "#FFFFFF", name: "#4A3B14" }
  }
  if (price >= 100) {
    return { header: "#FFF0FA", body: "#E33FFF", price: "#E2A6DC", message: "#FFFFFF", name: "#4A2C45" }
  }
  if (price >= 50) {
    return { header: "#E3F2FF", body: "#427DDE", price: "#8EB1E8", message: "#FFFFFF", name: "#2C3B4A" }
  }
  // ¥30 and below — classic cyan/blue
  return { header: "#EDF5FF", body: "#2A60B2", price: "#7497CD", message: "#FFFFFF", name: "#2C3B4A" }
}

function pickCssColor(...candidates: Array<string | undefined>): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c.trim())) {
      return c.trim()
    }
  }
  return undefined
}

/** Prefer recorded official colors; fall back to price tiers for legacy JSONL. */
export function resolveSuperChatTheme(
  ev: Pick<
    OverlayEvent,
    | "price"
    | "backgroundColor"
    | "backgroundBottomColor"
    | "backgroundPriceColor"
    | "messageFontColor"
    | "backgroundImage"
    | "nameColor"
  >
): SuperChatTheme {
  const fallback = superChatThemeByPrice(ev.price ?? 0)
  const header = pickCssColor(ev.backgroundColor) ?? fallback.header
  const body = pickCssColor(ev.backgroundBottomColor) ?? fallback.body
  const bgImage = typeof ev.backgroundImage === "string" && /^https?:\/\//i.test(ev.backgroundImage.trim())
    ? ev.backgroundImage.trim()
    : undefined
  return {
    header,
    body,
    price: pickCssColor(ev.backgroundPriceColor) ?? fallback.price,
    message: pickCssColor(ev.messageFontColor) ?? fallback.message,
    name: pickCssColor(ev.nameColor) ?? fallback.name,
    backgroundImage: bgImage,
  }
}

export type DanmakuFetchResult =
  | { kind: "none"; reason: "missing" | "xml" | "error"; message?: string }
  | { kind: "jsonl"; meta?: DanmakuMeta; bullets: DanmakuListItem[]; overlays: OverlayEvent[]; chatItems: PreviewChatItem[] }

/** Last index with ts <= t (+epsilon), assuming items sorted by ts ascending. */
export function chatItemsVisibleEnd(items: PreviewChatItem[], t: number): number {
  const limit = t + 0.05
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (items[mid].ts <= limit) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Fetch paired danmaku for a video path.
 * Only JSONL is accepted; XML or missing sidecar → kind "none".
 */
export async function fetchDanmakuForVideo(
  path: string,
  signal?: AbortSignal
): Promise<DanmakuFetchResult> {
  const url = apiClient.getDanmakuUrl(path)
  try {
    const res = await fetch(url, {
      credentials: "include",
      signal,
    })
    if (res.status === 404) {
      return { kind: "none", reason: "missing" }
    }
    if (!res.ok) {
      return { kind: "none", reason: "error", message: `HTTP ${res.status}` }
    }
    const contentType = (res.headers.get("content-type") || "").toLowerCase()
    if (contentType.includes("xml")) {
      return { kind: "none", reason: "xml" }
    }
    const text = await res.text()
    // Safety: if body looks like XML despite header
    const trimmed = text.trimStart()
    if (trimmed.startsWith("<") && !trimmed.startsWith("{")) {
      return { kind: "none", reason: "xml" }
    }
    let parsed: ParsedDanmaku
    try {
      parsed = await parseJsonlInWorker(text)
    } catch (error) {
      if (!(error instanceof DanmakuWorkerUnavailableError)) throw error
      parsed = parseJsonlDanmaku(text)
    }
    if (signal?.aborted) {
      return { kind: "none", reason: "error", message: "aborted" }
    }
    return { kind: "jsonl", ...parsed }
  } catch (err) {
    if (signal?.aborted) {
      return { kind: "none", reason: "error", message: "aborted" }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { kind: "none", reason: "error", message }
  }
}

export function guardLevelLabel(level: number | undefined): string {
  switch (level) {
    case 1:
      return "总督"
    case 2:
      return "提督"
    case 3:
      return "舰长"
    default:
      return "舰长"
  }
}

export function guardLevelColor(level: number | undefined): string {
  switch (level) {
    case 1:
      return "#e2b56f" // 总督 gold
    case 2:
      return "#c47aff" // 提督 purple
    case 3:
      return "#5dade2" // 舰长 blue
    default:
      return "#5dade2"
  }
}

/** Official bilibili 大航海 tier icons. URLs carry a build hash that may
 *  rotate; callers should fall back to a local glyph on load error. */
export function guardLevelIcon(level: number | undefined): string | undefined {
  switch (level) {
    case 1: // 总督
      return "https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/governor-DpDXKEdA.png"
    case 2: // 提督
      return "https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/supervisor-u43ElIjU.png"
    case 3: // 舰长
      return "https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/captain-Bjw5Byb5.png"
    default:
      return undefined
  }
}

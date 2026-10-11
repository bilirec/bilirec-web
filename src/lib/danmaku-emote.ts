import type { DanmakuAttrs, DanmakuListItem } from "n-danmaku"
import {
  DANMAKU_FIXED_REF_WIDTH,
  danmakuAutoFontPx,
  type DanmakuInjectStyleOptions,
} from "@/lib/playback-danmaku"

/** Passed through n-danmaku `attrs()` → `setDanmakuPos` for pre-anchor big-emote layout. */
export const BILIREC_BIG_EMOTE_URL = "__bilirecBigEmoteUrl"
export const BILIREC_BIG_EMOTE_HEIGHT = "__bilirecBigEmoteHeightPx"
export const BILIREC_BIG_EMOTE_FALLBACK = "__bilirecBigEmoteFallback"

export type BilirecBigEmoteStyleHints = {
  [BILIREC_BIG_EMOTE_URL]?: string
  [BILIREC_BIG_EMOTE_HEIGHT]?: number
  [BILIREC_BIG_EMOTE_FALLBACK]?: string
}

const BIG_EMOTE_IMG_ATTR = "data-bilirec-big-emote"

/** Whole-message user-uploaded sticker (JSONL emoticon_unique "upower_*"); renders enlarged. */
export type DanmakuBigEmoteMeta = {
  dmType: 1
  emoticonUrl: string
}

/** Official Bilibili emoji (emoticon_unique "official_*"); renders at normal inline size. */
export type DanmakuEmojiMeta = {
  emoticonUrl: string
}

export type BilirecDanmakuListItem = DanmakuListItem & {
  bigEmote?: DanmakuBigEmoteMeta
  emoji?: DanmakuEmojiMeta
}

export type EmoteMap = Readonly<Record<string, string>>

export type EmoteRenderContext = {
  emotes: EmoteMap | null
  styleOpts: DanmakuInjectStyleOptions
  hostWidth: number
}

const BIG_EMOTE_HEIGHT_LINES = 2.2
const INLINE_EMOTE_TOKEN = /(\[[^\[\]]+\])/g

let emoteMapPromise: Promise<EmoteMap | null> | null = null

export function loadEmoteMap(): Promise<EmoteMap | null> {
  if (!emoteMapPromise) {
    emoteMapPromise = fetch("/emotes.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { emotes?: Record<string, string> } | null) => {
        if (!body?.emotes || typeof body.emotes !== "object") return null
        warmEmoteCache(Object.values(body.emotes))
        return body.emotes
      })
      .catch(() => null)
  }
  return emoteMapPromise
}

/**
 * Trickle-fetch every known emote once so the service worker's cache-first
 * handler stores them. Prevents the burst of concurrent CDN requests when
 * many emote danmaku spawn at once (which made some images fail and fall
 * back to plain text). No-op when the service worker is not controlling the
 * page (e.g. dev server, first visit before activation).
 */
function warmEmoteCache(urls: readonly string[]): void {
  if (
    typeof navigator === "undefined" ||
    !navigator.serviceWorker?.controller
  ) {
    return
  }
  const queue = urls.filter((url) => /^https?:\/\//.test(url))
  const CONCURRENCY = 4
  const runNext = (): void => {
    const url = queue.shift()
    if (!url) return
    fetch(url, { mode: "no-cors", referrerPolicy: "no-referrer" })
      .catch(() => undefined)
      .finally(runNext)
  }
  for (let i = 0; i < CONCURRENCY && i < queue.length; i++) {
    runNext()
  }
}

function baseFontPx(ctx: EmoteRenderContext): number {
  const { styleOpts, hostWidth } = ctx
  if (styleOpts.danmakuFontSize) {
    const n = parseFloat(styleOpts.danmakuFontSize)
    if (Number.isFinite(n) && n > 0) return n
  }
  const w = hostWidth > 0 ? hostWidth : DANMAKU_FIXED_REF_WIDTH
  return danmakuAutoFontPx(w) * styleOpts.danmakuScale
}

function computeBigEmoteHeightPx(ctx: EmoteRenderContext): number {
  return Math.round(baseFontPx(ctx) * BIG_EMOTE_HEIGHT_LINES * 10) / 10
}

let emoteLayoutContextProvider: (() => EmoteRenderContext) | null = null

/** Read current picture width / danmaku style when each bullet is spawned (like n-danmaku text). */
export function setEmoteLayoutContextProvider(getCtx: () => EmoteRenderContext): void {
  emoteLayoutContextProvider = getCtx
}

function liveBigEmoteLayout(attrs: DanmakuAttrs): {
  url: string
  fallbackText: string
  heightPx: number
} | null {
  const record = attrs as DanmakuAttrs & BilirecBigEmoteStyleHints
  const url = record[BILIREC_BIG_EMOTE_URL]
  if (typeof url !== "string" || !url) return null
  const fallbackText =
    typeof record[BILIREC_BIG_EMOTE_FALLBACK] === "string"
      ? record[BILIREC_BIG_EMOTE_FALLBACK]
      : ""
  const ctx = emoteLayoutContextProvider?.()
  if (ctx) {
    return { url, fallbackText, heightPx: computeBigEmoteHeightPx(ctx) }
  }
  const heightPx = parseAnchorHeightPx(record[BILIREC_BIG_EMOTE_HEIGHT])
  if (heightPx == null) return null
  return { url, fallbackText, heightPx }
}

export function parseAnchorHeightPx(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function readBigEmoteAnchorMeta(attrs: DanmakuAttrs): {
  url: string
  heightPx: number
  fallbackText: string
} | null {
  const record = attrs as DanmakuAttrs & BilirecBigEmoteStyleHints
  const url = record[BILIREC_BIG_EMOTE_URL]
  const heightPx = parseAnchorHeightPx(record[BILIREC_BIG_EMOTE_HEIGHT])
  const fallbackText = record[BILIREC_BIG_EMOTE_FALLBACK]
  if (typeof url !== "string" || !url || heightPx == null) return null
  return {
    url,
    heightPx,
    fallbackText: typeof fallbackText === "string" ? fallbackText : "",
  }
}

/** Single-token message resolved from emotes.json (same layout as room big emote). */
function wholeLineEmoteUrl(text: string, map: EmoteMap | null): string | null {
  if (!map) return null
  const trimmed = text.trim()
  if (!/^\[[^\[\]]+\]$/.test(trimmed)) return null
  return map[trimmed] ?? null
}

function stampBigEmoteAnchorStyles(
  styles: NonNullable<BilirecDanmakuListItem["styles"]> & BilirecBigEmoteStyleHints,
  url: string,
  heightPx: number,
  fallbackText: string
): void {
  styles.size = `${heightPx}px`
  styles[BILIREC_BIG_EMOTE_URL] = url
  styles[BILIREC_BIG_EMOTE_HEIGHT] = heightPx
  styles[BILIREC_BIG_EMOTE_FALLBACK] = fallbackText
}

function applyBigEmoteWrapperBox(element: HTMLElement, heightPx: number): void {
  const gapPx = 10
  const widthPx = heightPx + gapPx
  element.style.display = "inline-block"
  element.style.boxSizing = "border-box"
  element.style.width = `${widthPx}px`
  element.style.minWidth = `${widthPx}px`
  element.style.height = `${heightPx}px`
  element.style.lineHeight = "1"
  element.style.whiteSpace = "nowrap"
  element.style.overflow = "hidden"
  void element.offsetWidth
}

function mountBigEmoteImg(
  element: HTMLElement,
  url: string,
  fallbackText: string,
  heightPx: number
): void {
  let img = element.querySelector(`img[${BIG_EMOTE_IMG_ATTR}]`) as HTMLImageElement | null
  if (!img) {
    img = document.createElement("img")
    img.setAttribute(BIG_EMOTE_IMG_ATTR, "1")
    img.src = url
    img.alt = fallbackText
    img.decoding = "async"
    img.referrerPolicy = "no-referrer"
    img.draggable = false
    img.style.objectFit = "contain"
    // Block-level: the fixed-size wrapper already reserves the exact box, so the
    // image must not join the parent's line box. As an inline-block with
    // vertical-align:middle, the line-height/font metrics push it down and the
    // wrapper's overflow:hidden clips ~10-15% off the image bottom.
    img.style.display = "block"
    img.style.pointerEvents = "none"

    // Under dense danmaku the CDN can momentarily fail; retry once before
    // giving up and rendering the plain text fallback.
    let retried = false
    img.addEventListener("error", () => {
      if (!retried) {
        retried = true
        img!.src = url
        return
      }
      restore()
    })
    img.addEventListener("load", () => {
      retried = true
    }, { once: true })

    element.replaceChildren(img)
  }

  img.style.height = `${heightPx}px`
  img.style.width = `${heightPx}px`
  applyBigEmoteWrapperBox(element, heightPx)

  function restore() {
    element.replaceChildren(document.createTextNode(fallbackText))
  }
}

/** Must run before n-danmaku `setDanmakuPos` so collision uses image bounds. */
export function applyBigEmoteBeforeAnchor(element: HTMLElement, attrs: DanmakuAttrs): void {
  const layout = liveBigEmoteLayout(attrs)
  if (!layout) return
  mountBigEmoteImg(element, layout.url, layout.fallbackText, layout.heightPx)
}

function inlineImg(url: string, alt: string): HTMLImageElement {
  const img = document.createElement("img")
  img.src = url
  img.alt = alt
  img.decoding = "async"
  img.referrerPolicy = "no-referrer"
  img.draggable = false
  img.style.height = "1em"
  img.style.width = "auto"
  // n-danmaku's garbageCollect revokes elements with offsetWidth <= 0 on the
  // next spawn; an unloaded img has zero width and would be killed before it
  // ever paints. Reserve one em immediately.
  img.style.minWidth = "1em"
  img.style.objectFit = "contain"
  img.style.verticalAlign = "text-bottom"
  img.style.display = "inline"
  img.style.pointerEvents = "none"
  return img
}

function replaceInlineEmotes(element: HTMLElement, text: string, map: EmoteMap): void {
  const textNode = element.firstChild
  if (!(textNode instanceof Text)) return

  const parts = text.split(INLINE_EMOTE_TOKEN)
  if (parts.length <= 1) return

  const frag = document.createDocumentFragment()
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith("[") && part.endsWith("]")) {
      const url = map[part]
      if (url) {
        frag.appendChild(inlineImg(url, part))
        continue
      }
    }
    frag.appendChild(document.createTextNode(part))
  }
  element.replaceChildren(frag)
}

/**
 * True when the whole message consists solely of `[token]`s that all resolve
 * in the room emote map (e.g. upower_[笑哭], [dog]). Such messages are
 * standard faces and render inline at 1em, never as enlarged stickers.
 */
function isPureResolvableTokens(text: string, map: EmoteMap | null): boolean {
  if (!map || !text.includes("[")) return false
  let hasToken = false
  for (const part of text.split(INLINE_EMOTE_TOKEN)) {
    if (!part) continue
    if (part.startsWith("[") && part.endsWith("]")) {
      if (!map[part]) return false
      hasToken = true
    } else {
      return false
    }
  }
  return hasToken
}

export function attachEmoteRendering(
  item: BilirecDanmakuListItem,
  ctx: EmoteRenderContext
): DanmakuListItem {
  const big = item.bigEmote
  const map = ctx.emotes
  const fallbackText = item.text
  const bigUrl = big?.emoticonUrl ?? ""
  // Official emoji (dmType absent, `emoji` meta set) render the image at
  // normal 1em size in place of the text.
  const emojiUrl = big?.dmType === 1 ? "" : item.emoji?.emoticonUrl ?? ""
  // A sticker whose tokens all resolve in the room emote map (upower_[笑哭]
  // and friends) is a standard face: downgrade to inline 1em.
  const pureTokens = isPureResolvableTokens(fallbackText, map)
  const needsBigLayout = big?.dmType === 1 && Boolean(bigUrl) && !pureTokens
  const needsInline =
    (pureTokens || Boolean(map && fallbackText.includes("["))) && !emojiUrl

  if (!needsBigLayout && !emojiUrl && !needsInline) return item

  const bigHeightPx = computeBigEmoteHeightPx(ctx)
  const styles = { ...item.styles } as NonNullable<typeof item.styles> &
    BilirecBigEmoteStyleHints

  if (needsBigLayout && bigUrl) {
    stampBigEmoteAnchorStyles(styles, bigUrl, bigHeightPx, fallbackText)
    styles.bottom_space = Math.max(styles.bottom_space ?? 0, 4)
  }

  return {
    ...item,
    styles,
    created: (element, id) => {
      item.created?.(element, id)
      if (needsBigLayout && bigUrl) {
        const liveCtx = emoteLayoutContextProvider?.() ?? ctx
        const heightPx = computeBigEmoteHeightPx(liveCtx)
        mountBigEmoteImg(element, bigUrl, fallbackText, heightPx)
        return
      }
      if (emojiUrl) {
        element.replaceChildren(inlineImg(emojiUrl, fallbackText))
        return
      }
      if (needsInline && map) {
        replaceInlineEmotes(element, fallbackText, map)
      }
    },
  }
}

export function attachEmoteRenderingBatch(
  items: DanmakuListItem[],
  ctx: EmoteRenderContext
): DanmakuListItem[] {
  return items.map((item) => attachEmoteRendering(item as BilirecDanmakuListItem, ctx))
}

export type ChatDanmakuPart =
  | { kind: "text"; value: string }
  | { kind: "image"; url: string; alt: string }

/** Chat list + replay: big sticker, whole-line `[token]`, or inline `[token]` segments. */
export function chatDanmakuParts(
  text: string,
  emoticonUrl: string | undefined,
  emotes: EmoteMap | null
): ChatDanmakuPart[] {
  if (emoticonUrl) {
    return [{ kind: "image", url: emoticonUrl, alt: text }]
  }
  const wholeUrl = wholeLineEmoteUrl(text, emotes)
  if (wholeUrl) {
    return [{ kind: "image", url: wholeUrl, alt: text }]
  }
  if (!emotes || !text.includes("[")) {
    return [{ kind: "text", value: text }]
  }

  const segments = text.split(INLINE_EMOTE_TOKEN)
  const parts: ChatDanmakuPart[] = []
  for (const segment of segments) {
    if (!segment) continue
    if (segment.startsWith("[") && segment.endsWith("]")) {
      const url = emotes[segment]
      if (url) {
        parts.push({ kind: "image", url, alt: segment })
        continue
      }
    }
    parts.push({ kind: "text", value: segment })
  }
  return parts.length > 0 ? parts : [{ kind: "text", value: text }]
}

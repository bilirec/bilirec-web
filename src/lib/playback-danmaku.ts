import type NDanmaku from "n-danmaku"
import type { DanmakuAttrs, DanmakuListItem, DanmakuType } from "n-danmaku"
import {
  attachEmoteRenderingBatch,
  applyBigEmoteBeforeAnchor,
  BILIREC_BIG_EMOTE_HEIGHT,
  parseAnchorHeightPx,
  type BilirecBigEmoteStyleHints,
  type EmoteRenderContext,
} from "@/lib/danmaku-emote"
import {
  clampDanmakuSize,
  clampDanmakuSpeed,
  DEFAULT_DANMAKU_SIZE,
  DEFAULT_DANMAKU_SPEED,
  type DanmakuArea,
  type OverlayCorner,
} from "@/lib/playback-settings"

/** Default n-danmaku font is ~width/36; desktop playback stays a bit smaller than live. */
export const DANMAKU_SCALE_DESKTOP = 0.63
/** Narrow / phone picture: a bit above n-danmaku's width formula so text stays readable. */
export const DANMAKU_SCALE_NARROW = 1.25
/** Keep the base danmaku motion at half of n-danmaku's default speed. */
const DANMAKU_SCROLL_LIFE_MS = 5000
const DANMAKU_BASE_SPEED = 0.5
/** Top/bottom hang duration at 1x. Independent of scroll travel time. */
const DANMAKU_HANG_LIFE_MS = 4000
/**
 * n-danmaku ranges are % of host height.
 * Bottom/top are measured from their stack origin (bottom up / top down).
 */
export const DANMAKU_RANGES = {
  scroll: [2, 85] as [number, number],
  top: [2, 35] as [number, number],
  bottom: [2, 58] as [number, number],
  random: [2, 85] as [number, number],
}
/** Small look-ahead window; the RAF ticker prevents dense bursts on each tick. */
export const DANMAKU_TICK_UNCERTAINTY_MS = 120
/** n-danmaku must not be ticked for every animation frame; its ranges overlap. */
export const DANMAKU_TICK_INTERVAL_MS = 160
export const DANMAKU_LOAD_CHUNK_SIZE = 1000

function isHangType(type: DanmakuType | undefined): boolean {
  return type === "top" || type === "bottom" || type === "midhang"
}

export function danmakuLifeForRate(
  rate: number,
  type?: DanmakuType,
  speedPercent: number = DEFAULT_DANMAKU_SPEED
): number {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1
  if (isHangType(type)) {
    return DANMAKU_HANG_LIFE_MS / safeRate
  }
  const speedMult = clampDanmakuSpeed(speedPercent) / 100
  return DANMAKU_SCROLL_LIFE_MS / (safeRate * DANMAKU_BASE_SPEED * speedMult)
}

export function danmakuRangesForArea(area: DanmakuArea): {
  scroll: [number, number]
  top: [number, number]
  bottom: [number, number]
  random: [number, number]
} {
  const maxPercent =
    area === "quarter"
      ? 25
      : area === "half"
        ? 50
        : area === "three-quarters"
          ? 75
          : 98

  return {
    scroll: [2, maxPercent],
    top: [2, Math.min(35, maxPercent)],
    bottom: [2, 58],
    random: [2, maxPercent],
  }
}

export function areaLabelKey(area: DanmakuArea): string {
  switch (area) {
    case "quarter":
      return "danmakuAreaQuarter"
    case "half":
      return "danmakuAreaHalf"
    case "three-quarters":
      return "danmakuAreaThreeQuarters"
    case "full":
    default:
      return "danmakuAreaFull"
  }
}

export function danmakuScaleForWidth(width: number): number {
  if (width > 0 && width < 520) return DANMAKU_SCALE_NARROW
  if (width > 0 && width < 900) return 0.95
  return DANMAKU_SCALE_DESKTOP
}

/** Same formula n-danmaku uses when `size` is null: (width / 180) * 5, min 5px. */
export function danmakuAutoFontPx(width: number): number {
  const auto = (Math.max(0, width) / 180) * 5
  return auto > 5 ? auto : 5
}

/**
 * Follow-off 100% matches n-danmaku auto size at this picture width.
 * Typical desktop player; independent of the current / fullscreen width.
 */
export const DANMAKU_FIXED_REF_WIDTH = 1600

export type ResolvedDanmakuFont = {
  scale: number
  /** Absolute CSS font-size. Null lets n-danmaku size from the container width. */
  size: string | null
}

export function isMobileScreen(width?: number, height?: number): boolean {
  if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) {
    if (Math.min(width, height) < 520) return true
  }
  if (typeof width === "number" && width > 0 && width < 520) {
    return true
  }
  if (typeof height === "number" && height > 0 && height < 520) {
    return true
  }

  if (typeof window !== "undefined") {
    if (window.innerWidth > 0 && window.innerHeight > 0) {
      if (Math.min(window.innerWidth, window.innerHeight) < 520) {
        return true
      }
    }
    if (window.screen) {
      const screenW = window.screen.width || 0
      const screenH = window.screen.height || 0
      if (screenW > 0 && screenH > 0 && Math.min(screenW, screenH) < 520) {
        return true
      }
    }
    if (typeof window.matchMedia === "function") {
      const isCoarse = window.matchMedia("(pointer: coarse)").matches
      const isSmallLandscape = window.matchMedia(
        "(max-width: 950px) and (max-height: 520px), (max-width: 520px)"
      ).matches
      if (isCoarse && isSmallLandscape) {
        return true
      }
    }
  }

  return false
}

/**
 * Follow-on: font tracks picture width via scale.
 * Follow-off: fixed CSS px from size percent, same in windowed and fullscreen.
 * On mobile/phone screens (both portrait <520px and landscape fullscreen with short edge <520px),
 * baseline size is halved to prevent oversized fonts on small displays.
 */
export function resolveDanmakuFont(
  width: number,
  followScreen: boolean,
  sizePercent: number,
  height?: number
): ResolvedDanmakuFont {
  if (followScreen) {
    return {
      scale: danmakuScaleForWidth(width),
      size: null,
    }
  }
  const size = Number.isFinite(sizePercent) ? sizePercent : DEFAULT_DANMAKU_SIZE
  const isMobile = isMobileScreen(width, height)
  const mobileFactor = isMobile ? 0.5 : 1
  const sizeMult = (clampDanmakuSize(size) / 100) * mobileFactor
  const px =
    Math.round(
      danmakuAutoFontPx(DANMAKU_FIXED_REF_WIDTH) * DANMAKU_SCALE_DESKTOP * sizeMult * 10
    ) / 10
  return {
    scale: 1,
    size: `${px}px`,
  }
}

export function sameNumberList(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function cornerLabelKey(corner: OverlayCorner): string {
  switch (corner) {
    case "top-right":
      return "overlayCornerTopRight"
    case "bottom-left":
      return "overlayCornerBottomLeft"
    case "bottom-right":
      return "overlayCornerBottomRight"
    case "hidden":
      return "overlayCornerHidden"
    case "top-left":
    default:
      return "overlayCornerTopLeft"
  }
}

type NDanmakuHitBox = {
  target?: HTMLElement
  hitSets?: Record<string, { to: number }[]>
  danmakuAnchor: (element: HTMLElement, attrs: DanmakuAttrs, retry?: boolean) => number
  setDanmakuPos: (element: HTMLElement, attrs: DanmakuAttrs) => void
  refreshHitSets: (type?: string) => void
}

const ANCHOR_TYPES = new Set<DanmakuType>(["scroll", "top", "bottom"])
const SCROLL_MOTION_TYPES = new Set<DanmakuType>(["scroll", "random", "midscroll"])
const DISCARD_ATTR = "data-bilirec-danmaku-discard"
const DM_WIDTH_ATTR = "data-bilirec-dm-width"
const DM_FROM_X = "--bilirec-dm-from-x"
const DM_TO_X = "--bilirec-dm-to-x"

type HitLaneDm = {
  start: number
  life: number
  reversed: boolean
  element: HTMLElement
}

type HitLane = {
  from: number
  to: number
  available: boolean
  dm: HitLaneDm | null
}

type HitBoxWithLanes = NDanmakuHitBox & {
  hitSets?: Record<string, HitLane[]>
}

function nowMs(): number {
  return Date.now()
}

function parseAnimationDurationMs(element: HTMLElement): number {
  const inline = element.style.animationDuration
  const raw = inline || (typeof getComputedStyle !== "undefined" ? getComputedStyle(element).animationDuration : "")
  if (!raw) return 5000
  const trimmed = raw.trim()
  if (trimmed.endsWith("ms")) {
    const n = parseFloat(trimmed)
    return Number.isFinite(n) && n > 0 ? n : 5000
  }
  if (trimmed.endsWith("s")) {
    const n = parseFloat(trimmed)
    return Number.isFinite(n) && n > 0 ? n * 1000 : 5000
  }
  const n = parseFloat(trimmed)
  return Number.isFinite(n) && n > 0 ? n * 1000 : 5000
}

function readScrollAnimationProgress(
  element: HTMLElement,
  fallbackLifeMs: number,
  startMs?: number
): number {
  const anim = element.getAnimations?.()?.[0]
  if (anim?.effect && typeof anim.currentTime === "number") {
    const timing = (anim.effect as KeyframeEffect).getTiming()
    let duration = timing.duration
    if (typeof duration !== "number" || duration <= 0) {
      duration = parseAnimationDurationMs(element)
    }
    if (duration > 0) {
      return Math.min(1, Math.max(0, anim.currentTime / duration))
    }
  }
  const life = parseAnimationDurationMs(element) || fallbackLifeMs
  if (startMs != null && life > 0) {
    const elapsed = nowMs() - startMs
    return Math.min(1, Math.max(0, elapsed / life))
  }
  return 0
}

function readStoredScrollWidth(element: HTMLElement): number | null {
  const stored = element.getAttribute(DM_WIDTH_ATTR)
  if (stored) {
    const n = parseFloat(stored)
    if (Number.isFinite(n) && n > 0) return n
  }
  const w = element.offsetWidth
  if (w > 0) {
    element.setAttribute(DM_WIDTH_ATTR, String(w))
    return w
  }
  return null
}

function scrollOccupancyReleased(
  element: HTMLElement,
  lifeMs: number,
  layerWidth: number,
  startMs?: number
): boolean {
  const w = readStoredScrollWidth(element)
  if (w == null || layerWidth <= 0) return true
  const progress = readScrollAnimationProgress(element, lifeMs, startMs)
  return progress >= w / (layerWidth + w)
}

function applyScrollMotionVars(element: HTMLElement, attrs: DanmakuAttrs, layerWidth: number): void {
  if (!attrs.type || !SCROLL_MOTION_TYPES.has(attrs.type)) return
  if (layerWidth <= 0) return

  const w = readStoredScrollWidth(element)
  if (w == null) return

  const reversed = Boolean(attrs.reverse)
  const fromX = reversed ? -w : layerWidth
  const toX = reversed ? layerWidth : -w
  element.style.setProperty(DM_FROM_X, `${fromX}px`)
  element.style.setProperty(DM_TO_X, `${toX}px`)
  element.style.left = "0"
  element.style.right = "auto"
}

function bilirecDanmakuAnchor(
  hitBox: HitBoxWithLanes,
  element: HTMLElement,
  attrs: DanmakuAttrs,
  layerWidth: number,
  retry: boolean
): number {
  const laneHeight = element.offsetHeight
  const lanes = attrs.type ? hitBox.hitSets?.[attrs.type] : undefined
  if (!lanes) return 0

  const bottomSpace = attrs.bottom_space ?? 2
  let anchorTopPx = -1

  for (let n = 0, laneCount = lanes.length; n < laneCount; n++) {
    const lane = lanes[n]!
    if (lane.available) {
      const slotUnits = lane.to - lane.from + 1
      const needUnits = Math.floor(100 * (laneHeight + bottomSpace))
      if (anchorTopPx === -1 && slotUnits >= needUnits) {
        const tailLane: HitLane = { ...lane }
        const splitAt = lane.from + needUnits
        anchorTopPx = lane.from / 100
        lane.to = splitAt - 1
        lane.available = false
        lane.dm = {
          start: nowMs(),
          life: attrs.life ?? 5000,
          reversed: Boolean(attrs.reverse),
          element,
        }
        tailLane.from = splitAt
        lanes.splice(n + 1, 0, tailLane)
      }
    } else if (lane.dm) {
      const dmEl = lane.dm.element
      let released = false
      switch (attrs.type) {
        case "scroll":
          released = scrollOccupancyReleased(dmEl, lane.dm.life, layerWidth, lane.dm.start)
          break
        case "top":
        case "bottom":
          released = nowMs() - lane.dm.start >= lane.dm.life
          break
        default:
          released = false
      }
      if (dmEl.offsetWidth === 0 || dmEl.parentNode == null) {
        released = true
      }

      if (released) {
        const prev = lanes[n - 1]
        const next = lanes[n + 1]
        if (prev?.available && next?.available) {
          prev.to = next.to
          lanes.splice(n, 2)
          n -= 1
          laneCount -= 2
        } else if (prev?.available) {
          prev.to = lane.to
          lanes.splice(n, 1)
          n -= 1
          laneCount -= 1
        } else if (next?.available) {
          lane.to = next.to
          lane.available = true
          lane.dm = null
          lanes.splice(n + 1, 1)
          laneCount -= 1
        } else {
          lane.available = true
          lane.dm = null
        }
        n -= 1
      }
    }
  }

  if (anchorTopPx === -1) {
    if (!retry) {
      return bilirecDanmakuAnchor(hitBox, element, attrs, layerWidth, true)
    }
    return -1
  }
  return anchorTopPx
}

/** Recompute scroll transform endpoints after the picture box width changes. */
export function resyncDanmakuScrollMotionAfterResize(dm: NDanmaku): void {
  const layer = dm.dmLayer
  if (!layer) return
  const W = layer.clientWidth
  if (W <= 0) return

  const nodes = layer.querySelectorAll(".N-scroll")
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue
    const w = readStoredScrollWidth(node) ?? node.offsetWidth
    if (w <= 0) continue
    node.setAttribute(DM_WIDTH_ATTR, String(w))

    const reversed = node.classList.contains("N-scroll-reversed")
    const life = parseAnimationDurationMs(node)
    const progress = readScrollAnimationProgress(node, life)
    const remaining = Math.max(0, (1 - progress) * life)

    const fromX = reversed ? -w + progress * (W + w) : W - progress * (W + w)
    const toX = reversed ? W : -w

    node.style.setProperty(DM_FROM_X, `${fromX}px`)
    node.style.setProperty(DM_TO_X, `${toX}px`)
    node.style.left = "0"
    node.style.right = "auto"
    if (remaining > 0) {
      node.style.animationDuration = `${remaining}ms`
    }
  }
}

function resolveLayerWidth(dm: NDanmaku, hitBox: HitBoxWithLanes): number {
  return dm.dmLayer?.clientWidth ?? hitBox.target?.clientWidth ?? 0
}

/**
 * When lanes are full, n-danmaku resets hitSets and places the new item at 0.
 * Replace that with a discard: skip refreshHitSets and remove the element.
 *
 * ranges() often runs while the layer is display:none, so lanes are built at
 * height 0. Rebuild once the layer has a real size; otherwise every item is discarded.
 */
export function attachDanmakuOverlapControl(
  dm: NDanmaku,
  isPreventOverlapEnabled: () => boolean
): void {
  const hitBox = (dm as unknown as { hitBox?: HitBoxWithLanes }).hitBox
  if (!hitBox?.danmakuAnchor || !hitBox.setDanmakuPos || !hitBox.refreshHitSets) return

  let tickLayerWidth = resolveLayerWidth(dm, hitBox)

  const skippedTypes = new Set<DanmakuType>()

  const currentAnchorType = (): DanmakuType | undefined => {
    const type = (dm as unknown as { currentAttrs?: { type?: DanmakuType } }).currentAttrs?.type
    return type && ANCHOR_TYPES.has(type) ? type : undefined
  }

  const originalTick = dm.list.tick.bind(dm.list)
  dm.list.tick = (time: number) => {
    skippedTypes.clear()
    tickLayerWidth = resolveLayerWidth(dm, hitBox)
    originalTick(time)
  }

  const originalAnchor = hitBox.danmakuAnchor.bind(hitBox)
  hitBox.danmakuAnchor = (element, attrs, retry = false) => {
    applyBigEmoteBeforeAnchor(element, attrs)

    if (!isPreventOverlapEnabled()) {
      return originalAnchor(element, attrs, retry)
    }
    if (retry) return -1

    const originalRefresh = hitBox.refreshHitSets.bind(hitBox)
    const height = hitBox.target?.offsetHeight ?? 0
    const lanes = attrs.type ? hitBox.hitSets?.[attrs.type] : undefined
    const laneTo = lanes?.[lanes.length - 1]?.to ?? 0
    if (height > 0 && laneTo === 0) originalRefresh(attrs.type)

    hitBox.refreshHitSets = () => undefined
    try {
      const layerWidth = tickLayerWidth || resolveLayerWidth(dm, hitBox)
      return bilirecDanmakuAnchor(hitBox, element, attrs, layerWidth, false)
    } finally {
      hitBox.refreshHitSets = originalRefresh
    }
  }

  const originalSetPos = hitBox.setDanmakuPos.bind(hitBox)
  hitBox.setDanmakuPos = (element, attrs) => {
    applyBigEmoteBeforeAnchor(element, attrs)
    const layerWidth = tickLayerWidth || resolveLayerWidth(dm, hitBox)
    applyScrollMotionVars(element, attrs, layerWidth)
    originalSetPos(element, attrs)
    if (!isPreventOverlapEnabled()) return
    const type = attrs.type
    if (!type || !ANCHOR_TYPES.has(type)) return
    const pos = type === "bottom" ? element.style.bottom : element.style.top
    if (pos === "-1px") {
      element.setAttribute(DISCARD_ATTR, "1")
    }
  }

  const originalCreate = dm.create.bind(dm)
  dm.create = (text, created, callback) => {
    if (isPreventOverlapEnabled()) {
      const type = currentAnchorType()
      if (type && skippedTypes.has(type)) return dm
    }
    return originalCreate(
      text,
      (element, id) => {
        if (element.getAttribute(DISCARD_ATTR) === "1") {
          const type = currentAnchorType()
          if (type) skippedTypes.add(type)
          dm.clear(id)
          return
        }
        created?.(element, id)
      },
      callback
    )
  }
}

export interface DanmakuInjectStyleOptions {
  danmakuScale: number
  danmakuFontSize: string | null
  danmakuOpacity: number
  danmakuSpeed: number
  playbackRate: number
}

export function styleDanmakuItems(
  items: DanmakuListItem[],
  opts: DanmakuInjectStyleOptions
): DanmakuListItem[] {
  return items.map((b) => {
    const hint = (b.styles as BilirecBigEmoteStyleHints | undefined)?.[
      BILIREC_BIG_EMOTE_HEIGHT
    ]
    const anchorHeight = parseAnchorHeightPx(hint)
    return {
      ...b,
      styles: {
        ...b.styles,
        scale: opts.danmakuScale,
        size: anchorHeight != null ? `${anchorHeight}px` : opts.danmakuFontSize,
        opacity: opts.danmakuOpacity,
        life: danmakuLifeForRate(opts.playbackRate, b.styles?.type, opts.danmakuSpeed),
        pointer_events: false,
        custom_css: b.styles?.custom_css ? { ...b.styles.custom_css } : undefined,
      },
    }
  })
}

/** Rebuild lane geometry from current layer height (required after host resize, e.g. fullscreen). */
export function reapplyDanmakuRanges(dm: NDanmaku, danmakuArea: DanmakuArea): void {
  dm.ranges(danmakuRangesForArea(danmakuArea))
}

export function prepareDanmakuVodList(dm: NDanmaku, danmakuArea: DanmakuArea): void {
  try {
    dm.list.del("vod")
  } catch {
    /* ignore */
  }
  dm.list.new("vod")
  dm.list.use("vod")
  dm.list.uncertainty(DANMAKU_TICK_UNCERTAINTY_MS)
  reapplyDanmakuRanges(dm, danmakuArea)
}

export function styleDanmakuItemsForEngine(
  items: DanmakuListItem[],
  opts: DanmakuInjectStyleOptions,
  emoteCtx?: EmoteRenderContext | null
): DanmakuListItem[] {
  const styled = styleDanmakuItems(items, opts)
  if (!emoteCtx) return styled
  return attachEmoteRenderingBatch(styled, emoteCtx)
}

export async function injectDanmakuBullets(
  dm: NDanmaku,
  bullets: DanmakuListItem[],
  opts: DanmakuInjectStyleOptions,
  callbacks?: {
    isCancelled?: () => boolean
    onChunkLoaded?: (loadedCount: number, total: number) => void
    emoteCtx?: EmoteRenderContext | null
  }
): Promise<void> {
  const total = bullets.length
  for (let start = 0; start < total; start += DANMAKU_LOAD_CHUNK_SIZE) {
    if (callbacks?.isCancelled?.()) return
    const chunk = styleDanmakuItemsForEngine(
      bullets.slice(start, start + DANMAKU_LOAD_CHUNK_SIZE),
      opts,
      callbacks?.emoteCtx
    )
    dm.list.load(chunk)
    callbacks?.onChunkLoaded?.(Math.min(start + chunk.length, total), total)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}


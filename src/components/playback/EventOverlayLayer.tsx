import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { OverlayEvent } from "@/lib/danmaku"
import { guardLevelColor, guardLevelIcon, guardLevelLabel, resolveSuperChatTheme } from "@/lib/danmaku"
import type { OverlayCorner } from "@/lib/playback-settings"

const SC_FALLBACK_SEC = 4.5
const GUARD_LIFE_SEC = 10
const GIFT_LIFE_SEC = 3
/** Exit animation length in wall-clock ms (CSS-driven, rate-independent). */
const EXIT_MS = 280
const MAX_HANG = 3
const MAX_TOAST = 4
const DESKTOP_FULLSCREEN_SCALE = 1.45
const MOBILE_OVERLAY_HEIGHT_RATIO = 0.4

function lifeSecFor(ev: OverlayEvent): number {
  if (ev.kind === "gift") return GIFT_LIFE_SEC
  if (ev.kind === "guard") return GUARD_LIFE_SEC
  // super_chat: JSONL `time` is bilibili hang duration in seconds
  if (ev.lifeSec != null && ev.lifeSec > 0) return ev.lifeSec
  return SC_FALLBACK_SEC
}

interface ActiveItem {
  event: OverlayEvent
  /** Video-time seconds when the event entered the overlay. */
  startAtSec: number
  /** Video-time seconds at which the item should start its exit animation. */
  hideAtSec: number
  /** Wall-clock ms at which to remove the DOM after entering exit. Undefined until exiting. */
  removeAtWall?: number
  exiting: boolean
}

function activate(ev: OverlayEvent, videoSec: number, startAtSec = videoSec): ActiveItem {
  return {
    event: ev,
    startAtSec,
    hideAtSec: startAtSec + lifeSecFor(ev),
    exiting: false,
  }
}

function remainingRatio(item: ActiveItem, videoSec: number): number {
  const duration = item.hideAtSec - item.startAtSec
  if (duration <= 0) return 0
  return Math.max(0, Math.min(1, (item.hideAtSec - videoSec) / duration))
}

function pruneActive(items: ActiveItem[], videoSec: number, wallMs: number): ActiveItem[] {
  let changed = false
  const next: ActiveItem[] = []
  for (const item of items) {
    if (item.exiting) {
      if (item.removeAtWall != null && wallMs >= item.removeAtWall) {
        changed = true
        continue
      }
      next.push(item)
      continue
    }
    if (videoSec >= item.hideAtSec) {
      changed = true
      next.push({ ...item, exiting: true, removeAtWall: wallMs + EXIT_MS })
      continue
    }
    next.push(item)
  }
  return changed ? next : items
}

/** Portrait chat-list layout: letterbox bars, or translucent dock on the picture. */
export type OverlayLayout =
  | { mode: "content" }
  | {
      mode: "letterbox"
      topBar: number
      bottomBar: number
      contentBottom: number
    }
  | {
      mode: "docked"
      /** Chat panel height inside the picture (px). */
      panelHeight: number
      /** Extra bottom inset so controls are not covered (px). */
      bottomInset: number
    }

interface EventOverlayLayerProps {
  events: OverlayEvent[]
  currentTime: number
  hidden: boolean
  seekEpoch: number
  /** Where on the stage to anchor the combined event zone. */
  overlayCorner?: OverlayCorner
  /** Display mode controls mobile sizing while preserving desktop fullscreen scale. */
  overlayMode?: "none" | "mobile" | "desktop"
  /** One-time mobile layout inset reserved for playback controls. */
  mobileBottomInset?: number
  className?: string
}

function isBottomCorner(corner: OverlayCorner): boolean {
  return corner === "bottom-left" || corner === "bottom-right"
}

function cornerStyle(
  corner: OverlayCorner,
  mobileLayout: boolean
): { className: string; origin: string } {
  switch (corner) {
    case "top-right":
      return { className: "top-8 right-2", origin: "top right" }
    case "bottom-left":
      // Leave room below the complete event group for the playback controls.
      return {
        className: mobileLayout ? "left-2" : "bottom-56 sm:bottom-60 left-2",
        origin: "bottom left",
      }
    case "bottom-right":
      return {
        className: mobileLayout ? "right-2" : "bottom-56 sm:bottom-60 right-2",
        origin: "bottom right",
      }
    case "top-left":
    default:
      return { className: "top-8 left-2", origin: "top left" }
  }
}

/** Tier medal: tries the official bilibili 大航海 icon, falls back to a shield
 *  glyph if the (hash-bearing) CDN URL ever 404s. */
export function GuardIcon({ level, color }: { level: number | undefined; color: string }) {
  const [failed, setFailed] = useState(false)
  const url = guardLevelIcon(level)
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-base"
      style={{ backgroundColor: `${color}26`, boxShadow: `0 0 8px ${color}80`, color }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        "🛡️"
      )}
    </span>
  )
}

function useWallClock() {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    let raf = 0
    const loop = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return now
}

function overlayMotionClass(exiting: boolean, variant: "hang" | "toast") {
  return cn(
    variant === "hang" ? "bilirec-overlay-hang" : "bilirec-overlay-toast",
    exiting ? "bilirec-overlay-exit" : "bilirec-overlay-enter"
  )
}

export function EventOverlayLayer({
  events,
  currentTime,
  hidden,
  seekEpoch,
  overlayCorner = "top-left",
  overlayMode = "none",
  mobileBottomInset = 0,
  className,
}: EventOverlayLayerProps) {
  const { t } = useTranslation()
  const cursorRef = useRef(0)
  const currentTimeRef = useRef(currentTime)
  const zoneRef = useRef<HTMLDivElement>(null)
  currentTimeRef.current = currentTime
  const [hang, setHang] = useState<ActiveItem[]>([])
  const [toasts, setToasts] = useState<ActiveItem[]>([])
  const [mobileLayoutScale, setMobileLayoutScale] = useState(1)
  const now = useWallClock()

  useEffect(() => {
    let frame = 0
    if (overlayMode !== "mobile") {
      setMobileLayoutScale((prev) => (prev === 1 ? prev : 1))
      return () => undefined
    }

    // Measure once when entering mobile landscape / after control inset settles.
    frame = requestAnimationFrame(() => {
      const zone = zoneRef.current
      const host = zone?.parentElement
      const pictureHeight = host?.clientHeight ?? 0
      const naturalHeight = zone?.offsetHeight ?? 0
      const nextScale =
        pictureHeight > 0 && naturalHeight > 0
          ? Math.min(1, (pictureHeight * MOBILE_OVERLAY_HEIGHT_RATIO) / naturalHeight)
          : 1
      setMobileLayoutScale((prev) =>
        Math.abs(prev - nextScale) < 0.001 ? prev : nextScale
      )
    })
    return () => cancelAnimationFrame(frame)
  }, [overlayMode, mobileBottomInset])

  useEffect(() => {
    const t0 = currentTimeRef.current
    const activeAtCurrentTime = hidden
      ? []
      : events.filter((ev) => ev.ts <= t0 && ev.ts + lifeSecFor(ev) > t0)
    setHang(
      activeAtCurrentTime
        .filter((ev) => ev.kind !== "gift")
        .map((ev) => activate(ev, t0, ev.ts))
        .slice(-MAX_HANG)
    )
    setToasts(
      activeAtCurrentTime
        .filter((ev) => ev.kind === "gift")
        .map((ev) => activate(ev, t0, ev.ts))
        .slice(-MAX_TOAST)
    )
    let i = 0
    while (i < events.length && events[i].ts <= t0) i += 1
    cursorRef.current = i
  }, [seekEpoch, events, hidden])

  useEffect(() => {
    if (hidden || events.length === 0) return
    const videoSec = currentTime
    const nextHang: ActiveItem[] = []
    const nextToast: ActiveItem[] = []
    let i = cursorRef.current
    while (i < events.length && events[i].ts <= currentTime + 0.05) {
      const ev = events[i]
      i += 1
      if (ev.kind === "gift") {
        nextToast.push(activate(ev, videoSec))
      } else {
        nextHang.push(activate(ev, videoSec))
      }
    }
    cursorRef.current = i
    if (nextHang.length === 0 && nextToast.length === 0) return
    if (nextHang.length) {
      setHang((prev) => [...prev, ...nextHang].slice(-MAX_HANG))
    }
    if (nextToast.length) {
      setToasts((prev) => [...prev, ...nextToast].slice(-MAX_TOAST))
    }
  }, [currentTime, events, hidden])

  useEffect(() => {
    if (hidden) return
    setHang((prev) => pruneActive(prev, currentTime, now))
    setToasts((prev) => pruneActive(prev, currentTime, now))
  }, [now, currentTime, hidden])

  const visibleHang = useMemo(() => (hidden ? [] : hang), [hang, hidden])
  const visibleToasts = useMemo(() => (hidden ? [] : toasts), [toasts, hidden])
  const scale =
    overlayMode === "desktop"
      ? DESKTOP_FULLSCREEN_SCALE
      : overlayMode === "mobile"
        ? mobileLayoutScale
        : 1

  if (hidden) return null

  const mobileLayout = overlayMode === "mobile"
  const rightAlignedCorner =
    overlayCorner === "top-right" || overlayCorner === "bottom-right"
  const mobileEffectWidthClass = mobileLayout
    ? rightAlignedCorner
      ? "w-3/5 self-end"
      : "w-3/5 self-start"
    : undefined
  const corner = cornerStyle(overlayCorner, mobileLayout)
  const safeMobileBottomInset =
    Number.isFinite(mobileBottomInset) && mobileBottomInset > 0 ? mobileBottomInset : 0

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 z-19 overflow-hidden", className)}
      aria-hidden
    >
      {/* Keep hang cards and gifts in one anchored group so scaling preserves
          the position of the complete visual effect, including the gift lane. */}
      <div
        ref={zoneRef}
        className={cn("absolute", corner.className)}
        style={{
          ...(scale !== 1
            ? { transform: `scale(${scale})`, transformOrigin: corner.origin }
            : {}),
          ...(mobileLayout && isBottomCorner(overlayCorner)
            ? {
                // Cap with a picture-height % so short landscape screens keep
                // bottom-corner gifts near the lower edge, not mid-frame.
                bottom: `min(calc(${safeMobileBottomInset}px + env(safe-area-inset-bottom, 0px)), 22%)`,
              }
            : {}),
          // Give the flex column a real cross-axis width so toast rows cannot
          // collapse when the chosen corner is anchored with only one inset.
          width: "calc(100% - 1rem)",
          maxWidth: "24rem",
        }}
      >
        <div className="flex flex-col items-stretch gap-1">
          <div className="flex flex-col items-stretch gap-1.5">
          {visibleHang.map((item) => {
            const { event, exiting } = item
            if (event.kind === "super_chat") {
              const theme = resolveSuperChatTheme(event)
              const remaining = remainingRatio(item, currentTime)
              return (
                <div
                  key={event.id}
                  className={cn(
                    "overflow-hidden rounded-md text-left shadow-md",
                    overlayMotionClass(exiting, "hang"),
                    mobileEffectWidthClass
                  )}
                  style={{
                    backgroundColor: theme.body,
                    border: `1px solid ${theme.body}`,
                    boxShadow: "1px 1px 5px rgb(0 0 0 / 0.75)",
                  }}
                >
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold bg-contain bg-no-repeat"
                    style={{
                      backgroundColor: theme.header,
                      color: theme.name,
                      backgroundImage: theme.backgroundImage ? `url(${theme.backgroundImage})` : undefined,
                      backgroundPosition: "right center",
                    }}
                  >
                    {event.face ? (
                      <img
                        src={event.face}
                        alt=""
                        className="size-6 shrink-0 rounded-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="size-6 shrink-0 rounded-full bg-black/20" />
                    )}
                    <span className="truncate min-w-0 flex-1 leading-6">{event.user}</span>
                    <span className="shrink-0 tabular-nums leading-6" style={{ color: theme.price }}>
                      ￥{event.price ?? 0}
                    </span>
                  </div>
                  <div className="h-0.5 bg-black/10" aria-hidden>
                    <div
                      className="h-full origin-left transition-[width] duration-100 ease-linear"
                      style={{
                        width: `${remaining * 100}%`,
                        backgroundColor: theme.header,
                        boxShadow: `0 0 3px ${theme.header}`,
                      }}
                    />
                  </div>
                  <p
                    className="px-2.5 py-1.5 text-xs sm:text-sm leading-snug line-clamp-3 wrap-break-word"
                    style={{ color: theme.message }}
                  >
                    {event.text}
                  </p>
                </div>
              )
            }
            const color = guardLevelColor(event.level)
            const label = guardLevelLabel(event.level)
            const count = event.giftCount ?? 1
            return (
              <div
                key={event.id}
                className={cn(
                  "relative overflow-hidden rounded-md bg-black/75 text-left shadow-md backdrop-blur-sm",
                  overlayMotionClass(exiting, "hang"),
                  mobileEffectWidthClass
                )}
                style={{
                  border: `1px solid ${color}66`,
                  boxShadow: `0 0 12px ${color}40, 1px 1px 5px rgb(0 0 0 / 0.75)`,
                }}
              >
                {/* Left tier color bar — signals importance at a glance */}
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1.5"
                  style={{ backgroundColor: color }}
                />
                <div className="flex items-center gap-2 pl-3.5 pr-2.5 py-1.5">
                  {/* Tier medal — official 大航海 icon with shield fallback */}
                  <GuardIcon level={event.level} color={color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] sm:text-xs font-bold leading-tight" style={{ color }}>
                        {label}
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-white/55 leading-tight">
                        {t("playbackPlayer.guardAction")}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className="truncate text-xs sm:text-sm font-medium leading-tight text-white">
                        {event.user}
                      </span>
                      {count > 1 ? (
                        <span className="shrink-0 text-[11px] sm:text-xs text-white/60">×{count}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          </div>

          <div className="flex flex-col items-stretch gap-1">
          {visibleToasts.map(({ event, exiting }) => (
            <div
              key={event.id}
              className={cn(
                "rounded-md border border-pink-400/40 bg-black/65 px-2 py-1 text-[11px] sm:text-xs text-white shadow-sm backdrop-blur-sm truncate",
                overlayMotionClass(exiting, "toast"),
                mobileEffectWidthClass
              )}
            >
              <span aria-hidden>🎁 </span>
              <span className="text-pink-200 font-medium">{event.user}</span>
              <span className="text-white/80">
                {" "}
                {t("playbackPlayer.giftLine", {
                  gift: event.giftName || t("playbackPlayer.giftFallback"),
                  count: event.giftCount ?? 1,
                })}
              </span>
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  )
}

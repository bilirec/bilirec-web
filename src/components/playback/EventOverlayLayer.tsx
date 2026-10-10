import { useEffect, useRef, useState, type RefObject } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { remainingRatio, useOverlayEventQueue } from "@/hooks/use-overlay-event-queue"
import type { OverlayEvent } from "@/lib/danmaku"
import { guardLevelColor, guardLevelIcon, guardLevelLabel, resolveSuperChatTheme } from "@/lib/danmaku"
import type { OverlayCorner } from "@/lib/playback-settings"
import {
  DESKTOP_EVENT_OVERLAY_PICTURE_FLOOR_PX,
  resolveWindowedBottomCornerPx,
} from "@/lib/playback-layout"

const DESKTOP_FULLSCREEN_SCALE = 1.45
const MOBILE_OVERLAY_HEIGHT_RATIO = 0.4

/** Portrait chat-list layout: letterbox bars, or translucent dock on the picture. */
export type OverlayLayout =
  | { mode: "content"; /** Letterbox below the picture (px), within the stage. */ bottomBar: number }
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
  videoRef: RefObject<HTMLVideoElement | null>
  hidden: boolean
  seekEpoch: number
  /** Where on the stage to anchor the combined event zone. */
  overlayCorner?: OverlayCorner
  /** Display mode controls mobile sizing while preserving desktop fullscreen scale. */
  overlayMode?: "none" | "mobile" | "desktop"
  /** Measured inset above overlapping playback controls (mobile landscape / desktop fullscreen). */
  chromeBottomInset?: number
  /** Letterbox height below the picture; used for windowed bottom-corner placement. */
  pictureBottomBar?: number
  /** Narrower event stack in desktop windowed mode (px). */
  maxZoneWidthPx?: number
  className?: string
}

function isBottomCorner(corner: OverlayCorner): boolean {
  return corner === "bottom-left" || corner === "bottom-right"
}

function resolveBottomCornerInset(
  corner: OverlayCorner,
  overlayMode: "none" | "mobile" | "desktop",
  pictureBottomBar: number,
  chromeBottomInset: number
): number | string | undefined {
  if (!isBottomCorner(corner)) return undefined

  const measuredInset =
    Number.isFinite(chromeBottomInset) && chromeBottomInset > 0 ? chromeBottomInset : 0

  if (overlayMode === "mobile") {
    return `min(calc(${measuredInset}px + env(safe-area-inset-bottom, 0px)), 22%)`
  }
  if (overlayMode === "desktop") {
    return Math.max(measuredInset, DESKTOP_EVENT_OVERLAY_PICTURE_FLOOR_PX)
  }
  return resolveWindowedBottomCornerPx(pictureBottomBar)
}

function cornerAnchor(corner: OverlayCorner): { className: string; origin: string } {
  switch (corner) {
    case "top-right":
      return { className: "top-8 right-2", origin: "top right" }
    case "bottom-left":
      return { className: "left-2", origin: "bottom left" }
    case "bottom-right":
      return { className: "right-2", origin: "bottom right" }
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

function overlayMotionClass(exiting: boolean, variant: "hang" | "toast") {
  return cn(
    variant === "hang" ? "bilirec-overlay-hang" : "bilirec-overlay-toast",
    exiting ? "bilirec-overlay-exit" : "bilirec-overlay-enter"
  )
}

/** Guard (艦長/提督/總督) hanging card — shared by the hang lane and the
 *  lower coverable lane where guards rotate together with gift toasts. */
function GuardCard({
  event,
  exiting,
  variant,
  className,
}: {
  event: OverlayEvent
  exiting: boolean
  variant: "hang" | "toast"
  className?: string
}) {
  const { t } = useTranslation()
  const color = guardLevelColor(event.level)
  const label = guardLevelLabel(event.level)
  const count = event.giftCount ?? 1
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-black/75 text-left shadow-md backdrop-blur-sm",
        overlayMotionClass(exiting, variant),
        className
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
}

export function EventOverlayLayer({
  events,
  videoRef,
  hidden,
  seekEpoch,
  overlayCorner = "top-left",
  overlayMode = "none",
  chromeBottomInset = 0,
  pictureBottomBar = 0,
  maxZoneWidthPx,
  className,
}: EventOverlayLayerProps) {
  const { t } = useTranslation()
  const { currentTime, hangActive, guardActive, gifts } = useOverlayEventQueue({
    events,
    videoRef,
    hidden,
    seekEpoch,
  })
  const zoneRef = useRef<HTMLDivElement>(null)
  const [mobileLayoutScale, setMobileLayoutScale] = useState(1)

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
  }, [overlayMode, chromeBottomInset])

  const visibleHang = hangActive
  const visibleGuards = guardActive
  const visibleGifts = gifts
  const scale =
    overlayMode === "desktop"
      ? DESKTOP_FULLSCREEN_SCALE
      : overlayMode === "mobile"
        ? mobileLayoutScale
        : 1

  if (hidden || overlayCorner === "hidden") return null

  const mobileLayout = overlayMode === "mobile"
  const rightAlignedCorner =
    overlayCorner === "top-right" || overlayCorner === "bottom-right"
  const mobileEffectWidthClass = mobileLayout
    ? rightAlignedCorner
      ? "w-3/5 self-end"
      : "w-3/5 self-start"
    : undefined
  const windowedOverlay = maxZoneWidthPx != null
  const scMessageClass = windowedOverlay
    ? "overflow-hidden px-2.5 py-1.5 text-xs leading-snug line-clamp-4 wrap-break-word"
    : "overflow-hidden px-2.5 py-1.5 text-xs sm:text-sm leading-snug line-clamp-3 wrap-break-word"
  const corner = cornerAnchor(overlayCorner)
  const zoneBottom = resolveBottomCornerInset(
    overlayCorner,
    overlayMode,
    pictureBottomBar,
    chromeBottomInset
  )

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 z-19 overflow-hidden", className)}
      aria-hidden
    >
      {/* Keep hang SC cards, guard cards and gift toasts in one anchored group so
          scaling preserves the position of the complete visual effect. */}
      <div
        ref={zoneRef}
        className={cn("absolute", corner.className)}
        style={{
          ...(scale !== 1
            ? { transform: `scale(${scale})`, transformOrigin: corner.origin }
            : {}),
          ...(zoneBottom != null ? { bottom: zoneBottom } : {}),
          // Give the flex column a real cross-axis width so toast rows cannot
          // collapse when the chosen corner is anchored with only one inset.
          width: "calc(100% - 1rem)",
          maxWidth:
            maxZoneWidthPx != null ? `${maxZoneWidthPx}px` : "24rem",
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
                  <p className={scMessageClass} style={{ color: theme.message }}>
                    {event.text}
                  </p>
                </div>
              )
            }
            return (
              <GuardCard
                key={event.id}
                event={event}
                exiting={exiting}
                variant="hang"
                className={mobileEffectWidthClass}
              />
            )
          })}
          </div>

          <div className="flex flex-col items-stretch gap-1">
          {/* Guards always sit above gifts and can only ever be covered by
              other guards (same SC settle mechanics, tier-priced priority). */}
          {visibleGuards.map((item) => (
            <GuardCard
              key={item.event.id}
              event={item.event}
              exiting={item.exiting}
              variant="toast"
              className={mobileEffectWidthClass}
            />
          ))}
          {visibleGifts.map(({ event, exiting }) => (
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

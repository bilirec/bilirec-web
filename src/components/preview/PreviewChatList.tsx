import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import {
  chatItemsVisibleEnd,
  guardLevelColor,
  guardLevelLabel,
  resolveSuperChatTheme,
  type PreviewChatItem,
} from "@/lib/danmaku"
import { GuardIcon, type OverlayLayout } from "@/components/preview/EventOverlayLayer"

const CONTROL_RESERVE_PX = 100
const STICK_BOTTOM_PX = 48
const EST_ROW_PX = 36

type ChatListLayout = Extract<OverlayLayout, { mode: "letterbox" | "docked" }>

interface PreviewChatListProps {
  items: PreviewChatItem[]
  currentTime: number
  hidden: boolean
  layout: ChatListLayout
  className?: string
}

function ChatRow({ item }: { item: PreviewChatItem }) {
  const { t } = useTranslation()

  if (item.kind === "danmaku") {
    return (
      <div className="px-2.5 py-1 text-[13px] leading-snug text-white/90">
        {item.user ? (
          <span className="mr-1.5 font-medium text-white/55">{item.user}</span>
        ) : null}
        <span style={item.color ? { color: item.color } : undefined}>{item.text}</span>
      </div>
    )
  }

  if (item.kind === "super_chat") {
    const theme = resolveSuperChatTheme(item)
    return (
      <div
        className="mx-2 my-1 overflow-hidden rounded-md text-left shadow-md"
        style={{
          backgroundColor: theme.body,
          border: `1px solid ${theme.body}`,
          boxShadow: "1px 1px 5px rgb(0 0 0 / 0.75)",
        }}
      >
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold bg-contain bg-no-repeat"
          style={{
            backgroundColor: theme.header,
            color: theme.name,
            backgroundImage: theme.backgroundImage ? `url(${theme.backgroundImage})` : undefined,
            backgroundPosition: "right center",
          }}
        >
          {item.face ? (
            <img
              src={item.face}
              alt=""
              className="size-6 shrink-0 rounded-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="size-6 shrink-0 rounded-full bg-black/20" />
          )}
          <span className="min-w-0 flex-1 truncate leading-6">{item.user}</span>
          <span className="shrink-0 tabular-nums leading-6" style={{ color: theme.price }}>
            ￥{item.price ?? 0}
          </span>
        </div>
        {item.text ? (
          <p
            className="px-2.5 py-1.5 text-xs leading-snug line-clamp-3 wrap-break-word"
            style={{ color: theme.message }}
          >
            {item.text}
          </p>
        ) : null}
      </div>
    )
  }

  if (item.kind === "gift") {
    return (
      <div className="px-2.5 py-1 text-[12px] leading-snug text-white/85">
        <span aria-hidden>🎁 </span>
        <span className="font-medium text-pink-200">{item.user}</span>
        <span className="text-white/75">
          {" "}
          {t("previewPlayer.giftLine", {
            gift: item.giftName || t("previewPlayer.giftFallback"),
            count: item.giftCount ?? 1,
          })}
        </span>
      </div>
    )
  }

  const color = guardLevelColor(item.level)
  const label = guardLevelLabel(item.level)
  return (
    <div
      className="relative mx-2 my-1 overflow-hidden rounded-md bg-black/75 text-left shadow-md backdrop-blur-sm"
      style={{
        border: `1px solid ${color}66`,
        boxShadow: `0 0 12px ${color}40, 1px 1px 5px rgb(0 0 0 / 0.75)`,
      }}
    >
      <div aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} />
      <div className="flex items-center gap-2 py-1.5 pl-3.5 pr-2.5">
        <GuardIcon level={item.level} color={color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold leading-tight" style={{ color }}>
              {label}
            </span>
            <span className="text-[10px] text-white/55 leading-tight">{t("previewPlayer.guardAction")}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="truncate text-xs font-medium leading-tight text-white">{item.user}</span>
            {(item.giftCount ?? 1) > 1 ? (
              <span className="shrink-0 text-[11px] text-white/60">×{item.giftCount}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Portrait chat timeline (virtualized): letterbox black bar, or translucent dock on vertical VODs.
 * Follows playback (stick-to-bottom) until the user scrolls up.
 */
export function PreviewChatList({
  items,
  currentTime,
  hidden,
  layout,
  className,
}: PreviewChatListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const [stickBottom, setStickBottom] = useState(true)

  const visibleCount = useMemo(
    () => chatItemsVisibleEnd(items, currentTime),
    [items, currentTime]
  )
  const visible = useMemo(() => items.slice(0, visibleCount), [items, visibleCount])

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => EST_ROW_PX,
    overscan: 12,
    measureElement:
      typeof window !== "undefined" && "ResizeObserver" in window
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  })

  useEffect(() => {
    stickRef.current = true
    setStickBottom(true)
  }, [items])

  useEffect(() => {
    if (!stickRef.current || visible.length === 0) return
    const id = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(visible.length - 1, { align: "end" })
    })
    return () => cancelAnimationFrame(id)
    // Only follow when the visible window grows/shrinks with playback/seek.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- virtualizer API is stable enough here
  }, [visible.length])

  if (hidden) return null

  const docked = layout.mode === "docked"
  const panelStyle: CSSProperties = docked
    ? {
        left: 0,
        right: 0,
        bottom: layout.bottomInset,
        height: layout.panelHeight,
      }
    : {
        top: layout.contentBottom + 4,
        bottom: CONTROL_RESERVE_PX,
        left: 0,
        right: 0,
      }

  return (
    <div
      className={cn(
        "pointer-events-auto absolute z-19 flex flex-col",
        docked && "bg-linear-to-r from-black/75 via-black/50 to-black/10 backdrop-blur-[1px]",
        className
      )}
      style={panelStyle}
    >
      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
        onScroll={() => {
          const el = parentRef.current
          if (!el) return
          const dist = el.scrollHeight - el.scrollTop - el.clientHeight
          const next = dist <= STICK_BOTTOM_PX
          stickRef.current = next
          setStickBottom(next)
        }}
      >
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const item = visible[row.index]
            if (!item) return null
            return (
              <div
                key={item.id}
                data-index={row.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                <ChatRow item={item} />
              </div>
            )
          })}
        </div>
      </div>
      {!stickBottom && visible.length > 0 ? (
        <button
          type="button"
          className="absolute bottom-1 right-2 rounded-full bg-white/15 px-2.5 py-1 text-[11px] text-white/90 backdrop-blur-sm"
          onClick={() => {
            stickRef.current = true
            setStickBottom(true)
            virtualizer.scrollToIndex(visible.length - 1, { align: "end" })
          }}
        >
          ↓
        </button>
      ) : null}
    </div>
  )
}

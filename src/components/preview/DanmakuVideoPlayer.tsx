import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import NDanmaku from "n-danmaku"
import {
  MediaChromeButton,
  MediaControlBar,
  MediaController,
  MediaLoadingIndicator,
  MediaMuteButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react"
import {
  MediaPlaybackRateMenu,
  MediaPlaybackRateMenuButton,
} from "media-chrome/react/menu"
import {
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretUpIcon,
  ChatCircleSlashIcon,
  ChatCircleTextIcon,
  CornersOutIcon,
  GearSixIcon,
  SubtitlesIcon,
  SubtitlesSlashIcon,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { EventOverlayLayer, type OverlayLayout } from "@/components/preview/EventOverlayLayer"
import { PreviewChatList } from "@/components/preview/PreviewChatList"
import {
  fetchDanmakuForVideo,
  type DanmakuMeta,
  type OverlayEvent,
  type PreviewChatItem,
} from "@/lib/danmaku"
import {
  DEFAULT_DANMAKU_OPACITY,
  DEFAULT_FRAME_STEP_MS,
  DEFAULT_OVERLAY_CORNER,
  DEFAULT_PLAYBACK_RATES,
  DEFAULT_SEEK_OFFSET_SEC,
  OVERLAY_CORNERS,
  loadDanmakuOpacity,
  loadFrameStepMs,
  loadOverlayCorner,
  loadPlaybackRates,
  loadSeekOffsetSec,
  loadScreenDanmakuVisible,
  parsePositiveNumber,
  parseRatesInput,
  saveDanmakuOpacity,
  saveFrameStepMs,
  saveOverlayCorner,
  savePlaybackRates,
  saveSeekOffsetSec,
  saveScreenDanmakuVisible,
} from "@/lib/preview-settings"
import type { OverlayCorner } from "@/lib/preview-settings"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { DanmakuListItem } from "n-danmaku"
import { getCurrentLanguage } from "@/i18n"
import "media-chrome/dist/lang/zh-CN.js"
import "media-chrome/dist/lang/zh-TW.js"

export type ObjectFitMode = "contain" | "cover" | "fill"

const FIT_CYCLE: ObjectFitMode[] = ["contain", "cover", "fill"]

function getObjectFitContentBox(
  video: HTMLVideoElement,
  fit: ObjectFitMode
): { top: number; left: number; width: number; height: number } {
  const elW = video.clientWidth
  const elH = video.clientHeight
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!elW || !elH || !vw || !vh || fit === "fill") {
    return { top: 0, left: 0, width: elW, height: elH }
  }

  const videoAspect = vw / vh
  const elAspect = elW / elH

  if (fit === "cover") {
    if (videoAspect > elAspect) {
      const width = elH * videoAspect
      return { top: 0, left: (elW - width) / 2, width, height: elH }
    }
    const height = elW / videoAspect
    return { top: (elH - height) / 2, left: 0, width: elW, height }
  }

  // contain
  if (videoAspect > elAspect) {
    const height = elW / videoAspect
    return { top: (elH - height) / 2, left: 0, width: elW, height }
  }
  const width = elH * videoAspect
  return { top: 0, left: (elW - width) / 2, width, height: elH }
}

/** Default n-danmaku font is ~width/36; desktop preview stays a bit smaller than live. */
const DANMAKU_SCALE_DESKTOP = 0.63
/** Narrow / phone picture boxes need a larger scale or bullets become unreadable. */
const DANMAKU_SCALE_NARROW = 1.55
/** Keep the base danmaku motion at half of n-danmaku's default speed. */
const DANMAKU_DEFAULT_LIFE_MS = 5000
const DANMAKU_BASE_SPEED = 0.5
/** Small look-ahead window; the RAF ticker prevents dense bursts on each tick. */
const DANMAKU_TICK_UNCERTAINTY_MS = 120
/** n-danmaku must not be ticked for every animation frame; its ranges overlap. */
const DANMAKU_TICK_INTERVAL_MS = 160

function danmakuLifeForRate(rate: number): number {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1
  return DANMAKU_DEFAULT_LIFE_MS / (safeRate * DANMAKU_BASE_SPEED)
}

function cornerLabelKey(corner: OverlayCorner): string {
  switch (corner) {
    case "top-right":
      return "overlayCornerTopRight"
    case "bottom-left":
      return "overlayCornerBottomLeft"
    case "bottom-right":
      return "overlayCornerBottomRight"
    case "top-left":
    default:
      return "overlayCornerTopLeft"
  }
}

function danmakuScaleForWidth(width: number): number {
  if (width > 0 && width < 520) return DANMAKU_SCALE_NARROW
  if (width > 0 && width < 900) return 0.95
  return DANMAKU_SCALE_DESKTOP
}

const MEDIA_CHROME_VARS = {
  "--media-primary-color": "#fff",
  // Keep secondary dark so built-in tooltips are not light-gray panels
  "--media-secondary-color": "rgb(24 24 27 / 0.92)",
  "--media-control-background": "transparent",
  "--media-control-hover-background": "rgb(255 255 255 / 0.12)",
  "--media-menu-background": "rgb(24 24 27 / 0.96)",
  "--media-tooltip-background-color": "rgb(24 24 27)",
  "--media-tooltip-background": "rgb(24 24 27)",
  "--media-tooltip-arrow-color": "rgb(24 24 27)",
  "--media-text-color": "#fff",
  "--media-button-icon-width": "1.25rem",
  "--media-font-family": "inherit",
  "--media-range-track-background": "rgb(255 255 255 / 0.28)",
  "--media-range-bar-color": "#fff",
  "--media-range-thumb-background": "#fff",
  "--media-time-range-buffered-color": "rgb(255 255 255 / 0.35)",
  "--media-preview-time-background": "rgb(0 0 0 / 0.75)",
} as CSSProperties

interface DanmakuVideoPlayerProps {
  playbackUrl: string
  videoPath: string
  /** Display filename shown in the player chrome */
  fileName: string
  className?: string
}

function TextChipButton({
  title,
  onClick,
  active,
  children,
}: {
  title: string
  onClick: () => void
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium tracking-wide text-white/90",
        "hover:bg-white/12 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
        active && "bg-white/15 text-white"
      )}
    >
      {children}
    </button>
  )
}

/** Shared muted label style for 跳幀 / 縮放 / 倍速 */
const ADV_LABEL = "text-xs font-medium text-white/55 shrink-0"

export function DanmakuVideoPlayer({ playbackUrl, videoPath, fileName, className }: DanmakuVideoPlayerProps) {
  const { t } = useTranslation()
  // Keep media-chrome tooltips in sync with app i18n (zh-CN / zh-TW)
  const mediaLang = getCurrentLanguage()
  const stageRef = useRef<HTMLDivElement>(null)
  const danmakuHostRef = useRef<HTMLDivElement>(null)
  const overlayHostRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const danmakuRef = useRef<NDanmaku | null>(null)
  const listReadyRef = useRef(false)
  const lastDanmakuTickMsRef = useRef<number | null>(null)
  const danmakuSeekingRef = useRef(false)

  const [objectFit, setObjectFit] = useState<ObjectFitMode>("contain")
  const [danmakuHidden, setDanmakuHidden] = useState(false)
  const [screenDanmakuVisible, setScreenDanmakuVisible] = useState<boolean>(() =>
    loadScreenDanmakuVisible()
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [paused, setPaused] = useState(true)
  const [seekEpoch, setSeekEpoch] = useState(0)
  const [stageFullscreen, setStageFullscreen] = useState(false)
  const [bullets, setBullets] = useState<DanmakuListItem[]>([])
  const [overlays, setOverlays] = useState<OverlayEvent[]>([])
  const [chatItems, setChatItems] = useState<PreviewChatItem[]>([])
  const [meta, setMeta] = useState<DanmakuMeta | undefined>()
  const [danmakuStatus, setDanmakuStatus] = useState<"loading" | "ready" | "none" | "xml">("loading")
  const [rates, setRates] = useState<number[]>(() => loadPlaybackRates())
  const [playbackRate, setPlaybackRate] = useState(1)
  const [frameStepMs, setFrameStepMs] = useState(() => loadFrameStepMs())
  const [seekOffsetSec, setSeekOffsetSec] = useState(() => loadSeekOffsetSec())
  const [danmakuOpacity, setDanmakuOpacity] = useState(() => loadDanmakuOpacity())
  const [overlayCorner, setOverlayCorner] = useState<OverlayCorner>(() => loadOverlayCorner())
  const [danmakuScale, setDanmakuScale] = useState(DANMAKU_SCALE_DESKTOP)
  const [overlayLayout, setOverlayLayout] = useState<OverlayLayout>({ mode: "content" })
  const [ratesDraft, setRatesDraft] = useState(() => loadPlaybackRates().join(", "))
  const [frameDraft, setFrameDraft] = useState(() => String(loadFrameStepMs()))
  const [seekDraft, setSeekDraft] = useState(() => String(loadSeekOffsetSec()))
  const [opacityDraft, setOpacityDraft] = useState(() => loadDanmakuOpacity())
  const [settingsOpen, setSettingsOpen] = useState(false)

  const frameStepSec = frameStepMs / 1000

  useEffect(() => {
    const ac = new AbortController()
    setDanmakuStatus("loading")
    setBullets([])
    setOverlays([])
    setChatItems([])
    setMeta(undefined)
    fetchDanmakuForVideo(videoPath, ac.signal).then((res) => {
      if (ac.signal.aborted) return
      if (res.kind === "none") {
        setDanmakuStatus(res.reason === "xml" ? "xml" : "none")
        return
      }
      setMeta(res.meta)
      setBullets(res.bullets)
      setOverlays(res.overlays)
      setChatItems(res.chatItems)
      setDanmakuStatus("ready")
    })
    return () => ac.abort()
  }, [videoPath])

  useEffect(() => {
    const host = danmakuHostRef.current
    if (!host) return
    // Host is sized to the video picture box; layer fills the host
    const instance = new NDanmaku(host, "bilirec", "1")
    instance.dmLayer.style.pointerEvents = "none"
    danmakuRef.current = instance
    listReadyRef.current = false
    instance.pause()
    return () => {
      try {
        instance.clear()
      } catch {
        /* ignore */
      }
      danmakuRef.current = null
      listReadyRef.current = false
    }
  }, [])

  // Keep danmaku on the picture box; portrait stage uses chat list (letterbox or docked).
  useEffect(() => {
    const stage = stageRef.current
    const host = danmakuHostRef.current
    const overlayHost = overlayHostRef.current
    const video = videoRef.current
    if (!stage || !host || !video) return

    const sync = () => {
      const box = getObjectFitContentBox(video, objectFit)
      const stageRect = stage.getBoundingClientRect()
      const videoRect = video.getBoundingClientRect()
      const top = videoRect.top - stageRect.top + box.top
      const left = videoRect.left - stageRect.left + box.left
      const stageW = stage.clientWidth
      const stageH = stage.clientHeight
      const applyBox = (el: HTMLElement) => {
        el.style.top = `${top}px`
        el.style.left = `${left}px`
        el.style.width = `${box.width}px`
        el.style.height = `${box.height}px`
      }
      applyBox(host)

      const topBar = Math.max(0, top)
      const bottomBar = Math.max(0, stageH - top - box.height)
      const portraitStage = stageH > stageW
      // Landscape VOD on portrait phone → black bars. Vertical VOD → translucent dock on picture.
      const useLetterbox =
        objectFit === "contain" && portraitStage && topBar >= 40 && bottomBar >= 40
      const useDocked = objectFit === "contain" && portraitStage && !useLetterbox

      if (overlayHost) {
        if (useLetterbox) {
          overlayHost.style.top = "0px"
          overlayHost.style.left = "0px"
          overlayHost.style.width = `${stageW}px`
          overlayHost.style.height = `${stageH}px`
        } else {
          applyBox(overlayHost)
        }
      }

      const nextScale = danmakuScaleForWidth(box.width)
      setDanmakuScale((prev) => (prev === nextScale ? prev : nextScale))

      setOverlayLayout((prev) => {
        if (useLetterbox) {
          const next: OverlayLayout = {
            mode: "letterbox",
            topBar,
            bottomBar,
            contentBottom: top + box.height,
          }
          if (
            prev.mode === "letterbox" &&
            prev.topBar === next.topBar &&
            prev.bottomBar === next.bottomBar &&
            prev.contentBottom === next.contentBottom
          ) {
            return prev
          }
          return next
        }
        if (useDocked) {
          const panelHeight = Math.round(
            Math.min(280, Math.max(140, box.height * 0.34))
          )
          // If the picture reaches into the control chrome, lift the dock above it.
          const bottomInset = Math.max(8, Math.round(100 - bottomBar))
          const next: OverlayLayout = { mode: "docked", panelHeight, bottomInset }
          if (
            prev.mode === "docked" &&
            prev.panelHeight === next.panelHeight &&
            prev.bottomInset === next.bottomInset
          ) {
            return prev
          }
          return next
        }
        return prev.mode === "content" ? prev : { mode: "content" }
      })

      danmakuRef.current?.resetRanges()
    }

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(stage)
    ro.observe(video)
    video.addEventListener("loadedmetadata", sync)
    return () => {
      ro.disconnect()
      video.removeEventListener("loadedmetadata", sync)
    }
  }, [objectFit, playbackUrl, mediaLang])

  useEffect(() => {
    const onFs = () => {
      const stage = stageRef.current
      setStageFullscreen(!!stage && document.fullscreenElement === stage)
    }
    onFs()
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])

  useEffect(() => {
    const dm = danmakuRef.current
    if (!dm || danmakuStatus !== "ready") return
    try {
      dm.list.del("vod")
    } catch {
      /* ignore */
    }
    dm.list.new("vod")
    dm.list.use("vod")
    dm.list.uncertainty(DANMAKU_TICK_UNCERTAINTY_MS)
    // n-danmaku ranges are % of host height: top/scroll from top, bottom from bottom.
    dm.ranges({
      scroll: [2, 85],
      top: [2, 35],
      bottom: [2, 32],
      random: [2, 85],
    })
    // n-danmaku load() mutates items (deletes time) — clone so React state stays intact
    dm.list.load(
      bullets.map((b) => ({
        ...b,
        styles: {
          ...b.styles,
          scale: danmakuScale,
          opacity: danmakuOpacity,
          life: danmakuLifeForRate(playbackRate),
          pointer_events: false,
          custom_css: b.styles?.custom_css ? { ...b.styles.custom_css } : undefined,
        },
      }))
    )
    listReadyRef.current = true
    dm.clear()
    const list = dm.list as unknown as { lastTickRange: [number, number] }
    list.lastTickRange = [0, 0]
    lastDanmakuTickMsRef.current = null
    const video = videoRef.current
    if (video && !video.paused) {
      const videoMs = Math.round(video.currentTime * 1000)
      dm.list.tick(videoMs)
      lastDanmakuTickMsRef.current = videoMs
      dm.resume()
    }
  }, [bullets, danmakuStatus, danmakuOpacity, danmakuScale, playbackRate])

  useEffect(() => {
    const layer = danmakuHostRef.current?.querySelector(".N-dmLayer") as HTMLElement | null
    if (!layer) return
    const visible = !danmakuHidden && screenDanmakuVisible
    layer.style.display = visible ? "block" : "none"
    if (!visible) {
      danmakuRef.current?.clear()
      return
    }
    const dm = danmakuRef.current
    if (!dm || !listReadyRef.current) return
    const list = dm.list as unknown as { lastTickRange: [number, number] }
    list.lastTickRange = [0, 0]
    lastDanmakuTickMsRef.current = null
    const video = videoRef.current
    if (video && !video.paused) {
      const videoMs = Math.round(video.currentTime * 1000)
      dm.list.tick(videoMs)
      lastDanmakuTickMsRef.current = videoMs
      dm.resume()
    }
  }, [danmakuHidden, screenDanmakuVisible])

  const stepFrame = useCallback(
    (dir: -1 | 1) => {
      const video = videoRef.current
      if (!video) return
      video.pause()
      const next = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + dir * frameStepSec))
      video.currentTime = next
    },
    [frameStepSec]
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let danmakuRaf = 0
    const stopDanmakuTicker = () => {
      if (danmakuRaf !== 0) {
        cancelAnimationFrame(danmakuRaf)
        danmakuRaf = 0
      }
    }
    const tickDanmaku = (force = false) => {
      if (!force && danmakuSeekingRef.current) return
      if (
        !danmakuHidden &&
        screenDanmakuVisible &&
        listReadyRef.current &&
        danmakuRef.current
      ) {
        const videoMs = Math.round(video.currentTime * 1000)
        const lastTickMs = lastDanmakuTickMsRef.current
        if (
          !force &&
          lastTickMs != null &&
          videoMs >= lastTickMs &&
          videoMs - lastTickMs < DANMAKU_TICK_INTERVAL_MS
        ) {
          return
        }
        danmakuRef.current.list.tick(videoMs)
        lastDanmakuTickMsRef.current = videoMs
      }
    }
    const runDanmakuTicker = () => {
      tickDanmaku()
      if (!video.paused) {
        danmakuRaf = requestAnimationFrame(runDanmakuTicker)
      } else {
        danmakuRaf = 0
      }
    }
    const startDanmakuTicker = () => {
      stopDanmakuTicker()
      danmakuRaf = requestAnimationFrame(runDanmakuTicker)
    }
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      // Fallback for throttled requestAnimationFrame (background tabs / seeks).
      tickDanmaku()
    }
    const onPlay = () => {
      setPaused(false)
      danmakuRef.current?.resume()
      startDanmakuTicker()
    }
    const onPause = () => {
      setPaused(true)
      danmakuRef.current?.pause()
      stopDanmakuTicker()
    }
    const onRateChange = () => {
      setPlaybackRate(video.playbackRate)
    }
    const onSeeking = () => {
      danmakuSeekingRef.current = true
      lastDanmakuTickMsRef.current = null
      danmakuRef.current?.clear()
    }
    const onSeeked = () => {
      danmakuSeekingRef.current = false
      // Bump seekEpoch only after currentTime is the post-seek value so overlays can replay
      setCurrentTime(video.currentTime)
      setSeekEpoch((n) => n + 1)
      const dm = danmakuRef.current
      if (dm?.list) {
        const list = dm.list as unknown as { lastTickRange: [number, number] }
        list.lastTickRange = [0, 0]
      }
      if (
        !danmakuHidden &&
        screenDanmakuVisible &&
        listReadyRef.current &&
        dm &&
        !video.paused
      ) {
        tickDanmaku(true)
      }
    }

    video.addEventListener("timeupdate", onTimeUpdate)
    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("ratechange", onRateChange)
    video.addEventListener("seeking", onSeeking)
    video.addEventListener("seeked", onSeeked)
    setPaused(video.paused)
    setCurrentTime(video.currentTime)
    setPlaybackRate(video.playbackRate)
    if (!video.paused) startDanmakuTicker()

    return () => {
      stopDanmakuTicker()
      video.removeEventListener("timeupdate", onTimeUpdate)
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("ratechange", onRateChange)
      video.removeEventListener("seeking", onSeeking)
      video.removeEventListener("seeked", onSeeked)
    }
  }, [danmakuHidden, playbackUrl, screenDanmakuVisible])

  const cycleFit = () => {
    setObjectFit((prev) => FIT_CYCLE[(FIT_CYCLE.indexOf(prev) + 1) % FIT_CYCLE.length])
  }

  const openNative = () => {
    window.open(playbackUrl, "_blank", "noopener,noreferrer")
  }

  const toggleStageFullscreen = async () => {
    const stage = stageRef.current
    if (!stage) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await stage.requestFullscreen()
      }
    } catch (err) {
      console.warn("Fullscreen failed:", err)
    }
  }

  const applySettings = () => {
    const parsedRates = parseRatesInput(ratesDraft)
    if (!parsedRates) {
      toast.error(t("previewPlayer.ratesInvalid"))
      return
    }
    const fs = parsePositiveNumber(frameDraft, { min: 1, max: 5000 })
    if (fs == null) {
      toast.error(t("previewPlayer.frameStepInvalid"))
      return
    }
    const so = parsePositiveNumber(seekDraft, { min: 0.5, max: 600 })
    if (so == null) {
      toast.error(t("previewPlayer.seekOffsetInvalid"))
      return
    }
    const opacity = Math.min(100, Math.max(0, Math.round(opacityDraft)))

    setRates(parsedRates)
    savePlaybackRates(parsedRates)
    setRatesDraft(parsedRates.join(", "))
    setFrameStepMs(fs)
    saveFrameStepMs(fs)
    setFrameDraft(String(fs))
    setSeekOffsetSec(so)
    saveSeekOffsetSec(so)
    setSeekDraft(String(so))
    setDanmakuOpacity(opacity)
    saveDanmakuOpacity(opacity)
    setOpacityDraft(opacity)
    setSettingsOpen(false)
    toast.success(t("previewPlayer.settingsApplied"))
  }

  const resetSettings = () => {
    setRates([...DEFAULT_PLAYBACK_RATES])
    setFrameStepMs(DEFAULT_FRAME_STEP_MS)
    setSeekOffsetSec(DEFAULT_SEEK_OFFSET_SEC)
    setDanmakuOpacity(DEFAULT_DANMAKU_OPACITY)
    setOverlayCorner(DEFAULT_OVERLAY_CORNER)
    setRatesDraft(DEFAULT_PLAYBACK_RATES.join(", "))
    setFrameDraft(String(DEFAULT_FRAME_STEP_MS))
    setSeekDraft(String(DEFAULT_SEEK_OFFSET_SEC))
    setOpacityDraft(DEFAULT_DANMAKU_OPACITY)
    savePlaybackRates(DEFAULT_PLAYBACK_RATES)
    saveFrameStepMs(DEFAULT_FRAME_STEP_MS)
    saveSeekOffsetSec(DEFAULT_SEEK_OFFSET_SEC)
    saveDanmakuOpacity(DEFAULT_DANMAKU_OPACITY)
    saveOverlayCorner(DEFAULT_OVERLAY_CORNER)
  }

  const fitLabel = t(`previewPlayer.fit.${objectFit}`)

  const statusHint =
    danmakuStatus === "xml" || danmakuStatus === "none"
      ? t("previewPlayer.danmakuXmlSkipped")
      : danmakuStatus === "loading"
        ? t("previewPlayer.danmakuLoading")
        : null

  const headerTitle = fileName || [meta?.name, meta?.title].filter(Boolean).join(" · ")
  const chatLayout =
    overlayLayout.mode === "letterbox" || overlayLayout.mode === "docked" ? overlayLayout : null

  return (
    <div className={cn("relative flex h-full min-h-0 w-full flex-col bg-black", className)}>
      <div className="pointer-events-none absolute top-2 left-3 right-12 z-30 flex max-w-[calc(100%-3.5rem)] flex-col gap-0.5">
        {headerTitle ? (
          <div className="truncate text-sm font-medium text-white drop-shadow-md">{headerTitle}</div>
        ) : null}
        {statusHint ? (
          <p className="text-[11px] leading-snug text-amber-200/80 drop-shadow-md">{statusHint}</p>
        ) : null}
      </div>

      <div ref={stageRef} className="bilirec-preview-stage relative min-h-0 flex-1 w-full overflow-hidden bg-black">
        <MediaController
          key={mediaLang}
          className="bilirec-preview-player absolute inset-0 h-full w-full"
          style={MEDIA_CHROME_VARS}
          lang={mediaLang}
        >
          <video
            ref={videoRef}
            slot="media"
            src={playbackUrl}
            playsInline
            preload="metadata"
            className="h-full w-full bg-black"
            style={{ objectFit }}
          />
          <MediaLoadingIndicator slot="centered-chrome" />
          <MediaPlaybackRateMenu
            className="bilirec-preview-rate-menu"
            hidden
            anchor="auto"
            rates={rates}
          />

          {/* Bottom chrome: dark gradient only — no solid gray bar.
              Unnamed default slot == bottom chrome in media-container. */}
          <div className="pointer-events-none relative z-20 flex w-full flex-col bg-linear-to-t from-black/85 via-black/45 to-transparent pt-10">
            <div className="pointer-events-auto flex w-full flex-col gap-0.5 px-2 pb-2 pt-1 sm:px-3 sm:pb-3">
              {/* VLC-style: progress alone on first row.
                  Isolate so media-time-range's shadow #range { z-index:1 } cannot escape. */}
              <MediaControlBar className="bilirec-preview-bar bilirec-preview-bar-progress relative z-0 isolate w-full">
                <MediaTimeRange className="w-full min-w-0 flex-1" />
              </MediaControlBar>

              {/* Controls below progress; higher stack than the isolated range */}
              <div className="relative z-[1] flex w-full flex-col gap-0.5">
              {/* Common controls */}
              <MediaControlBar className="bilirec-preview-bar flex w-full items-center gap-0.5">
                <div className="flex items-center">
                  <MediaPlayButton />
                  <MediaSeekBackwardButton seekOffset={seekOffsetSec} />
                  <MediaSeekForwardButton seekOffset={seekOffsetSec} />
                </div>

                <MediaTimeDisplay showDuration className="mx-1 tabular-nums text-[11px] sm:text-xs" />

                <div className="ml-auto flex items-center gap-0.5">
                  <div className="hidden items-center sm:flex">
                    <MediaMuteButton />
                    <MediaVolumeRange className="max-w-[5.5rem]" />
                  </div>
                  <div className="sm:hidden">
                    <MediaMuteButton />
                  </div>

                  <div className="bilirec-preview-rate-chip flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 hover:bg-white/12 sm:px-2.5">
                    <MediaPlaybackRateMenuButton className="bilirec-preview-rate-btn" />
                  </div>

                  <div className="flex items-center gap-1">
                    {chatLayout ? (
                      <MediaChromeButton
                        noTooltip
                        title={
                          screenDanmakuVisible
                            ? t("previewPlayer.hideScreenDanmaku")
                            : t("previewPlayer.showScreenDanmaku")
                        }
                        aria-pressed={screenDanmakuVisible}
                        onClick={() => {
                          const next = !screenDanmakuVisible
                          setScreenDanmakuVisible(next)
                          saveScreenDanmakuVisible(next)
                        }}
                      >
                        {screenDanmakuVisible ? (
                          <SubtitlesIcon className="size-5" weight="bold" />
                        ) : (
                          <SubtitlesSlashIcon className="size-5 opacity-70" weight="bold" />
                        )}
                      </MediaChromeButton>
                    ) : null}

                    <MediaChromeButton
                      noTooltip
                      title={danmakuHidden ? t("previewPlayer.showDanmaku") : t("previewPlayer.hideDanmaku")}
                      onClick={() => setDanmakuHidden((v) => !v)}
                    >
                      {danmakuHidden ? (
                        <ChatCircleSlashIcon className="size-5 opacity-70" weight="bold" />
                      ) : (
                        <ChatCircleTextIcon className="size-5" weight="bold" />
                      )}
                    </MediaChromeButton>
                  </div>

                  <TextChipButton
                    title={advancedOpen ? t("previewPlayer.hideAdvanced") : t("previewPlayer.showAdvanced")}
                    active={advancedOpen}
                    onClick={() => setAdvancedOpen((v) => !v)}
                  >
                    <span>{t("previewPlayer.advanced")}</span>
                    {advancedOpen ? (
                      <CaretDownIcon className="size-3.5 opacity-80" weight="bold" />
                    ) : (
                      <CaretUpIcon className="size-3.5 opacity-80" weight="bold" />
                    )}
                  </TextChipButton>

                  <MediaChromeButton
                    noTooltip
                    title={t("previewPlayer.fullscreen")}
                    onClick={() => void toggleStageFullscreen()}
                  >
                    <CornersOutIcon className="size-5" weight="bold" />
                  </MediaChromeButton>
                </div>
              </MediaControlBar>

              {/* Advanced row — text chips separated from icon-only clusters */}
              {advancedOpen ? (
                <MediaControlBar className="bilirec-preview-bar flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-1.5">
                  <div className="flex items-center gap-1">
                    <span className={cn(ADV_LABEL, "mr-0.5", chatLayout ? "inline" : "hidden sm:inline")}>
                      {t("previewPlayer.frameGroup")}
                    </span>
                    <MediaChromeButton
                      noTooltip
                      title={t("previewPlayer.frameBack")}
                      onClick={() => stepFrame(-1)}
                    >
                      <ArrowCounterClockwiseIcon className="size-4" weight="bold" />
                    </MediaChromeButton>
                    <MediaChromeButton
                      noTooltip
                      title={t("previewPlayer.frameForward")}
                      onClick={() => stepFrame(1)}
                    >
                      <ArrowClockwiseIcon className="size-4" weight="bold" />
                    </MediaChromeButton>
                  </div>

                  <div className="flex items-center gap-1.5 border-l border-white/10 pl-3">
                    <TextChipButton
                      title={t("previewPlayer.objectFit", { mode: objectFit })}
                      onClick={cycleFit}
                    >
                      <span className={ADV_LABEL}>{t("previewPlayer.fitLabel")}</span>
                      <span className="text-xs font-medium text-white/90">{fitLabel}</span>
                    </TextChipButton>
                  </div>

                  <div className="ml-auto flex items-center gap-1.5">
                    <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-8 items-center justify-center rounded-md text-white/90 hover:bg-white/12"
                          title={t("previewPlayer.settings")}
                          aria-label={t("previewPlayer.settings")}
                        >
                          <GearSixIcon className="size-[1.125rem]" weight="bold" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        container={stageRef.current}
                        side="top"
                        sideOffset={8}
                        align="end"
                        className="max-h-[calc(100dvh-1rem)] w-80 max-w-[calc(100vw-1rem)] space-y-3 overflow-y-auto border-white/15 bg-zinc-900 text-zinc-50 shadow-xl"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <div className="space-y-1.5">
                          <Label htmlFor="preview-rates" className="text-zinc-200">
                            {t("previewPlayer.ratesLabel")}
                          </Label>
                          <Input
                            id="preview-rates"
                            value={ratesDraft}
                            onChange={(e) => setRatesDraft(e.target.value)}
                            placeholder="0.25, 0.5, 1, 1.5, 2"
                            inputMode="decimal"
                            autoComplete="off"
                            spellCheck={false}
                            className="border-white/15 bg-zinc-950 text-zinc-50 placeholder:text-zinc-500"
                          />
                          <p className="text-xs text-zinc-400">{t("previewPlayer.ratesHint")}</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="preview-frame" className="text-zinc-200">
                            {t("previewPlayer.frameStepLabel")}
                          </Label>
                          <Input
                            id="preview-frame"
                            type="number"
                            min={1}
                            max={5000}
                            value={frameDraft}
                            onChange={(e) => setFrameDraft(e.target.value)}
                            className="border-white/15 bg-zinc-950 text-zinc-50"
                          />
                          <div className="flex flex-wrap gap-1">
                            {[24, 30, 60].map((fps) => (
                              <Button
                                key={fps}
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 border-white/20 bg-transparent text-xs text-zinc-200 hover:bg-white/10 hover:text-white"
                                onClick={() => setFrameDraft(String(Math.round(1000 / fps)))}
                              >
                                {fps}fps
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="preview-seek" className="text-zinc-200">
                            {t("previewPlayer.seekOffsetLabel")}
                          </Label>
                          <Input
                            id="preview-seek"
                            type="number"
                            min={0.5}
                            max={600}
                            step={0.5}
                            value={seekDraft}
                            onChange={(e) => setSeekDraft(e.target.value)}
                            className="border-white/15 bg-zinc-950 text-zinc-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="preview-opacity" className="text-zinc-200">
                              {t("previewPlayer.danmakuOpacityLabel")}
                            </Label>
                            <span className="tabular-nums text-xs text-zinc-400">{opacityDraft}%</span>
                          </div>
                          <Slider
                            id="preview-opacity"
                            min={0}
                            max={100}
                            step={1}
                            value={[opacityDraft]}
                            onValueChange={(v) => setOpacityDraft(v[0] ?? DEFAULT_DANMAKU_OPACITY)}
                            className="w-full"
                          />
                          <p className="text-xs text-zinc-400">{t("previewPlayer.danmakuOpacityHint")}</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-zinc-200">
                            {t("previewPlayer.overlayCornerLabel")}
                          </Label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {OVERLAY_CORNERS.map((corner) => (
                              <Button
                                key={corner}
                                type="button"
                                size="sm"
                                variant={overlayCorner === corner ? "default" : "outline"}
                                className="border-white/20 bg-transparent text-xs text-zinc-200 hover:bg-white/10 hover:text-white"
                                onClick={() => {
                                  setOverlayCorner(corner)
                                  saveOverlayCorner(corner)
                                }}
                              >
                                {t(`previewPlayer.${cornerLabelKey(corner)}`)}
                              </Button>
                            ))}
                          </div>
                          <p className="text-xs text-zinc-400">{t("previewPlayer.overlayCornerHint")}</p>
                        </div>
                        <div className="flex justify-between gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-zinc-300 hover:bg-white/10 hover:text-white"
                            onClick={resetSettings}
                          >
                            {t("previewPlayer.resetSettings")}
                          </Button>
                          <Button type="button" size="sm" onClick={applySettings}>
                            {t("previewPlayer.applySettings")}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <TextChipButton title={t("previewPlayer.nativePlayer")} onClick={openNative}>
                      <ArrowSquareOutIcon className="size-3.5 opacity-90" weight="bold" />
                      <span>{t("previewPlayer.nativePlayerShort")}</span>
                    </TextChipButton>
                  </div>
                </MediaControlBar>
              ) : null}
              </div>
            </div>
          </div>
        </MediaController>

        {/* Sized to the video picture box (not the whole stage / letterbox / chrome) */}
        <div
          ref={danmakuHostRef}
          className="bilirec-danmaku-host pointer-events-none absolute z-[18] overflow-hidden"
          aria-hidden
        />

        <div
          ref={overlayHostRef}
          className="pointer-events-none absolute z-19 overflow-hidden"
          aria-hidden={!chatLayout}
        >
          {chatLayout ? (
            <PreviewChatList
              items={chatItems}
              currentTime={currentTime}
              hidden={danmakuHidden}
              layout={chatLayout}
            />
          ) : (
            <EventOverlayLayer
              events={overlays}
              currentTime={currentTime}
              hidden={danmakuHidden}
              seekEpoch={seekEpoch}
              overlayCorner={overlayCorner}
              fullscreen={stageFullscreen}
            />
          )}
        </div>
      </div>
    </div>
  )
}

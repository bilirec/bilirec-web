import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
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
  CircleNotchIcon,
  GearSixIcon,
  SubtitlesIcon,
  SubtitlesSlashIcon,
} from "@phosphor-icons/react"
import { EventOverlayLayer, type OverlayLayout } from "@/components/playback/EventOverlayLayer"
import { PlaybackChatList } from "@/components/playback/PlaybackChatList"
import { PlaybackSettingsDialog } from "@/components/playback/PlaybackSettingsDialog"
import {
  fetchDanmakuForVideo,
  type DanmakuMeta,
  type OverlayEvent,
  type PlaybackChatItem,
} from "@/lib/danmaku"
import {
  type OverlayCorner,
  type PlaybackSettingsValue,
  type DanmakuArea,
  loadDanmakuFollowScreen,
  loadDanmakuOpacity,
  loadDanmakuSize,
  loadDanmakuSpeed,
  loadDanmakuArea,
  loadDanmakuPreventOverlap,
  loadFrameStepMs,
  loadOverlayCorner,
  loadPlaybackRates,
  loadSeekOffsetSec,
  loadScreenDanmakuVisible,
  saveDanmakuFollowScreen,
  saveDanmakuOpacity,
  saveDanmakuSize,
  saveDanmakuSpeed,
  saveDanmakuArea,
  saveDanmakuPreventOverlap,
  saveFrameStepMs,
  saveOverlayCorner,
  savePlaybackRates,
  saveSeekOffsetSec,
  saveScreenDanmakuVisible,
} from "@/lib/playback-settings"
import {
  DANMAKU_LOAD_CHUNK_SIZE,
  DANMAKU_TICK_INTERVAL_MS,
  DANMAKU_TICK_UNCERTAINTY_MS,
  danmakuLifeForRate,
  danmakuRangesForArea,
  resolveDanmakuFont,
  attachDanmakuOverlapControl,
} from "@/lib/playback-danmaku"
import {
  exitDocumentFullscreen,
  getScreenOrientation,
  requestElementFullscreen,
} from "@/lib/playback-fullscreen"
import {
  DEFAULT_VIDEO_OBJECT_POSITION,
  FIT_CYCLE,
  MEDIA_CHROME_VARS,
  PORTRAIT_LANDSCAPE_OBJECT_POSITION,
  PORTRAIT_LANDSCAPE_VIDEO_ALIGNMENT,
  getObjectFitContentBox,
  type ObjectFitMode,
} from "@/lib/playback-layout"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { DanmakuListItem } from "n-danmaku"
import { getCurrentLanguage } from "@/i18n"
import "media-chrome/dist/lang/zh-CN.js"
import "media-chrome/dist/lang/zh-TW.js"

export type { ObjectFitMode }

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
  className,
  children,
}: {
  title: string
  onClick: () => void
  active?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium tracking-wide text-white/90 [@media(pointer:fine)]:h-8",
        "hover:bg-white/12 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
        active && "bg-white/15 text-white",
        className
      )}
    >
      {children}
    </button>
  )
}

/** Shared muted label style for 跳幀 / 縮放 / 倍速 */
const ADV_LABEL = "text-xs font-medium text-white/55 shrink-0"

export function DanmakuVideoPlayer({
  playbackUrl,
  videoPath,
  fileName,
  className,
}: DanmakuVideoPlayerProps) {
  const { t } = useTranslation()
  // Keep media-chrome tooltips in sync with app i18n (zh-CN / zh-TW)
  const mediaLang = getCurrentLanguage()
  const stageRef = useRef<HTMLDivElement>(null)
  const danmakuHostRef = useRef<HTMLDivElement>(null)
  const overlayHostRef = useRef<HTMLDivElement>(null)
  const controlsHostRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const danmakuRef = useRef<NDanmaku | null>(null)
  const listReadyRef = useRef(false)
  const lastDanmakuTickMsRef = useRef<number | null>(null)
  const danmakuSeekingRef = useRef(false)
  const danmakuPreventOverlapRef = useRef(loadDanmakuPreventOverlap())
  const touchDeviceRef = useRef(
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  )
  const orientationLockedRef = useRef(false)

  const [objectFit, setObjectFit] = useState<ObjectFitMode>("contain")
  const [videoObjectPosition, setVideoObjectPosition] = useState<string>(
    DEFAULT_VIDEO_OBJECT_POSITION
  )
  // Keep effects off until the paired JSONL is loaded and contains events.
  const [danmakuHidden, setDanmakuHidden] = useState(true)
  const [screenDanmakuVisible, setScreenDanmakuVisible] = useState<boolean>(() =>
    loadScreenDanmakuVisible()
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [paused, setPaused] = useState(true)
  const [videoMetadataReady, setVideoMetadataReady] = useState(false)
  const [seekEpoch, setSeekEpoch] = useState(0)
  const [stageFullscreen, setStageFullscreen] = useState(false)
  const [appFullscreen, setAppFullscreen] = useState(false)
  const [orientationLocked, setOrientationLocked] = useState(false)
  const [viewportLandscape, setViewportLandscape] = useState(() =>
    typeof window !== "undefined" && window.innerWidth > window.innerHeight
  )
  const [mobileOverlayBottomInset, setMobileOverlayBottomInset] = useState(0)
  const [bullets, setBullets] = useState<DanmakuListItem[]>([])
  const [loadedDanmakuCount, setLoadedDanmakuCount] = useState<number | null>(null)
  const [overlays, setOverlays] = useState<OverlayEvent[]>([])
  const [chatItems, setChatItems] = useState<PlaybackChatItem[]>([])
  const [meta, setMeta] = useState<DanmakuMeta | undefined>()
  const [danmakuStatus, setDanmakuStatus] = useState<"loading" | "ready" | "none" | "xml">("loading")
  const [rates, setRates] = useState<number[]>(() => loadPlaybackRates())
  const [playbackRate, setPlaybackRate] = useState(1)
  const [frameStepMs, setFrameStepMs] = useState(() => loadFrameStepMs())
  const [seekOffsetSec, setSeekOffsetSec] = useState(() => loadSeekOffsetSec())
  const [danmakuOpacity, setDanmakuOpacity] = useState(() => loadDanmakuOpacity())
  const [danmakuFollowScreen, setDanmakuFollowScreen] = useState(() =>
    loadDanmakuFollowScreen()
  )
  const [danmakuSize, setDanmakuSize] = useState(() => loadDanmakuSize())
  const [danmakuSpeed, setDanmakuSpeed] = useState(() => loadDanmakuSpeed())
  const [danmakuArea, setDanmakuArea] = useState<DanmakuArea>(() => loadDanmakuArea())
  const [danmakuPreventOverlap, setDanmakuPreventOverlap] = useState(() =>
    loadDanmakuPreventOverlap()
  )
  const [overlayCorner, setOverlayCorner] = useState<OverlayCorner>(() => loadOverlayCorner())
  const [danmakuScale, setDanmakuScale] = useState(
    () => resolveDanmakuFont(0, loadDanmakuFollowScreen(), loadDanmakuSize()).scale
  )
  const [danmakuFontSize, setDanmakuFontSize] = useState<string | null>(
    () => resolveDanmakuFont(0, loadDanmakuFollowScreen(), loadDanmakuSize()).size
  )
  const [overlayLayout, setOverlayLayout] = useState<OverlayLayout>({ mode: "content" })
  const [settingsOpen, setSettingsOpen] = useState(false)

  danmakuPreventOverlapRef.current = danmakuPreventOverlap

  const settingsValue = useMemo<PlaybackSettingsValue>(
    () => ({
      rates,
      frameStepMs,
      seekOffsetSec,
      danmakuOpacity,
      danmakuFollowScreen,
      danmakuSize,
      danmakuSpeed,
      danmakuArea,
      danmakuPreventOverlap,
      overlayCorner,
    }),
    [
      rates,
      frameStepMs,
      seekOffsetSec,
      danmakuOpacity,
      danmakuFollowScreen,
      danmakuSize,
      danmakuSpeed,
      danmakuArea,
      danmakuPreventOverlap,
      overlayCorner,
    ]
  )

  const frameStepSec = frameStepMs / 1000

  const unlockScreenOrientation = useCallback(() => {
    if (!orientationLockedRef.current) return
    orientationLockedRef.current = false
    setOrientationLocked(false)
    try {
      getScreenOrientation()?.unlock?.()
    } catch {
      // Ignore browsers that reject unlocking after fullscreen has ended.
    }
  }, [])

  useEffect(() => {
    const onFs = () => {
      const stage = stageRef.current
      const isStageFullscreen = !!stage && document.fullscreenElement === stage
      setStageFullscreen(isStageFullscreen)
      // System / gesture exit from native fullscreen should release orientation lock.
      if (!isStageFullscreen) unlockScreenOrientation()
    }
    onFs()
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [unlockScreenOrientation])

  useEffect(() => {
    const updateViewportOrientation = () => {
      const width = window.visualViewport?.width ?? window.innerWidth
      const height = window.visualViewport?.height ?? window.innerHeight
      setViewportLandscape((prev) => {
        const next = width > height
        return prev === next ? prev : next
      })
    }
    updateViewportOrientation()
    window.addEventListener("resize", updateViewportOrientation)
    window.addEventListener("orientationchange", updateViewportOrientation)
    window.visualViewport?.addEventListener("resize", updateViewportOrientation)
    return () => {
      window.removeEventListener("resize", updateViewportOrientation)
      window.removeEventListener("orientationchange", updateViewportOrientation)
      window.visualViewport?.removeEventListener("resize", updateViewportOrientation)
    }
  }, [])

  useEffect(() => {
    return () => unlockScreenOrientation()
  }, [unlockScreenOrientation])

  useEffect(() => {
    const ac = new AbortController()
    setDanmakuStatus("loading")
    setDanmakuHidden(true)
    setBullets([])
    setLoadedDanmakuCount(null)
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
      setDanmakuHidden(res.bullets.length === 0 && res.overlays.length === 0)
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
    attachDanmakuOverlapControl(instance, () => danmakuPreventOverlapRef.current)
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
      const stageW = stage.clientWidth
      const stageH = stage.clientHeight
      const box = getObjectFitContentBox(
        video,
        objectFit,
        PORTRAIT_LANDSCAPE_VIDEO_ALIGNMENT
      )
      const nextObjectPosition =
        objectFit === "contain" &&
        stageH > stageW &&
        video.videoWidth > video.videoHeight
          ? PORTRAIT_LANDSCAPE_OBJECT_POSITION
          : DEFAULT_VIDEO_OBJECT_POSITION
      setVideoObjectPosition((prev) =>
        prev === nextObjectPosition ? prev : nextObjectPosition
      )
      const top = box.top
      const left = box.left
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

      const nextFont = resolveDanmakuFont(
        box.width,
        danmakuFollowScreen,
        danmakuSize,
        box.height
      )
      setDanmakuScale((prev) => (prev === nextFont.scale ? prev : nextFont.scale))
      setDanmakuFontSize((prev) => (prev === nextFont.size ? prev : nextFont.size))

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
  }, [
    appFullscreen,
    danmakuFollowScreen,
    danmakuSize,
    mediaLang,
    objectFit,
    orientationLocked,
    playbackUrl,
    viewportLandscape,
  ])

  useEffect(() => {
    const dm = danmakuRef.current
    if (!dm || danmakuStatus !== "ready") return
    let cancelled = false

    const loadDanmaku = async () => {
      listReadyRef.current = false
      try {
        dm.list.del("vod")
      } catch {
        /* ignore */
      }
      dm.list.new("vod")
      dm.list.use("vod")
      dm.list.uncertainty(DANMAKU_TICK_UNCERTAINTY_MS)
      dm.ranges(danmakuRangesForArea(danmakuArea))

      // n-danmaku's addDm inserts each item by scanning its timeline. Loading
      // in batches keeps each synchronous section short enough for the browser
      // to paint between batches.
      for (let start = 0; start < bullets.length; start += DANMAKU_LOAD_CHUNK_SIZE) {
        if (cancelled) return
        const chunk = bullets
          .slice(start, start + DANMAKU_LOAD_CHUNK_SIZE)
          .map((b) => ({
            ...b,
            styles: {
              ...b.styles,
              scale: danmakuScale,
              size: danmakuFontSize,
              opacity: danmakuOpacity,
              life: danmakuLifeForRate(playbackRate, b.styles?.type, danmakuSpeed),
              pointer_events: false,
              custom_css: b.styles?.custom_css ? { ...b.styles.custom_css } : undefined,
            },
          }))
        dm.list.load(chunk)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }

      if (cancelled) return
      listReadyRef.current = true
      setLoadedDanmakuCount(bullets.length)
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
    }

    void loadDanmaku()
    return () => {
      cancelled = true
      listReadyRef.current = false
    }
  }, [
    bullets,
    danmakuStatus,
    danmakuFollowScreen,
    danmakuOpacity,
    danmakuScale,
    danmakuFontSize,
    danmakuSpeed,
    danmakuArea,
    playbackRate,
  ])

  const touchDevice = touchDeviceRef.current
  const landscapeVideo =
    (videoRef.current?.videoWidth ?? 0) > (videoRef.current?.videoHeight ?? 0)
  const mobileLandscapeLayout =
    touchDevice && landscapeVideo && (orientationLocked || viewportLandscape)
  const chatLayout =
    !mobileLandscapeLayout &&
    (overlayLayout.mode === "letterbox" || overlayLayout.mode === "docked")
      ? overlayLayout
      : null
  // Flying danmaku is optional only while the portrait chat list is on screen.
  // Landscape desktop/mobile has no chat panel, so ignore that hide preference.
  const screenDanmakuActive = chatLayout == null || screenDanmakuVisible

  useEffect(() => {
    const layer = danmakuHostRef.current?.querySelector(".N-dmLayer") as HTMLElement | null
    if (!layer) return
    const visible = !danmakuHidden && screenDanmakuActive
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
  }, [danmakuHidden, screenDanmakuActive])

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
        screenDanmakuActive &&
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
    const onLoadStart = () => {
      setVideoMetadataReady(false)
    }
    const onLoadedMetadata = () => {
      setVideoMetadataReady(true)
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
        screenDanmakuActive &&
        listReadyRef.current &&
        dm &&
        !video.paused
      ) {
        tickDanmaku(true)
      }
    }

    video.addEventListener("timeupdate", onTimeUpdate)
    video.addEventListener("loadstart", onLoadStart)
    video.addEventListener("loadedmetadata", onLoadedMetadata)
    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)
    video.addEventListener("ratechange", onRateChange)
    video.addEventListener("seeking", onSeeking)
    video.addEventListener("seeked", onSeeked)
    setPaused(video.paused)
    setCurrentTime(video.currentTime)
    setPlaybackRate(video.playbackRate)
    setVideoMetadataReady(video.readyState >= HTMLMediaElement.HAVE_METADATA)
    if (!video.paused) startDanmakuTicker()

    return () => {
      stopDanmakuTicker()
      video.removeEventListener("timeupdate", onTimeUpdate)
      video.removeEventListener("loadstart", onLoadStart)
      video.removeEventListener("loadedmetadata", onLoadedMetadata)
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("ratechange", onRateChange)
      video.removeEventListener("seeking", onSeeking)
      video.removeEventListener("seeked", onSeeked)
    }
  }, [danmakuHidden, playbackUrl, screenDanmakuActive])

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

  const toggleAppFullscreen = async () => {
    if (appFullscreen || document.fullscreenElement) {
      unlockScreenOrientation()
      await exitDocumentFullscreen()
      setAppFullscreen(false)
      return
    }

    const video = videoRef.current
    const stage = stageRef.current
    if (!video || !stage) return

    const enteredFullscreen = await requestElementFullscreen(stage)
    if (!enteredFullscreen) {
      // Fullscreen API unavailable: CSS-only immersive fallback (lock will not work).
      setAppFullscreen(true)
      toast.info(t("playbackPlayer.orientationLockFailed"))
      return
    }

    setAppFullscreen(true)

    const landscapeVideo =
      video.videoWidth > 0 && video.videoHeight > 0 && video.videoWidth > video.videoHeight
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth
    const portraitViewport = viewportHeight > viewportWidth

    if (!landscapeVideo || !portraitViewport) return

    const orientation = getScreenOrientation()
    if (!orientation?.lock) {
      toast.info(t("playbackPlayer.orientationLockFailed"))
      return
    }

    try {
      await orientation.lock("landscape")
      orientationLockedRef.current = true
      setOrientationLocked(true)
    } catch (lockError) {
      console.warn("Screen orientation lock rejected; keeping fullscreen:", lockError)
      toast.info(t("playbackPlayer.orientationLockFailed"))
    }
  }

  const toggleFullscreen = async () => {
    if (touchDeviceRef.current) {
      await toggleAppFullscreen()
      return
    }
    await toggleStageFullscreen()
  }

  const handleApplySettings = useCallback((next: PlaybackSettingsValue) => {
    setRates(next.rates)
    savePlaybackRates(next.rates)
    setFrameStepMs(next.frameStepMs)
    saveFrameStepMs(next.frameStepMs)
    setSeekOffsetSec(next.seekOffsetSec)
    saveSeekOffsetSec(next.seekOffsetSec)
    setDanmakuOpacity(next.danmakuOpacity)
    saveDanmakuOpacity(next.danmakuOpacity)
    setDanmakuFollowScreen(next.danmakuFollowScreen)
    saveDanmakuFollowScreen(next.danmakuFollowScreen)
    setDanmakuSize(next.danmakuSize)
    saveDanmakuSize(next.danmakuSize)
    setDanmakuSpeed(next.danmakuSpeed)
    saveDanmakuSpeed(next.danmakuSpeed)
    setDanmakuArea(next.danmakuArea)
    saveDanmakuArea(next.danmakuArea)
    setDanmakuPreventOverlap(next.danmakuPreventOverlap)
    saveDanmakuPreventOverlap(next.danmakuPreventOverlap)
    danmakuPreventOverlapRef.current = next.danmakuPreventOverlap
    setOverlayCorner(next.overlayCorner)
    saveOverlayCorner(next.overlayCorner)
  }, [])

  const fitLabel = t(`playbackPlayer.fit.${objectFit}`)

  const statusHint =
    danmakuStatus === "xml" || danmakuStatus === "none"
      ? t("playbackPlayer.danmakuXmlSkipped")
      : danmakuStatus === "loading"
        ? t("playbackPlayer.danmakuLoading")
        : null

  const headerTitle = fileName || [meta?.name, meta?.title].filter(Boolean).join(" · ")
  const loadedDanmakuHint =
    loadedDanmakuCount != null && loadedDanmakuCount > 0
      ? t("playbackPlayer.danmakuLoaded", { count: loadedDanmakuCount })
      : null
  const mobileAppFullscreen = touchDevice && appFullscreen && !stageFullscreen
  // Settings Dialog portals to document.body and is invisible under native/CSS immersive fullscreen.
  const immersiveFullscreen = stageFullscreen || mobileAppFullscreen
  const landscapeControlClass = mobileLandscapeLayout
    ? "w-auto min-w-0 flex-none"
    : "w-full min-w-0 flex-1 sm:w-auto sm:flex-none"
  const mobileStageClass = mobileAppFullscreen
    ? "fixed inset-0 z-9999 flex-none"
    : undefined

  useEffect(() => {
    if (!immersiveFullscreen) return
    setSettingsOpen(false)
  }, [immersiveFullscreen])

  useEffect(() => {
    let frame = 0
    let nestedFrame = 0
    if (!mobileLandscapeLayout) {
      setMobileOverlayBottomInset((prev) => (prev === 0 ? prev : 0))
      return () => undefined
    }

    // Measure after layout settles. Exclude the controls gradient padding so
    // bottom-corner overlays sit in the fade zone (near the real chrome), and
    // cap by picture height so short landscape phones do not push them mid-screen.
    frame = requestAnimationFrame(() => {
      nestedFrame = requestAnimationFrame(() => {
        const host = overlayHostRef.current
        const controls = controlsHostRef.current
        if (!host || !controls) return
        const hostRect = host.getBoundingClientRect()
        const controlsRect = controls.getBoundingClientRect()
        const padTop = Number.parseFloat(getComputedStyle(controls).paddingTop) || 0
        const raw = Math.round(hostRect.bottom - controlsRect.top - padTop)
        const maxByScreen = Math.max(40, Math.round(hostRect.height * 0.22))
        const inset = Math.min(Math.max(0, raw + 6), maxByScreen)
        setMobileOverlayBottomInset((prev) => (prev === inset ? prev : inset))
      })
    })
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(nestedFrame)
    }
  }, [mobileLandscapeLayout, advancedOpen])

  return (
    <div className={cn("relative flex h-full min-h-0 w-full flex-col bg-black", className)}>
      {headerTitle || statusHint || loadedDanmakuHint ? (
        <div
          className="pointer-events-none absolute top-2 left-3 right-12 z-30 flex max-w-[calc(100%-3.5rem)] flex-col gap-0.5 sm:top-0 sm:right-0 sm:left-0 sm:max-w-none sm:bg-linear-to-b sm:from-black/60 sm:via-black/25 sm:to-transparent sm:px-3 sm:pt-2 sm:pb-4"
          aria-hidden
        >
          <div className="max-w-full sm:max-w-[calc(100%-3.5rem)]">
            {headerTitle ? (
              <div className="truncate text-sm font-medium text-white drop-shadow-md">{headerTitle}</div>
            ) : null}
            {loadedDanmakuHint ? (
              <p className="text-[11px] leading-snug text-yellow-300 drop-shadow-md">{loadedDanmakuHint}</p>
            ) : null}
            {statusHint ? (
              <p className="text-[11px] leading-snug text-amber-200/80 drop-shadow-md">{statusHint}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        ref={stageRef}
        className={cn(
          "bilirec-playback-stage relative min-h-0 flex-1 w-full overflow-hidden bg-black",
          mobileStageClass
        )}
      >
          <MediaController
            key={mediaLang}
            className="bilirec-playback-player absolute inset-0 h-full w-full"
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
            style={{ objectFit, objectPosition: videoObjectPosition }}
          />
          <MediaLoadingIndicator slot="centered-chrome" />
          <MediaPlaybackRateMenu
            className="bilirec-playback-rate-menu"
            hidden
            anchor="auto"
            rates={rates}
          />

          {/* Bottom chrome: dark gradient only — no solid gray bar.
              Unnamed default slot == bottom chrome in media-container. */}
          <div
            ref={controlsHostRef}
            className="pointer-events-none relative z-20 flex w-full flex-col bg-linear-to-t from-black/85 via-black/45 to-transparent pt-10"
          >
            <div className="pointer-events-auto flex w-full flex-col gap-0.5 px-2 pb-2 pt-1 sm:px-3 sm:pb-3">
              {/* VLC-style: progress alone on first row.
                  Isolate so media-time-range's shadow #range { z-index:1 } cannot escape. */}
              <MediaControlBar className="bilirec-playback-bar bilirec-playback-bar-progress relative z-0 isolate w-full">
                <MediaTimeRange className="w-full min-w-0 flex-1" />
              </MediaControlBar>

              {/* Controls below progress; higher stack than the isolated range */}
              <div className="relative z-1 flex w-full flex-col gap-0.5">
              {/* Common controls: two intentional rows on narrow screens. */}
              <MediaControlBar
                className={cn(
                  "bilirec-playback-bar flex w-full gap-0.5",
                  mobileLandscapeLayout ? "flex-row items-center" : "flex-col sm:flex-row sm:items-center"
                )}
              >
                {/* Transport and time */}
                <div
                  className={cn(
                    "flex items-center",
                    mobileLandscapeLayout
                      ? "w-auto justify-start gap-0"
                      : "w-full justify-between gap-0.5 sm:w-auto sm:justify-start"
                  )}
                >
                  <div className={cn("flex items-center", mobileLandscapeLayout ? "gap-0" : "gap-1 sm:gap-0")}>
                    <MediaPlayButton />
                    <MediaSeekBackwardButton seekOffset={seekOffsetSec} />
                    <MediaSeekForwardButton seekOffset={seekOffsetSec} />
                  </div>

                  <MediaTimeDisplay
                    showDuration
                    className={cn(
                      "shrink-0 tabular-nums text-[11px]",
                      mobileLandscapeLayout ? "mx-1 text-xs" : "sm:mx-1 sm:text-xs"
                    )}
                  />
                </div>

                {/* Secondary controls */}
                <div
                  className={cn(
                    "flex items-center",
                    mobileLandscapeLayout
                      ? "ml-auto w-auto gap-0.5"
                      : "w-full gap-1 sm:ml-auto sm:w-auto sm:gap-0.5"
                  )}
                >
                  <div className={cn("items-center", mobileLandscapeLayout ? "flex" : "hidden sm:flex")}>
                    <MediaMuteButton />
                    <MediaVolumeRange className="max-w-[5.5rem]" />
                  </div>
                  <div
                    className={cn(
                      "min-w-0 items-center justify-center",
                      mobileLandscapeLayout ? "hidden" : "flex flex-1 sm:hidden"
                    )}
                  >
                    <MediaMuteButton />
                  </div>

                  <div
                    className={cn(
                      "bilirec-playback-rate-chip flex min-w-0 items-center gap-1 rounded-md hover:bg-white/12",
                      mobileLandscapeLayout
                        ? "flex-none px-2.5"
                        : "flex-1 px-1.5 sm:h-8 sm:flex-none sm:px-2.5"
                    )}
                  >
                    <MediaPlaybackRateMenuButton
                      className={cn(
                        "bilirec-playback-rate-btn justify-center",
                        mobileLandscapeLayout ? "w-auto" : "w-full sm:w-auto"
                      )}
                    />
                  </div>

                  <div
                    className={
                      mobileLandscapeLayout ? "flex items-center gap-1" : "contents sm:flex sm:items-center sm:gap-1"
                    }
                  >
                    {chatLayout ? (
                      <MediaChromeButton
                        className={cn("bilirec-playback-touch", landscapeControlClass)}
                        noTooltip
                        title={
                          screenDanmakuVisible
                            ? t("playbackPlayer.hideScreenDanmaku")
                            : t("playbackPlayer.showScreenDanmaku")
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
                      className={cn("bilirec-playback-touch", landscapeControlClass)}
                      noTooltip
                      title={danmakuHidden ? t("playbackPlayer.showDanmaku") : t("playbackPlayer.hideDanmaku")}
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
                    title={advancedOpen ? t("playbackPlayer.hideAdvanced") : t("playbackPlayer.showAdvanced")}
                    active={advancedOpen}
                    className={cn(landscapeControlClass, "justify-center")}
                    onClick={() => setAdvancedOpen((v) => !v)}
                  >
                    <span>{t("playbackPlayer.advanced")}</span>
                    {advancedOpen ? (
                      <CaretDownIcon className="size-3.5 opacity-80" weight="bold" />
                    ) : (
                      <CaretUpIcon className="size-3.5 opacity-80" weight="bold" />
                    )}
                  </TextChipButton>

                  <MediaChromeButton
                    className={cn("bilirec-playback-touch", landscapeControlClass)}
                    noTooltip
                    title={t("playbackPlayer.fullscreen")}
                    onClick={() => void toggleFullscreen()}
                  >
                    <CornersOutIcon className="size-5" weight="bold" />
                  </MediaChromeButton>
                </div>
              </MediaControlBar>

              {/* Advanced row — text chips separated from icon-only clusters */}
              {advancedOpen ? (
                <MediaControlBar className="bilirec-playback-bar flex w-full items-center gap-x-3 border-t border-white/10 pt-1.5 max-[349px]:gap-x-1.5">
                  <div className="flex min-w-0 items-center gap-1">
                    <span
                      className={cn(
                        ADV_LABEL,
                        "mr-0.5 max-[349px]:hidden",
                        chatLayout ? "inline" : "hidden sm:inline"
                      )}
                    >
                      {t("playbackPlayer.frameGroup")}
                    </span>
                    <MediaChromeButton
                      className="bilirec-playback-touch"
                      noTooltip
                      title={t("playbackPlayer.frameBack")}
                      onClick={() => stepFrame(-1)}
                    >
                      <ArrowCounterClockwiseIcon className="size-5 sm:size-4" weight="bold" />
                    </MediaChromeButton>
                    <MediaChromeButton
                      className="bilirec-playback-touch"
                      noTooltip
                      title={t("playbackPlayer.frameForward")}
                      onClick={() => stepFrame(1)}
                    >
                      <ArrowClockwiseIcon className="size-5 sm:size-4" weight="bold" />
                    </MediaChromeButton>
                  </div>

                  <div className="flex min-w-0 shrink items-center gap-1.5 border-l border-white/10 pl-3 max-[349px]:pl-2">
                    <TextChipButton
                      title={t("playbackPlayer.objectFit", { mode: objectFit })}
                      onClick={cycleFit}
                      className="max-[349px]:px-1.5"
                    >
                      <span className={cn(ADV_LABEL, "max-[349px]:hidden")}>
                        {t("playbackPlayer.fitLabel")}
                      </span>
                      <span className="text-xs font-medium text-white/90">{fitLabel}</span>
                    </TextChipButton>
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-1.5 max-[349px]:gap-1">
                    {!immersiveFullscreen ? (
                      <>
                        <button
                          type="button"
                          className="inline-flex size-10 items-center justify-center rounded-md text-white/90 hover:bg-white/12 sm:size-8"
                          title={t("playbackPlayer.settings")}
                          aria-label={t("playbackPlayer.settings")}
                          onClick={() => setSettingsOpen(true)}
                        >
                          <GearSixIcon className="size-5 sm:size-[1.125rem]" weight="bold" />
                        </button>
                        <PlaybackSettingsDialog
                          open={settingsOpen}
                          onOpenChange={setSettingsOpen}
                          value={settingsValue}
                          onApply={handleApplySettings}
                        />
                      </>
                    ) : null}

                    <TextChipButton title={t("playbackPlayer.nativePlayer")} onClick={openNative}>
                      <ArrowSquareOutIcon className="size-4 opacity-90 sm:size-3.5" weight="bold" />
                      <span className="max-[349px]:hidden">{t("playbackPlayer.nativePlayerShort")}</span>
                    </TextChipButton>
                  </div>
                </MediaControlBar>
              ) : null}
              </div>
            </div>
          </div>
        </MediaController>

        {!videoMetadataReady || danmakuStatus === "loading" ? (
          <div
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/20"
            role="status"
            aria-live="polite"
            aria-label={t("playbackPlayer.videoLoading")}
          >
            <CircleNotchIcon className="size-8 animate-spin text-white/90" weight="bold" aria-hidden />
          </div>
        ) : null}

        {/* Sized to the video picture box (not the whole stage / letterbox / chrome) */}
        <div
          ref={danmakuHostRef}
          className="bilirec-danmaku-host pointer-events-none absolute z-18 overflow-hidden"
          aria-hidden
        />

        <div
          ref={overlayHostRef}
          className="pointer-events-none absolute z-19 overflow-hidden"
          aria-hidden={!chatLayout}
        >
          {chatLayout ? (
            <PlaybackChatList
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
              overlayMode={
                touchDevice
                  ? mobileLandscapeLayout
                    ? "mobile"
                    : "none"
                  : stageFullscreen
                    ? "desktop"
                    : "none"
              }
              mobileBottomInset={mobileOverlayBottomInset}
            />
          )}
        </div>
      </div>
    </div>
  )
}

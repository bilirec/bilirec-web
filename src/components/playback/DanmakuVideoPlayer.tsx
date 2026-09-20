import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
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
  MusicNoteIcon,
  SubtitlesIcon,
  SubtitlesSlashIcon,
} from "@phosphor-icons/react"
import { EventOverlayLayer, type OverlayLayout } from "@/components/playback/EventOverlayLayer"
import { PlaybackChatList } from "@/components/playback/PlaybackChatList"
import { PlaybackSettingsDialog } from "@/components/playback/PlaybackSettingsDialog"
import { Progress } from "@/components/ui/progress"
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
  DANMAKU_TICK_INTERVAL_MS,
  DANMAKU_TICK_UNCERTAINTY_MS,
  injectDanmakuBullets,
  prepareDanmakuVodList,
  styleDanmakuItems,
  type DanmakuInjectStyleOptions,
  resolveDanmakuFont,
  attachDanmakuOverlapControl,
} from "@/lib/playback-danmaku"
import {
  exitDocumentFullscreen,
  getScreenOrientation,
  requestElementFullscreen,
  shouldLockLandscapeInPortrait,
  tryLockScreenLandscape,
} from "@/lib/playback-fullscreen"
import {
  buildAudioMediaSessionArtwork,
  buildCoverMediaSessionArtwork,
} from "@/lib/media-session-artwork"
import { apiClient } from "@/lib/api"
import {
  DEFAULT_VIDEO_OBJECT_POSITION,
  FIT_CYCLE,
  MEDIA_CHROME_VARS,
  PORTRAIT_LANDSCAPE_OBJECT_POSITION,
  PORTRAIT_LANDSCAPE_VIDEO_ALIGNMENT,
  getObjectFitContentBox,
  measureEventOverlayBottomInset,
  WINDOWED_EVENT_OVERLAY_MAX_WIDTH_PX,
  type ObjectFitMode,
} from "@/lib/playback-layout"
import {
  DANMAKU_LOAD_TIMEOUT_MS,
  getDanmakuStageProgress,
  hasDanmakuLoadTimedOut,
  isDanmakuPipelineBusy,
  shouldBlockPlayback,
  type DanmakuPipelineStatus,
} from "@/lib/playback-loading"
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

const PROGRESS_THROTTLE_MS = 100

function buildInjectStyleKey(
  opts: DanmakuInjectStyleOptions,
  area: DanmakuArea
): string {
  return JSON.stringify({
    danmakuScale: opts.danmakuScale,
    danmakuFontSize: opts.danmakuFontSize,
    danmakuOpacity: opts.danmakuOpacity,
    danmakuSpeed: opts.danmakuSpeed,
    playbackRate: opts.playbackRate,
    danmakuArea: area,
  })
}

export function DanmakuVideoPlayer({
  playbackUrl,
  videoPath,
  fileName,
  className,
}: DanmakuVideoPlayerProps) {
  const { t } = useTranslation()
  const audioOnlyFileByName = fileName.toLowerCase().endsWith(".m4a")
  // Keep media-chrome tooltips in sync with app i18n (zh-CN / zh-TW)
  const mediaLang = getCurrentLanguage()
  const stageRef = useRef<HTMLDivElement>(null)
  const audioPictureRef = useRef<HTMLDivElement>(null)
  const danmakuHostRef = useRef<HTMLDivElement>(null)
  const overlayHostRef = useRef<HTMLDivElement>(null)
  const controlsHostRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const danmakuRef = useRef<NDanmaku | null>(null)
  const bulletsRef = useRef<DanmakuListItem[]>([])
  const appliedInjectKeyRef = useRef<string | null>(null)
  const danmakuLoadGenerationRef = useRef(0)
  const injectPumpRafRef = useRef(0)
  const bulletsLoadedCountRef = useRef(0)
  const expectedBulletCountRef = useRef(0)
  const vodListPreparedRef = useRef(false)
  const loadProgressThrottleRef = useRef(0)
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
  const [audioOnlyPlayback, setAudioOnlyPlayback] = useState(audioOnlyFileByName)
  const [danmakuLoadTimedOut, setDanmakuLoadTimedOut] = useState(false)
  const [loadIndicatorDocked, setLoadIndicatorDocked] = useState(false)
  const [seekEpoch, setSeekEpoch] = useState(0)
  const [stageFullscreen, setStageFullscreen] = useState(false)
  const [appFullscreen, setAppFullscreen] = useState(false)
  const [orientationLocked, setOrientationLocked] = useState(false)
  const [viewportLandscape, setViewportLandscape] = useState(() =>
    typeof window !== "undefined" && window.innerWidth > window.innerHeight
  )
  const [overlayChromeBottomInset, setOverlayChromeBottomInset] = useState(0)
  const [loadedDanmakuCount, setLoadedDanmakuCount] = useState<number | null>(null)
  const [loadProgressPercent, setLoadProgressPercent] = useState<number | null>(null)
  const [overlays, setOverlays] = useState<OverlayEvent[]>([])
  const [chatItems, setChatItems] = useState<PlaybackChatItem[]>([])
  const [meta, setMeta] = useState<DanmakuMeta | undefined>()
  const [danmakuStatus, setDanmakuStatus] = useState<DanmakuPipelineStatus>("fetching")
  const [danmakuSidecarPresent, setDanmakuSidecarPresent] = useState(false)
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
  const [overlayLayout, setOverlayLayout] = useState<OverlayLayout>({
    mode: "content",
    bottomBar: 0,
  })
  const [settingsOpen, setSettingsOpen] = useState(false)

  const showAudioOnlyPlayback = audioOnlyFileByName || audioOnlyPlayback

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

  const getInjectStyleOptions = useCallback(
    (): DanmakuInjectStyleOptions => ({
      danmakuScale,
      danmakuFontSize,
      danmakuOpacity,
      danmakuSpeed,
      playbackRate,
    }),
    [danmakuScale, danmakuFontSize, danmakuOpacity, danmakuSpeed, playbackRate]
  )

  const injectStyleRef = useRef(getInjectStyleOptions())
  injectStyleRef.current = getInjectStyleOptions()
  const danmakuAreaRef = useRef(danmakuArea)
  danmakuAreaRef.current = danmakuArea

  const setLoadProgressThrottled = useCallback((percent: number) => {
    const now = Date.now()
    const clamped = Math.min(100, Math.max(0, Math.round(percent)))
    if (
      now - loadProgressThrottleRef.current < PROGRESS_THROTTLE_MS &&
      clamped < 100
    ) {
      return
    }
    loadProgressThrottleRef.current = now
    setLoadProgressPercent(clamped)
  }, [])

  const activateDanmakuAfterInject = useCallback(() => {
    const dm = danmakuRef.current
    if (!dm) return
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
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const generation = ++danmakuLoadGenerationRef.current

    setDanmakuStatus("fetching")
    setDanmakuSidecarPresent(false)
    setDanmakuLoadTimedOut(false)
    setLoadIndicatorDocked(false)
    setLoadProgressPercent(null)
    loadProgressThrottleRef.current = 0
    setDanmakuHidden(true)
    bulletsRef.current = []
    appliedInjectKeyRef.current = null
    bulletsLoadedCountRef.current = 0
    expectedBulletCountRef.current = 0
    vodListPreparedRef.current = false
    listReadyRef.current = false
    setLoadedDanmakuCount(null)
    setOverlays([])
    setChatItems([])
    setMeta(undefined)

    const chunkQueue: DanmakuListItem[][] = []
    let parseDone = false
    let pendingJsonl: Extract<
      Awaited<ReturnType<typeof fetchDanmakuForVideo>>,
      { kind: "jsonl" }
    > | null = null

    const stopInjectPump = () => {
      if (injectPumpRafRef.current !== 0) {
        cancelAnimationFrame(injectPumpRafRef.current)
        injectPumpRafRef.current = 0
      }
    }

    const reportInjectProgress = () => {
      const total = expectedBulletCountRef.current
      if (total <= 0) return
      const loaded = bulletsLoadedCountRef.current
      setDanmakuStatus("injecting")
      setLoadProgressThrottled(getDanmakuStageProgress(loaded / total))
    }

    const loadOneChunkIntoEngine = (chunk: DanmakuListItem[]) => {
      const dm = danmakuRef.current
      if (!dm || chunk.length === 0) return false
      if (!vodListPreparedRef.current) {
        prepareDanmakuVodList(dm, danmakuAreaRef.current)
        vodListPreparedRef.current = true
        appliedInjectKeyRef.current = buildInjectStyleKey(
          injectStyleRef.current,
          danmakuAreaRef.current
        )
      }
      dm.list.load(styleDanmakuItems(chunk, injectStyleRef.current))
      bulletsLoadedCountRef.current += chunk.length
      return true
    }

    const tryFinalize = async () => {
      if (!parseDone || chunkQueue.length > 0) return
      if (generation !== danmakuLoadGenerationRef.current || !pendingJsonl) return

      const res = pendingJsonl
      const dm = danmakuRef.current

      if (dm && res.bulletCount === 0 && !vodListPreparedRef.current) {
        prepareDanmakuVodList(dm, danmakuAreaRef.current)
        vodListPreparedRef.current = true
        appliedInjectKeyRef.current = buildInjectStyleKey(
          injectStyleRef.current,
          danmakuAreaRef.current
        )
      }

      const currentKey = buildInjectStyleKey(injectStyleRef.current, danmakuAreaRef.current)
      if (
        dm &&
        bulletsRef.current.length > 0 &&
        appliedInjectKeyRef.current !== null &&
        appliedInjectKeyRef.current !== currentKey
      ) {
        listReadyRef.current = false
        dm.clear()
        vodListPreparedRef.current = false
        prepareDanmakuVodList(dm, danmakuAreaRef.current)
        vodListPreparedRef.current = true
        bulletsLoadedCountRef.current = 0
        await injectDanmakuBullets(dm, bulletsRef.current, injectStyleRef.current, {
          isCancelled: () => generation !== danmakuLoadGenerationRef.current,
        })
        if (generation !== danmakuLoadGenerationRef.current) return
        bulletsLoadedCountRef.current = bulletsRef.current.length
        appliedInjectKeyRef.current = currentKey
      }

      if (generation !== danmakuLoadGenerationRef.current) return
      listReadyRef.current = true
      setLoadedDanmakuCount(res.bulletCount)
      setDanmakuHidden(res.bulletCount === 0 && res.overlays.length === 0)
      setLoadProgressPercent(100)
      setDanmakuStatus("ready")
      activateDanmakuAfterInject()
    }

    const runInjectPump = () => {
      injectPumpRafRef.current = 0
      if (generation !== danmakuLoadGenerationRef.current) return

      const dm = danmakuRef.current
      if (!dm) {
        if (chunkQueue.length > 0 || (parseDone && pendingJsonl)) {
          injectPumpRafRef.current = requestAnimationFrame(runInjectPump)
        }
        return
      }

      if (chunkQueue.length > 0) {
        const chunk = chunkQueue.shift()!
        if (loadOneChunkIntoEngine(chunk)) {
          reportInjectProgress()
        } else {
          chunkQueue.unshift(chunk)
        }
        injectPumpRafRef.current = requestAnimationFrame(runInjectPump)
        return
      }

      void tryFinalize()
    }

    const scheduleInjectPump = () => {
      if (injectPumpRafRef.current !== 0) return
      injectPumpRafRef.current = requestAnimationFrame(runInjectPump)
    }

    void fetchDanmakuForVideo(videoPath, {
      signal: ac.signal,
      onJsonlSidecarFound: () => {
        if (generation !== danmakuLoadGenerationRef.current) return
        setDanmakuSidecarPresent(true)
      },
      onProgress: (ratio) => {
        if (generation !== danmakuLoadGenerationRef.current) return
        setDanmakuStatus("parsing")
        setLoadProgressThrottled(getDanmakuStageProgress(ratio))
      },
      onChunk: (chunk) => {
        if (generation !== danmakuLoadGenerationRef.current) return
        bulletsRef.current.push(...chunk)
        chunkQueue.push(chunk)
        scheduleInjectPump()
      },
    }).then((res) => {
      if (ac.signal.aborted || generation !== danmakuLoadGenerationRef.current) return
      if (res.kind === "none") {
        stopInjectPump()
        chunkQueue.length = 0
        setDanmakuStatus(
          res.reason === "xml" ? "xml" : res.reason === "error" ? "error" : "none"
        )
        setLoadProgressPercent(null)
        return
      }

      pendingJsonl = res
      parseDone = true
      expectedBulletCountRef.current = res.bulletCount
      setMeta(res.meta)
      setOverlays(res.overlays)
      setChatItems(res.chatItems)
      scheduleInjectPump()
    })

    return () => {
      ac.abort()
      stopInjectPump()
      chunkQueue.length = 0
    }
  }, [videoPath, setLoadProgressThrottled, activateDanmakuAfterInject])

  useEffect(() => {
    if (!isDanmakuPipelineBusy(danmakuStatus)) {
      setDanmakuLoadTimedOut(false)
      setLoadIndicatorDocked(false)
      return
    }

    const activityStartedAt = performance.now()
    const timeoutId = window.setTimeout(() => {
      if (
        hasDanmakuLoadTimedOut(
          performance.now(),
          activityStartedAt,
          danmakuStatus,
          DANMAKU_LOAD_TIMEOUT_MS
        )
      ) {
        setDanmakuLoadTimedOut(true)
      }
    }, DANMAKU_LOAD_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [danmakuStatus, loadProgressPercent])

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
  useLayoutEffect(() => {
    const stage = stageRef.current
    const host = danmakuHostRef.current
    const overlayHost = overlayHostRef.current
    const video = videoRef.current
    if (!stage || !host || !video) return

    const sync = () => {
      const stageW = stage.clientWidth
      const stageH = stage.clientHeight
      const portraitStage = stageH > stageW
      const audioPicture = showAudioOnlyPlayback ? audioPictureRef.current : null
      // Audio-only: pretend 16:9 so overlays match landscape MP4 on a portrait stage.
      const layoutFit = showAudioOnlyPlayback ? "contain" : objectFit
      const box = getObjectFitContentBox(
        {
          clientWidth: video.clientWidth,
          clientHeight: video.clientHeight,
          videoWidth: showAudioOnlyPlayback ? 16 : video.videoWidth,
          videoHeight: showAudioOnlyPlayback ? 9 : video.videoHeight,
        },
        layoutFit,
        PORTRAIT_LANDSCAPE_VIDEO_ALIGNMENT
      )
      const nextObjectPosition =
        !showAudioOnlyPlayback &&
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
      if (audioPicture) applyBox(audioPicture)
      applyBox(host)

      const topBar = Math.max(0, top)
      const bottomBar = Math.max(0, stageH - top - box.height)
      // Landscape VOD on portrait phone → black bars. Vertical VOD → translucent dock on picture.
      const useLetterbox =
        layoutFit === "contain" && portraitStage && topBar >= 40 && bottomBar >= 40
      const useDocked = layoutFit === "contain" && portraitStage && !useLetterbox

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
        const next: OverlayLayout = { mode: "content", bottomBar }
        if (prev.mode === "content" && prev.bottomBar === next.bottomBar) {
          return prev
        }
        return next
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
    showAudioOnlyPlayback,
    viewportLandscape,
  ])

  useEffect(() => {
    const dm = danmakuRef.current
    if (!dm || danmakuStatus !== "ready") return
    if (bulletsRef.current.length === 0) return

    const nextKey = buildInjectStyleKey(getInjectStyleOptions(), danmakuArea)
    if (appliedInjectKeyRef.current === nextKey) return

    let cancelled = false

    const reloadStyledDanmaku = async () => {
      listReadyRef.current = false
      dm.clear()
      vodListPreparedRef.current = false
      prepareDanmakuVodList(dm, danmakuArea)
      vodListPreparedRef.current = true
      bulletsLoadedCountRef.current = 0

      await injectDanmakuBullets(dm, bulletsRef.current, getInjectStyleOptions(), {
        isCancelled: () => cancelled,
      })

      if (cancelled) return
      bulletsLoadedCountRef.current = bulletsRef.current.length
      appliedInjectKeyRef.current = nextKey
      listReadyRef.current = true
      activateDanmakuAfterInject()
    }

    void reloadStyledDanmaku()
    return () => {
      cancelled = true
      listReadyRef.current = false
    }
  }, [
    danmakuOpacity,
    danmakuScale,
    danmakuFontSize,
    danmakuSpeed,
    danmakuArea,
    playbackRate,
    getInjectStyleOptions,
    activateDanmakuAfterInject,
  ])

  const touchDevice = touchDeviceRef.current
  const landscapeVideo =
    showAudioOnlyPlayback ||
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
  const effectsReady = danmakuStatus === "ready"

  useEffect(() => {
    const layer = danmakuHostRef.current?.querySelector(".N-dmLayer") as HTMLElement | null
    if (!layer) return
    const visible = effectsReady && !danmakuHidden && screenDanmakuActive
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
  }, [danmakuHidden, effectsReady, screenDanmakuActive])

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
        effectsReady &&
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
      setAudioOnlyPlayback(audioOnlyFileByName)
    }
    const onLoadedMetadata = () => {
      setVideoMetadataReady(true)
      setAudioOnlyPlayback(
        audioOnlyFileByName || video.videoWidth === 0 || video.videoHeight === 0
      )
    }
    const onPlay = () => {
      const playbackBlocked = shouldBlockPlayback({
        videoMetadataReady,
        danmakuStatus,
        danmakuLoadTimedOut,
      })
      if (playbackBlocked) {
        video.pause()
        return
      }

      if (isDanmakuPipelineBusy(danmakuStatus)) {
        setLoadIndicatorDocked(true)
      }
      setPaused(false)
      if (effectsReady) {
        danmakuRef.current?.resume()
      }
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
        effectsReady &&
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
    const metadataReady = video.readyState >= HTMLMediaElement.HAVE_METADATA
    setVideoMetadataReady(metadataReady)
    if (metadataReady) {
      setAudioOnlyPlayback(
        audioOnlyFileByName || video.videoWidth === 0 || video.videoHeight === 0
      )
    }
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
  }, [
    audioOnlyFileByName,
    danmakuHidden,
    danmakuLoadTimedOut,
    danmakuStatus,
    effectsReady,
    playbackUrl,
    screenDanmakuActive,
    videoMetadataReady,
  ])

  useEffect(() => {
    const video = videoRef.current
    if (
      !video ||
      !showAudioOnlyPlayback ||
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator)
    ) {
      return
    }

    const mediaSession = navigator.mediaSession
    const setActionHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        mediaSession.setActionHandler(action, handler)
      } catch {
        // Ignore unsupported actions.
      }
    }
    const syncPlaybackState = () => {
      mediaSession.playbackState = video.ended
        ? "none"
        : video.paused
          ? "paused"
          : "playing"
    }
    const syncPositionState = () => {
      const duration = video.duration
      const position = video.currentTime
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return
      try {
        mediaSession.setPositionState({
          duration,
          playbackRate: video.playbackRate > 0 ? video.playbackRate : 1,
          position: Math.max(0, Math.min(position, duration)),
        })
      } catch {
        // Ignore browsers that reject incomplete position state.
      }
    }
    const seekBy = (offset: number) => {
      const duration = video.duration
      const max = Number.isFinite(duration) && duration > 0 ? duration : video.currentTime
      video.currentTime = Math.max(0, Math.min(max, video.currentTime + offset))
    }

    setActionHandler("play", () => {
      void video.play().catch(() => {})
    })
    setActionHandler("pause", () => {
      video.pause()
    })
    setActionHandler("seekbackward", (details) => {
      seekBy(-(details.seekOffset ?? 10))
    })
    setActionHandler("seekforward", (details) => {
      seekBy(details.seekOffset ?? 10)
    })
    setActionHandler("seekto", (details) => {
      if (details.seekTime == null) return
      const duration = video.duration
      const max = Number.isFinite(duration) && duration > 0 ? duration : details.seekTime
      video.currentTime = Math.max(0, Math.min(max, details.seekTime))
    })

    const artworkLabel = [meta?.name, meta?.title].filter(Boolean).join(" · ") || fileName
    const metadataBase = {
      title: fileName,
      artist: meta?.name || "BiliRec",
      album: meta?.title || t("playbackPlayer.audioAlbumFallback"),
    }
    const pathRoomId = Number.parseInt(videoPath.split(/[/\\]/)[0] ?? "", 10)
    const roomId =
      meta?.roomId ??
      (Number.isFinite(pathRoomId) && pathRoomId > 0 ? pathRoomId : undefined)

    let cancelled = false
    const setSessionMetadata = (artwork: ReturnType<typeof buildAudioMediaSessionArtwork>) => {
      if (cancelled) return
      mediaSession.metadata = new MediaMetadata({ ...metadataBase, artwork })
    }

    setSessionMetadata(buildAudioMediaSessionArtwork(artworkLabel))
    if (roomId) {
      void apiClient.getRoomInfo(roomId).then((info) => {
        if (cancelled || !info.cover) return
        setSessionMetadata(buildCoverMediaSessionArtwork(info.cover))
      })
    }
    let lastPositionAt = 0
    const onTimeUpdate = () => {
      const now = performance.now()
      if (now - lastPositionAt < 1000) return
      lastPositionAt = now
      syncPositionState()
    }
    video.addEventListener("play", syncPlaybackState)
    video.addEventListener("pause", syncPlaybackState)
    video.addEventListener("ended", syncPlaybackState)
    video.addEventListener("timeupdate", onTimeUpdate)
    video.addEventListener("durationchange", syncPositionState)
    video.addEventListener("ratechange", syncPositionState)
    video.addEventListener("seeked", syncPositionState)
    syncPlaybackState()
    syncPositionState()

    return () => {
      cancelled = true
      video.removeEventListener("play", syncPlaybackState)
      video.removeEventListener("pause", syncPlaybackState)
      video.removeEventListener("ended", syncPlaybackState)
      video.removeEventListener("timeupdate", onTimeUpdate)
      video.removeEventListener("durationchange", syncPositionState)
      video.removeEventListener("ratechange", syncPositionState)
      video.removeEventListener("seeked", syncPositionState)
      for (const action of [
        "play",
        "pause",
        "seekbackward",
        "seekforward",
        "seekto",
      ] as MediaSessionAction[]) {
        setActionHandler(action, null)
      }
      mediaSession.metadata = null
      mediaSession.playbackState = "none"
    }
  }, [
    fileName,
    mediaLang,
    meta?.name,
    meta?.roomId,
    meta?.title,
    showAudioOnlyPlayback,
    t,
    videoPath,
  ])

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

    const lockIfNeeded = async () => {
      if (
        !shouldLockLandscapeInPortrait({
          audioOnly: showAudioOnlyPlayback,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        })
      ) {
        return
      }
      const locked = await tryLockScreenLandscape()
      if (locked) {
        orientationLockedRef.current = true
        setOrientationLocked(true)
        return
      }
      console.warn("Screen orientation lock rejected; keeping fullscreen")
      toast.info(t("playbackPlayer.orientationLockFailed"))
    }

    const enteredFullscreen = await requestElementFullscreen(stage)
    setAppFullscreen(true)
    if (!enteredFullscreen) {
      // Fullscreen API unavailable: CSS-only immersive fallback; still try orientation lock.
      await lockIfNeeded()
      return
    }

    await lockIfNeeded()
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

  const danmakuPipelineBusy = isDanmakuPipelineBusy(danmakuStatus)
  const playbackBlocked = shouldBlockPlayback({
    videoMetadataReady,
    danmakuStatus,
    danmakuLoadTimedOut,
  })
  const showCentralLoadOverlay =
    !loadIndicatorDocked && (!videoMetadataReady || danmakuPipelineBusy)
  const showDockedLoadIndicator =
    loadIndicatorDocked &&
    videoMetadataReady &&
    danmakuSidecarPresent &&
    danmakuPipelineBusy
  const loadProgressAccentClass =
    danmakuStatus === "parsing"
      ? "bg-sky-300"
      : danmakuStatus === "injecting"
        ? "bg-violet-300"
        : "bg-amber-300"
  const loadProgressIndicatorClass =
    danmakuStatus === "parsing"
      ? "**:data-[slot=progress-indicator]:bg-sky-300"
      : danmakuStatus === "injecting"
        ? "**:data-[slot=progress-indicator]:bg-violet-300"
        : "**:data-[slot=progress-indicator]:bg-amber-300"

  const loadProgressLabel =
    loadProgressPercent != null &&
    (danmakuStatus === "parsing" || danmakuStatus === "injecting")
      ? danmakuStatus === "parsing"
        ? t("playbackPlayer.danmakuParsing", { percent: loadProgressPercent })
        : t("playbackPlayer.danmakuInjecting", { percent: loadProgressPercent })
      : null

  const showDanmakuFetching =
    danmakuSidecarPresent && danmakuStatus === "fetching"

  const statusHint =
    danmakuStatus === "xml" || danmakuStatus === "none"
      ? t("playbackPlayer.danmakuXmlSkipped")
      : danmakuStatus === "error"
        ? t("playbackPlayer.danmakuLoadError")
        : showDanmakuFetching
          ? t("playbackPlayer.danmakuFetching")
          : loadProgressLabel

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
    const measureChromeInset = mobileLandscapeLayout || (!touchDevice && stageFullscreen)
    if (!measureChromeInset) {
      setOverlayChromeBottomInset((prev) => (prev === 0 ? prev : 0))
      return () => undefined
    }

    const runMeasure = () => {
      const host = overlayHostRef.current
      const controls = controlsHostRef.current
      if (!host || !controls) return
      const hostRect = host.getBoundingClientRect()
      const controlsRect = controls.getBoundingClientRect()
      const padTop = Number.parseFloat(getComputedStyle(controls).paddingTop) || 0
      const inset = measureEventOverlayBottomInset(hostRect, controlsRect, padTop, {
        maxHeightRatio: mobileLandscapeLayout ? 0.22 : undefined,
      })
      setOverlayChromeBottomInset((prev) => (prev === inset ? prev : inset))
    }

    // Measure after layout settles. Exclude the controls gradient padding so
    // bottom-corner overlays sit in the fade zone (near the real chrome).
    frame = requestAnimationFrame(() => {
      nestedFrame = requestAnimationFrame(runMeasure)
    })

    const stage = stageRef.current
    let ro: ResizeObserver | null = null
    if (stage) {
      ro = new ResizeObserver(() => runMeasure())
      ro.observe(stage)
    }

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(nestedFrame)
      ro?.disconnect()
    }
  }, [
    advancedOpen,
    mobileLandscapeLayout,
    objectFit,
    playbackUrl,
    showAudioOnlyPlayback,
    stageFullscreen,
    touchDevice,
  ])

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

                  {showAudioOnlyPlayback ? null : (
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
                  )}

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

        {showAudioOnlyPlayback ? (
          <div
            ref={audioPictureRef}
            className="pointer-events-none absolute top-0 left-0 z-10 flex aspect-video w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(120,80,190,0.32),transparent_55%),linear-gradient(145deg,#10101a,#050507)] px-6 py-3"
            role="img"
            aria-label={t("recordCard.audioOnlyBadge")}
          >
            <div className="flex min-h-0 max-h-full w-full max-w-[min(78vw,24rem)] flex-col items-center justify-center gap-2 text-center">
              <div className="relative flex size-[4.25rem] shrink-0 items-center justify-center sm:size-20">
                <div
                  className={cn(
                    "absolute inset-1 rounded-full border border-white/15 bg-white/8 shadow-[0_0_28px_rgba(139,92,246,0.35)]",
                    !paused && "animate-[spin_16s_linear_infinite] motion-reduce:animate-none"
                  )}
                  aria-hidden
                />
                <div
                  className={cn(
                    "absolute inset-0 rounded-full bg-violet-300/14 blur-md",
                    !paused && "animate-pulse motion-reduce:animate-none"
                  )}
                  aria-hidden
                />
                <MusicNoteIcon
                  className="relative size-9 text-violet-200 sm:size-11"
                  weight="duotone"
                />
              </div>
              <p className="max-w-full shrink truncate text-xs text-white/70 sm:text-sm">{fileName}</p>
            </div>
          </div>
        ) : null}

        {showCentralLoadOverlay ? (
          <div
            className={cn(
              "absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 px-8",
              playbackBlocked
                ? "pointer-events-auto bg-black/60 backdrop-blur-[2px]"
                : "pointer-events-none"
            )}
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-valuenow={
              danmakuStatus === "parsing" || danmakuStatus === "injecting"
                ? loadProgressPercent ?? undefined
                : undefined
            }
            aria-label={
              !videoMetadataReady
                ? t("playbackPlayer.videoLoading")
                : loadProgressLabel ??
                  (showDanmakuFetching
                    ? t("playbackPlayer.danmakuFetching")
                    : t("playbackPlayer.videoLoading"))
            }
          >
            <CircleNotchIcon className="size-8 animate-spin text-white/90" weight="bold" aria-hidden />
            {danmakuSidecarPresent && danmakuPipelineBusy ? (
              <div className="w-full max-w-xs space-y-1.5">
                {danmakuStatus === "fetching" || loadProgressPercent == null ? (
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                    <div
                      className={cn(
                        "progress-indeterminate absolute inset-y-0 rounded-full",
                        loadProgressAccentClass
                      )}
                    />
                  </div>
                ) : (
                  <Progress
                    value={loadProgressPercent}
                    className={cn(
                      "h-1.5 bg-white/15",
                      loadProgressIndicatorClass
                    )}
                  />
                )}
                {loadProgressLabel ? (
                  <p className="text-center text-[11px] text-white/85">{loadProgressLabel}</p>
                ) : showDanmakuFetching ? (
                  <p className="text-center text-[11px] text-white/85">
                    {t("playbackPlayer.danmakuFetching")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {showDockedLoadIndicator ? (
          <div
            className="pointer-events-none absolute right-3 bottom-24 z-40 flex items-center gap-2 rounded-md bg-black/70 px-2.5 py-2 text-white/90 shadow-lg backdrop-blur-sm sm:bottom-20"
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-valuenow={
              danmakuStatus === "parsing" || danmakuStatus === "injecting"
                ? loadProgressPercent ?? undefined
                : undefined
            }
            aria-label={loadProgressLabel ?? t("playbackPlayer.danmakuFetching")}
          >
            <CircleNotchIcon className="size-4 animate-spin" weight="bold" aria-hidden />
            <div className="w-20 space-y-1">
              <div className="relative h-1 overflow-hidden rounded-full bg-white/20">
                {danmakuStatus === "fetching" || loadProgressPercent == null ? (
                  <div
                    className={cn(
                      "progress-indeterminate absolute inset-y-0 rounded-full",
                      loadProgressAccentClass
                    )}
                  />
                ) : (
                  <div
                    className="h-full rounded-full bg-amber-300 transition-[width]"
                    style={{ width: `${loadProgressPercent}%` }}
                  />
                )}
              </div>
              <p className="text-[10px] leading-none text-white/75">
                {loadProgressLabel ?? t("playbackPlayer.danmakuFetching")}
              </p>
            </div>
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
              hidden={danmakuHidden || !effectsReady}
              layout={chatLayout}
            />
          ) : (
            <EventOverlayLayer
              events={overlays}
              currentTime={currentTime}
              hidden={danmakuHidden || !effectsReady}
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
              maxZoneWidthPx={
                !touchDevice && !stageFullscreen
                  ? WINDOWED_EVENT_OVERLAY_MAX_WIDTH_PX
                  : undefined
              }
              chromeBottomInset={overlayChromeBottomInset}
              pictureBottomBar={
                overlayLayout.mode === "content" ? overlayLayout.bottomBar : 0
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}

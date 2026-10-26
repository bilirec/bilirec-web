import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"
import { useTranslation } from "react-i18next"
import {
  DEFAULT_SUBTITLE_OFFSET,
  loadSubtitleOffset,
  saveSubtitleOffset,
  type SubtitleOffset,
} from "@/lib/playback-settings"

function stripCueMarkup(text: string): string {
  if (!text.includes("<")) return text
  const doc = new DOMParser().parseFromString(text, "text/html")
  return doc.body.textContent ?? text
}

function subtitlesAreEnabled(video: HTMLVideoElement): boolean {
  const tracks = video.textTracks
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    if (track.kind !== "subtitles" && track.kind !== "captions") continue
    if (track.mode === "showing") return true
  }
  return false
}

function readShowingCueText(video: HTMLVideoElement): string {
  if (!subtitlesAreEnabled(video)) return ""
  const tracks = video.textTracks
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    if (track.kind !== "subtitles" && track.kind !== "captions") continue
    if (track.mode !== "showing") continue
    const cues = track.activeCues
    if (!cues || cues.length === 0) return ""
    const lines: string[] = []
    for (let j = 0; j < cues.length; j++) {
      const cue = cues[j] as VTTCue
      const line = stripCueMarkup(cue.text ?? "").trim()
      if (line) lines.push(line)
    }
    return lines.join("\n")
  }
  return ""
}

function clampOffsetToHost(
  offset: SubtitleOffset,
  host: HTMLElement,
  pill: HTMLElement
): SubtitleOffset {
  const hostW = host.clientWidth
  const hostH = host.clientHeight
  if (hostW <= 0 || hostH <= 0) return offset

  const pillW = pill.offsetWidth
  const pillH = pill.offsetHeight
  const halfW = pillW / 2 / hostW
  const fullH = pillH / hostH

  return {
    x: Math.min(1 - halfW, Math.max(halfW, offset.x)),
    y: Math.min(1, Math.max(fullH, offset.y)),
  }
}

interface PlaybackSubtitleOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>
}

export function PlaybackSubtitleOverlay({ videoRef }: PlaybackSubtitleOverlayProps) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origin: SubtitleOffset
  } | null>(null)

  const [cueText, setCueText] = useState("")
  const [offset, setOffset] = useState<SubtitleOffset>(() => loadSubtitleOffset())
  const offsetRef = useRef(offset)
  offsetRef.current = offset

  const syncCueText = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      setCueText("")
      return
    }
    setCueText(readShowingCueText(video))
  }, [videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onCueChange = () => syncCueText()
    const onAddTrack = (event: Event) => {
      const track = (event as TrackEvent).track
      if (!track) return
      track.addEventListener("cuechange", onCueChange)
    }
    const onRemoveTrack = (event: Event) => {
      const track = (event as TrackEvent).track
      if (!track) return
      track.removeEventListener("cuechange", onCueChange)
    }
    const bindTracks = () => {
      const tracks = video.textTracks
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].addEventListener("cuechange", onCueChange)
      }
    }
    const unbindTracks = () => {
      const tracks = video.textTracks
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].removeEventListener("cuechange", onCueChange)
      }
    }

    bindTracks()
    video.textTracks.addEventListener("addtrack", onAddTrack)
    video.textTracks.addEventListener("removetrack", onRemoveTrack)
    video.addEventListener("loadedmetadata", bindTracks)
    video.addEventListener("timeupdate", onCueChange)
    video.addEventListener("seeked", onCueChange)

    const controller = video.closest("media-controller")
    const subtitlesAttr = "mediasubtitlesshowing"
    const onSubtitlesUiChange = () => {
      queueMicrotask(onCueChange)
    }
    let subtitlesObserver: MutationObserver | undefined
    if (controller) {
      controller.addEventListener(subtitlesAttr, onSubtitlesUiChange)
      subtitlesObserver = new MutationObserver(onSubtitlesUiChange)
      subtitlesObserver.observe(controller, {
        attributes: true,
        attributeFilter: [subtitlesAttr],
      })
      const captionsButton = controller.querySelector("media-captions-button")
      captionsButton?.addEventListener("click", onSubtitlesUiChange)
    }

    syncCueText()

    return () => {
      unbindTracks()
      video.textTracks.removeEventListener("addtrack", onAddTrack)
      video.textTracks.removeEventListener("removetrack", onRemoveTrack)
      video.removeEventListener("loadedmetadata", bindTracks)
      video.removeEventListener("timeupdate", onCueChange)
      video.removeEventListener("seeked", onCueChange)
      if (controller) {
        controller.removeEventListener(subtitlesAttr, onSubtitlesUiChange)
        subtitlesObserver?.disconnect()
        controller
          .querySelector("media-captions-button")
          ?.removeEventListener("click", onSubtitlesUiChange)
      }
    }
  }, [videoRef, syncCueText])

  useLayoutEffect(() => {
    const host = hostRef.current
    const pill = pillRef.current
    if (!host || !pill || !cueText) return

    const reclamp = () => {
      setOffset((prev) => {
        const next = clampOffsetToHost(prev, host, pill)
        if (next.x === prev.x && next.y === prev.y) return prev
        offsetRef.current = next
        saveSubtitleOffset(next)
        return next
      })
    }

    reclamp()
    const ro = new ResizeObserver(reclamp)
    ro.observe(host)
    return () => ro.disconnect()
  }, [cueText])

  const persistOffset = useCallback((next: SubtitleOffset) => {
    setOffset(next)
    saveSubtitleOffset(next)
  }, [])

  const resetOffset = useCallback(() => {
    persistOffset({ ...DEFAULT_SUBTITLE_OFFSET })
  }, [persistOffset])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const host = hostRef.current
    if (!host) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: offset,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const host = hostRef.current
    const pill = pillRef.current
    if (!drag || drag.pointerId !== event.pointerId || !host || !pill) return

    const hostW = host.clientWidth
    const hostH = host.clientHeight
    if (hostW <= 0 || hostH <= 0) return

    const dx = (event.clientX - drag.startX) / hostW
    const dy = (event.clientY - drag.startY) / hostH
    const moved = clampOffsetToHost(
      { x: drag.origin.x + dx, y: drag.origin.y + dy },
      host,
      pill
    )
    offsetRef.current = moved
    setOffset(moved)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    persistOffset(offsetRef.current)
  }

  const onDoubleClick = () => {
    resetOffset()
  }

  if (!cueText) return null

  return (
    <div ref={hostRef} className="bilirec-subtitle-overlay-host absolute inset-0">
      <div
        ref={pillRef}
        className="bilirec-subtitle-overlay-pill"
        style={{
          left: `${offset.x * 100}%`,
          top: `${offset.y * 100}%`,
          transform: "translate(-50%, -100%)",
        }}
        title={t("playbackPlayer.subtitleMove")}
        aria-label={t("playbackPlayer.subtitleMove")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {cueText}
      </div>
    </div>
  )
}

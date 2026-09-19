export type ObjectFitMode = "contain" | "cover" | "fill"

export const FIT_CYCLE: ObjectFitMode[] = ["contain", "cover", "fill"]

/** Move horizontal recordings toward the upper-middle in portrait stages. */
export const PORTRAIT_LANDSCAPE_VIDEO_ALIGNMENT = 0.25
export const DEFAULT_VIDEO_OBJECT_POSITION = "50% 50%"
export const PORTRAIT_LANDSCAPE_OBJECT_POSITION = "50% 25%"

export function getObjectFitContentBox(
  video: Pick<HTMLVideoElement, "clientWidth" | "clientHeight" | "videoWidth" | "videoHeight">,
  fit: ObjectFitMode,
  portraitLandscapeAlignment = 0.5
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
    const top =
      elH > elW && videoAspect > 1
        ? (elH - height) * portraitLandscapeAlignment
        : (elH - height) / 2
    return { top, left: 0, width: elW, height }
  }
  const width = elH * videoAspect
  return { top: 0, left: (elW - width) / 2, width, height: elH }
}

/** Controls sit in stage letterbox below the picture (not overlapping it). */
export const PICTURE_BOTTOM_BAR_LETTERBOX_PX = 40
export const DESKTOP_EVENT_OVERLAY_PICTURE_FLOOR_PX = 12
/** Windowed desktop when controls overlap the picture (above subtitle band, not the control bar). */
export const WINDOWED_EVENT_OVERLAY_OVER_PICTURE_PX = 176
/** Max width for gift / event stack in desktop windowed mode. */
export const WINDOWED_EVENT_OVERLAY_MAX_WIDTH_PX = 270

export function resolveWindowedBottomCornerPx(pictureBottomBar: number): number {
  return pictureBottomBar >= PICTURE_BOTTOM_BAR_LETTERBOX_PX
    ? DESKTOP_EVENT_OVERLAY_PICTURE_FLOOR_PX
    : WINDOWED_EVENT_OVERLAY_OVER_PICTURE_PX
}

/** Distance from picture bottom to control chrome top (px), for bottom-corner event overlays. */
export function measureEventOverlayBottomInset(
  hostRect: Pick<DOMRectReadOnly, "bottom" | "height">,
  controlsRect: Pick<DOMRectReadOnly, "top">,
  controlsPaddingTopPx: number,
  options?: { maxHeightRatio?: number; padPx?: number }
): number {
  const pad = options?.padPx ?? 6
  const gapBelowPicture = controlsRect.top - hostRect.bottom
  if (gapBelowPicture >= PICTURE_BOTTOM_BAR_LETTERBOX_PX) {
    return DESKTOP_EVENT_OVERLAY_PICTURE_FLOOR_PX
  }
  const raw = Math.round(hostRect.bottom - controlsRect.top - controlsPaddingTopPx)
  const minInset = DESKTOP_EVENT_OVERLAY_PICTURE_FLOOR_PX
  const maxByScreen =
    options?.maxHeightRatio != null
      ? Math.max(40, Math.round(hostRect.height * options.maxHeightRatio))
      : Number.POSITIVE_INFINITY
  return Math.min(Math.max(minInset, raw + pad), maxByScreen)
}

/** media-chrome CSS variables shared by the playback controller. */
export const MEDIA_CHROME_VARS: Record<string, string> = {
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
}

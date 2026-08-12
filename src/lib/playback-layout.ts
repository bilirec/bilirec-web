export type ObjectFitMode = "contain" | "cover" | "fill"

export const FIT_CYCLE: ObjectFitMode[] = ["contain", "cover", "fill"]

/** Move horizontal recordings toward the upper-middle in portrait stages. */
export const PORTRAIT_LANDSCAPE_VIDEO_ALIGNMENT = 0.25
export const DEFAULT_VIDEO_OBJECT_POSITION = "50% 50%"
export const PORTRAIT_LANDSCAPE_OBJECT_POSITION = "50% 25%"

export function getObjectFitContentBox(
  video: HTMLVideoElement,
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

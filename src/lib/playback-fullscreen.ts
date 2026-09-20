type OrientationLockController = {
  lock?: (orientation: "landscape") => Promise<void>
  unlock?: () => void
}

export function getScreenOrientation(): OrientationLockController | undefined {
  if (typeof window === "undefined") return undefined
  return window.screen.orientation as OrientationLockController | undefined
}

/** Enter element fullscreen; returns false when unsupported or rejected. */
export async function requestElementFullscreen(el: HTMLElement): Promise<boolean> {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
    webkitRequestFullScreen?: () => Promise<void> | void
  }
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen()
      return true
    }
    if (anyEl.webkitRequestFullscreen) {
      await anyEl.webkitRequestFullscreen()
      return true
    }
    if (anyEl.webkitRequestFullScreen) {
      await anyEl.webkitRequestFullScreen()
      return true
    }
  } catch {
    return false
  }
  return false
}

export async function exitDocumentFullscreen(): Promise<void> {
  if (!document.fullscreenElement) return
  try {
    await document.exitFullscreen()
  } catch {
    // Ignore browsers that reject exiting after the element already left fullscreen.
  }
}

export function isPortraitViewport(): boolean {
  if (typeof window === "undefined") return false
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth
  return viewportHeight > viewportWidth
}

/** Lock to landscape when entering mobile fullscreen from portrait (audio-only or landscape video). */
export function shouldLockLandscapeInPortrait(options: {
  audioOnly: boolean
  videoWidth: number
  videoHeight: number
}): boolean {
  if (!isPortraitViewport()) return false
  if (options.audioOnly) return true
  return (
    options.videoWidth > 0 &&
    options.videoHeight > 0 &&
    options.videoWidth > options.videoHeight
  )
}

export async function tryLockScreenLandscape(): Promise<boolean> {
  const orientation = getScreenOrientation()
  if (!orientation?.lock) return false
  try {
    await orientation.lock("landscape")
    return true
  } catch {
    return false
  }
}

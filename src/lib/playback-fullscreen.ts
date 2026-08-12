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

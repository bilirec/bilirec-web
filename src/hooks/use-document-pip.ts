import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import {
  applyDocumentPipViewportLayout,
  copyOpenerStylesIntoPipWindow,
  isDocumentPipSupported,
  markStageForDocumentPip,
  moveStageIntoPipWindow,
  readStageVideoIntrinsicSize,
  restoreStageToSlot,
  setClockWindow,
} from "@/lib/document-pip"

export interface UseDocumentPipOptions {
  stageRef: RefObject<HTMLDivElement | null>
  stageSlotRef: RefObject<HTMLDivElement | null>
  enabled: boolean
  getPreferredSize: () => { width: number; height: number }
  onEnter?: () => void
  onLeave?: () => void
}

export interface UseDocumentPipResult {
  supported: boolean
  active: boolean
  pipWindow: Window | null
  open: () => Promise<void>
  close: () => void
  toggle: () => Promise<void>
}

export function useDocumentPip({
  stageRef,
  stageSlotRef,
  enabled,
  getPreferredSize,
  onEnter,
  onLeave,
}: UseDocumentPipOptions): UseDocumentPipResult {
  const supported = enabled && isDocumentPipSupported()
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const pipWindowRef = useRef<Window | null>(null)
  pipWindowRef.current = pipWindow

  const leavePip = useCallback(() => {
    const win = pipWindowRef.current
    const stage = stageRef.current
    const slot = stageSlotRef.current
    if (stage && slot) {
      restoreStageToSlot(stage, slot)
    }
    setPipWindow(null)
    setClockWindow(null)
    onLeave?.()
    if (win && !win.closed) {
      try {
        win.close()
      } catch {
        /* ignore */
      }
    }
  }, [onLeave, stageRef, stageSlotRef])

  const onPageHide = useCallback(() => {
    leavePip()
  }, [leavePip])

  useEffect(() => {
    const win = pipWindow
    if (!win) return
    win.addEventListener("pagehide", onPageHide)
    return () => win.removeEventListener("pagehide", onPageHide)
  }, [pipWindow, onPageHide])

  const leavePipRef = useRef(leavePip)
  leavePipRef.current = leavePip
  useEffect(() => {
    return () => {
      if (pipWindowRef.current != null) {
        leavePipRef.current()
      }
    }
  }, [])

  const open = useCallback(async () => {
    if (!supported) return
    const api = window.documentPictureInPicture
    if (!api) return
    if (pipWindowRef.current) {
      return
    }
    const stage = stageRef.current
    if (!stage) return

    const { width, height } = getPreferredSize()
    const win = await api.requestWindow({
      width: Math.max(320, Math.round(width)),
      height: Math.max(180, Math.round(height)),
    })

    try {
      copyOpenerStylesIntoPipWindow(win)
    } catch (err) {
      console.warn("Document PiP style copy failed:", err)
    }
    const { width: vw, height: vh } = readStageVideoIntrinsicSize(stage)
    applyDocumentPipViewportLayout(win, vw, vh)
    markStageForDocumentPip(stage)
    moveStageIntoPipWindow(stage, win)
    setPipWindow(win)
    setClockWindow(win)
    onEnter?.()
  }, [getPreferredSize, leavePip, onEnter, stageRef, supported])

  const close = useCallback(() => {
    leavePip()
  }, [leavePip])

  const toggle = useCallback(async () => {
    if (pipWindowRef.current) {
      close()
      return
    }
    await open()
  }, [close, open])

  return {
    supported,
    active: pipWindow != null,
    pipWindow,
    open,
    close,
    toggle,
  }
}

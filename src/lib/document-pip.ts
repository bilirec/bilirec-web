/** Document Picture-in-Picture (desktop Chromium / Firefox 151+). */

export interface DocumentPictureInPictureOptions {
  width?: number
  height?: number
  disallowReturnToOpener?: boolean
  preferInitialWindowPlacement?: boolean
}

export interface DocumentPictureInPicture {
  readonly window: Window | null
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>
  addEventListener(type: "enter", listener: (event: Event) => void): void
  removeEventListener(type: "enter", listener: (event: Event) => void): void
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture
  }
}

export function isDocumentPipSupported(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window
}

/** Window whose timers/RAF should run while the player is in document PiP. */
let clockWindow: Window | null = null

export function getClockWindow(): Window {
  return clockWindow ?? window
}

export function setClockWindow(target: Window | null): void {
  clockWindow = target
}

export function requestAnimationFrameInClock(cb: FrameRequestCallback): number {
  return getClockWindow().requestAnimationFrame(cb)
}

export function cancelAnimationFrameInClock(id: number): void {
  getClockWindow().cancelAnimationFrame(id)
}

export function setIntervalInClock(
  handler: TimerHandler,
  timeout?: number,
  ...args: unknown[]
): ReturnType<typeof setInterval> {
  return getClockWindow().setInterval(handler, timeout, ...args)
}

export function clearIntervalInClock(id: ReturnType<typeof setInterval>): void {
  getClockWindow().clearInterval(id)
}

function cloneStyleSheetRules(sheet: CSSStyleSheet, pipDoc: Document): void {
  try {
    const rules = [...sheet.cssRules]
    if (rules.length === 0) return
    const el = pipDoc.createElement("style")
    el.textContent = rules.map((r) => r.cssText).join("\n")
    pipDoc.head.appendChild(el)
  } catch {
    // Cross-origin stylesheets cannot be read; rely on <link> clones.
  }
}

/**
 * Mirror opener styles into the PiP document so Tailwind, media-chrome, and danmaku CSS apply.
 */
export function copyOpenerStylesIntoPipWindow(pipWindow: Window): void {
  const pipDoc = pipWindow.document
  const openerDoc = document

  for (const node of openerDoc.querySelectorAll('link[rel="stylesheet"]')) {
    pipDoc.head.appendChild(node.cloneNode(true))
  }

  for (const node of openerDoc.querySelectorAll("style")) {
    pipDoc.head.appendChild(node.cloneNode(true))
  }

  if (openerDoc.adoptedStyleSheets?.length) {
    try {
      pipDoc.adoptedStyleSheets = [...openerDoc.adoptedStyleSheets]
    } catch {
      // Some browsers reject sharing constructed sheets across documents.
    }
  }

  for (const sheet of openerDoc.styleSheets) {
    cloneStyleSheetRules(sheet, pipDoc)
  }

  const appearance = openerDoc.documentElement.getAttribute("data-appearance")
  if (appearance) {
    pipDoc.documentElement.setAttribute("data-appearance", appearance)
  }
  pipDoc.documentElement.className = openerDoc.documentElement.className

  const base = pipDoc.createElement("style")
  base.textContent = `
    html.bilirec-document-pip,
    html.bilirec-document-pip body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }
    html.bilirec-document-pip body {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    html.bilirec-document-pip body > .bilirec-playback-stage--document-pip {
      position: relative;
      flex: 0 0 auto;
      width: min(
        100%,
        calc(100vh * var(--bilirec-pip-aspect-w, 16) / var(--bilirec-pip-aspect-h, 9))
      );
      height: min(
        100%,
        calc(100vw * var(--bilirec-pip-aspect-h, 9) / var(--bilirec-pip-aspect-w, 16))
      );
      max-width: 100%;
      max-height: 100%;
      overflow: hidden;
    }
  `
  pipDoc.head.appendChild(base)
}

/** Fit a max box to a video aspect ratio (for PiP initial window size). */
export function fitBoxToVideoAspect(
  maxWidth: number,
  maxHeight: number,
  videoWidth: number,
  videoHeight: number
): { width: number; height: number } {
  if (videoWidth <= 0 || videoHeight <= 0) {
    return { width: maxWidth, height: maxHeight }
  }
  const aspect = videoWidth / videoHeight
  let width = maxWidth
  let height = width / aspect
  if (height > maxHeight) {
    height = maxHeight
    width = height * aspect
  }
  return { width, height }
}

function collectCustomElementTags(root: ParentNode, out: Set<string>): void {
  for (const el of root.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase()
    if (tag.includes("-")) out.add(tag)
    if (el.shadowRoot) collectCustomElementTags(el.shadowRoot, out)
  }
}

/**
 * media-chrome elements created after the stage moves are created in the PiP
 * document. That document has its own registry, so copy the opener's definitions
 * before React renders into it. Already-created elements keep the shadow root
 * they got in the opener.
 */
export function defineOpenerCustomElementsInPip(pipWindow: Window): void {
  const tags = new Set<string>()
  collectCustomElementTags(document, tags)
  for (const tag of tags) {
    if (pipWindow.customElements.get(tag)) continue
    const Ctor = customElements.get(tag)
    if (!Ctor) continue
    try {
      pipWindow.customElements.define(tag, Ctor)
    } catch (err) {
      console.warn(`Document PiP custom element ${tag} was not defined:`, err)
    }
  }

  // PiP's createElement does not upgrade constructors defined from the opener
  // realm. Build those elements with `new Ctor()` so they keep their shadow root
  // after React renders into the PiP document.
  const pipDoc = pipWindow.document as Document & { __bilirecCustomElements?: boolean }
  if (pipDoc.__bilirecCustomElements) return
  pipDoc.__bilirecCustomElements = true
  const createElement = pipDoc.createElement.bind(pipDoc)
  pipDoc.createElement = ((tag: string, options?: ElementCreationOptions) => {
    if (tag.includes("-")) {
      const Ctor = customElements.get(tag)
      if (Ctor) {
        try {
          return new Ctor()
        } catch {
          /* fall through */
        }
      }
    }
    return createElement(tag, options)
  }) as typeof pipDoc.createElement
}

export function applyDocumentPipViewportLayout(
  pipWindow: Window,
  videoWidth: number,
  videoHeight: number
): void {
  const pipDoc = pipWindow.document
  const w = videoWidth > 0 ? videoWidth : 16
  const h = videoHeight > 0 ? videoHeight : 9
  pipDoc.documentElement.classList.add("bilirec-document-pip")
  pipDoc.documentElement.style.setProperty("--bilirec-pip-aspect-w", String(w))
  pipDoc.documentElement.style.setProperty("--bilirec-pip-aspect-h", String(h))
}

export function markStageForDocumentPip(stage: HTMLElement): void {
  stage.classList.add("bilirec-playback-stage--document-pip")
}

export function unmarkStageForDocumentPip(stage: HTMLElement): void {
  stage.classList.remove("bilirec-playback-stage--document-pip")
}

export function readStageVideoIntrinsicSize(stage: HTMLElement): {
  width: number
  height: number
} {
  const video = stage.querySelector("video")
  return {
    width: video?.videoWidth ?? 0,
    height: video?.videoHeight ?? 0,
  }
}

export function moveStageIntoPipWindow(stage: HTMLElement, pipWindow: Window): void {
  pipWindow.document.body.append(stage)
}

export function restoreStageToSlot(stage: HTMLElement, slot: HTMLElement): void {
  unmarkStageForDocumentPip(stage)
  slot.append(stage)
}

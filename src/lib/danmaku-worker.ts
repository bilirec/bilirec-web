import { parseJsonlDanmaku } from "./danmaku-parse"
import type { DanmakuListItem } from "n-danmaku"
import type { DanmakuMeta, OverlayEvent, PlaybackChatItem } from "./danmaku-parse"

interface ParseRequest {
  id: number
  text: string
}

type ParseResponse =
  | { id: number; type: "progress"; ratio: number }
  | { id: number; type: "chunk"; bullets: DanmakuListItem[] }
  | {
      id: number
      type: "done"
      meta?: DanmakuMeta
      overlays: OverlayEvent[]
      chatItems: PlaybackChatItem[]
      bulletCount: number
    }
  | { id: number; type: "error"; error: string }

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null
  postMessage: (message: ParseResponse) => void
}

workerScope.onmessage = (event) => {
  const { id, text } = event.data
  try {
    const result = parseJsonlDanmaku(text, {
      onProgress: (ratio) => {
        workerScope.postMessage({ id, type: "progress", ratio })
      },
      onBulletChunk: (bullets) => {
        workerScope.postMessage({ id, type: "chunk", bullets })
      },
    })
    workerScope.postMessage({
      id,
      type: "done",
      meta: result.meta,
      overlays: result.overlays,
      chatItems: result.chatItems,
      bulletCount: "bulletCount" in result ? result.bulletCount : (result as { bullets: DanmakuListItem[] }).bullets.length,
    })
  } catch (error) {
    workerScope.postMessage({
      id,
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

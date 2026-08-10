import { parseJsonlDanmaku, type ParsedDanmaku } from "./danmaku-parse"

interface ParseRequest {
  id: number
  text: string
}

interface ParseResponse {
  id: number
  result?: ParsedDanmaku
  error?: string
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null
  postMessage: (message: ParseResponse) => void
}

workerScope.onmessage = (event) => {
  const { id, text } = event.data
  try {
    workerScope.postMessage({ id, result: parseJsonlDanmaku(text) })
  } catch (error) {
    workerScope.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

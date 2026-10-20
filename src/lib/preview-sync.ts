export function isSegmentEventType(type: string): boolean {
  return type === "segment"
}

/** Extracts the SSE payload's "type" field; undefined when the payload is not JSON. */
export function previewEventTypeOf(raw: string): string | undefined {
  try {
    return (JSON.parse(raw) as { type?: string }).type ?? ""
  } catch {
    return undefined
  }
}
const ARTWORK_SIZES = [96, 128, 256, 512] as const

export type MediaSessionArtwork = {
  src: string
  sizes: string
  type: string
}

export function buildCoverMediaSessionArtwork(coverUrl: string): MediaSessionArtwork[] {
  return [
    { src: coverUrl, sizes: "512x512", type: "image/jpeg" },
    { src: coverUrl, sizes: "256x256", type: "image/jpeg" },
  ]
}

function truncateLabel(text: string, maxLen: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  return `${trimmed.slice(0, Math.max(0, maxLen - 1))}…`
}

/** PNG data URLs for Media Session / lock-screen artwork (Chrome ignores missing favicon). */
export function buildAudioMediaSessionArtwork(label: string): MediaSessionArtwork[] {
  if (typeof document === "undefined") return []
  const title = truncateLabel(label, 48)
  return ARTWORK_SIZES.map((size) => ({
    sizes: `${size}x${size}`,
    type: "image/png",
    src: renderAudioCoverDataUrl(size, title),
  }))
}

function renderAudioCoverDataUrl(size: number, title: string): string {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  const r = size / 512

  const bg = ctx.createLinearGradient(0, 0, size, size * 0.92)
  bg.addColorStop(0, "#10101a")
  bg.addColorStop(1, "#050507")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  const glow = ctx.createRadialGradient(size * 0.5, size * 0.42, 0, size * 0.5, size * 0.42, size * 0.38)
  glow.addColorStop(0, "rgba(120, 80, 190, 0.45)")
  glow.addColorStop(0.55, "rgba(120, 80, 190, 0.12)")
  glow.addColorStop(1, "rgba(0, 0, 0, 0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)

  const discR = 82 * r
  const cx = size * 0.5
  const cy = size * 0.4
  ctx.beginPath()
  ctx.arc(cx, cy, discR, 0, Math.PI * 2)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)"
  ctx.lineWidth = Math.max(1, 3 * r)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, discR * 0.92, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)"
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, 22 * r, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(196, 181, 253, 0.85)"
  ctx.fill()

  drawMusicNote(ctx, cx + 28 * r, cy - 8 * r, 44 * r)

  if (size >= 128 && title) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.72)"
    ctx.font = `${Math.round(22 * r)}px system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText(title, size * 0.5, size * 0.92, size * 0.86)
  }

  return canvas.toDataURL("image/png")
}

function drawMusicNote(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const stemW = Math.max(1.5, h * 0.09)
  const headR = h * 0.16
  ctx.fillStyle = "rgba(237, 233, 254, 0.95)"
  ctx.beginPath()
  ctx.ellipse(x, y + h * 0.55, headR * 1.15, headR, -0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x + headR * 0.85, y, stemW, h * 0.62)
  ctx.beginPath()
  ctx.ellipse(x + stemW + headR * 0.85, y + h * 0.08, headR * 1.1, headR * 0.95, -0.35, 0, Math.PI * 2)
  ctx.fill()
}

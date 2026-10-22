import { useState, type CSSProperties, type PointerEvent } from "react"
import { useTranslation } from "react-i18next"
import type { PreviewDvrState } from "@/hooks/use-preview-dvr"
import { formatPreviewBufferDepth, formatPreviewDelay } from "@/lib/preview-dvr"
import { cn } from "@/lib/utils"

export function PreviewDvrRange({
  dvr,
  keepSeconds,
  className,
}: {
  dvr: PreviewDvrState
  keepSeconds: number
  className?: string
}) {
  const { t } = useTranslation()
  const [scrub, setScrub] = useState<number | null>(null)
  const slider = scrub ?? dvr.slider
  const pct = keepSeconds > 0 ? (slider / keepSeconds) * 100 : 0

  const onPointerDown = (event: PointerEvent<HTMLInputElement>) => {
    setScrub(event.currentTarget.valueAsNumber)
  }
  const endScrub = () => setScrub(null)

  return (
    <input
      type="range"
      className={cn("bilirec-preview-dvr w-full min-w-0", className)}
      min={0}
      max={keepSeconds}
      step={0.1}
      value={slider}
      aria-label={dvr.nearLive ? t("playbackPlayer.liveNow") : t("playbackPlayer.goLive")}
      style={{ "--dvr-pct": `${pct}%` } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onChange={(e) => {
        const v = e.currentTarget.valueAsNumber
        setScrub(v)
        dvr.seek(v)
      }}
    />
  )
}

export function PreviewLiveStatus({ dvr }: { dvr: PreviewDvrState }) {
  const { t } = useTranslation()
  const label = dvr.nearLive ? t("playbackPlayer.liveNow") : formatPreviewDelay(dvr.behind)

  const rewindBufferLabel = t("playbackPlayer.previewRewindBuffer", {
    time: formatPreviewBufferDepth(dvr.bufferDepthSec),
  })

  return (
    <button
      type="button"
      className={cn(
        "max-w-[min(100%,14rem)] shrink-0 rounded-md px-1.5 py-0.5 text-left text-[11px] tabular-nums leading-tight sm:max-w-none sm:text-xs",
        dvr.nearLive
          ? "cursor-default text-red-400"
          : "text-white/85 hover:bg-white/12 hover:text-white"
      )}
      disabled={dvr.nearLive}
      title={
        dvr.nearLive
          ? `${t("playbackPlayer.liveNow")} ${rewindBufferLabel}`
          : t("playbackPlayer.goLive")
      }
      onClick={() => dvr.goLive()}
    >
      {dvr.nearLive ? (
        <span className="inline-flex flex-wrap items-baseline gap-x-1">
          <span className="font-semibold">{t("playbackPlayer.liveNow")}</span>
          <span className="font-normal text-white/70">{rewindBufferLabel}</span>
        </span>
      ) : (
        `${label} · ${t("playbackPlayer.goLive")}`
      )}
    </button>
  )
}

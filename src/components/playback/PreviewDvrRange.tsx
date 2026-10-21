import { useState, type CSSProperties, type PointerEvent, type RefObject } from "react"
import { useTranslation } from "react-i18next"
import { usePreviewDvr } from "@/hooks/use-preview-dvr"
import { PREVIEW_KEEP_SECONDS, formatPreviewDelay } from "@/lib/preview-dvr"
import { cn } from "@/lib/utils"

export function PreviewDvrRange({
  videoRef,
  className,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  className?: string
}) {
  const { t } = useTranslation()
  const dvr = usePreviewDvr(videoRef, true)
  const [scrub, setScrub] = useState<number | null>(null)
  const slider = scrub ?? dvr.slider
  const pct = (slider / PREVIEW_KEEP_SECONDS) * 100

  const onPointerDown = (event: PointerEvent<HTMLInputElement>) => {
    setScrub(event.currentTarget.valueAsNumber)
  }
  const endScrub = () => setScrub(null)

  return (
    <input
      type="range"
      className={cn("bilirec-preview-dvr w-full min-w-0", className)}
      min={0}
      max={PREVIEW_KEEP_SECONDS}
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

export function PreviewLiveStatus({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
}) {
  const { t } = useTranslation()
  const dvr = usePreviewDvr(videoRef, true)
  const label = dvr.nearLive ? t("playbackPlayer.liveNow") : formatPreviewDelay(dvr.behind)

  return (
    <button
      type="button"
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums sm:text-xs",
        dvr.nearLive
          ? "cursor-default font-semibold text-red-400"
          : "text-white/85 hover:bg-white/12 hover:text-white"
      )}
      disabled={dvr.nearLive}
      title={dvr.nearLive ? t("playbackPlayer.liveNow") : t("playbackPlayer.goLive")}
      onClick={() => dvr.goLive()}
    >
      {dvr.nearLive ? t("playbackPlayer.liveNow") : `${label} · ${t("playbackPlayer.goLive")}`}
    </button>
  )
}

import { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  type PlaybackSettingsValue,
  type OverlayCorner,
  type DanmakuArea,
  DEFAULT_PLAYBACK_SETTINGS,
  DEFAULT_DANMAKU_OPACITY,
  DEFAULT_DANMAKU_SIZE,
  DEFAULT_DANMAKU_SPEED,
  DANMAKU_SIZE_MIN,
  DANMAKU_SIZE_MAX,
  DANMAKU_SPEED_MIN,
  DANMAKU_SPEED_MAX,
  DANMAKU_AREAS,
  OVERLAY_CORNERS,
  parseRatesInput,
  parsePositiveNumber,
  clampDanmakuSize,
  clampDanmakuSpeed,
} from "@/lib/playback-settings"
import { sameNumberList, cornerLabelKey, areaLabelKey } from "@/lib/playback-danmaku"

export interface PlaybackSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: PlaybackSettingsValue
  onApply: (next: PlaybackSettingsValue) => void
}

export function PlaybackSettingsDialog({
  open,
  onOpenChange,
  value,
  onApply,
}: PlaybackSettingsDialogProps) {
  const { t } = useTranslation()

  const [ratesDraft, setRatesDraft] = useState(() => value.rates.join(", "))
  const [frameDraft, setFrameDraft] = useState(() => String(value.frameStepMs))
  const [seekDraft, setSeekDraft] = useState(() => String(value.seekOffsetSec))
  const [opacityDraft, setOpacityDraft] = useState(() => value.danmakuOpacity)
  const [followScreenDraft, setFollowScreenDraft] = useState(() => value.danmakuFollowScreen)
  const [sizeDraft, setSizeDraft] = useState(() => value.danmakuSize)
  const [speedDraft, setSpeedDraft] = useState(() => value.danmakuSpeed)
  const [areaDraft, setAreaDraft] = useState<DanmakuArea>(() => value.danmakuArea)
  const [overlayCornerDraft, setOverlayCornerDraft] = useState<OverlayCorner>(() => value.overlayCorner)

  const prevOpenRef = useRef(open)

  // Sync draft state with committed value only when the dialog transitions to open
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setRatesDraft(value.rates.join(", "))
      setFrameDraft(String(value.frameStepMs))
      setSeekDraft(String(value.seekOffsetSec))
      setOpacityDraft(value.danmakuOpacity)
      setFollowScreenDraft(value.danmakuFollowScreen)
      setSizeDraft(value.danmakuSize)
      setSpeedDraft(value.danmakuSpeed)
      setAreaDraft(value.danmakuArea)
      setOverlayCornerDraft(value.overlayCorner)
    }
    prevOpenRef.current = open
  }, [open, value])

  const parsedRatesDraft = parseRatesInput(ratesDraft)
  const parsedFrameDraft = parsePositiveNumber(frameDraft, { min: 1, max: 5000 })
  const parsedSeekDraft = parsePositiveNumber(seekDraft, { min: 0.5, max: 600 })
  const normalizedOpacityDraft = Math.min(100, Math.max(0, Math.round(opacityDraft)))
  const normalizedSizeDraft = clampDanmakuSize(sizeDraft)
  const normalizedSpeedDraft = clampDanmakuSpeed(speedDraft)

  const settingsDraftInvalid =
    parsedRatesDraft == null || parsedFrameDraft == null || parsedSeekDraft == null

  const hasPendingSettings =
    settingsDraftInvalid ||
    !sameNumberList(parsedRatesDraft ?? [], [...value.rates].sort((a, b) => a - b)) ||
    parsedFrameDraft !== value.frameStepMs ||
    parsedSeekDraft !== value.seekOffsetSec ||
    normalizedOpacityDraft !== value.danmakuOpacity ||
    followScreenDraft !== value.danmakuFollowScreen ||
    normalizedSizeDraft !== value.danmakuSize ||
    normalizedSpeedDraft !== value.danmakuSpeed ||
    areaDraft !== value.danmakuArea ||
    overlayCornerDraft !== value.overlayCorner

  const handleApply = () => {
    if (parsedRatesDraft == null) {
      toast.error(t("playbackPlayer.ratesInvalid"))
      return
    }
    if (parsedFrameDraft == null) {
      toast.error(t("playbackPlayer.frameStepInvalid"))
      return
    }
    if (parsedSeekDraft == null) {
      toast.error(t("playbackPlayer.seekOffsetInvalid"))
      return
    }

    const next: PlaybackSettingsValue = {
      rates: parsedRatesDraft,
      frameStepMs: parsedFrameDraft,
      seekOffsetSec: parsedSeekDraft,
      danmakuOpacity: normalizedOpacityDraft,
      danmakuFollowScreen: followScreenDraft,
      danmakuSize: normalizedSizeDraft,
      danmakuSpeed: normalizedSpeedDraft,
      danmakuArea: areaDraft,
      overlayCorner: overlayCornerDraft,
    }

    onApply(next)
    onOpenChange(false)
    toast.success(t("playbackPlayer.settingsApplied"))
  }

  const handleReset = () => {
    setRatesDraft(DEFAULT_PLAYBACK_SETTINGS.rates.join(", "))
    setFrameDraft(String(DEFAULT_PLAYBACK_SETTINGS.frameStepMs))
    setSeekDraft(String(DEFAULT_PLAYBACK_SETTINGS.seekOffsetSec))
    setOpacityDraft(DEFAULT_PLAYBACK_SETTINGS.danmakuOpacity)
    setFollowScreenDraft(DEFAULT_PLAYBACK_SETTINGS.danmakuFollowScreen)
    setSizeDraft(DEFAULT_PLAYBACK_SETTINGS.danmakuSize)
    setSpeedDraft(DEFAULT_PLAYBACK_SETTINGS.danmakuSpeed)
    setAreaDraft(DEFAULT_PLAYBACK_SETTINGS.danmakuArea)
    setOverlayCornerDraft(DEFAULT_PLAYBACK_SETTINGS.overlayCorner)

    onApply(DEFAULT_PLAYBACK_SETTINGS)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[min(34rem,calc(100dvh-2rem))] w-96 max-w-[calc(100vw-1.5rem)] flex-col gap-3 overflow-hidden border-white/15 bg-zinc-900 p-4 text-zinc-50 shadow-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-0 text-left">
          <DialogTitle className="text-sm font-semibold text-zinc-100">
            {t("playbackPlayer.settings")}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="playback" className="flex min-h-0 flex-1 flex-col gap-2.5">
          <TabsList className="grid h-8 w-full grid-cols-3 rounded-md bg-white/10 p-0.5 text-zinc-400">
            <TabsTrigger
              value="playback"
              className="h-7 rounded-sm text-xs font-medium text-zinc-300 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 data-[state=active]:shadow-sm"
            >
              {t("playbackPlayer.tabPlayback")}
            </TabsTrigger>
            <TabsTrigger
              value="danmaku"
              className="h-7 rounded-sm text-xs font-medium text-zinc-300 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 data-[state=active]:shadow-sm"
            >
              {t("playbackPlayer.tabDanmaku")}
            </TabsTrigger>
            <TabsTrigger
              value="overlay"
              className="h-7 rounded-sm text-xs font-medium text-zinc-300 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 data-[state=active]:shadow-sm"
            >
              {t("playbackPlayer.tabOverlay")}
            </TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(255,255,255,0.35)_transparent]">
            <TabsContent value="playback" className="mt-0 flex min-h-[240px] flex-col gap-3 outline-none">
              <div className="space-y-1.5">
                <Label htmlFor="playback-rates" className="text-zinc-200">
                  {t("playbackPlayer.ratesLabel")}
                </Label>
                <Input
                  id="playback-rates"
                  value={ratesDraft}
                  onChange={(e) => setRatesDraft(e.target.value)}
                  placeholder="0.25, 0.5, 1, 1.5, 2"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  className="border-white/15 bg-zinc-950 text-zinc-50 placeholder:text-zinc-500"
                />
                <p className="text-xs text-zinc-400">{t("playbackPlayer.ratesHint")}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="playback-frame" className="text-zinc-200">
                  {t("playbackPlayer.frameStepLabel")}
                </Label>
                <Input
                  id="playback-frame"
                  type="number"
                  min={1}
                  max={5000}
                  value={frameDraft}
                  onChange={(e) => setFrameDraft(e.target.value)}
                  className="border-white/15 bg-zinc-950 text-zinc-50"
                />
                <div className="flex flex-wrap gap-1">
                  {[24, 30, 60].map((fps) => (
                    <Button
                      key={fps}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 border-white/20 bg-transparent text-xs text-zinc-200 hover:bg-white/10 hover:text-white"
                      onClick={() => setFrameDraft(String(Math.round(1000 / fps)))}
                    >
                      {fps}fps
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="playback-seek" className="text-zinc-200">
                  {t("playbackPlayer.seekOffsetLabel")}
                </Label>
                <Input
                  id="playback-seek"
                  type="number"
                  min={0.5}
                  max={600}
                  step={0.5}
                  value={seekDraft}
                  onChange={(e) => setSeekDraft(e.target.value)}
                  className="border-white/15 bg-zinc-950 text-zinc-50"
                />
              </div>
            </TabsContent>

            <TabsContent value="danmaku" className="mt-0 flex min-h-[240px] flex-col gap-3 outline-none">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="playback-opacity" className="text-zinc-200">
                    {t("playbackPlayer.danmakuOpacityLabel")}
                  </Label>
                  <span className="tabular-nums text-xs text-zinc-400">{opacityDraft}%</span>
                </div>
                <Slider
                  id="playback-opacity"
                  min={0}
                  max={100}
                  step={1}
                  value={[opacityDraft]}
                  onValueChange={(v) => setOpacityDraft(v[0] ?? DEFAULT_DANMAKU_OPACITY)}
                  className="w-full"
                />
                <p className="text-xs text-zinc-400">{t("playbackPlayer.danmakuOpacityHint")}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="playback-speed" className="text-zinc-200">
                    {t("playbackPlayer.danmakuSpeedLabel")}
                  </Label>
                  <span className="tabular-nums text-xs text-zinc-400">
                    {(speedDraft / 100).toFixed(speedDraft % 10 !== 0 ? 2 : 1)}x
                  </span>
                </div>
                <Slider
                  id="playback-speed"
                  min={DANMAKU_SPEED_MIN}
                  max={DANMAKU_SPEED_MAX}
                  step={5}
                  value={[speedDraft]}
                  onValueChange={(v) =>
                    setSpeedDraft(clampDanmakuSpeed(v[0] ?? DEFAULT_DANMAKU_SPEED))
                  }
                  className="w-full"
                />
                <p className="text-xs text-zinc-400">{t("playbackPlayer.danmakuSpeedHint")}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-200">
                  {t("playbackPlayer.danmakuAreaLabel")}
                </Label>
                <div
                  className="grid grid-cols-4 gap-1.5"
                  role="radiogroup"
                  aria-label={t("playbackPlayer.danmakuAreaLabel")}
                >
                  {DANMAKU_AREAS.map((area) => {
                    const isSelected = areaDraft === area
                    return (
                      <Button
                        key={area}
                        type="button"
                        size="sm"
                        aria-pressed={isSelected}
                        className={cn(
                          "h-8 text-xs transition-colors",
                          isSelected
                            ? "border-white bg-white font-semibold text-zinc-950 shadow-xs hover:bg-zinc-100 hover:text-zinc-950"
                            : "border-white/15 bg-zinc-950/40 text-zinc-300 hover:border-white/25 hover:bg-white/10 hover:text-white"
                        )}
                        onClick={() => setAreaDraft(area)}
                      >
                        {t(`playbackPlayer.${areaLabelKey(area)}`)}
                      </Button>
                    )
                  })}
                </div>
                <p className="text-xs text-zinc-400">{t("playbackPlayer.danmakuAreaHint")}</p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="playback-danmaku-follow" className="text-zinc-200">
                    {t("playbackPlayer.danmakuFollowScreenLabel")}
                  </Label>
                  <Switch
                    id="playback-danmaku-follow"
                    checked={followScreenDraft}
                    onCheckedChange={setFollowScreenDraft}
                    className="data-[state=unchecked]:bg-white/25"
                  />
                </div>
                <p className="text-xs text-zinc-400">
                  {t("playbackPlayer.danmakuFollowScreenHint")}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="playback-danmaku-size"
                    className={cn(
                      "text-zinc-200",
                      followScreenDraft && "text-zinc-500"
                    )}
                  >
                    {t("playbackPlayer.danmakuSizeLabel")}
                  </Label>
                  <span className="tabular-nums text-xs text-zinc-400">{sizeDraft}%</span>
                </div>
                <Slider
                  id="playback-danmaku-size"
                  min={DANMAKU_SIZE_MIN}
                  max={DANMAKU_SIZE_MAX}
                  step={5}
                  value={[sizeDraft]}
                  disabled={followScreenDraft}
                  onValueChange={(v) =>
                    setSizeDraft(clampDanmakuSize(v[0] ?? DEFAULT_DANMAKU_SIZE))
                  }
                  className="w-full"
                />
                <p className="text-xs text-zinc-400">{t("playbackPlayer.danmakuSizeHint")}</p>
              </div>
            </TabsContent>

            <TabsContent value="overlay" className="mt-0 flex min-h-[240px] flex-col gap-3 outline-none">
              <div className="space-y-2">
                <Label className="text-zinc-200">
                  {t("playbackPlayer.overlayCornerLabel")}
                </Label>
                <div
                  className="grid grid-cols-2 gap-1.5"
                  role="radiogroup"
                  aria-label={t("playbackPlayer.overlayCornerLabel")}
                >
                  {OVERLAY_CORNERS.map((corner) => {
                    const isSelected = overlayCornerDraft === corner
                    return (
                      <Button
                        key={corner}
                        type="button"
                        size="sm"
                        aria-pressed={isSelected}
                        className={cn(
                          "h-8 text-xs transition-colors",
                          corner === "hidden" && "col-span-2",
                          isSelected
                            ? "border-white bg-white font-semibold text-zinc-950 shadow-xs hover:bg-zinc-100 hover:text-zinc-950"
                            : "border-white/15 bg-zinc-950/40 text-zinc-300 hover:border-white/25 hover:bg-white/10 hover:text-white"
                        )}
                        onClick={() => setOverlayCornerDraft(corner)}
                      >
                        {t(`playbackPlayer.${cornerLabelKey(corner)}`)}
                      </Button>
                    )
                  })}
                </div>
                <p className="text-xs text-zinc-400">{t("playbackPlayer.overlayCornerHint")}</p>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
          <p
            className={cn(
              "text-xs",
              settingsDraftInvalid
                ? "text-amber-300"
                : hasPendingSettings
                  ? "text-amber-300"
                  : "text-emerald-300"
            )}
            role="status"
            aria-live="polite"
          >
            {settingsDraftInvalid
              ? t("playbackPlayer.settingsStatusInvalid")
              : hasPendingSettings
                ? t("playbackPlayer.settingsStatusPending")
                : t("playbackPlayer.settingsStatusApplied")}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-zinc-300 hover:bg-white/10 hover:text-white"
              onClick={handleReset}
            >
              {t("playbackPlayer.resetSettings")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={!hasPendingSettings}
            >
              {t("playbackPlayer.applySettings")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

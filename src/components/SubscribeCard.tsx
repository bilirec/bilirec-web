import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RoomCover } from '@/components/RoomCover'
import { PlayIcon, UserIcon, TrashIcon, ArrowSquareOutIcon, ClockIcon, CopySimpleIcon, GearSixIcon, EyeIcon, EyeClosedIcon, type IconWeight } from '@phosphor-icons/react'
import { useTheme } from 'next-themes'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { RoomInfo } from '@/lib/types'
import { useRole } from '@/lib/role-context'
import { getLiveTimeMeta, normalizeText } from '@/lib/utils'
import { RoomConfigDialog } from '@/components/RoomConfigDialog'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

interface SubscribeCardProps {
  roomInfo: RoomInfo
  isRecording?: boolean
  autoRecord?: boolean
  onUnsubscribe: (roomId: number) => Promise<void>
  onStartRecord: (roomId: number) => Promise<void>
}

export function SubscribeCard({ roomInfo, isRecording = false, autoRecord = false, onUnsubscribe, onStartRecord }: SubscribeCardProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { isReadOnly } = useRole()
  const autoRecordEyeWeight: IconWeight = resolvedTheme === 'dark' ? 'duotone' : 'regular'
  const [isLoading, setIsLoading] = useState(false)
  const [isUnsubDialogOpen, setIsUnsubDialogOpen] = useState(false)
  const [isStartRecordDialogOpen, setIsStartRecordDialogOpen] = useState(false)
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false)

  const cleanTitle = normalizeText(roomInfo.title) || t('subscribeCard.loadingTitle')
  const cleanDescription = normalizeText(roomInfo.description)
  const liveTimeMeta = getLiveTimeMeta(roomInfo.live_time)

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(String(roomInfo.room_id))
      toast.success(t('toast.copyRoomIdSuccess', { roomId: roomInfo.room_id }), { position: 'bottom-center' })
    } catch {
      toast.error(t('toast.copyRoomIdFailed'), { position: 'bottom-center' })
    }
  }

  const confirmUnsubscribe = async () => {
    setIsUnsubDialogOpen(false)
    setIsLoading(true)
    try {
      await onUnsubscribe(roomInfo.room_id)
    } finally {
      setIsLoading(false)
    }
  }

  const confirmStartRecord = async () => {
    setIsStartRecordDialogOpen(false)
    setIsLoading(true)
    try {
      await onStartRecord(roomInfo.room_id)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartRecord = () => {
    setIsStartRecordDialogOpen(true)
  }

  const isLive = roomInfo.live_status === 1

  const isAutoRecordSkipped = isLive && !isRecording
  const AutoRecordIcon = isAutoRecordSkipped ? EyeClosedIcon : EyeIcon
  const autoRecordEyeClass = isAutoRecordSkipped
    ? 'text-amber-600 dark:text-amber-300'
    : isLive && isRecording
      ? 'text-teal-600 dark:text-teal-400'
      : 'text-teal-600/80 dark:text-teal-400/80'

  const autoRecordTooltip = !isLive
    ? t('subscribeCard.autoRecordStandby')
    : isRecording
      ? t('subscribeCard.autoRecordActive')
      : t('subscribeCard.autoRecordLiveNotRecording')

  const renderAutoRecordIcon = () => {
    if (!autoRecord) {
      return null
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            className={`relative inline-flex size-4 shrink-0 items-center justify-center leading-none ${autoRecordEyeClass}`}
            aria-label={autoRecordTooltip}
          >
            <AutoRecordIcon size={16} weight={autoRecordEyeWeight} className="block" />
            {isLive && isRecording && (
              <span
                className="absolute -top-px -right-px size-1.5 rounded-full bg-current ring-1 ring-background"
                aria-hidden
              />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{autoRecordTooltip}</TooltipContent>
      </Tooltip>
    )
  }

  const renderOnlineCountRow = (className?: string) => {
    if (roomInfo.online === undefined) {
      return null
    }
    return (
      <div className={className ?? 'flex items-center gap-2 text-sm text-muted-foreground'}>
        <UserIcon size={16} />
        <span className="font-mono" title={t('subscribeCard.onlineCount')}>
          {roomInfo.online.toLocaleString()}
        </span>
      </div>
    )
  }

  const renderStatusRow = (className?: string) => (
    <div className={className ?? 'flex min-h-5 items-center gap-2'}>
      {renderAutoRecordIcon()}
      {getLiveStatusBadge()}
    </div>
  )

  const getLiveStatusBadge = () => {
    if (roomInfo.lock_status === 1) {
      return (
        <Badge variant="destructive">
          {t('subscribeCard.banned')}
        </Badge>
      )
    }
    if (roomInfo.live_status === 1) {
      return (
        <Badge className="relative overflow-visible bg-accent text-accent-foreground">
          {t('subscribeCard.live')}
        </Badge>
      )
    }
    return (
      <Badge variant="secondary">
        {t('subscribeCard.offline')}
      </Badge>
    )
  }

  return (
    <Card className="subscribe-card h-full p-4 transition-all hover:shadow-lg">
      <div className="flex h-full flex-col gap-3">
        <div className="relative grow">
          <div className="flex flex-col sm:flex-row items-start gap-3">
            <RoomCover
              src={roomInfo.cover}
              alt={cleanTitle || roomInfo.uid.toString()}
              className="w-full sm:w-40 shrink-0"
            />

            <div className="flex flex-col flex-1 min-w-0 w-full">
              <div className="flex items-start gap-3 w-full">
                <div className="min-w-0 flex-1">
                  <div className="flex max-w-full items-center gap-1.5">
                    <div className="min-w-0 flex items-center gap-1.5">
                      <p className="font-semibold text-card-foreground truncate max-w-[13.5rem] sm:max-w-[15rem] lg:max-w-[17rem]">
                        {roomInfo.uname ?? t('subscribeCard.roomFallback', { roomId: roomInfo.room_id })}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                        title={t('subscribeCard.copyRoomIdTitle', { roomId: roomInfo.room_id })}
                        aria-label={t('subscribeCard.copyRoomIdAria', { roomId: roomInfo.room_id })}
                        onClick={handleCopyRoomId}
                      >
                        <CopySimpleIcon size={12} />
                      </Button>
                    </div>
                    {!isReadOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-6 shrink-0 rounded-full text-muted-foreground hover:text-foreground sm:hidden"
                        title={t('subscribeCard.roomConfig')}
                        aria-label={t('subscribeCard.roomConfigAria', { roomId: roomInfo.room_id })}
                        onClick={() => setIsConfigDialogOpen(true)}
                      >
                        <GearSixIcon size={12} />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-5 wrap-break-word">
                    {cleanTitle}
                  </p>
                  {liveTimeMeta && roomInfo.live_status === 1 && (
                    <div className="mt-1">
                      <Badge
                        variant="outline"
                        className="border-accent/40 bg-accent/10 text-accent"
                        title={t('subscribeCard.liveStartedAt', { time: liveTimeMeta.title })}
                      >
                        <ClockIcon size={14} weight="bold" />
                        {liveTimeMeta.relativeLabel}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Desktop: Show online count and status badge */}
                <div className="hidden sm:flex flex-col items-end gap-2 ml-2 shrink-0">
                  {renderOnlineCountRow()}
                  {renderStatusRow()}
                </div>
              </div>

              {/* Mobile: online + badge on one row */}
              <div className="sm:hidden flex items-center gap-2 text-sm text-muted-foreground mt-2 w-full justify-between">
                {renderOnlineCountRow('flex items-center gap-2 min-w-0') ?? <span />}

                {renderStatusRow('ml-2 shrink-0 flex items-center gap-2')}
              </div>

              {cleanDescription && (
                <p className="text-sm text-muted-foreground/90 mt-2 line-clamp-2 wrap-break-word whitespace-normal">
                  {cleanDescription}
                </p>
              )}
            </div>
          </div>

          {/* Mobile viewers handled above in single row */}
        </div>

        {/* Action buttons */}
        <div className="subscribe-card-actions flex flex-col sm:flex-row gap-2 w-full mt-auto">
          {roomInfo.live_status === 1 && (
            <>
              <Button
                asChild
                variant="default"
                className="subscribe-card-action-btn w-full sm:flex-1 transition-all hover:shadow-lg"
              >
                <a
                  href={`https://live.bilibili.com/${roomInfo.room_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ArrowSquareOutIcon size={18} />
                  {t('subscribeCard.enterLiveRoom')}
                </a>
              </Button>

              {!isReadOnly && (
              <Button
                onClick={handleStartRecord}
                disabled={isLoading || isRecording}
                className="subscribe-card-action-btn w-full sm:flex-1 transition-all bg-emerald-500 text-white hover:bg-emerald-400 hover:shadow-lg disabled:bg-emerald-500/50"
                variant="default"
              >
                <PlayIcon size={20} />
                {isRecording ? t('subscribeCard.recording') : t('subscribeCard.startRecording')}
              </Button>
              )}
            </>
          )}

          {!isReadOnly && (
            <>
              <Button
                onClick={() => setIsUnsubDialogOpen(true)}
                disabled={isLoading}
                variant="destructive"
                className="subscribe-card-action-btn w-full sm:flex-1 transition-all bg-red-600 text-white hover:bg-red-500 hover:shadow-lg"
              >
                <TrashIcon size={18} />
                {t('subscribeCard.unsubscribe')}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="subscribe-card-gear-desktop hidden sm:inline-flex shrink-0 sm:ml-auto hover:bg-accent hover:text-accent-foreground"
                title={t('subscribeCard.roomConfig')}
                aria-label={t('subscribeCard.roomConfigAria', { roomId: roomInfo.room_id })}
                onClick={() => setIsConfigDialogOpen(true)}
              >
                <GearSixIcon size={16} />
              </Button>
            </>
          )}
        </div>

        <Dialog open={isUnsubDialogOpen} onOpenChange={setIsUnsubDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('subscribeCard.unsubTitle')}</DialogTitle>
              <DialogDescription>
                {t('subscribeCard.unsubDescription', {
                  name: roomInfo.uname ?? t('subscribeCard.roomFallback', { roomId: roomInfo.room_id })
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsUnsubDialogOpen(false)} disabled={isLoading}>
                {t('fileCard.cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmUnsubscribe} disabled={isLoading}>
                {isLoading ? t('subscribeCard.processing') : t('subscribeCard.confirmCancel')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isStartRecordDialogOpen} onOpenChange={setIsStartRecordDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('subscribeCard.startTitle')}</DialogTitle>
              <DialogDescription>
                {t('subscribeCard.startDescription', {
                  name: roomInfo.uname ?? t('subscribeCard.roomFallback', { roomId: roomInfo.room_id })
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsStartRecordDialogOpen(false)} disabled={isLoading}>
                {t('fileCard.cancel')}
              </Button>
              <Button onClick={confirmStartRecord} disabled={isLoading}>
                {isLoading ? t('subscribeCard.processing') : t('subscribeCard.confirmStart')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <RoomConfigDialog
          roomInfo={roomInfo}
          open={isConfigDialogOpen}
          onOpenChange={setIsConfigDialogOpen}
        />
      </div>
    </Card>
  )
}

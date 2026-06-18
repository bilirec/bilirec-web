import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RoomCover } from '@/components/RoomCover'
import { StopIcon, UserIcon, ClockIcon, DatabaseIcon, ArrowSquareOutIcon, CopySimpleIcon } from '@phosphor-icons/react'
import { formatFileSize, formatDuration } from '@/lib/utils'
import type { RecordTask } from '@/lib/types'
import { useRole } from '@/lib/role-context'
import { toast } from 'sonner'

interface RecordCardProps {
  task: RecordTask
  onStop: (roomId: number) => void
}
import { useTranslation } from 'react-i18next'

export function RecordCard({ task, onStop }: RecordCardProps) {
  const { t } = useTranslation()
  const { isReadOnly } = useRole()
  const [isLoading, setIsLoading] = useState(false)
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false)
  const roomId = task.roomInfo?.room_id ?? task.roomId

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(String(roomId))
      toast.success(t('toast.copyRoomIdSuccess', { roomId }), { position: 'bottom-center' })
    } catch {
      toast.error(t('toast.copyRoomIdFailed'), { position: 'bottom-center' })
    }
  }

  const canControlRecording = task.status === 'recording' || task.status === 'recovering'

  const confirmStop = async () => {
    setIsStopDialogOpen(false)
    setIsLoading(true)
    try {
      if (canControlRecording) {
        onStop(task.roomId)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = () => {
    setIsStopDialogOpen(true)
  }

  const getStatusBadge = () => {
    switch (task.status) {
      case 'recording':
        return (
          <Badge className="relative overflow-visible bg-accent text-accent-foreground">
            {t('recordCard.recording')}
            <span className="pointer-events-none absolute -right-1 -top-1 flex size-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
            </span>
          </Badge>
        )
      case 'recovering':
        return (
          <Badge variant="outline" className="border-accent text-accent animate-pulse">
            {t('recordCard.recovering')}
          </Badge>
        )
      case 'idle':
        return (
          <Badge variant="secondary">
            {t('recordCard.idle')}
          </Badge>
        )
    }
  }

  return (
    <Card className="h-full p-4 record-card transition-all hover:shadow-lg">
      <div className="flex h-full flex-col gap-3">
        <div className="relative grow">
          <div className="flex flex-col sm:flex-row items-start gap-3">
            {task.roomInfo?.cover ? (
              <RoomCover
                src={task.roomInfo.cover}
                alt={task.roomInfo.title ?? task.roomInfo.uid.toString()}
                className="w-full sm:w-40 shrink-0"
                fallbackIconSize={20}
              />
            ) : (
              <div className="w-full h-24 sm:w-40 sm:h-24 shrink-0 bg-muted rounded-md flex items-center justify-center p-4">
                <UserIcon size={20} />
              </div>
            )}

            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex max-w-full items-center gap-1.5">
                    <p className="font-semibold text-card-foreground record-title truncate max-w-full">
                      { task.roomInfo?.uname ?? t('recordCard.roomFallback', { roomId: task.roomInfo?.room_id })}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                      title={t('recordCard.copyRoomIdTitle', { roomId })}
                      aria-label={t('recordCard.copyRoomIdAria', { roomId })}
                      onClick={handleCopyRoomId}
                    >
                      <CopySimpleIcon size={12} />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {task.roomInfo?.title || t('recordCard.loadingTitle')}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 ml-2 shrink-0">
                  {task.roomInfo?.online !== undefined && (
                    <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                      <UserIcon size={16} />
                      <span className="font-mono" title={t('recordCard.onlineCount')}>{(task.roomInfo.online ?? 0).toLocaleString()}</span>
                    </div>
                  )}

                  {/* status badge placed here to avoid covering the cover image (hidden on mobile) */}
                  <div className="hidden sm:block">
                    {getStatusBadge()}
                  </div>
                </div>
              </div>

              {task.roomInfo?.description && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-3 wrap-break-word break-all whitespace-normal">
                  {task.roomInfo.description}
                </p>
              )}
            </div>
          </div>

          {/* viewers shown below on mobile */}
          {task.roomInfo?.online !== undefined && (
            <div className="mt-2 sm:hidden flex items-center gap-2 text-sm text-muted-foreground justify-between w-full">
              <div className="flex items-center gap-2">
                <UserIcon size={16} />
                <span className="font-mono" title={t('recordCard.onlineCount')}>{(task.roomInfo.online ?? 0).toLocaleString()}</span>
              </div>

              {/* show badge on mobile row too (aligned right) */}
              <div className="ml-2 shrink-0">
                {getStatusBadge()}
              </div>
            </div>
          )}
        </div>

        {task.status === 'recording' && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            {task.recordedTime !== undefined && (
              <div className="flex items-center gap-2 text-muted-foreground" title={t('recordCard.estimatedDuration')}>
                <ClockIcon size={16} />
                <span className="font-mono">{formatDuration(task.recordedTime)}</span>
              </div>
            )}
            {task.fileSize !== undefined && (
              <div className="flex items-center gap-2 text-muted-foreground" title="預計錄製檔案大小">
                <DatabaseIcon size={16} />
                <span className="font-mono">{formatFileSize(task.fileSize)}</span>
              </div>
            )}
          </div>
        )}

        {task.error && (
          <p className="text-sm text-destructive">
            {task.error}
          </p>
        )}

        {canControlRecording ? (
          <div className="flex flex-col sm:flex-row gap-2 mt-auto">
            <Button
              asChild
              variant="default"
              className="w-full sm:flex-1 transition-all hover:shadow-lg"
            >
              <a
                href={`https://live.bilibili.com/${task.roomInfo?.room_id ?? task.roomId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowSquareOutIcon size={18} />
                {t('recordCard.enterLiveRoom')}
              </a>
            </Button>

            {!isReadOnly && (
            <Button
              onClick={handleStop}
              disabled={isLoading}
              variant="destructive"
              className="w-full sm:w-1/2 transition-all hover:bg-destructive/90 hover:shadow-md hover:ring-1 hover:ring-destructive/30"
            >
              <StopIcon size={20} />
              {t('recordCard.stopRecording')}
            </Button>
            )}
          </div>
        ) : null}

        <Dialog open={isStopDialogOpen} onOpenChange={setIsStopDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('recordCard.stopConfirmTitle')}</DialogTitle>
              <DialogDescription>
                {t('recordCard.stopConfirmDescription', {
                  name: task.roomInfo?.uname ?? t('recordCard.roomFallback', { roomId: task.roomInfo?.room_id ?? task.roomId })
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsStopDialogOpen(false)} disabled={isLoading}>
                {t('fileCard.cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmStop} disabled={isLoading}>
                {isLoading ? t('recordCard.processing') : t('recordCard.confirmStop')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  )
}

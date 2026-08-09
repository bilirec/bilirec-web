import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RecordStartOptions } from '@/components/RecordStartOptions'
import { apiClient } from '@/lib/api'
import type { RoomConfig, RoomInfo } from '@/lib/types'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

interface RoomConfigDialogProps {
  roomInfo: RoomInfo
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoomConfigDialog({ roomInfo, open, onOpenChange }: RoomConfigDialogProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    let isMounted = true

    const loadRoomConfig = async () => {
      setIsLoading(true)
      try {
        const config = await apiClient.getRoomConfig(roomInfo.room_id)
        if (isMounted) {
          setRoomConfig(config)
        }
      } catch (error: any) {
        console.error('Failed to load room config:', error)
        toast.error(error.response?.data || t('roomConfig.loadFailed'), { position: 'bottom-center' })
        if (isMounted) {
          onOpenChange(false)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadRoomConfig()

    return () => {
      isMounted = false
    }
  }, [open, onOpenChange, roomInfo.room_id, t])

  const handleConfigToggle = (key: 'auto_record' | 'notify', checked: boolean) => {
    setRoomConfig((current) => {
      if (!current) {
        return {
          room_id: roomInfo.room_id,
          auto_record: key === 'auto_record' ? checked : false,
          notify: key === 'notify' ? checked : false,
        }
      }

      return {
        ...current,
        [key]: checked,
      }
    })
  }

  const handleSaveConfig = async () => {
    if (!roomConfig) {
      return
    }

    setIsSaving(true)
    try {
      const updatedConfig = await apiClient.updateRoomConfig(roomInfo.room_id, {
        auto_record: roomConfig.auto_record,
        notify: roomConfig.notify,
        record_duration_minutes: roomConfig.record_duration_minutes,
        qn: roomConfig.qn ?? 0,
        only_audio: roomConfig.only_audio ?? false,
        record_danmaku: roomConfig.record_danmaku ?? false,
        stream_profiles: roomConfig.stream_profiles ?? [],
      })
      setRoomConfig(updatedConfig)
      onOpenChange(false)
      toast.success(t('roomConfig.updateSuccess'), { position: 'bottom-center' })
    } catch (error: any) {
      console.error('Failed to update room config:', error)
      toast.error(error.response?.data || t('roomConfig.updateFailed'), { position: 'bottom-center' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-lg">
        <div className="shrink-0 px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle>{t('roomConfig.title')}</DialogTitle>
            <DialogDescription>
              {t('roomConfig.description', { name: roomInfo.uname ?? t('subscribeCard.roomFallback', { roomId: roomInfo.room_id }) })}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-4 px-6 py-4">
            {isLoading || !roomConfig ? (
              <p className="text-sm text-muted-foreground">{t('roomConfig.loading')}</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="space-y-1">
                    <Label htmlFor={`auto-record-${roomInfo.room_id}`}>{t('roomConfig.autoRecord')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('roomConfig.autoRecordHint')}
                    </p>
                  </div>
                  <Switch
                    id={`auto-record-${roomInfo.room_id}`}
                    checked={roomConfig.auto_record}
                    onCheckedChange={(checked) => handleConfigToggle('auto_record', checked)}
                    disabled={isSaving}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="space-y-1">
                    <Label htmlFor={`notify-${roomInfo.room_id}`}>{t('roomConfig.notify')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('roomConfig.notifyHint')}
                    </p>
                  </div>
                  <Switch
                    id={`notify-${roomInfo.room_id}`}
                    checked={roomConfig.notify}
                    onCheckedChange={(checked) => handleConfigToggle('notify', checked)}
                    disabled={isSaving}
                  />
                </div>

                <RecordStartOptions
                  value={{
                    record_duration_minutes: roomConfig.record_duration_minutes,
                    qn: roomConfig.qn,
                    only_audio: roomConfig.only_audio,
                    record_danmaku: roomConfig.record_danmaku,
                    stream_profiles: roomConfig.stream_profiles,
                  }}
                  onChange={(opts) => setRoomConfig((current) => (current ? { ...current, ...opts } : current))}
                  disabled={isSaving}
                  durationHintKey="roomConfig.recordDurationHint"
                />
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-6 py-4">
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading || isSaving}
            >
              {t('roomConfig.cancel')}
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={isLoading || isSaving || !roomConfig}
            >
              {isSaving ? t('roomConfig.saving') : t('roomConfig.save')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

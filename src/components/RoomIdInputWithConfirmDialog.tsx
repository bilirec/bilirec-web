import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RoomCover } from "@/components/RoomCover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PlusIcon, UserIcon } from '@phosphor-icons/react'
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import type { RoomInfo } from '@/lib/types'
import { useTranslation } from 'react-i18next'

interface RoomIdInputWithConfirmDialogProps {
  triggerLabel: string
  inputDialogTitle: string
  confirmDialogTitle: string
  confirmDialogDescription: string
  confirmLabel: string
  confirmLoadingLabel?: string
  confirmExtraContent?: ReactNode
  onConfirmDialogOpen?: () => void
  onConfirm: (roomInfo: RoomInfo) => Promise<void>
}

export function RoomIdInputWithConfirmDialog({
  triggerLabel,
  inputDialogTitle,
  confirmDialogTitle,
  confirmDialogDescription,
  confirmLabel,
  confirmLoadingLabel = '',
  confirmExtraContent,
  onConfirmDialogOpen,
  onConfirm,
}: RoomIdInputWithConfirmDialogProps) {
  const { t } = useTranslation()
  const [roomId, setRoomId] = useState('')
  const [isInputDialogOpen, setIsInputDialogOpen] = useState(false)
  const [isFetchingRoomInfo, setIsFetchingRoomInfo] = useState(false)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [confirmRoomInfo, setConfirmRoomInfo] = useState<RoomInfo | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [skipReopenInputDialog, setSkipReopenInputDialog] = useState(false)

  const handlePrepare = async () => {
    const id = parseInt(roomId.trim())
    if (!roomId.trim() || isNaN(id)) {
      toast.error(t('roomInput.invalidId'))
      return
    }

    setIsFetchingRoomInfo(true)
    try {
      const roomInfo = await apiClient.getRoomInfo(id)
      setConfirmRoomInfo(roomInfo)
      setIsInputDialogOpen(false)
      setSkipReopenInputDialog(false)
      onConfirmDialogOpen?.()
      setIsConfirmDialogOpen(true)
    } catch (error: any) {
      if (error.response?.status === 404) {
        toast.error(t('roomInput.roomNotFound'))
      } else if (error.response?.status === 400) {
        toast.error(t('roomInput.invalidRoomId'))
      } else {
        toast.error(error.response?.data || t('roomInput.fetchFailed'))
      }
    } finally {
      setIsFetchingRoomInfo(false)
    }
  }

  const handleConfirm = async () => {
    if (!confirmRoomInfo) return
    setIsSubmitting(true)
    try {
      await onConfirm(confirmRoomInfo)
      setSkipReopenInputDialog(true)
      setIsConfirmDialogOpen(false)
      setConfirmRoomInfo(null)
      setRoomId('')
    } catch {
      // Error toast is handled by caller.
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmDialogOpenChange = (open: boolean) => {
    setIsConfirmDialogOpen(open)
    if (!open) {
      setConfirmRoomInfo(null)
      if (!skipReopenInputDialog) {
        setIsInputDialogOpen(true)
      }
      setSkipReopenInputDialog(false)
    }
  }

  return (
    <>
      <Dialog open={isInputDialogOpen} onOpenChange={setIsInputDialogOpen}>
        <DialogTrigger asChild>
          <Button size='sm'>
            <PlusIcon size={20} />
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{inputDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className='space-y-4 pt-4'>
            <Input
              type='number'
              placeholder={t('roomInput.inputPlaceholder')}
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePrepare()}
              clearable
              onClear={() => setRoomId('')}
              clearAriaLabel={t('roomInput.cancel')}
            />
            <Button onClick={handlePrepare} className='w-full' disabled={isFetchingRoomInfo}>
              {isFetchingRoomInfo ? t('roomInput.fetching') : t('roomInput.next')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isConfirmDialogOpen} onOpenChange={handleConfirmDialogOpenChange}>
        <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-lg">
          <div className="shrink-0 px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle>{confirmDialogTitle}</DialogTitle>
              <DialogDescription>{confirmDialogDescription}</DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="space-y-3 px-6 py-4">
              {confirmRoomInfo && (
                <>
                  <RoomCover
                    src={confirmRoomInfo.cover}
                    alt={confirmRoomInfo.uname || t('recordCard.roomFallback', { roomId: confirmRoomInfo.room_id })}
                    className='w-full'
                    fallbackIconSize={24}
                  />

                  <div className='space-y-1 text-sm'>
                    <p>
                      <span className='text-muted-foreground'>{t('roomInput.roomIdLabel')}</span>
                      <span className='font-medium'>{confirmRoomInfo.room_id}</span>
                    </p>
                    <p>
                      <span className='text-muted-foreground'>{t('roomInput.streamerLabel')}</span>
                      <span className='font-medium'>{confirmRoomInfo.uname || t('roomInput.unknownStreamer')}</span>
                    </p>
                    <p>
                      <span className='text-muted-foreground'>{t('roomInput.streamTitleLabel')}</span>
                      <span className='font-medium'>{confirmRoomInfo.title || t('roomInput.noTitle')}</span>
                    </p>
                  </div>
                </>
              )}

              {confirmExtraContent}
            </div>
          </div>

          <div className="shrink-0 border-t border-border px-6 py-4">
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => handleConfirmDialogOpenChange(false)}
                disabled={isSubmitting}
              >
                {t('roomInput.cancel')}
              </Button>
              <Button
                type='button'
                onClick={handleConfirm}
                disabled={isSubmitting || !confirmRoomInfo}
              >
                {isSubmitting ? (confirmLoadingLabel || t('roomInput.loadingDefault')) : confirmLabel}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

import { useState, useEffect, useRef } from 'react'
import { RecordCard } from './RecordCard'
import { EmptyState } from './EmptyState'
import { RoomIdInputWithConfirmDialog } from './RoomIdInputWithConfirmDialog'
import { RecordStartOptions } from './RecordStartOptions'
import { apiClient } from '@/lib/api'
import {
  buildStartRecordParams,
  defaultRecordStartConfig,
  type RecordStartConfig,
} from '@/lib/room-config'
import { isNetworkError, markOffline, markOnline } from '@/lib/network-status'
import { toast } from 'sonner'
import type { RecordTask, RoomInfo } from '@/lib/types'
import { LoadingScreen } from './LoadingScreen'
import { usePageVisibility } from '@/hooks/use-visibility'
import { useRole } from '@/lib/role-context'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'

interface RecordsViewProps {
  onRefresh?: () => void
}

export function RecordsView({ onRefresh }: RecordsViewProps) {
  const { t } = useTranslation()
  const { isReadOnly } = useRole()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef(0)
  const isVisible = usePageVisibility()
  const [startConfig, setStartConfig] = useState<RecordStartConfig>(defaultRecordStartConfig)

  const resetRecordStartForm = () => {
    setStartConfig(defaultRecordStartConfig())
  }

  const {
    data: tasks = [],
    error,
    isLoading,
    mutate,
  } = useSWR<RecordTask[]>(
    isVisible ? 'record/tasks' : null,
    async () => {
      const recordTasks = await apiClient.getRecordTasks()
      const roomIds = Array.from(new Set(recordTasks.map((task) => task.roomId)))

      if (roomIds.length === 0) {
        return recordTasks
      }

      const roomInfoMap = await apiClient.getRoomInfos(roomIds)

      return recordTasks.map((task) => ({
        ...task,
        roomInfo: roomInfoMap[String(task.roomId)],
      }))
    },
    {
      refreshInterval: 5000,
      revalidateOnFocus: false,
      fallbackData: [],
      onSuccess: () => markOnline(),
      onError: (err) => {
        if (isNetworkError(err)) {
          markOffline()
        }
      },
    }
  )

  useEffect(() => {
    if (!error || isNetworkError(error)) {
      return
    }
    console.error('Failed to fetch tasks:', error)
    toast.error(t('recordsView.loadError'))
  }, [error, t])

  useEffect(() => {
    if (scrollContainerRef.current && scrollPositionRef.current > 0) {
      scrollContainerRef.current.scrollTop = scrollPositionRef.current
    }
  }, [tasks])

  const handleConfirmRecord = async (roomInfo: RoomInfo) => {
    try {
      await apiClient.startRecord(buildStartRecordParams(roomInfo.room_id, startConfig))
    } catch (error: any) {
      console.error('Failed to start record:', error)
      toast.error(error.response?.data || t('recordsView.startFailed'))
      throw error
    }
    toast.success(t('recordsView.startSuccess'))
    await mutate()
    onRefresh?.()
  }

  const handleStop = async (roomId: number) => {
    try {
      await apiClient.stopRecord(roomId)
      toast.success(t('recordsView.stopSuccess'))
      await mutate()
      onRefresh?.()
    } catch (error: any) {
      console.error('Failed to stop record:', error)
      toast.error(error.response?.data || t('recordsView.stopFailed'))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-background z-10 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">{t('recordsView.title')}</h2>
          {!isReadOnly && (
            <RoomIdInputWithConfirmDialog
              triggerLabel={t('recordsView.add')}
              inputDialogTitle={t('recordsView.addTaskTitle')}
              confirmDialogTitle={t('recordsView.confirmTargetTitle')}
              confirmDialogDescription={t('recordsView.confirmTargetDescription')}
              confirmLabel={t('recordsView.confirmRecord')}
              confirmLoadingLabel={t('recordsView.adding')}
              onConfirmDialogOpen={resetRecordStartForm}
              confirmExtraContent={
                <RecordStartOptions value={startConfig} onChange={setStartConfig} />
              }
              onConfirm={handleConfirmRecord}
            />
          )}
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 pb-20">
        {isLoading ? (
          <LoadingScreen />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            }
            title={t('recordsView.emptyTitle')}
            description={t('recordsView.emptyDescription')}
          />
        ) : (
          <div className="cards-grid grid gap-4">
            {tasks.map((task) => (
              <RecordCard
                key={task.roomId}
                task={task}
                onStop={handleStop}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

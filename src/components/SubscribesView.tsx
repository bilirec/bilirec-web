import { useState, useEffect, useMemo, useRef } from 'react'
import { useGridVirtualizer } from '@/hooks/use-grid-virtualizer'
import { BellIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { SearchBar } from './SearchBar'
import { SubscribeCard } from './SubscribeCard'
import { EmptyState } from './EmptyState'
import { RoomIdInputWithConfirmDialog } from './RoomIdInputWithConfirmDialog'
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import type { RecordInfo, RecordStatus, RoomConfig, RoomInfo } from '@/lib/types'
import { buildStartRecordParams, type RecordStartPrefs } from '@/lib/record-prefs'
import { LoadingScreen } from './LoadingScreen'
import { usePageVisibility } from '@/hooks/use-visibility'
import { useScoredSearch } from '@/hooks/use-scored-search'
import { useRole } from '@/lib/role-context'
import { normalizeText } from '@/lib/utils'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'

const CARD_MIN_WIDTH = 400
const GRID_GAP = 16
const CONTENT_PADDING_X = 32
const ESTIMATED_ROW_HEIGHT = 200
const MAX_COLUMNS = 3

interface SubscribesViewProps {
  onRefresh?: () => void
  pinnedRoomId?: number | null
}

export function SubscribesView({ onRefresh, pinnedRoomId }: SubscribesViewProps) {
  const { t } = useTranslation()
  const { isReadOnly } = useRole()
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef(0)
  const isVisible = usePageVisibility()

  const {
    data: subscribedRoomIds = [],
    error: subscribedRoomsError,
    isLoading: isSubscribedRoomsLoading,
    mutate: mutateSubscribedRoomIds,
  } = useSWR<number[]>(
    isVisible ? 'subscribe/room-ids' : null,
    () => apiClient.getSubscribedRooms(),
    {
      refreshInterval: 5000,
      revalidateOnFocus: false,
      fallbackData: [],
    }
  )

  const roomInfoKey =
    subscribedRoomIds.length > 0 ? `subscribe/details/${subscribedRoomIds.join(',')}` : null

  const {
    data: details = { roomInfos: {}, recordStatuses: [] },
    isLoading: isDetailsLoading,
    mutate: mutateDetails,
  } = useSWR<{ roomInfos: Record<string, RoomInfo>; recordStatuses: RecordInfo[] }>(
    roomInfoKey,
    async () => {
      const [roomInfos, recordStatusesMap] = await Promise.all([
        apiClient.getRoomInfos(subscribedRoomIds),
        apiClient.getRecordStatuses(subscribedRoomIds).catch((): Record<string, RecordStatus> => ({}))
      ])

      const recordStatuses = subscribedRoomIds.map((id) => ({
        room_id: id,
        status: recordStatusesMap[id.toString()] ?? 'idle',
      }))

      return { roomInfos, recordStatuses }
    },
    {
      refreshInterval: 5000,
      revalidateOnFocus: false,
      fallbackData: { roomInfos: {}, recordStatuses: [] },
    }
  )

  const recordingRoomIds = useMemo(
    () => new Set(details.recordStatuses.filter((status) => status.status === 'recording').map((status) => status.room_id)),
    [details.recordStatuses]
  )

  const rooms = useMemo(() => {
    return Object.values(details.roomInfos).sort((a, b) => {
      if (pinnedRoomId !== undefined && pinnedRoomId !== null) {
        if (a.room_id === pinnedRoomId) return -1
        if (b.room_id === pinnedRoomId) return 1
      }
      if (a.live_status === 1 && b.live_status !== 1) return -1
      if (a.live_status !== 1 && b.live_status === 1) return 1
      return 0
    })
  }, [details.roomInfos, pinnedRoomId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim())
    }, 200)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const normalizeSearchText = useMemo(
    () => (value: string) => normalizeText(value).toLowerCase(),
    []
  )

  const roomSearchFields = useMemo(
    () => [
      {
        getValue: (room: RoomInfo) => room.room_id,
        exact: 140,
        startsWith: 90,
        includes: 70,
      },
      {
        getValue: (room: RoomInfo) => room.room_id,
        exact: 140,
        startsWith: 120,
        includes: 100,
        when: (normalizedQuery: string) => /^\d+$/.test(normalizedQuery),
      },
      {
        getValue: (room: RoomInfo) => room.uname,
        exact: 130,
        startsWith: 110,
        includes: 90,
      },
      {
        getValue: (room: RoomInfo) => room.title,
        exact: 80,
        startsWith: 80,
        includes: 60,
      },
      {
        getValue: (room: RoomInfo) => room.description,
        exact: 40,
        startsWith: 40,
        includes: 40,
      },
    ],
    []
  )

  const filteredRooms = useScoredSearch<RoomInfo>({
    items: rooms,
    query: searchQuery,
    fields: roomSearchFields,
    normalize: normalizeSearchText,
    minScore: 1,
  })

  const isLoading = isSubscribedRoomsLoading || (subscribedRoomIds.length > 0 && isDetailsLoading)

  useEffect(() => {
    if (subscribedRoomsError) {
      console.error('Failed to fetch subscribed rooms:', subscribedRoomsError)
      toast.error(t('subscribesView.loadError'))
    }
  }, [subscribedRoomsError, t])

  useEffect(() => {
    if (!scrollContainerRef.current) return
    if (pinnedRoomId != null) {
      scrollContainerRef.current.scrollTop = 0
    } else if (scrollPositionRef.current > 0) {
      scrollContainerRef.current.scrollTop = scrollPositionRef.current
    }
  }, [rooms, pinnedRoomId])

  const { rows, fixedColumnsStyle, rowVirtualizer } = useGridVirtualizer<RoomInfo>({
    scrollContainerRef,
    items: filteredRooms,
    cardMinWidth: CARD_MIN_WIDTH,
    gridGap: GRID_GAP,
    contentPaddingX: CONTENT_PADDING_X,
    estimatedRowHeight: ESTIMATED_ROW_HEIGHT,
    maxColumns: MAX_COLUMNS,
  })

  const handleConfirmSubscribe = async (roomInfo: RoomInfo) => {
    try {
      await apiClient.subscribeRoom(roomInfo.room_id)
    } catch (error: any) {
      console.error('Failed to subscribe room:', error)
      if (error.response?.status === 409) {
        toast.error(t('subscribesView.duplicated'))
      } else if (error.response?.status === 400) {
        toast.error(t('subscribesView.invalidRoom'))
      } else {
        toast.error(error.response?.data || t('subscribesView.subscribeFailed'))
      }
      throw error
    }
    toast.success(t('subscribesView.subscribeSuccess'))
    await mutateSubscribedRoomIds()
    onRefresh?.()
  }

  const handleUnsubscribe = async (roomId: number) => {
    try {
      await apiClient.unsubscribeRoom(roomId)
      toast.success(t('subscribesView.unsubscribeSuccess'))
      await mutateSubscribedRoomIds()
      onRefresh?.()
    } catch (error: any) {
      console.error('Failed to unsubscribe room:', error)
      if (error.response?.status === 404) {
        toast.error(t('subscribesView.notSubscribed'))
      } else {
        toast.error(error.response?.data || t('subscribesView.unsubscribeFailed'))
      }
    }
  }

  const handleStartRecord = async (roomId: number, sessionPrefs?: RecordStartPrefs) => {
    try {
      let config: RoomConfig | null = null
      try {
        config = await apiClient.getRoomConfig(roomId)
      } catch {
        // If config fetch fails, fall back to backend default (no param)
      }
      await apiClient.startRecord(buildStartRecordParams(roomId, config, sessionPrefs))
      await mutateDetails()
      toast.success(t('subscribesView.startSuccess'))
      onRefresh?.()
    } catch (error: any) {
      console.error('Failed to start record:', error)
      toast.error(error.response?.data || t('subscribesView.startFailed'))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-background z-10 p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold shrink-0">{t('subscribesView.title')}</h2>

          <SearchBar
            value={searchInput}
            onChange={setSearchInput}
            placeholder={t('subscribesView.searchPlaceholder')}
            isSearching={searchInput.trim() !== searchQuery}
            searchingLabel={t('subscribesView.searching')}
            searchLabel={t('actions.search')}
            dialogTitle={t('subscribesView.searchAria')}
            ariaLabel={t('subscribesView.searchAria')}
            containerClassName="ml-auto"
            inputWidth="w-[200px] md:w-[280px]"
          />

          {!isReadOnly && (
            <RoomIdInputWithConfirmDialog
              triggerLabel={t('subscribesView.subscribe')}
              inputDialogTitle={t('subscribesView.subscribeTitle')}
              confirmDialogTitle={t('subscribesView.confirmTargetTitle')}
              confirmDialogDescription={t('subscribesView.confirmTargetDescription')}
              confirmLabel={t('subscribesView.confirmSubscribe')}
              confirmLoadingLabel={t('subscribesView.subscribing')}
              onConfirm={handleConfirmSubscribe}
            />
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="p-4 pb-20">
            {isLoading ? (
              <LoadingScreen />
            ) : rooms.length === 0 ? (
              <EmptyState
                icon={
                  <span className="text-muted-foreground">
                    <BellIcon size={40} />
                  </span>
                }
                title={t('subscribesView.emptyTitle')}
                description={t('subscribesView.emptyDescription')}
              />
            ) : filteredRooms.length === 0 ? (
              <EmptyState
                icon={
                  <span className="text-muted-foreground">
                    <MagnifyingGlassIcon size={40} />
                  </span>
                }
                title={t('subscribesView.emptySearchTitle')}
                description={t('subscribesView.emptySearchDescription')}
              />
            ) : (
              <div style={{ height: `${Math.max(0, rowVirtualizer.getTotalSize() - GRID_GAP)}px`, position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom: `${GRID_GAP}px`,
                    }}
                  >
                    <div className="grid gap-4" style={fixedColumnsStyle}>
                      {rows[virtualRow.index].map((room, colIndex) => {
                        if (!room) return <div key={`empty-${virtualRow.index}-${colIndex}`} />
                        const isPinned = room.room_id === pinnedRoomId
                        return (
                          <div
                            key={room.room_id}
                            className={`w-full rounded-lg transition-shadow duration-300 ${
                              isPinned ? 'ring-2 ring-primary shadow-md' : ''
                            }`}
                          >
                            <SubscribeCard
                              roomInfo={room}
                              isRecording={recordingRoomIds.has(room.room_id)}
                              onUnsubscribe={handleUnsubscribe}
                              onStartRecord={handleStartRecord}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

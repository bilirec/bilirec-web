import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useGridVirtualizer } from '@/hooks/use-grid-virtualizer'
import { FileCard } from './FileCard'
import { EmptyState } from './EmptyState'
import { PlaybackPlayerDialog } from '@/components/playback/PlaybackPlayerDialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { SearchBar } from './SearchBar'
import { apiClient } from '@/lib/api'
import { isNetworkError, markOffline, markOnline } from '@/lib/network-status'
import { toast } from 'sonner'
import type { RecordFile, RecordFileListResponse } from '@/lib/types'
import { useTranslation } from 'react-i18next'

type FilesLayoutConfig = {
  pageSize: number
}

const getFilesLayoutConfig = (width: number): FilesLayoutConfig => {
  if (width < 768) {
    return {
      pageSize: 14,
    }
  }

  if (width < 1280) {
    return {
      pageSize: 36,
    }
  }

  return {
    pageSize: 63,
  }
}

function FileCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 h-full w-full">
      <div className="flex h-full gap-3">
        <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
        <div className="flex grow min-w-0 flex-col">
          <div className="mb-2">
            <Skeleton className="h-6 w-2/3" />
          </div>

          <div className="grow" />

          <div className="mb-2">
            <Skeleton className="h-4 w-1/3" />
          </div>

          <div className="flex gap-2">
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}

const getFilesQueryKey = (path: string, search: string, pageSize: number) => [
  'files',
  path,
  search,
  pageSize
] as const

const normalizeList = (items?: RecordFile[]) => {
  return Array.isArray(items)
    ? items.filter((file) => !file.is_dir || file.name !== '..')
    : []
}

const CARD_MIN_WIDTH = 300
const GRID_GAP = 16
const CONTENT_PADDING_X = 32
const ESTIMATED_ROW_HEIGHT = 140

type PlaybackFile = {
  path: string
  name: string
}

export function FilesView() {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [displayFiles, setDisplayFiles] = useState<RecordFile[]>([])
  const [displayTotal, setDisplayTotal] = useState(0)
  const [isSearchTransition, setIsSearchTransition] = useState(false)
  const [layoutConfig, setLayoutConfig] = useState<FilesLayoutConfig>(() =>
    getFilesLayoutConfig(window.innerWidth)
  )
  const [playbackFile, setPlaybackFile] = useState<PlaybackFile | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null)
  const prevPathRef = useRef(currentPath)
  const prevSearchRef = useRef(search)
  const lastAppliedSearchRef = useRef(search)
  const queryClient = useQueryClient()

  useEffect(() => {
    const onResize = () => {
      const next = getFilesLayoutConfig(window.innerWidth)
      setLayoutConfig((prev) => (
        prev.pageSize === next.pageSize
      )
        ? prev
        : next)
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const { pageSize } = layoutConfig

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const queryKey = useMemo(
    () => getFilesQueryKey(currentPath, search, pageSize),
    [currentPath, search, pageSize]
  )

  const {
    data,
    isPending,
    isFetching,
    isFetchingNextPage,
    isSuccess,
    isError,
    error,
    fetchNextPage: fetchNextPageQuery,
    hasNextPage
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 0 }: { pageParam: number }) => {
      const data = await apiClient.getFiles(currentPath, pageParam, pageSize, search)
      return {
        ...data,
        items: normalizeList(data.items)
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: RecordFileListResponse, pages: RecordFileListResponse[]) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    staleTime: 15000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always'
  })

  useEffect(() => {
    void queryClient.invalidateQueries({
      queryKey: ['files', currentPath],
      exact: false,
      refetchType: 'active'
    })
  }, [currentPath, queryClient])

  const { rows, fixedColumnsStyle, rowVirtualizer } = useGridVirtualizer<RecordFile | null>({
    scrollContainerRef,
    items: displayFiles,
    cardMinWidth: CARD_MIN_WIDTH,
    gridGap: GRID_GAP,
    contentPaddingX: CONTENT_PADDING_X,
    estimatedRowHeight: ESTIMATED_ROW_HEIGHT,
  })

  const queryFiles = useMemo(() => {
    if (!data?.pages?.length) return []
    return data.pages.flatMap((page: RecordFileListResponse) => page.items)
  }, [data])

  const queryTotal = useMemo(() => {
    if (!data?.pages?.length) return 0
    return data.pages[0]?.total ?? 0
  }, [data])

  const isInitialLoading = (isPending || isFetching) && displayFiles.length === 0
  const isLoadingMore = isFetchingNextPage
  const isDebouncingSearch = searchInput.trim() !== search
  const isSearching = isDebouncingSearch || isSearchTransition || (isFetching && search.length > 0)

  useEffect(() => {
    const isSearchOnlyChange =
      prevPathRef.current === currentPath &&
      prevSearchRef.current !== search

    if (prevPathRef.current !== currentPath) {
      // Path changed: clear immediately so skeleton can represent new directory load.
      setDisplayFiles([])
      setDisplayTotal(0)
      setIsSearchTransition(false)
    } else if (isSearchOnlyChange && displayFiles.length > 0) {
      // Search changed under same path: keep old items until new result arrives.
      setIsSearchTransition(true)
    }

    prevPathRef.current = currentPath
    prevSearchRef.current = search
  }, [currentPath, search, pageSize, displayFiles.length])

  useEffect(() => {
    if (!isSuccess) return

    if (lastAppliedSearchRef.current !== search) {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      lastAppliedSearchRef.current = search
    }

    setDisplayFiles(queryFiles)
    setDisplayTotal(queryTotal)
    setIsSearchTransition(false)
  }, [isSuccess, queryFiles, queryTotal])

  useEffect(() => {
    if (isSearchTransition && !isFetching && !isDebouncingSearch) {
      setIsSearchTransition(false)
    }
  }, [isSearchTransition, isFetching, isDebouncingSearch])

  useEffect(() => {
    if (isSuccess) {
      markOnline()
    }
  }, [isSuccess])

  useEffect(() => {
    if (!isError) return
    if (isNetworkError(error)) {
      markOffline()
      return
    }
    const err = error as { response?: { data?: string } }
    toast.error(t('filesView.loadError') + (err?.response?.data ? `: ${err.response.data}` : ''))
  }, [isError, error, t])

  const handleFetchNextPage = useCallback(async () => {
    if (isInitialLoading || isLoadingMore || isSearchTransition || !hasNextPage) return
    await fetchNextPageQuery()
  }, [isInitialLoading, isLoadingMore, isSearchTransition, hasNextPage, fetchNextPageQuery])

  useEffect(() => {
    if (!hasNextPage) return

    const root = scrollContainerRef.current
    const target = loadMoreTriggerRef.current
    if (!root || !target) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          void handleFetchNextPage()
        }
      },
      {
        root,
        rootMargin: '0px',
        threshold: 0.01
      }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [handleFetchNextPage, hasNextPage, displayFiles.length, pageSize])

  const handleNavigate = (path: string) => {
    setSearchInput('')
    setSearch('')
    setCurrentPath(path)
  }

  const handlePlayback = useCallback((path: string, name: string) => {
    setPlaybackFile({ path, name })
  }, [])

  const handleBack = () => {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    setSearchInput('')
    setSearch('')
    setCurrentPath(parts.join('/'))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-background z-10 p-4 border-b border-border">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex items-center gap-2">
            {currentPath && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
              >
                <CaretLeftIcon size={20} />
              </Button>
            )}
            <h2 className="text-xl font-bold">{t('filesView.title')}</h2>
          </div>

          <SearchBar
            value={searchInput}
            onChange={setSearchInput}
            placeholder={t('filesView.searchPlaceholder')}
            isSearching={isSearching}
            searchingLabel={t('filesView.searching')}
            searchLabel={t('actions.search')}
            dialogTitle={t('filesView.searchPlaceholder')}
            containerClassName="ml-auto"
            inputWidth="w-[200px] sm:w-[280px]"
          />
        </div>

        {currentPath && (
          <p className="text-sm text-muted-foreground truncate">
            {currentPath}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="p-4 pb-20">
            {isInitialLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-pulse">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full">
                    <svg
                      className="w-8 h-8 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <circle cx="12" cy="12" r="10" strokeWidth="2" />
                      <circle cx="12" cy="12" r="3" fill="currentColor" />
                    </svg>
                  </div>
                </div>
              </div>
            ) : displayFiles.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                }
                title={t('filesView.emptyTitle')}
                description={t('filesView.emptyDescription')}
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
                      {rows[virtualRow.index].map((file, colIndex) => {
                        if (!file) {
                          return hasNextPage
                            ? <FileCardSkeleton key={`row-placeholder-${virtualRow.index}-${colIndex}`} />
                            : <div key={`row-empty-${virtualRow.index}-${colIndex}`} />
                        }

                        return (
                          <FileCard
                            key={file.path}
                            file={file}
                            onNavigate={handleNavigate}
                            onDelete={() => void queryClient.invalidateQueries({ queryKey })}
                            onPlayback={handlePlayback}
                            currentPath={currentPath}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isInitialLoading && displayFiles.length > 0 && hasNextPage && (
              <div ref={loadMoreTriggerRef} className="mt-4" aria-hidden>
                <div className="grid gap-4" style={fixedColumnsStyle}>
                  {Array.from({ length: pageSize }).map((_, index) => (
                    <FileCardSkeleton key={`skeleton-${index}`} />
                  ))}
                </div>
              </div>
            )}

            {!isInitialLoading && displayFiles.length > 0 && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                {t('filesView.loadedCount', { loaded: displayFiles.length, total: displayTotal })}
              </p>
            )}
          </div>
        </div>
      </div>
      {playbackFile ? (
        <PlaybackPlayerDialog
          open
          onOpenChange={(open) => {
            if (!open) setPlaybackFile(null)
          }}
          path={playbackFile.path}
          name={playbackFile.name}
        />
      ) : null}
    </div>
  )
}

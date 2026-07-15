import { useState, useEffect, useRef, useCallback } from 'react'
import { ConvertCard } from './ConvertCard'
import { EmptyState } from './EmptyState'
import { apiClient } from '@/lib/api'
import { isNetworkError, markOffline, markOnline } from '@/lib/network-status'
import { toast } from 'sonner'
import type { ConvertQueue } from '@/lib/types'
import { LoadingScreen } from './LoadingScreen'
import { SwapIcon } from '@phosphor-icons/react'
import { usePageVisibility } from '@/hooks/use-visibility'
import { useTranslation } from 'react-i18next'
export function ConvertsView() {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<ConvertQueue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef(0)
  const isVisible = usePageVisibility()

  const fetchTasks = useCallback(async (isInitial = false) => {
    const scrollContainer = scrollContainerRef.current
    if (scrollContainer && !isInitial) {
      scrollPositionRef.current = scrollContainer.scrollTop
    }
    
    if (isInitial) {
      setIsLoading(true)
    }
    
    try {
      const data = await apiClient.getConvertTasks()
      setTasks(Array.isArray(data) ? data : [])
      markOnline()
    } catch (error: unknown) {
      console.error('Failed to fetch convert tasks:', error)
      if (isNetworkError(error)) {
        markOffline()
      } else {
        toast.error(t('convertsView.loadError'))
      }
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!isVisible) {
      return
    }

    fetchTasks(true)
    const interval = setInterval(() => fetchTasks(false), 5000)
    return () => clearInterval(interval)
  }, [isVisible, fetchTasks])

  useEffect(() => {
    if (scrollContainerRef.current && scrollPositionRef.current > 0) {
      scrollContainerRef.current.scrollTop = scrollPositionRef.current
    }
  }, [tasks])

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-background z-10 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">{t('convertsView.title')}</h2>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 pb-20">
        {isLoading ? (
          <LoadingScreen />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={(
              <span className="text-muted-foreground">
                <SwapIcon size={40} />
              </span>
            )}
            title={t('convertsView.emptyTitle')}
            description={t('convertsView.emptyDescription')}
          />
        ) : (
          <div className="space-y-3">
            {tasks.map((t) => (
              <ConvertCard key={t.task_id} task={t} onCancel={fetchTasks} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

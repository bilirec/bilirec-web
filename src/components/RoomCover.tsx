import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { ImageIcon } from '@phosphor-icons/react'

interface RoomCoverProps {
  src?: string
  alt?: string
  className?: string
  imageClassName?: string
  fallbackIconSize?: number
}

export function RoomCover({
  src,
  alt,
  className,
  imageClassName,
  fallbackIconSize = 20,
}: RoomCoverProps) {
  const [isImageLoaded, setIsImageLoaded] = useState(false)

  useEffect(() => {
    setIsImageLoaded(false)
  }, [src])

  if (!src) {
    return (
      <div className={cn('flex items-center justify-center bg-muted rounded-md', className)}>
        <ImageIcon size={fallbackIconSize} />
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden bg-muted/40 dark:bg-muted/30 rounded-md aspect-video', className)}>
      {!isImageLoaded && (
        <div role="status" className="absolute inset-0 flex items-center justify-center animate-pulse">
          <Skeleton className="absolute inset-0" />
          <ImageIcon size={24} className="relative text-gray-700" />
          <span className="sr-only">Loading...</span>
        </div>
      )}
      <img
        src={src}
        alt={alt ?? ''}
        referrerPolicy="no-referrer"
        onLoad={() => setIsImageLoaded(true)}
        onError={() => setIsImageLoaded(true)}
        className={cn(
          'w-full h-auto object-contain transition-opacity duration-200',
          imageClassName,
          isImageLoaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}

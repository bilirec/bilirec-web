import { useCallback, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { DanmakuVideoPlayer } from "@/components/playback/DanmakuVideoPlayer"
import { apiClient } from "@/lib/api"
import { cn } from "@/lib/utils"

interface PlaybackPlayerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Relative path under recordings root, e.g. room/file.mp4 */
  path: string
  /** Display name for a11y */
  name: string
}

export function PlaybackPlayerDialog({ open, onOpenChange, path, name }: PlaybackPlayerDialogProps) {
  const playbackUrl = apiClient.getPlaybackUrl(path)
  // The chat panel reports whether it took the extended side-column form so the
  // dialog can widen instead of shrinking the video area. Width classes must
  // stay literal for Tailwind extraction (1664px = 1280px video + 320px panel).
  const [chatPanelExtended, setChatPanelExtended] = useState(false)
  const handleChatPanelExtended = useCallback((extended: boolean) => {
    setChatPanelExtended(extended)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[min(100dvh,100vh)] max-h-dvh w-screen max-w-[100vw] translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 shadow-none transition-[width,max-width] duration-200 ease-out sm:h-[min(92dvh,920px)] sm:max-h-[92dvh] sm:rounded-lg sm:border",
          chatPanelExtended
            ? "sm:w-[min(96vw,1664px)] sm:max-w-[min(96vw,1664px)]"
            : "sm:w-[min(96vw,1280px)] sm:max-w-[min(96vw,1280px)]",
          "[&>button]:inline-flex [&>button]:items-center [&>button]:justify-center [&>button]:p-0 [&>button]:text-white [&>button]:hover:bg-white/10 [&>button]:top-2 [&>button]:right-2 [&>button]:z-50 max-sm:[&>button]:size-11 max-sm:[&>button>svg]:size-6! sm:[&>button]:size-8"
        )}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{name}</DialogTitle>
        {open ? (
          <DanmakuVideoPlayer
            key={path}
            playbackUrl={playbackUrl}
            videoPath={path}
            fileName={name}
            onChatPanelExtendedChange={handleChatPanelExtended}
            className="min-h-0 flex-1 pt-8 sm:pt-0"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
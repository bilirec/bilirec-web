import { useCallback, useEffect, useState } from "react"
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

interface PlaybackMedia {
  url: string
  /** Presigned URLs expire and need renewal; cookie URLs do not. */
  presigned: boolean
  /** Epoch ms when the presigned token expires (0 when unknown). */
  expiresAtMs: number
}

export function PlaybackPlayerDialog({ open, onOpenChange, path, name }: PlaybackPlayerDialogProps) {
  // The chat panel reports whether it took the extended side-column form so the
  // dialog can widen instead of shrinking the video area. Width classes must
  // stay literal for Tailwind extraction (1664px = 1280px video + 320px panel).
  const [chatPanelExtended, setChatPanelExtended] = useState(false)
  const handleChatPanelExtended = useCallback((extended: boolean) => {
    setChatPanelExtended(extended)
  }, [])

  // Prefer a presigned playback URL (works through CDN pulls and external
  // players that replay the URL without cookies). Fall back to the
  // cookie-authenticated URL on backends without presigned playback.
  const [media, setMedia] = useState<PlaybackMedia | null>(null)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMedia(null)
    apiClient
      .mintPlaybackUrl(path)
      .then((minted) => {
        if (cancelled) return
        if (minted) {
          setMedia({ url: minted.url, presigned: true, expiresAtMs: minted.expiresAtMs })
        } else {
          setMedia({ url: apiClient.getPlaybackUrl(path), presigned: false, expiresAtMs: 0 })
        }
      })
      .catch(() => {
        if (!cancelled) setMedia({ url: apiClient.getPlaybackUrl(path), presigned: false, expiresAtMs: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [open, path])

  const renewPlaybackUrl = useCallback(async (): Promise<{ url: string; expiresAtMs: number } | null> => {
    const minted = await apiClient.mintPlaybackUrl(path)
    if (!minted) return null
    return { url: minted.url, expiresAtMs: minted.expiresAtMs }
  }, [path])

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
        {open && media ? (
          <DanmakuVideoPlayer
            key={path}
            playbackUrl={media.url}
            renewPlaybackUrl={media.presigned ? renewPlaybackUrl : undefined}
            playbackExpiresAtMs={media.presigned ? media.expiresAtMs : 0}
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

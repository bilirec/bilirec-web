import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { MoreVerticalIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { DownloadSimpleIcon, FileTextIcon, FileVideoIcon, FolderIcon, TrashSimpleIcon, ShareNetworkIcon, SwapIcon, EyeIcon } from '@phosphor-icons/react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select' 
import { formatFileSize, isConvertibleVideoFile, isDanmakuSidecarFile } from '@/lib/utils'
import type { RecordFile } from '@/lib/types'
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '../lib/utils';
import { useRole } from '@/lib/role-context'
import { useTranslation } from 'react-i18next'
import { PreviewPlayerDialog } from '@/components/preview/PreviewPlayerDialog'

interface FileCardProps {
  file: RecordFile
  onNavigate?: (fileName: string) => void
  onDelete?: () => void
  currentPath?: string
}

export function FileCard({ file, onNavigate, onDelete, currentPath = '' }: FileCardProps) {
  const { t } = useTranslation()
  const { isReadOnly } = useRole()
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [isSharing, setIsSharing] = useState(false)

  // Normalize incoming file shape and guard against missing data
  const name = typeof file.name === 'string' ? file.name : t('fileCard.unnamed')
  const isDir = 'is_dir' in file ? !!(file as any).is_dir : !!(file as any).isDir
  const sizeVal = typeof file.size === 'number' ? file.size : Number((file as any).size) || 0
  const extension = file.name.split('.').pop()?.toUpperCase()
  const isMp4 = extension?.toLowerCase() === 'mp4'
  const isDanmakuSidecar = isDanmakuSidecarFile(name)
  const canConvert = isConvertibleVideoFile(name)

  const isRecording = 'is_recording' in file ? !!(file as any).is_recording : false

  const fullPath = currentPath ? `${currentPath}/${name}` : name

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteTargetIsDir, setDeleteTargetIsDir] = useState(false)

  const openDeleteDialog = (directory = false) => {
    setDeleteTargetIsDir(directory)
    setIsDeleteDialogOpen(true)
  }

  const performDelete = async (directory = false) => {
    // Guard: prevent deleting while file is currently recording
    if (isRecording) {
      setIsDeleteDialogOpen(false)
      toast.error(t('fileCard.inRecordingDeleteBlocked'))
      return
    }

    setIsDeleteDialogOpen(false)
    setIsDeleting(true)
    try {
      if (directory) {
        await apiClient.deleteDir(fullPath)
      } else {
        await apiClient.deleteFiles([fullPath])
      }
      toast.success(t('fileCard.deleteSuccess'))
      onDelete?.()
    } catch (error: any) {
      console.error('Delete failed:', error)
      toast.error(t('fileCard.deleteFailed') + (error.response?.data ? `: ${error.response.data}` : ''))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDownload = async () => {
    if (isDir) {
      const path = currentPath ? `${currentPath}/${name}` : name
      onNavigate?.(path)
      return
    }

    if (isRecording) {
      toast.error(t('fileCard.inRecordingDownloadBlocked'))
      return
    }

    setIsDownloading(true)

    try {
      const fullPath = currentPath ? `${currentPath}/${name}` : name
      await apiClient.downloadFile(fullPath, { suggestedName: name })
      // Let the browser handle the download/navigation
      toast.info(t('fileCard.downloading'))
    } catch (error: any) {
      console.error('Download failed:', error)
      if (error?.name === 'AbortError') {
        toast.warning(t('fileCard.downloadCanceled'))
      } else {
        toast.error(t('fileCard.downloadFailed') + (error.response?.data ? `: ${error.response?.data}` : error?.message ? `: ${error.message}` : ''))
      }
    } finally {
      setIsDownloading(false)
    }
  }

  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const handlePreview = () => {
    if (isDir) return

    if (isRecording) {
      toast.error(t('fileCard.inRecordingPreviewBlocked'))
      return
    }

    setIsPreviewOpen(true)
  }

  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false)
  const [deleteSourceAfterConvert, setDeleteSourceAfterConvert] = useState(false)
  const [convertFormat, setConvertFormat] = useState<string>('mp4')
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [shareTtl, setShareTtl] = useState<string>('3600')

  const openConvertDialog = () => {
    if (isDir || !canConvert) {
      toast.error(t('fileCard.convertNotSupported'))
      return
    }

    if (isRecording) {
      toast.error(t('fileCard.inRecordingConvertBlocked'))
      return
    }

    // default: do not delete source unless user checks
    setDeleteSourceAfterConvert(false)
    setConvertFormat('mp4')
    setIsConvertDialogOpen(true)
  }

  const confirmConvert = async () => {
    setIsConvertDialogOpen(false)
    setIsConverting(true)
    try {
      const fullPath = currentPath ? `${currentPath}/${name}` : name
      await apiClient.enqueueConvertTask(fullPath, deleteSourceAfterConvert, convertFormat)
      toast.success(t('fileCard.enqueueConvertSuccess'))
    } catch (error: any) {
      console.error('Enqueue convert failed:', error)
      toast.error(t('fileCard.enqueueConvertFailed') + (error.response?.data ? `: ${error.response?.data}` : ''))
    } finally {
      setIsConverting(false)
    }
  }
  const openShareDialog = () => {
    if (isRecording) {
      toast.error(t('fileCard.inRecordingShareBlocked'))
      return
    }

    setShareTtl('3600')
    setIsShareDialogOpen(true)
  }

  const handleShare = async () => {
    setIsShareDialogOpen(false)
    const selectedTtl = Number(shareTtl)

    setIsSharing(true)
    try {
      const fullPath = currentPath ? `${currentPath}/${name}` : name
      const shareInfo = await apiClient.shareFile(fullPath, selectedTtl)
      const expiresIn = Number(shareInfo.expires_in)
      const durationLabel = expiresIn === 3600
        ? t('fileCard.shareExpire1h')
        : expiresIn === 21600
          ? t('fileCard.shareExpire6h')
          : expiresIn === 86400
            ? t('fileCard.shareExpire24h')
            : t('fileCard.shareExpireSeconds', { seconds: expiresIn })
      
      // Copy URL to clipboard
      await navigator.clipboard.writeText(shareInfo.url)
      toast.success(t('fileCard.shareLinkCopied', { duration: durationLabel }))
    } catch (error: any) {
      console.error('Share failed:', error)
      toast.error(t('fileCard.shareFailed') + (error.response?.data ? `: ${error.response.data}` : ''))
    } finally {
      setIsSharing(false)
    }
  }

  
  if (isDir) {
    const path = currentPath ? `${currentPath}/${name}` : name

    const handleOpenFolder = () => {
      onNavigate?.(path)
    }

    return (
      <Card
        className="h-full w-full p-4 file-card cursor-pointer transition-all hover:shadow-lg"
        role="button"
        tabIndex={0}
        onClick={handleOpenFolder}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleOpenFolder()
          }
        }}
        aria-label={t('fileCard.openFolderAria', { name })}
        title={t('fileCard.openFolderTitle')}
      >
        <div className="flex h-full gap-3">
          <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-secondary-foreground">
            <FolderIcon weight="fill" size={24} />
          </div>

          <div className="flex grow min-w-0 flex-col">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-card-foreground file-name leading-6">
                  {name}
                </p>
              </div>
            </div>

            <div className="grow" />

            <div className="mb-2 min-w-0 text-xs text-muted-foreground">
              <p className="font-mono">{t('fileCard.folderLabel')}</p>
            </div>

            <div className="flex gap-2">
              {!isReadOnly && (
              <Button
                size="sm"
                variant="destructive"
                className={cn("flex-1", isDeleting ? 'cursor-wait' : '')}
                disabled={isDeleting}
                onClick={(e) => {
                  e.stopPropagation()
                  openDeleteDialog(true)
                }}
                aria-label={t('fileCard.deleteFolderAria', { name })}
                title={t('fileCard.delete')}
              >
                <span className={isDeleting ? 'animate-ping' : ''} aria-hidden>
                  <TrashSimpleIcon size={16} />
                </span>
                <span>{isDeleting ? t('fileCard.deleting') : t('fileCard.delete')}</span>
              </Button>
              )}
            </div>
          </div>
        </div>

        {/* Delete confirmation dialog for folders */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>{t('fileCard.confirmDeleteTitle')}</DialogTitle>
              <DialogDescription>{deleteTargetIsDir ? t('fileCard.confirmDeleteFolder', { name }) : t('fileCard.confirmDeleteFile', { name })}</DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="ghost" onClick={(e) => { e.stopPropagation(); setIsDeleteDialogOpen(false) }}>{t('fileCard.cancel')}</Button>
              <Button variant="destructive" onClick={(e) => { e.stopPropagation(); performDelete(deleteTargetIsDir) }} disabled={isDeleting}>{isDeleting ? t('fileCard.deleting') : t('fileCard.confirmDelete')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    )
  }

  return (
    <Card className="h-full p-4 file-card transition-all hover:shadow-lg">
      <div className="flex h-full gap-3">
        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-secondary-foreground">
          {isDanmakuSidecar ? (
            <FileTextIcon weight="fill" size={24} />
          ) : (
            <FileVideoIcon weight="fill" size={24} />
          )}
        </div>

        <div className="flex grow min-w-0 flex-col">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-card-foreground file-name wrap-break-word line-clamp-2 leading-6">
                {name}
              </p>
              <p className="mt-1 break-all text-[11px] text-muted-foreground/70">
                {file.path ?? '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">
                {extension}
              </Badge>
              {isRecording && (
                <Badge variant="destructive" className="shrink-0">
                  {t('fileCard.recordingBadge')}
                </Badge>
              )}
            </div>
          </div>

          <div className="grow" />

          <div className="mb-2 min-w-0 text-xs text-muted-foreground">
            <p className="font-mono">{sizeVal ? formatFileSize(sizeVal) : '—'}</p>
          </div>

          <div className="flex flex-col gap-2 w-full mt-1">
            <div className="flex gap-2">
              <Button
                size="sm"
                className={cn("flex-1 relative overflow-hidden", isDownloading ? 'cursor-wait' : '')}
                disabled={isDownloading || isRecording || isDeleting}
                onClick={handleDownload}
                title={isRecording ? t('fileCard.inRecordingDownloadBlocked') : undefined}
                aria-disabled={isRecording || isDownloading || isDeleting}
              >
                <span className={isDownloading ? 'animate-ping relative z-10' : 'relative z-10'} aria-hidden>
                  <DownloadSimpleIcon size={16} />
                </span>
                <span className="relative z-10">
                  {isRecording ? t('fileCard.recordingBadge') : isDownloading ? t('fileCard.downloadingLabel') : t('fileCard.download')}
                </span>
              </Button>

              {/* Desktop actions: show preview (mp4), share, convert (ts/fmp4/flv) & delete on sm+ */}
              <div className="hidden sm:flex items-center gap-2">
                {isMp4 && (
                  <Button
                    size="icon"
                    variant="outline"
                    className={cn("p-2 rounded-md h-8 w-8 flex items-center justify-center shrink-0")}
                    disabled={isRecording || isDeleting || isDownloading}
                    onClick={handlePreview}
                    aria-label={t('fileCard.previewAria', { name })}
                    title={isRecording ? t('fileCard.inRecordingPreviewBlocked') : t('fileCard.preview')}
                  >
                    <EyeIcon size={16} />
                  </Button>
                )}
                {canConvert && !isReadOnly && (
                  <Button
                    size="icon"
                    variant="outline"
                    className={cn("p-2 rounded-md h-8 w-8 flex items-center justify-center shrink-0", isConverting ? 'cursor-wait' : '')}
                    disabled={isConverting || isDownloading || isDeleting || isRecording}
                    onClick={openConvertDialog}
                    aria-label={t('fileCard.convertAria', { name })}
                    title={isConverting ? t('fileCard.converting') : t('fileCard.convert')}
                  >
                    <span className={isConverting ? 'animate-ping' : ''} aria-hidden>
                      <SwapIcon size={16} />
                    </span>
                  </Button>
                )}
                {/* Hide share button while recording or downloading */}
                {!isRecording && !isDownloading && (
                  <Button
                    size="icon"
                    variant="outline"
                    className={cn("p-2 rounded-md h-8 w-8 flex items-center justify-center", isSharing ? 'cursor-wait' : '')}
                    disabled={isSharing || isDeleting}
                    onClick={openShareDialog}
                    aria-label={t('fileCard.shareFileAria', { name })}
                    title={isSharing ? t('fileCard.shareGenerating') : t('fileCard.share')}
                  >
                    <span className={isSharing ? 'animate-ping' : ''} aria-hidden>
                      <ShareNetworkIcon size={16} />
                    </span>
                  </Button>
                )}
                {!isReadOnly && !isRecording && (
                  <Button
                    size="icon"
                    variant="destructive-ghost"
                    className={cn("p-2 rounded-md h-8 w-8 flex items-center justify-center", isDeleting ? 'opacity-50 pointer-events-none' : '')}
                    disabled={isDeleting || isDownloading}
                    onClick={() => { if (!isDownloading) { openDeleteDialog(false); } }}
                    aria-label={isDownloading ? t('fileCard.downloadInProgress') : t('fileCard.deleteFileAria', { name })}
                    title={isDownloading ? t('fileCard.downloadInProgress') : t('fileCard.delete')}
                  >
                    <span className={isDeleting ? 'animate-ping' : ''} aria-hidden>
                      <TrashSimpleIcon size={16} />
                    </span>
                  </Button>
                )} 
              </div>

              {/* Mobile: three-dots menu */}
              <div className="sm:hidden flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn("p-2 rounded-md h-8 w-8 flex items-center justify-center", (isDeleting || isRecording) ? 'opacity-50 pointer-events-none' : '')}
                      disabled={isDeleting || isRecording || isDownloading}
                      aria-label={t('fileCard.moreActions')}
                    >
                      <MoreVerticalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isMp4 && (
                      <DropdownMenuItem onSelect={() => { handlePreview(); }} disabled={isDeleting || isDownloading || isRecording}>
                        {t('fileCard.preview')}
                      </DropdownMenuItem>
                    )}
                    {/* Show share item only when not recording or downloading */}
                    {!isRecording && !isDownloading && (
                      <DropdownMenuItem onSelect={() => { openShareDialog(); }} disabled={isSharing || isDeleting}>
                        {isSharing ? t('fileCard.shareGeneratingLong') : t('fileCard.share')}
                      </DropdownMenuItem>
                    )}
                    {canConvert && !isReadOnly && (
                      <DropdownMenuItem onSelect={() => { openConvertDialog(); }} disabled={isConverting || isDownloading || isDeleting || isRecording}>
                        {isConverting ? t('fileCard.converting') : t('fileCard.convert')}
                      </DropdownMenuItem>
                    )}
                    {!isReadOnly && !isRecording && (
                      <DropdownMenuItem variant="destructive" onSelect={() => { if (!isDownloading) { openDeleteDialog(false); } }} disabled={isDeleting || isDownloading}>
                        {t('fileCard.delete')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

            </div>

            {/* Convert confirmation dialog */}
            <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('fileCard.convertConfirmTitle')}</DialogTitle>
                  <DialogDescription>{t('fileCard.convertConfirmDescription', { name, format: convertFormat.toUpperCase() })}</DialogDescription>
                </DialogHeader>

                <div className="mt-3">
                  <span className="text-sm">{t('fileCard.outputFormat')}</span>
                  <div className="mt-2">
                    <Select value={convertFormat} onValueChange={(v) => setConvertFormat(v)}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="MP4" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mp4">MP4</SelectItem>
                        {/* <SelectItem value="mkv" disabled>MKV (coming soon)</SelectItem> */}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <Checkbox checked={deleteSourceAfterConvert} onCheckedChange={(v) => setDeleteSourceAfterConvert(!!v)} />
                  <div className="flex flex-col">
                    <span className="text-sm">{t('fileCard.deleteSourceAfterConvert')}</span>
                    <span className="text-xs text-muted-foreground">{t('fileCard.keepSourceHint')}</span>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsConvertDialogOpen(false)}>{t('fileCard.cancel')}</Button>
                  <Button onClick={confirmConvert} disabled={isConverting}>{isConverting ? t('fileCard.convertRunning', { format: convertFormat.toUpperCase() }) : t('fileCard.confirmConvert', { format: convertFormat.toUpperCase() })}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Share confirmation dialog */}
            <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('fileCard.shareConfirmTitle')}</DialogTitle>
                  <DialogDescription>{t('fileCard.shareConfirmDescription', { name })}</DialogDescription>
                </DialogHeader>

                <div className="mt-3">
                  <span className="text-sm">{t('fileCard.shareExpireLabel')}</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant={shareTtl === '3600' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 sm:flex-none border"
                      onClick={() => setShareTtl('3600')}
                      disabled={isSharing}
                    >
                      {t('fileCard.shareExpire1h')}
                    </Button>
                    <Button
                      variant={shareTtl === '21600' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 sm:flex-none border"
                      onClick={() => setShareTtl('21600')}
                      disabled={isSharing}
                    >
                      {t('fileCard.shareExpire6h')}
                    </Button>
                    <Button
                      variant={shareTtl === '86400' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 sm:flex-none border"
                      onClick={() => setShareTtl('86400')}
                      disabled={isSharing}
                    >
                      {t('fileCard.shareExpire24h')}
                    </Button>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsShareDialogOpen(false)}>{t('fileCard.cancel')}</Button>
                  <Button onClick={handleShare} disabled={isSharing}>{isSharing ? t('fileCard.shareGenerating') : t('fileCard.confirmShare')}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete confirmation dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('fileCard.confirmDeleteTitle')}</DialogTitle>
                  <DialogDescription>{deleteTargetIsDir ? t('fileCard.confirmDeleteFolder', { name }) : t('fileCard.confirmDeleteFile', { name })}</DialogDescription>
                </DialogHeader>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>{t('fileCard.cancel')}</Button>
                  <Button variant="destructive" onClick={() => performDelete(deleteTargetIsDir)} disabled={isDeleting}>{isDeleting ? t('fileCard.deleting') : t('fileCard.confirmDelete')}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {isMp4 ? (
              <PreviewPlayerDialog
                open={isPreviewOpen}
                onOpenChange={setIsPreviewOpen}
                path={fullPath}
                name={name}
              />
            ) : null}

          </div>
        </div>
      </div>
    </Card>
  )
} 

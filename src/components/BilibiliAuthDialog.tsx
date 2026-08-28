import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowSquareOutIcon, CircleNotchIcon, CopyIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { usePageVisibility } from '@/hooks/use-visibility'
import { apiClient } from '@/lib/api'
import type { BilibiliAuthInitResponse, BilibiliAuthStatus } from '@/lib/types'

type MobileLoginMode = 'app' | 'qr'

interface BilibiliAuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialStatus: BilibiliAuthStatus | null
  onStatusChange: (status: BilibiliAuthStatus | null) => void
  onControllerUnsupported: () => void
}

const AWAITING_STATES = new Set(['awaiting_qr', 'authenticating'])
const CONFIRM_DONE_DELAY_MS = 15_000

function isUnsupportedStatus(statusCode: number | undefined) {
  return statusCode === 400 || statusCode === 404 || statusCode === 403
}

function DesktopQrPanel({
  qrUrl,
  qrImageUrl,
  qrLinkLabel,
}: {
  qrUrl: string
  qrImageUrl: string
  qrLinkLabel: string
}) {
  return (
    <div className="flex justify-center">
      <a href={qrUrl} target="_blank" rel="noreferrer" className="inline-block">
        <img
          src={qrImageUrl}
          alt={qrLinkLabel}
          referrerPolicy="no-referrer"
          className="size-56 rounded-md border border-border bg-white object-contain p-2"
          loading="lazy"
        />
      </a>
    </div>
  )
}

function MobileLoginPanel({
  qrUrl,
  showConfirmDone,
  isChecking,
  onOpenedClient,
  onCheckDone,
}: {
  qrUrl: string
  showConfirmDone: boolean
  isChecking: boolean
  onOpenedClient: () => void
  onCheckDone: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-foreground">
          <li>{t('bilibiliAuth.mobileStepOpen')}</li>
          <li>{t('bilibiliAuth.mobileStepReturn')}</li>
          <li>{t('bilibiliAuth.mobileStepAuto')}</li>
        </ol>
      </div>

      <Button asChild className="w-full">
        <a href={qrUrl} target="_blank" rel="noreferrer" onClick={onOpenedClient}>
          <ArrowSquareOutIcon data-icon="inline-start" />
          {t('bilibiliAuth.openScanLink')}
        </a>
      </Button>

      {showConfirmDone ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isChecking}
          aria-busy={isChecking}
          onClick={onCheckDone}
        >
          {isChecking ? (
            <>
              <CircleNotchIcon className="animate-spin" data-icon="inline-start" />
              {t('bilibiliAuth.confirmChecking')}
            </>
          ) : (
            t('bilibiliAuth.confirmDone')
          )}
        </Button>
      ) : null}
    </div>
  )
}

function MobileQrPanel({
  qrImageUrl,
  qrLinkLabel,
  onCopyLink,
}: {
  qrImageUrl: string
  qrLinkLabel: string
  onCopyLink: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">
        <img
          src={qrImageUrl}
          alt={qrLinkLabel}
          referrerPolicy="no-referrer"
          className="size-40 rounded-md border border-border bg-white object-contain p-2"
          loading="lazy"
        />
      </div>

      <Button type="button" variant="outline" className="w-full" onClick={onCopyLink}>
        <CopyIcon data-icon="inline-start" />
        {t('bilibiliAuth.copyLoginLink')}
      </Button>
    </div>
  )
}

export function BilibiliAuthDialog({
  open,
  onOpenChange,
  initialStatus,
  onStatusChange,
  onControllerUnsupported,
}: BilibiliAuthDialogProps) {
  const { t } = useTranslation()
  const isVisible = usePageVisibility()
  const [status, setStatus] = useState<BilibiliAuthStatus | null>(initialStatus)
  const [qrUrl, setQrUrl] = useState(initialStatus?.qr?.url ?? '')
  const [isStarting, setIsStarting] = useState(false)
  const [hasOpenedClient, setHasOpenedClient] = useState(false)
  const [showConfirmDone, setShowConfirmDone] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [mobileMode, setMobileMode] = useState<MobileLoginMode>('app')
  const statusRef = useRef(status)
  const qrUrlRef = useRef(qrUrl)
  const isCheckingRef = useRef(false)
  const openedClientAtRef = useRef<number | null>(null)
  const wasVisibleRef = useRef(isVisible)

  statusRef.current = status
  qrUrlRef.current = qrUrl

  const syncStatus = (next: BilibiliAuthStatus | BilibiliAuthInitResponse | null) => {
    if (!next) {
      setStatus(null)
      setQrUrl('')
      onStatusChange(null)
      return
    }

    const isFullStatus = 'state' in next
    const prev = statusRef.current
    const prevQrUrl = qrUrlRef.current
    const nextAccount = isFullStatus ? next.account ?? prev?.account : prev?.account
    const nextQrUrl = isFullStatus
      ? next.qr?.url ?? ''
      : next.qr?.url ?? prevQrUrl

    setQrUrl(nextQrUrl)

    const merged: BilibiliAuthStatus = {
      authenticated: isFullStatus ? next.authenticated : prev?.authenticated ?? false,
      state: isFullStatus
        ? next.state
        : next.error
          ? 'failed'
          : nextQrUrl
            ? 'awaiting_qr'
            : prev?.state ?? 'idle',
      lastError: isFullStatus ? next.lastError : next.error,
      ...(nextAccount ? { account: nextAccount } : {}),
      ...(nextQrUrl ? { qr: { url: nextQrUrl } } : {}),
    }

    setStatus(merged)
    onStatusChange(merged)
  }

  const qrImageUrl = qrUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrUrl)}`
    : ''
  const isExpired = status?.state === 'qr_expired'
  const statusMessage = isExpired ? t('bilibiliAuth.qrExpired') : status?.lastError
  const isAwaiting = Boolean(status && AWAITING_STATES.has(status.state))
  const showLoginContent = !isStarting && !isExpired && Boolean(qrUrl)

  const resetSessionUi = () => {
    setHasOpenedClient(false)
    setShowConfirmDone(false)
    setMobileMode('app')
    openedClientAtRef.current = null
  }

  const startAuth = async () => {
    setIsStarting(true)
    resetSessionUi()
    try {
      const next = await apiClient.initBilibiliAuth()
      syncStatus(next)
    } catch (error: any) {
      if (isUnsupportedStatus(error?.response?.status)) {
        onControllerUnsupported()
        onOpenChange(false)
        return
      }

      const message = error?.response?.data?.error || error?.response?.data || error?.message || t('bilibiliAuth.startFailed')
      toast.error(message)
    } finally {
      setIsStarting(false)
    }
  }

  const pollStatus = async (): Promise<'authenticated' | 'pending' | 'error'> => {
    try {
      const next = await apiClient.getBilibiliAuthStatus()
      syncStatus(next)
      if (next.state === 'authenticated') {
        onOpenChange(false)
        toast.success(t('bilibiliAuth.loginSuccess'))
        return 'authenticated'
      }
      return 'pending'
    } catch (error: any) {
      if (isUnsupportedStatus(error?.response?.status)) {
        onControllerUnsupported()
        onOpenChange(false)
      }
      return 'error'
    }
  }

  useEffect(() => {
    if (!open) {
      resetSessionUi()
      return
    }

    void startAuth()
  }, [open])

  useEffect(() => {
    if (!open || !hasOpenedClient || mobileMode !== 'app') {
      wasVisibleRef.current = isVisible
      return
    }

    if (openedClientAtRef.current === null) {
      openedClientAtRef.current = Date.now()
    }

    const justReturned = !wasVisibleRef.current && isVisible
    wasVisibleRef.current = isVisible

    if (
      justReturned &&
      Date.now() - openedClientAtRef.current >= CONFIRM_DONE_DELAY_MS
    ) {
      setShowConfirmDone(true)
    }
  }, [open, hasOpenedClient, isVisible, mobileMode])

  useEffect(() => {
    setStatus(initialStatus)
    if (initialStatus?.qr?.url) {
      setQrUrl(initialStatus.qr.url)
    }
  }, [initialStatus])

  useEffect(() => {
    if (!open || !isVisible || !isAwaiting) {
      return
    }

    let cancelled = false

    const poll = async () => {
      try {
        const next = await apiClient.getBilibiliAuthStatus()
        if (cancelled) {
          return
        }
        syncStatus(next)
        if (next.state === 'authenticated') {
          onOpenChange(false)
          toast.success(t('bilibiliAuth.loginSuccess'))
        }
      } catch (error: any) {
        if (cancelled) {
          return
        }
        if (isUnsupportedStatus(error?.response?.status)) {
          onControllerUnsupported()
          onOpenChange(false)
        }
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, isVisible, isAwaiting])

  const handleCheckDone = async () => {
    if (isCheckingRef.current) {
      return
    }

    isCheckingRef.current = true
    setIsChecking(true)
    try {
      const result = await pollStatus()
      if (result === 'pending') {
        toast.info(t('bilibiliAuth.confirmNotReady'))
      }
    } finally {
      isCheckingRef.current = false
      setIsChecking(false)
    }
  }

  const handleCopyLoginLink = async () => {
    if (!qrUrl) {
      return
    }

    try {
      await navigator.clipboard.writeText(qrUrl)
      toast.success(t('bilibiliAuth.copyLoginLinkSuccess'))
    } catch {
      toast.error(t('bilibiliAuth.copyLoginLinkFailed'))
    }
  }

  const handleMobileModeChange = (value: string) => {
    if (value === 'app' || value === 'qr') {
      setMobileMode(value)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="py-6">
        <DialogHeader>
          <DialogTitle>{t('bilibiliAuth.title')}</DialogTitle>
          {showLoginContent ? (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={mobileMode}
              onValueChange={handleMobileModeChange}
              className="hidden w-full [@media(pointer:coarse)]:flex"
              aria-label={t('bilibiliAuth.mobileModeGroup')}
            >
              <ToggleGroupItem value="app">{t('bilibiliAuth.mobileModeApp')}</ToggleGroupItem>
              <ToggleGroupItem value="qr">{t('bilibiliAuth.mobileModeQr')}</ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          <DialogDescription>
            <span className="[@media(pointer:coarse)]:hidden">{t('bilibiliAuth.description')}</span>
            <span className="hidden [@media(pointer:coarse)]:inline">
              {mobileMode === 'qr'
                ? t('bilibiliAuth.otherDeviceDescription')
                : t('bilibiliAuth.mobileDescription')}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          {isStarting ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-muted-foreground">
              <span className="[@media(pointer:coarse)]:hidden">{t('bilibiliAuth.generatingQr')}</span>
              <span className="hidden [@media(pointer:coarse)]:inline">{t('bilibiliAuth.preparingLogin')}</span>
            </div>
          ) : null}

          {!isStarting && statusMessage ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive">
              {statusMessage}
            </div>
          ) : null}

          {isExpired && !isStarting ? (
            <Button type="button" className="w-full" onClick={() => void startAuth()}>
              {t('bilibiliAuth.retryLogin')}
            </Button>
          ) : null}

          {showLoginContent ? (
            <>
              <div className="[@media(pointer:coarse)]:hidden">
                <DesktopQrPanel
                  qrUrl={qrUrl}
                  qrImageUrl={qrImageUrl}
                  qrLinkLabel={t('bilibiliAuth.qrLink')}
                />
              </div>
              <div className="hidden [@media(pointer:coarse)]:block">
                {mobileMode === 'qr' ? (
                  <MobileQrPanel
                    qrImageUrl={qrImageUrl}
                    qrLinkLabel={t('bilibiliAuth.qrLink')}
                    onCopyLink={() => void handleCopyLoginLink()}
                  />
                ) : (
                  <MobileLoginPanel
                    qrUrl={qrUrl}
                    showConfirmDone={showConfirmDone}
                    isChecking={isChecking}
                    onOpenedClient={() => {
                      if (openedClientAtRef.current === null) {
                        openedClientAtRef.current = Date.now()
                      }
                      setHasOpenedClient(true)
                    }}
                    onCheckDone={() => void handleCheckDone()}
                  />
                )}
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

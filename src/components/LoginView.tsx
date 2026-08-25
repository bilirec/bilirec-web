import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { apiClient } from '@/lib/api'
import { BackendUnreachableError, getHttpStatus } from '@/lib/backend'
import { storage } from '@/lib/storage'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoIcon } from '@phosphor-icons/react'
import type { LoginResponse, ServerVersionResult } from '@/lib/types'
import { isValidServerUrl } from '@/lib/utils'

interface LoginViewProps {
  onLoginSuccess: (response: LoginResponse, version: ServerVersionResult | null) => void
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [serverUrl, setServerUrl] = useState('http://localhost:8080')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const loadServerUrl = async () => {
      const saved = await storage.get<string>('server-url')
      if (saved) setServerUrl(saved.trim())
    }
    loadServerUrl()
  }, [])

  const toastProbeError = (
    err: unknown,
    context: 'no-credentials' | 'after-login' | 'login-fallback'
  ) => {
    const status = getHttpStatus(err)
    if (status === 401) {
      if (context === 'no-credentials') {
        toast.error(t('login.errorNeedCredential'))
      } else if (context === 'after-login') {
        toast.error(t('login.errorLoginGeneral'))
      } else {
        toast.error(t('login.errorLoginInvalid'))
      }
      return
    }
    if (err instanceof BackendUnreachableError) {
      toast.error(t('login.errorNotBackend'))
      return
    }
    toast.error(t('login.errorConnect'))
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const url = (serverUrl || 'http://localhost:8080').trim()
    if (url !== serverUrl) setServerUrl(url)

    if (!url) {
      toast.error(t('login.errorNeedServer'))
      return
    }

    if (!isValidServerUrl(url)) {
      toast.error(t('login.errorInvalidServerUrl'))
      return
    }

    // If username provided, require password as well
    if (username.trim() && !password.trim()) {
      toast.error(t('login.errorNeedPassword'))
      return
    }

    setIsLoading(true)

    try {
      await apiClient.runWithoutUnauthorizedEvent(async () => {
        // Always set base URL and persist it so the app can attempt unauthenticated access
        apiClient.setBaseURL(url)
        await storage.set('server-url', url)

        // If no credentials provided, just try accessing a protected endpoint to see if auth is required
        if (!username.trim() && !password.trim()) {
          try {
            const version = await apiClient.probeBackend()
            toast.success(t('login.connectNoAuth'))
            onLoginSuccess({ user: '', role: 'admin' }, version)
          } catch (err: unknown) {
            console.error('Unauthenticated access failed:', err)
            toastProbeError(err, 'no-credentials')
          }
          return
        }

        // Credentials provided – try login
        const result = await apiClient.login({ user: username, pass: password })
        if (result) {
          try {
            const version = await apiClient.probeBackend()
            onLoginSuccess(result, version)
          } catch (err: unknown) {
            console.error('Backend probe after login failed:', err)
            toastProbeError(err, 'after-login')
          }
          return
        }

        // If login failed, fallback to try unauthenticated access (in case server does not require auth)
        try {
          const version = await apiClient.probeBackend()
          toast.success(t('login.connectNoAuth'))
          onLoginSuccess({ user: '', role: 'admin' }, version)
        } catch (err: unknown) {
          console.error('Unauthenticated access failed:', err)
            toastProbeError(err, 'login-fallback')
        }
      })
    } catch (error: unknown) {
      console.error('Login error:', error)
      const axiosData = (error as { response?: { data?: string } }).response?.data
      toast.error(
        typeof axiosData === 'string' ? axiosData : t('login.errorLoginGeneral')
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md p-6 bg-card text-card-foreground">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">{t('login.title')}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t('login.description')}</p>
        </div>

        <Alert className="mb-4">
          <InfoIcon size={16} />
          <AlertDescription className="text-xs">
            {t('login.hint')}
          </AlertDescription>
        </Alert>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="server-url">{t('login.serverUrl')}</Label>
            <Input
              id="server-url"
              type="text"
              placeholder="http://localhost:8080"
              value={serverUrl || ''}
              onChange={(e) => setServerUrl(e.target.value)}
              onBlur={() => setServerUrl((value) => value.trim())}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">{t('login.username')}</Label>
            <Input
              id="username"
              type="text"
              placeholder={t('login.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t('login.password')}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading}
          >
            {isLoading ? t('login.loading') : t('login.submit')}
          </Button>
        </form>
      </Card>
    </div>
  )
}

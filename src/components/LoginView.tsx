import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { apiClient } from '@/lib/api'
import { storage } from '@/lib/storage'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoIcon } from '@phosphor-icons/react'
import type { LoginResponse } from '@/lib/types'
import { isValidServerUrl } from '@/lib/utils'

interface LoginViewProps {
  onLoginSuccess: (response: LoginResponse) => void
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
      // Always set base URL and persist it so the app can attempt unauthenticated access
      apiClient.setBaseURL(url)
      await storage.set('server-url', url)

      // If no credentials provided, just try accessing a protected endpoint to see if auth is required
      if (!username.trim() && !password.trim()) {
        try {
          await apiClient.getRecords()
          toast.success(t('login.connectNoAuth'))
          onLoginSuccess({ user: '', role: 'admin' })
        } catch (err: any) {
          console.error('Unauthenticated access failed:', err)
          if (err?.status === 401) {
            toast.error(t('login.errorNeedCredential'))
          } else {
            toast.error(err?.message || t('login.errorConnect'))
          }
        }
        return
      }

      // Credentials provided – try login
      const result = await apiClient.login({ user: username, pass: password })
      if (result) {
        // Server should set an HttpOnly cookie on successful login
        onLoginSuccess(result)
      } else {
        // If login failed, fallback to try unauthenticated access (in case server does not require auth)
        try {
          await apiClient.getRecords()
          toast.success(t('login.connectNoAuth'))
          onLoginSuccess({ user: '', role: 'admin' })
        } catch (err: any) {
          console.error('Unauthenticated access failed:', err)
          if (err?.status === 401) {
            toast.error(t('login.errorLoginInvalid'))
          } else {
            toast.error(err?.message || t('login.errorConnect'))
          }
        }
      }
    } catch (error: any) {
      console.error('Login error:', error)
      toast.error(error.response?.data || t('login.errorLoginGeneral'))
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

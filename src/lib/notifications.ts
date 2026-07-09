import { apiClient } from '@/lib/api'
import { getServiceWorkerRegistration } from '@/lib/service-worker'

export type NotificationBootstrapResult =
  | 'started'
  | 'permission-denied-fresh'
  | 'permission-denied-existing'
  | 'permission-default'
  | 'push-unavailable'
  | 'unsupported'
  | 'worker-unavailable'

export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported'

export const NOTIFICATION_BLOCKED_BANNER_DISMISSED_KEY =
  'notification-blocked-banner-dismissed'

export type StartLiveNotificationsOptions = {
  autoRequestPermission?: boolean
}

function canUseNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotificationPermission(): NotificationPermissionStatus {
  if (!canUseNotifications()) {
    return 'unsupported'
  }

  return Notification.permission as NotificationPermissionStatus
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!canUseNotifications()) {
    return 'unsupported'
  }

  const current = Notification.permission
  if (current === 'granted' || current === 'denied') {
    return current as NotificationPermissionStatus
  }

  return (await Notification.requestPermission()) as NotificationPermissionStatus
}

export function watchNotificationPermission(
  onChange: (status: NotificationPermissionStatus) => void
): () => void {
  if (!canUseNotifications() || !navigator.permissions?.query) {
    return () => {}
  }

  let disposed = false
  let removeListener: (() => void) | null = null

  const handler = () => {
    if (!disposed) {
      onChange(getNotificationPermission())
    }
  }

  void navigator.permissions
    .query({ name: 'notifications' as PermissionName })
    .then((status) => {
      if (disposed) {
        return
      }

      status.addEventListener('change', handler)
      removeListener = () => status.removeEventListener('change', handler)
      onChange(getNotificationPermission())
    })
    .catch(() => {})

  return () => {
    disposed = true
    removeListener?.()
  }
}

function base64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

export async function startLiveNotifications(
  options: StartLiveNotificationsOptions = {}
): Promise<NotificationBootstrapResult> {
  const { autoRequestPermission = true } = options
  const registration = await getServiceWorkerRegistration()
  if (!registration) {
    return 'unsupported'
  }

  if (!canUseNotifications()) {
    return 'unsupported'
  }

  let permission = Notification.permission
  let requestedPermission = false
  if (permission === 'default' && autoRequestPermission) {
    requestedPermission = true
    permission = await Notification.requestPermission()
  }

  if (permission === 'denied') {
    return requestedPermission
      ? 'permission-denied-fresh'
      : 'permission-denied-existing'
  }

  if (permission !== 'granted') {
    return 'permission-default'
  }

  if (!('PushManager' in window) || !registration.pushManager) {
    return 'push-unavailable'
  }

  try {
    const config = await apiClient.getWebPushPublicKey()
    if (!config.enabled || !config.public_key) {
      return 'started'
    }

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(config.public_key),
        })
      } catch (subscribeError) {
        // Chrome can leave the push manager in a broken state after a PWA data reset.
        // Unsubscribe any stale local state and retry once.
        console.warn('Push subscribe failed, retrying after unsubscribe:', subscribeError)
        const stale = await registration.pushManager.getSubscription()
        if (stale) {
          await stale.unsubscribe().catch(() => {})
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(config.public_key),
        })
      }
    }

    const json = subscription.toJSON()
    const endpoint = json.endpoint
    const auth = json.keys?.auth
    const p256dh = json.keys?.p256dh

    if (!endpoint || !auth || !p256dh) {
      throw new Error('Invalid push subscription payload')
    }

    await apiClient.registerWebPushSubscription({
      endpoint,
      keys: {
        auth,
        p256dh,
      },
    })

    return 'started'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Failed to sync Web Push subscription:', message, error)
    return 'push-unavailable'
  }
}

export async function stopLiveNotifications(): Promise<void> {
  const registration = await getServiceWorkerRegistration()
  if (!registration?.pushManager) {
    return
  }

  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    return
  }

  const endpoint = subscription.endpoint

  try {
    await apiClient.removeWebPushSubscription({ endpoint })
  } catch (error) {
    // Backend may reject when session already expired; local unsubscribe should still proceed.
    console.warn('Failed to remove Web Push subscription on server:', error)
  }

  try {
    await subscription.unsubscribe()
  } catch (error) {
    console.warn('Failed to unsubscribe local Web Push subscription:', error)
  }
}

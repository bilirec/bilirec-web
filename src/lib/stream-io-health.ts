import type { StreamIoHealth } from './types'

/** Health from sustained write lag only — not from absolute unflushed buffer size. */
export function computeStreamIoHealth(
  backpressure: boolean,
  lagStreak: number,
): StreamIoHealth {
  if (backpressure) {
    return 'unhealthy'
  }
  if (lagStreak >= 1) {
    return 'warning'
  }
  return 'healthy'
}

export function streamHealthIconClass(health: StreamIoHealth): string {
  switch (health) {
    case 'healthy':
      return 'text-green-600 dark:text-green-500'
    case 'warning':
      return 'text-amber-600 dark:text-amber-400'
    case 'unhealthy':
      return 'text-red-600 dark:text-red-400'
  }
}

export function streamHealthUsesFillIcon(health: StreamIoHealth): boolean {
  return health !== 'healthy'
}

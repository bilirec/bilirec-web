import { useEffect, useState } from 'react'

function readPageVisibility(): boolean {
  if (typeof document === 'undefined') {
    return true
  }
  return document.visibilityState !== 'hidden'
}

export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(readPageVisibility)

  useEffect(() => {
    const syncFromDocument = () => {
      const next = readPageVisibility()
      setIsVisible((prev) => (prev === next ? prev : next))
    }

    const markVisible = () => {
      setIsVisible((prev) => (prev ? prev : true))
    }

    document.addEventListener('visibilitychange', syncFromDocument)
    window.addEventListener('pageshow', markVisible)
    window.addEventListener('focus', markVisible)
    document.addEventListener('resume', markVisible)

    syncFromDocument()

    return () => {
      document.removeEventListener('visibilitychange', syncFromDocument)
      window.removeEventListener('pageshow', markVisible)
      window.removeEventListener('focus', markVisible)
      document.removeEventListener('resume', markVisible)
    }
  }, [])

  return isVisible
}

'use client'
import { useEffect, useRef, useState } from 'react'

// BeforeInstallPromptEvent is not in the standard TypeScript lib — define it locally
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed-at'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

function isDismissed(): boolean {
  if (typeof window === 'undefined') return false
  const ts = localStorage.getItem(DISMISS_KEY)
  if (!ts) return false
  return Date.now() - parseInt(ts, 10) < DISMISS_TTL_MS
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true
  )
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  // Lazy initializer reads localStorage once on mount — avoids synchronous setState-in-effect
  const [dismissed, setDismissed] = useState(() => isDismissed())
  const isInstallingRef = useRef(false) // P6: guard against concurrent calls

  useEffect(() => {
    // Already installed or dismissed within TTL → skip listener
    if (isStandalone() || dismissed) return

    const handler = (e: Event) => {
      e.preventDefault() // Prevent default mini-infobar on Chrome
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [dismissed])

  const canInstall = !!deferredPrompt && !dismissed && !isStandalone()

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
    setDeferredPrompt(null) // P5: clear reference on dismiss
    setDismissed(true)
  }

  const promptInstall = async () => {
    if (!deferredPrompt || isInstallingRef.current) return // P6: no-op if already installing
    isInstallingRef.current = true
    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } finally {
      isInstallingRef.current = false
      dismiss() // P1+P3: always persists dismissed state, even if prompt() threw
    }
  }

  return { canInstall, promptInstall, dismiss }
}

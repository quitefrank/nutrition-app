'use client'
import { useEffect, useState } from 'react'

/**
 * Returns true when the browser reports an active network connection.
 *
 * LIMITATION: navigator.onLine can return true even when the device has no
 * actual internet connectivity (e.g., connected to a router with no WAN).
 * This is sufficient for showing an offline message but should not be used
 * as a hard gate for security-critical operations.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    // Sync with current state immediately on mount
    update()
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return isOnline
}

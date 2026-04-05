'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import type { NearbyRestaurantResult } from '@/types/api'

// Re-export the shared type under the hook's public name for backwards compat
export type { NearbyRestaurantResult as NearbyRestaurant }

export function useNearbyRestaurant(): {
  nearbyRestaurant: NearbyRestaurantResult | null
  isLoading: boolean
  requestPermission: () => void
} {
  const [nearbyRestaurant, setNearbyRestaurant] = useState<NearbyRestaurantResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    // Cancel any in-flight request before starting a new one
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    try {
      const res = await fetch(
        `/api/restaurants/nearby?lat=${lat}&lng=${lng}&radius=200`,
        { signal: controller.signal }
      )
      if (!res.ok) return
      const json = await res.json() as { data: NearbyRestaurantResult[] }
      setNearbyRestaurant(json.data[0] ?? null)
    } catch (err) {
      // Ignore aborts and network errors — no banner shown
      if (err instanceof Error && err.name === 'AbortError') return
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getPosition = useCallback(() => {
    if (typeof navigator === 'undefined') return

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void fetchNearby(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        // GeolocationPositionError — permission denied or unavailable; no banner
        setIsLoading(false)
      },
      { timeout: 10000, maximumAge: 60000 }
    )
  }, [fetchNearby])

  useEffect(() => {
    // SSR guard
    if (typeof navigator === 'undefined') return

    // Only auto-request if permission is already granted (avoid silent prompt)
    // Falls back to direct geolocation if Permissions API is unavailable (P10)
    if (!navigator.permissions?.query) {
      getPosition()
      return
    }

    void navigator.permissions.query({ name: 'geolocation' }).then((status) => {
      if (status.state === 'granted') {
        getPosition()
      }
      // 'prompt' or 'denied' — do nothing until requestPermission() is called
    })

    // Cleanup: abort any in-flight fetch on unmount (P11)
    return () => { abortRef.current?.abort() }
  }, [getPosition])

  const requestPermission = useCallback(() => {
    if (typeof navigator === 'undefined') return
    toast('Allow location so Plately can recognise restaurants you\'ve visited')
    getPosition()
  }, [getPosition])

  return { nearbyRestaurant, isLoading, requestPermission }
}

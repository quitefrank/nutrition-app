'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Types ──────────────────────────────────────────────────

interface ScanResult {
  restaurantName?: string | null
  allDishes?: unknown[]
  partialResults?: boolean
}

interface SmartBannerProps {
  /** All scan results currently in sessionStorage */
  scans: ScanResult[]
}

type BannerType = 'return-visit' | 'search-triggered' | 'location'

interface BannerData {
  type: BannerType
  restaurantName: string
  recipeCount: number
  message: string
}

interface NearbyRestaurant {
  placeId: string
  name: string
  address: string
}

interface NearbyCache {
  restaurant: NearbyRestaurant | null
  fetchedAt: number
}

// ─── localStorage / sessionStorage keys ─────────────────────

const DISMISSED_KEY = 'plately_smart_banner_dismissed'
const LOCATION_KEY = 'plately_location_granted'
const NEARBY_CACHE_KEY = 'plately_nearby_cache'
const NEARBY_CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

function getSessionDismissed(): string | null {
  try { return sessionStorage.getItem(DISMISSED_KEY) } catch { return null }
}
function setSessionDismissed(type: BannerType): void {
  try { sessionStorage.setItem(DISMISSED_KEY, type) } catch { /* ignore */ }
}

function getNearbyCache(): NearbyCache | null {
  try {
    const raw = sessionStorage.getItem(NEARBY_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as NearbyCache
    if (Date.now() - parsed.fetchedAt > NEARBY_CACHE_TTL_MS) {
      sessionStorage.removeItem(NEARBY_CACHE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function setNearbyCache(restaurant: NearbyRestaurant | null): void {
  try {
    const cache: NearbyCache = { restaurant, fetchedAt: Date.now() }
    sessionStorage.setItem(NEARBY_CACHE_KEY, JSON.stringify(cache))
  } catch { /* ignore */ }
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Read all saved recipe restaurant names from sessionStorage scan data.
 * Returns a map of restaurantName -> dish count.
 */
function getSavedRestaurantMap(scans: ScanResult[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const scan of scans) {
    if (scan.restaurantName) {
      const name = scan.restaurantName
      const count = Array.isArray(scan.allDishes) ? scan.allDishes.length : 1
      map.set(name, (map.get(name) ?? 0) + count)
    }
  }
  return map
}

/**
 * Get search visit from localStorage if within 24h.
 * Stored under `plately_search_[restaurantName]` as JSON { visitedAt: number, recipeCount: number }
 */
interface SearchVisit {
  restaurantName: string
  visitedAt: number
  recipeCount: number
}

function getRecentSearchVisit(): SearchVisit | null {
  try {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('plately_search_')) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as { visitedAt: number; recipeCount: number }
      if (Date.now() - parsed.visitedAt <= TWENTY_FOUR_HOURS) {
        return {
          restaurantName: key.replace('plately_search_', ''),
          visitedAt: parsed.visitedAt,
          recipeCount: parsed.recipeCount ?? 0,
        }
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── SmartBanner ────────────────────────────────────────────

export function SmartBanner({ scans }: SmartBannerProps) {
  const [bannerData, setBannerData] = useState<BannerData | null>(null)
  const [visible, setVisible] = useState(false)
  const [locationGranted, setLocationGranted] = useState(false)
  const [nearbyRestaurant, setNearbyRestaurant] = useState<NearbyRestaurant | null>(null)
  const [nearbyResolved, setNearbyResolved] = useState(false)
  // Track whether we've already kicked off a geo+fetch to avoid duplicate calls
  const locationFetchRef = useRef(false)

  // ── Effect 1: priority 1 & 2 (no async) ─────────────────
  useEffect(() => {
    const dismissed = getSessionDismissed()
    const restaurantMap = getSavedRestaurantMap(scans)

    // ── Priority 1: return-visit ────────────────────────────
    if (dismissed !== 'return-visit') {
      for (const [restaurantName, count] of restaurantMap) {
        if (count > 1) {
          setBannerData({
            type: 'return-visit',
            restaurantName,
            recipeCount: count,
            message: `You've been here before — ${count} saved dishes from ${restaurantName}`,
          })
          setVisible(true)
          return
        }
      }
    }

    // ── Priority 2: search-triggered ───────────────────────
    if (dismissed !== 'search-triggered') {
      const searchVisit = getRecentSearchVisit()
      if (searchVisit && restaurantMap.has(searchVisit.restaurantName)) {
        const count = restaurantMap.get(searchVisit.restaurantName) ?? searchVisit.recipeCount
        setBannerData({
          type: 'search-triggered',
          restaurantName: searchVisit.restaurantName,
          recipeCount: count,
          message: `Looks like you found ${searchVisit.restaurantName}! You have ${count} saved dish${count !== 1 ? 'es' : ''} from it.`,
        })
        setVisible(true)
        return
      }
    }

    // Priority 1 & 2 didn't fire — clear any stale banner so Effect 3 can take over
    setBannerData(null)
    setVisible(false)
  }, [scans])

  // ── Effect 2: resolve nearby restaurant via geolocation ──
  // Runs once when location permission is granted and we have scans.
  // Skipped if already resolved or a fetch is in flight.
  useEffect(() => {
    const dismissed = getSessionDismissed()
    if (dismissed === 'location') return
    if (nearbyResolved) return
    if (locationFetchRef.current) return

    // Extracted fetch logic — called from both the localStorage fast path and
    // the Permissions API slow path.
    const runFetch = () => {
      locationFetchRef.current = true

      // Check session cache first
      const cached = getNearbyCache()
      if (cached) {
        setNearbyRestaurant(cached.restaurant)
        setNearbyResolved(true)
        return
      }

      if (typeof window === 'undefined' || !navigator.geolocation) {
        setNearbyResolved(true)
        return
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // Record that location was granted so future sessions skip the Permissions API check
          try { localStorage.setItem(LOCATION_KEY, 'true') } catch { /* ignore */ }
          const { latitude: lat, longitude: lng } = position.coords
          try {
            const res = await fetch('/api/places/nearby', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat, lng, radius: 200 }),
            })
            if (res.ok) {
              const data = (await res.json()) as { data?: NearbyRestaurant[] }
              const restaurant = data.data?.[0] ?? null
              setNearbyCache(restaurant)
              setNearbyRestaurant(restaurant)
            } else {
              setNearbyCache(null)
            }
          } catch {
            setNearbyCache(null)
          } finally {
            setNearbyResolved(true)
          }
        },
        () => {
          // Permission denied or error — cache a null result to avoid re-requesting
          setNearbyCache(null)
          setNearbyResolved(true)
        },
        { timeout: 8000, maximumAge: 60_000 }
      )
    }

    // Fast path: localStorage flag set by a previous successful grant
    let lsGranted = false
    try { lsGranted = localStorage.getItem(LOCATION_KEY) === 'true' } catch { /* ignore */ }
    setLocationGranted(lsGranted)

    if (lsGranted) {
      runFetch()
      return
    }

    // Slow path: no localStorage flag yet — check the Permissions API to pick
    // up grants that happened outside of this session (e.g. native browser prompt).
    if (typeof window !== 'undefined' && navigator.permissions?.query) {
      void navigator.permissions.query({ name: 'geolocation' }).then((status) => {
        if (status.state === 'granted') {
          setLocationGranted(true)
          runFetch()
        }
      })
    }
  }, [scans.length, nearbyResolved]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 3: show location banner once nearby is resolved ─
  useEffect(() => {
    if (!nearbyResolved) return
    if (!locationGranted) return

    const dismissed = getSessionDismissed()
    if (dismissed === 'location') return

    // Only show the location banner if priority 1 & 2 didn't already fire
    if (bannerData && bannerData.type !== 'location') return

    if (!nearbyRestaurant) return

    const restaurantMap = getSavedRestaurantMap(scans)
    const hasSavedDishes = restaurantMap.has(nearbyRestaurant.name)

    const message = hasSavedDishes
      ? `You might be near ${nearbyRestaurant.name} — you've saved dishes from here before`
      : `Looks like you're near ${nearbyRestaurant.name}`

    setBannerData({
      type: 'location',
      restaurantName: nearbyRestaurant.name,
      recipeCount: restaurantMap.get(nearbyRestaurant.name) ?? 0,
      message,
    })
    setVisible(true)
  }, [nearbyResolved, nearbyRestaurant, locationGranted, bannerData, scans])

  const handleDismiss = () => {
    if (bannerData) setSessionDismissed(bannerData.type)
    setVisible(false)
  }

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => {
      if (bannerData) setSessionDismissed(bannerData.type)
      setVisible(false)
    }, 5000)
    return () => clearTimeout(timer)
  }, [visible, bannerData])

  return (
    <AnimatePresence>
      {visible && bannerData && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 'calc(var(--space-safe-top, 0px) + 68px)',
            left: 20,
            right: 20,
            zIndex: 40,
            borderRadius: 16,
            background: 'rgba(255,252,247,0.96)',
            backdropFilter: 'blur(24px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
            border: '1px solid rgba(180,170,158,0.28)',
            boxShadow: '0 4px 24px rgba(80,60,40,0.12), 0 1px 4px rgba(80,60,40,0.08)',
          }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Icon */}
            <div className="flex-shrink-0 flex items-center justify-center" aria-hidden="true">
              <BannerIcon type={bannerData.type} />
            </div>

            {/* Text */}
            <p
              className="flex-1 text-[13px] leading-snug"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {bannerData.message}
            </p>

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss banner"
              className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Icon per banner type ───────────────────────────────────

function BannerIcon({ type }: { type: BannerType }) {
  if (type === 'return-visit') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" fill="var(--color-accent)" />
      </svg>
    )
  }
  if (type === 'search-triggered') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="var(--color-accent)" strokeWidth="2" />
        <path d="M16.5 16.5L21 21" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  // location
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="var(--color-accent)" strokeWidth="2" fill="none" />
      <circle cx="12" cy="9" r="2.5" stroke="var(--color-accent)" strokeWidth="1.75" />
    </svg>
  )
}

// ─── Helper to record a search visit ───────────────────────
// Call this in SearchScreen when user taps a restaurant

export function recordSearchVisit(restaurantName: string, recipeCount: number): void {
  try {
    const key = `plately_search_${restaurantName}`
    localStorage.setItem(key, JSON.stringify({ visitedAt: Date.now(), recipeCount }))
  } catch {
    // ignore
  }
}

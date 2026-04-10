'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RestaurantSearchResult, DishResult, ApiSuccess } from '@/types/api'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

async function fetchRestaurants(query: string): Promise<RestaurantSearchResult[]> {
  const res = await fetch('/api/search/restaurants?q=' + encodeURIComponent(query))
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error ?? 'Search failed')
  }
  const json = await res.json().catch(() => { throw new Error('Search failed') })
  if (!Array.isArray((json as ApiSuccess<RestaurantSearchResult[]>).data)) {
    throw new Error('Search failed')
  }
  return (json as ApiSuccess<RestaurantSearchResult[]>).data
}

export function useRestaurantSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300)
  return {
    ...useQuery({
      queryKey: ['search', 'restaurants', debouncedQuery],
      queryFn: () => fetchRestaurants(debouncedQuery),
      enabled: debouncedQuery.length >= 3,
    }),
    debouncedQuery,
  }
}

// ─── SSE-based dish stream hook ────────────────────────────────────────────────

export interface DishStreamState {
  dishes: DishResult[] | null
  statusMessage: string | null
  isStreaming: boolean
  error: string | null
}

export function useRestaurantDishStream(
  googlePlacesId: string | null,
  restaurantName?: string,
): DishStreamState & { retry: () => void } {
  const [state, setState] = useState<DishStreamState>({
    dishes: null,
    statusMessage: null,
    isStreaming: false,
    error: null,
  })

  // Stable key so we can re-trigger without remounting
  const [retryKey, setRetryKey] = useState(0)
  const esRef = useRef<EventSource | null>(null)

  const retry = useCallback(() => {
    setState({ dishes: null, statusMessage: null, isStreaming: false, error: null })
    setRetryKey(k => k + 1)
  }, [])

  useEffect(() => {
    if (!googlePlacesId) return

    // Close any previous connection
    esRef.current?.close()

    const url = new URL(
      `/api/search/restaurants/${encodeURIComponent(googlePlacesId)}/dishes`,
      window.location.origin,
    )
    if (restaurantName) url.searchParams.set('restaurantName', restaurantName)

    setState(s => ({ ...s, isStreaming: true, error: null, dishes: null }))

    const es = new EventSource(url.toString())
    esRef.current = es

    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { message: string }
        setState(s => ({ ...s, statusMessage: data.message }))
      } catch { /* ignore malformed */ }
    })

    es.addEventListener('dishes', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { dishes: DishResult[] }
        setState({ dishes: data.dishes, statusMessage: null, isStreaming: false, error: null })
      } catch {
        setState(s => ({ ...s, isStreaming: false, error: 'Failed to parse dishes' }))
      }
      es.close()
    })

    es.addEventListener('error', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { error: string }
        setState({ dishes: null, statusMessage: null, isStreaming: false, error: data.error })
      } catch {
        setState({ dishes: null, statusMessage: null, isStreaming: false, error: 'Dish list unavailable' })
      }
      es.close()
    })

    // Network-level error (e.g. connection dropped)
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return // already handled
      setState({ dishes: null, statusMessage: null, isStreaming: false, error: 'Connection lost. Please try again.' })
      es.close()
    }

    return () => {
      es.close()
      esRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googlePlacesId, restaurantName, retryKey])

  return { ...state, retry }
}

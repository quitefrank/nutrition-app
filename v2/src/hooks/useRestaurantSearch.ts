/**
 * useRestaurantSearch — TanStack Query v5 hook for restaurant search.
 *
 * Wraps POST /api/places/search and is enabled only when the query
 * has at least 2 non-whitespace characters.
 *
 * Query key: ['restaurants', 'search', query]
 * Errors surface as { error: { code, message } } (ARCH7).
 */

import { useQuery } from '@tanstack/react-query'

// ─── Result type ──────────────────────────────────────────────────────────────

export interface RestaurantSearchResult {
  placeId: string
  name: string
  address: string
  rating?: number
  userRatingsTotal?: number
  photoUrl?: string | null
}

// ─── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchRestaurantSearch(query: string): Promise<RestaurantSearchResult[]> {
  const res = await fetch('/api/places/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  const json = await res.json() as unknown

  if (!res.ok) {
    const envelope = json as { error?: { code?: string; message?: string } }
    const code = envelope?.error?.code ?? 'SEARCH_ERROR'
    const message = envelope?.error?.message ?? 'Restaurant search failed'
    throw Object.assign(new Error(message), { code })
  }

  const data = (json as { data?: RestaurantSearchResult[] }).data
  return Array.isArray(data) ? data : []
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Search for restaurants by name using the Places API.
 *
 * @param query - The search string. Must have >= 2 non-whitespace characters to trigger a fetch.
 */
export function useRestaurantSearch(query: string) {
  const { data, isPending, isError, error, refetch } = useQuery<RestaurantSearchResult[], Error>({
    queryKey: ['restaurants', 'search', query],
    queryFn: () => fetchRestaurantSearch(query),
    enabled: query.trim().length >= 2,
    // Stale time: keep results for 30s so typing doesn't hammer the API
    staleTime: 30_000,
    retry: false,
  })

  return {
    results: data ?? [],
    isPending,
    isError,
    error,
    refetch,
  }
}

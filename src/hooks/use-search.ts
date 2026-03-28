'use client'

import { useEffect, useState } from 'react'
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

async function fetchRestaurantDishes(googlePlacesId: string): Promise<DishResult[]> {
  const res = await fetch(`/api/search/restaurants/${encodeURIComponent(googlePlacesId)}/dishes`)
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error ?? 'Dish list unavailable')
  }
  const json = await res.json().catch(() => { throw new Error('Dish list unavailable') })
  if (!Array.isArray((json as ApiSuccess<DishResult[]>).data)) {
    throw new Error('Dish list unavailable')
  }
  return (json as ApiSuccess<DishResult[]>).data
}

export function useRestaurantDishes(googlePlacesId: string | null) {
  return useQuery({
    queryKey: ['search', 'restaurants', googlePlacesId, 'dishes'],
    queryFn: () => fetchRestaurantDishes(googlePlacesId!),
    enabled: !!googlePlacesId,
  })
}

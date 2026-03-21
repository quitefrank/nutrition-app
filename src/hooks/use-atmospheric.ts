'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { buildTieredBackground } from '@/lib/atmospheric'
import type { AtmosphericPalette, AtmosphericState, DomainRestaurant } from '@/types/domain'

const NEUTRAL_STATE: AtmosphericState = {
  imageUrl: null,
  palette: null,
  tier: 'neutral',
  backgroundColorFallback: '#0a0a0a',
}

/**
 * Returns the resolved AtmosphericState for a given restaurant context.
 *
 * AC 7: Reads from the ['restaurants', restaurantId] TanStack Query cache.
 * Does NOT fire a network call if the restaurant row is already cached.
 * Falls back to tier 3 (neutral) if restaurantId is undefined or no data.
 */
export function useAtmosphericState(restaurantId?: string): AtmosphericState {
  const queryClient = useQueryClient()
  const [atmosphericState, setAtmosphericState] = useState<AtmosphericState>(NEUTRAL_STATE)

  // Read cached restaurant data without triggering a new fetch
  const { data: restaurant } = useQuery<DomainRestaurant>({
    queryKey: ['restaurants', restaurantId],
    // queryFn intentionally omitted here — this hook only reads from cache.
    // A parent component (restaurant page) is responsible for populating the cache.
    queryFn: () => {
      // Return cached data if it exists, otherwise return undefined to prevent
      // unintended network calls from this hook.
      const cached = queryClient.getQueryData<DomainRestaurant>(['restaurants', restaurantId])
      return cached ?? Promise.reject(new Error('no-restaurant-cache'))
    },
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      if (!restaurantId || !restaurant) {
        if (!cancelled) setAtmosphericState(NEUTRAL_STATE)
        return
      }

      const paletteJson = restaurant.atmosphericPaletteJson
      let palette: AtmosphericPalette | null = null

      // Attempt to parse stored palette from DB — validate field types before casting
      if (
        paletteJson &&
        typeof paletteJson === 'object' &&
        typeof (paletteJson as Record<string, unknown>).dominantColor === 'string' &&
        typeof (paletteJson as Record<string, unknown>).sourceImageUrl === 'string'
      ) {
        palette = paletteJson as AtmosphericPalette
      }

      if (!cancelled) {
        const state = buildTieredBackground(restaurantId, undefined, palette)
        setAtmosphericState(state)
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [restaurantId, restaurant, queryClient])

  return atmosphericState
}

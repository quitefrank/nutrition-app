/**
 * useAutoScan — TanStack mutation hook for the auto-scan endpoint.
 *
 * Calls POST /api/restaurants/auto-scan with { placeId, name }.
 * On success, invalidates ['restaurants', 'with-recipes'] so the
 * collection grid refreshes automatically.
 *
 * Mutation key: ['restaurants', 'auto-scan']
 * Errors surface as { error: { code, message } } (ARCH7).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoScanPayload {
  placeId: string
  name: string
}

/** Shape returned by POST /api/restaurants/auto-scan */
export interface AutoScanDish {
  id: string
  name: string
  description: string
  calorieEstimate: number | null
  confidence: number
  ingredients: unknown[]
  photoUrl: string | null
}

export interface AutoScanResult {
  restaurantName: string | null
  dishes: AutoScanDish[]
  menuPhotoUrl: string | null
  dishPhotos: Array<{ name: string; url: string }>
  fromCache?: boolean
}

// ─── Mutation function ────────────────────────────────────────────────────────

async function postAutoScan(payload: AutoScanPayload): Promise<AutoScanResult> {
  const res = await fetch('/api/restaurants/auto-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeId: payload.placeId, restaurantName: payload.name }),
  })

  const json = await res.json() as unknown

  if (!res.ok) {
    const envelope = json as { error?: { code?: string; message?: string } }
    const code = envelope?.error?.code ?? 'AUTO_SCAN_ERROR'
    const message = envelope?.error?.message ?? 'Auto-scan failed'
    throw Object.assign(new Error(message), { code })
  }

  return (json as { data: AutoScanResult }).data
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Trigger an auto-scan for a restaurant found via search.
 * On success, the ['restaurants', 'with-recipes'] query is invalidated
 * so the collection grid automatically shows the new restaurant.
 */
export function useAutoScan() {
  const queryClient = useQueryClient()

  return useMutation<AutoScanResult, Error, AutoScanPayload>({
    mutationKey: ['restaurants', 'auto-scan'],
    mutationFn: postAutoScan,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['restaurants', 'with-recipes'] })
    },
  })
}

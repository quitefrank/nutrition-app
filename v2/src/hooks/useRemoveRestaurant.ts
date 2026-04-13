'use client'

/**
 * useRemoveRestaurant — TanStack mutation for soft-deleting a restaurant.
 *
 * ARCH16: Mutation key ['restaurants', 'remove', id].
 *         Invalidates ['restaurants', 'with-recipes'] on settled.
 *
 * Optimistic update flow:
 *   1. onMutate  — snapshot cache; remove target from snapshot; write back
 *   2. onError   — restore snapshot
 *   3. onSettled — invalidate to sync server state
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DomainRestaurant, DomainRecipe } from '@/types/database'

type RestaurantWithRecipes = DomainRestaurant & { recipes: DomainRecipe[] }

async function deleteRestaurant(id: string): Promise<void> {
  const res = await fetch(`/api/restaurants/${id}`, { method: 'DELETE' })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
    }
    throw new Error(body?.error?.message ?? `DELETE failed with status ${res.status}`)
  }
}

export function useRemoveRestaurant(id: string) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string, { snapshot?: RestaurantWithRecipes[] }>({
    mutationKey: ['restaurants', 'remove', id],
    mutationFn: deleteRestaurant,

    onMutate: async (mutatedId: string) => {
      // Cancel any in-flight refetches to prevent them from overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ['restaurants', 'with-recipes'] })

      // Snapshot the current cache value
      const snapshot = queryClient.getQueryData<RestaurantWithRecipes[]>([
        'restaurants',
        'with-recipes',
      ])

      // Optimistically remove the target restaurant from the cache
      if (snapshot) {
        queryClient.setQueryData<RestaurantWithRecipes[]>(
          ['restaurants', 'with-recipes'],
          snapshot.filter((r) => r.id !== mutatedId)
        )
      }

      // Return snapshot for rollback on error
      return { snapshot }
    },

    onError: (_err, _id, context) => {
      // Restore snapshot on failure
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData<RestaurantWithRecipes[]>(
          ['restaurants', 'with-recipes'],
          context.snapshot
        )
      }
    },

    onSettled: () => {
      // Sync with server regardless of success/failure
      void queryClient.invalidateQueries({ queryKey: ['restaurants', 'with-recipes'] })
    },
  })
}

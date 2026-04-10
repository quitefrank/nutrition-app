'use client'

/**
 * useRestaurants — TanStack Query v5 hooks for restaurant CRUD
 *
 * v2 uses an auto-save model: every scan or search creates a restaurant
 * entity immediately. Users remove recipes, not restaurants.
 *
 * The upsert-by-place_id pattern prevents duplicates for chain restaurants
 * or repeat visits: if a Google Places ID already exists in the DB, the
 * existing row is returned rather than creating a second entry.
 *
 * Query keys:
 *   ['restaurants']           — all restaurants
 *   ['restaurants', id]       — single restaurant with visit history
 *   ['restaurants', 'nearby'] — restaurants with recent visits (nearby banner)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  mapRestaurant,
  RestaurantInsertSchema,
  type DomainRestaurant,
  type DomainRecipe,
  type RestaurantInsert,
} from '@/types/database'
import { mapRecipe } from '@/types/database'

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchRestaurants(): Promise<DomainRestaurant[]> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRestaurant)
}

async function fetchRestaurant(id: string): Promise<DomainRestaurant> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return mapRestaurant(data)
}

/** Returns restaurants that have at least one non-removed recipe. */
async function fetchRestaurantsWithRecipes(): Promise<
  Array<DomainRestaurant & { recipes: DomainRecipe[] }>
> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*, recipes(*)')
    .neq('recipes.status', 'removed')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? [])
    .map((row) => {
      const { recipes: rawRecipes, ...restaurantFields } = row as typeof row & {
        recipes: Array<Record<string, unknown>>
      }
      return {
        ...mapRestaurant(restaurantFields as Parameters<typeof mapRestaurant>[0]),
        recipes: (rawRecipes ?? []).map((r) =>
          mapRecipe(r as Parameters<typeof mapRecipe>[0])
        ),
      }
    })
    .filter((r) => r.recipes.length > 0)
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

/** Fetch all restaurants, newest first. */
export function useRestaurants() {
  return useQuery<DomainRestaurant[], Error>({
    queryKey: ['restaurants'],
    queryFn: fetchRestaurants,
    retry: (failureCount, error) => {
      if (error.message.includes('supabase') || failureCount >= 2) return false
      return true
    },
  })
}

/** Fetch a single restaurant by ID. */
export function useRestaurant(id: string | null) {
  return useQuery<DomainRestaurant, Error>({
    queryKey: ['restaurants', id],
    queryFn: () => fetchRestaurant(id!),
    enabled: !!id,
  })
}

/** Fetch restaurants that have active (non-removed) recipes. */
export function useRestaurantsWithRecipes() {
  return useQuery<Array<DomainRestaurant & { recipes: DomainRecipe[] }>, Error>({
    queryKey: ['restaurants', 'with-recipes'],
    queryFn: fetchRestaurantsWithRecipes,
  })
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export interface UpsertRestaurantPayload {
  /** If provided, the restaurant is looked up / deduplicated by this key. */
  placeId?: string | null
  name: string
  address?: string | null
  cuisineType?: string | null
  referenceImageUrl?: string | null
}

/**
 * Create or update a restaurant.
 *
 * Deduplication logic:
 *   1. If placeId is provided, upsert on the place_id column — safe for
 *      chain restaurants and repeat visits.
 *   2. If no placeId, insert a new row (e.g. unknown restaurant from scan).
 *
 * Returns the final restaurant row (existing or newly created).
 */
export function useUpsertRestaurant() {
  const queryClient = useQueryClient()

  return useMutation<DomainRestaurant, Error, UpsertRestaurantPayload>({
    mutationFn: async ({ placeId, name, address, cuisineType, referenceImageUrl }) => {
      // Validate input (SEC-INJ-1.00)
      const insert: RestaurantInsert = RestaurantInsertSchema.parse({
        place_id: placeId ?? null,
        name,
        address: address ?? null,
        cuisine_type: cuisineType ?? null,
        reference_image_url: referenceImageUrl ?? null,
        atmospheric_palette_json: null,
      })

      if (placeId) {
        // Upsert on place_id — idempotent for repeat visits
        const { data, error } = await supabase
          .from('restaurants')
          .upsert(insert, { onConflict: 'place_id', ignoreDuplicates: false })
          .select()
          .single()

        if (error) throw new Error(error.message)
        return mapRestaurant(data)
      } else {
        // No Places ID — always insert (may be an unknown restaurant)
        const { data, error } = await supabase
          .from('restaurants')
          .insert(insert)
          .select()
          .single()

        if (error) throw new Error(error.message)
        return mapRestaurant(data)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['restaurants'] })
    },
  })
}

export interface UpdateAtmosphericPalettePayload {
  restaurantId: string
  palette: { primary: string; secondary: string; accent: string }
}

/** Store the extracted atmospheric colour palette for a restaurant. */
export function useUpdateAtmosphericPalette() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, UpdateAtmosphericPalettePayload>({
    mutationFn: async ({ restaurantId, palette }) => {
      const { error } = await supabase
        .from('restaurants')
        .update({ atmospheric_palette_json: JSON.stringify(palette) })
        .eq('id', restaurantId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { restaurantId }) => {
      void queryClient.invalidateQueries({ queryKey: ['restaurants', restaurantId] })
      void queryClient.invalidateQueries({ queryKey: ['restaurants'] })
    },
  })
}

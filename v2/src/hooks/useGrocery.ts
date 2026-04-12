'use client'

/**
 * useGrocery — TanStack Query v5 hooks for grocery list CRUD
 *
 * Supabase is the source of truth. The existing grocery-store.ts
 * (localStorage) remains usable for offline/pre-auth scenarios but
 * these hooks take precedence when Supabase is configured.
 *
 * Optimistic updates are used for check/uncheck and delete so the UI
 * feels instant without waiting for a network round-trip.
 *
 * Query keys:
 *   ['grocery-items']   — full list
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  mapGroceryItem,
  GroceryItemInsertSchema,
  type DomainGroceryItem,
  type GroceryItemInsert,
} from '@/types/database'

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchGroceryItems(): Promise<DomainGroceryItem[]> {
  const { data, error } = await supabase
    .from('grocery_items')
    .select('id, name, quantity, unit, checked, recipe_ids, dish_name, created_at')
    .order('checked', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map(mapGroceryItem)
}

// ─── Query hook ───────────────────────────────────────────────────────────────

/** Fetch all grocery items, unchecked first, then by creation time. */
export function useGroceryItems() {
  return useQuery<DomainGroceryItem[], Error>({
    queryKey: ['grocery-items'],
    queryFn: fetchGroceryItems,
    retry: (failureCount, error) => {
      if (error.message.includes('supabase') || failureCount >= 2) return false
      return true
    },
  })
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export interface AddGroceryItemsPayload {
  /** Ingredients to add — will be deduped against existing items by name */
  items: Array<{
    name: string
    quantity: string | null
    unit: string | null
    recipeId?: string
    dishName?: string
  }>
}

export interface AddGroceryResult {
  added: number
  merged: number
}

/**
 * Add ingredients to the grocery list.
 * Items with the same name are merged (recipe_ids array is extended, quantity
 * left as-is from the existing item).
 */
export function useAddToGrocery() {
  const queryClient = useQueryClient()

  return useMutation<AddGroceryResult, Error, AddGroceryItemsPayload>({
    mutationFn: async ({ items }) => {
      if (items.length === 0) return { added: 0, merged: 0 }

      // Fetch current list to check for duplicates
      const { data: existing, error: fetchError } = await supabase
        .from('grocery_items')
        .select('*')

      if (fetchError) throw new Error(fetchError.message)

      const existingByName = new Map(
        (existing ?? []).map((row) => [row.name.toLowerCase().trim(), row])
      )

      let added = 0
      let merged = 0

      await Promise.all(
        items
          .filter((i) => i.name.trim().length > 0)
          .map(async (item) => {
            const key = item.name.toLowerCase().trim()
            const existingRow = existingByName.get(key)

            if (existingRow) {
              // Merge: extend recipe_ids without duplicates
              if (item.recipeId && !existingRow.recipe_ids.includes(item.recipeId)) {
                const { error } = await supabase
                  .from('grocery_items')
                  .update({ recipe_ids: [...existingRow.recipe_ids, item.recipeId] })
                  .eq('id', existingRow.id)

                if (error) throw new Error(error.message)
              }
              merged++
            } else {
              const insert: GroceryItemInsert = GroceryItemInsertSchema.parse({
                name: item.name.trim(),
                quantity: item.quantity ?? null,
                unit: item.unit ?? null,
                checked: false,
                recipe_ids: item.recipeId ? [item.recipeId] : [],
                dish_name: item.dishName ?? null,
              })

              const { error } = await supabase
                .from('grocery_items')
                .insert(insert)

              if (error) throw new Error(error.message)
              added++
            }
          })
      )

      return { added, merged }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
    },
    onError: (error) => {
      console.error('[useAddToGrocery] failed:', error.message)
    },
  })
}

/** Toggle the checked state of a grocery item with optimistic update. */
export function useCheckGroceryItem() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: string; checked: boolean }>({
    mutationFn: async ({ id, checked }) => {
      const { error } = await supabase
        .from('grocery_items')
        .update({ checked })
        .eq('id', id)

      if (error) throw new Error(error.message)
    },
    onMutate: async ({ id, checked }) => {
      await queryClient.cancelQueries({ queryKey: ['grocery-items'] })
      const previous = queryClient.getQueryData<DomainGroceryItem[]>(['grocery-items'])

      queryClient.setQueryData<DomainGroceryItem[]>(['grocery-items'], (old) => {
        if (!old) return old
        return [...old]
          .map((item) => (item.id === id ? { ...item, checked } : item))
          .sort((a, b) => {
            if (a.checked !== b.checked) return a.checked ? 1 : -1
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          })
      })

      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['grocery-items'], (ctx as { previous: DomainGroceryItem[] } | undefined)?.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
    },
  })
}

/** Delete a single grocery item with optimistic update. */
export function useDeleteGroceryItem() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('id', id)

      if (error) throw new Error(error.message)
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['grocery-items'] })
      const previous = queryClient.getQueryData<DomainGroceryItem[]>(['grocery-items'])

      queryClient.setQueryData<DomainGroceryItem[]>(['grocery-items'], (old) => {
        if (!old) return old
        return old.filter((item) => item.id !== id)
      })

      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['grocery-items'], (ctx as { previous: DomainGroceryItem[] } | undefined)?.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
    },
  })
}

/** Delete all checked items. */
export function useClearChecked() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('checked', true)

      if (error) throw new Error(error.message)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['grocery-items'] })
      const previous = queryClient.getQueryData<DomainGroceryItem[]>(['grocery-items'])

      queryClient.setQueryData<DomainGroceryItem[]>(['grocery-items'], (old) => {
        if (!old) return old
        return old.filter((item) => !item.checked)
      })

      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['grocery-items'], (ctx as { previous: DomainGroceryItem[] } | undefined)?.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
    },
  })
}


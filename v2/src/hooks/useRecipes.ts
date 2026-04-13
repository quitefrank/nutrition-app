'use client'

/**
 * useRecipes — TanStack Query v5 hooks for recipe CRUD
 *
 * All writes go to Supabase directly via the typed client.
 * Reads hydrate from Supabase; the hooks degrade gracefully if
 * Supabase env vars are not yet configured (queries return empty
 * arrays rather than throwing).
 *
 * Query keys:
 *   ['recipes']                     — full collection
 *   ['recipes', id]                 — single recipe with ingredients
 *   ['recipes', 'restaurant', rid]  — recipes for one restaurant
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  mapRecipe,
  mapIngredient,
  RecipeInsertSchema,
  RecipeUpdateSchema,
  RecipeIngredientInsertSchema,
  type DomainRecipe,
  type DomainIngredient,
  type RecipeInsert,
  type RecipeIngredientInsert,
} from '@/types/database'

// ─── Fetch helpers ────────────────────────────────────────────────────────────

// Columns needed by mapRecipe — explicit to avoid fetching large future columns
const RECIPE_LIST_COLUMNS =
  'id, name, restaurant_id, visit_id, description, dish_image_url, estimated_calories, status, photo_status, gemini_confidence, total_protein_g, total_carbs_g, total_fat_g, total_fibre_g, created_at'

async function fetchRecipes(): Promise<DomainRecipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_LIST_COLUMNS)
    .neq('status', 'removed')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRecipe)
}

async function fetchRecipe(id: string): Promise<DomainRecipe> {
  // Two queries: Supabase's generated types don't resolve the FK join at the
  // type level, so we fetch the recipe row and ingredients separately.
  const [{ data: recipeRow, error: recipeError }, { data: ingredientRows, error: ingError }] =
    await Promise.all([
      supabase.from('recipes').select(RECIPE_LIST_COLUMNS).eq('id', id).single(),
      supabase
        .from('recipe_ingredients')
        .select('id, recipe_id, name, quantity, unit, usda_fdc_id, calories_per_serving, protein_g, fat_g, carbs_g, confidence')
        .eq('recipe_id', id),
    ])

  if (recipeError) throw new Error(recipeError.message)
  if (ingError) throw new Error(ingError.message)

  return {
    ...mapRecipe(recipeRow),
    ingredients: (ingredientRows ?? []).map(mapIngredient),
  }
}

async function fetchRecipesByRestaurant(restaurantId: string): Promise<DomainRecipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_LIST_COLUMNS)
    .eq('restaurant_id', restaurantId)
    .neq('status', 'removed')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRecipe)
}

async function fetchKeptRecipes(): Promise<DomainRecipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_LIST_COLUMNS)
    .eq('status', 'kept')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRecipe)
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

/** Fetch all non-removed recipes, newest first. */
export function useRecipes() {
  return useQuery<DomainRecipe[], Error>({
    queryKey: ['recipes'],
    queryFn: fetchRecipes,
    // If Supabase is not configured, return empty rather than error-looping
    retry: (failureCount, error) => {
      if (error.message.includes('supabase') || failureCount >= 2) return false
      return true
    },
  })
}

/** Fetch a single recipe including its ingredients. */
export function useRecipe(id: string | null) {
  return useQuery<DomainRecipe, Error>({
    queryKey: ['recipes', id],
    queryFn: () => fetchRecipe(id!),
    enabled: !!id,
  })
}

/** Fetch all non-removed recipes for a specific restaurant. */
export function useRecipesByRestaurant(restaurantId: string | null) {
  return useQuery<DomainRecipe[], Error>({
    queryKey: ['recipes', 'restaurant', restaurantId],
    queryFn: () => fetchRecipesByRestaurant(restaurantId!),
    enabled: !!restaurantId,
  })
}

/** Fetch only kept recipes — the "My Recipes" collection. */
export function useKeptRecipes() {
  return useQuery<DomainRecipe[], Error>({
    queryKey: ['recipes', 'kept'],
    queryFn: fetchKeptRecipes,
    retry: (failureCount, error) => {
      if (error.message.includes('supabase') || failureCount >= 2) return false
      return true
    },
  })
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export interface SaveRecipePayload {
  recipe: RecipeInsert
  ingredients: RecipeIngredientInsert[]
}

/** Create a new recipe and its ingredients in a single coordinated write. */
export function useSaveRecipe() {
  const queryClient = useQueryClient()

  return useMutation<DomainRecipe, Error, SaveRecipePayload>({
    mutationFn: async ({ recipe, ingredients }) => {
      // Validate at the boundary (SEC-INJ-1.00)
      const parsedRecipe = RecipeInsertSchema.parse(recipe)

      const { data: recipeRow, error: recipeError } = await supabase
        .from('recipes')
        .insert(parsedRecipe)
        .select()
        .single()

      if (recipeError) throw new Error(recipeError.message)

      if (ingredients.length > 0) {
        const parsedIngredients = ingredients.map((ing) =>
          RecipeIngredientInsertSchema.parse({ ...ing, recipe_id: recipeRow.id })
        )

        const { error: ingError } = await supabase
          .from('recipe_ingredients')
          .insert(parsedIngredients)

        if (ingError) throw new Error(ingError.message)
      }

      return fetchRecipe(recipeRow.id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export interface UpdateRecipePayload {
  id: string
  updates: {
    name?: string
    description?: string | null
    status?: 'auto_captured' | 'kept' | 'removed'
    estimatedCalories?: number | null
  }
}

/** Update mutable fields on an existing recipe. */
export function useUpdateRecipe() {
  const queryClient = useQueryClient()

  return useMutation<DomainRecipe, Error, UpdateRecipePayload>({
    mutationFn: async ({ id, updates }) => {
      // Map camelCase domain fields back to snake_case DB columns
      const dbUpdates: Record<string, unknown> = {}
      if ('name' in updates) dbUpdates.name = updates.name
      if ('description' in updates) dbUpdates.description = updates.description
      if ('status' in updates) dbUpdates.status = updates.status
      if ('estimatedCalories' in updates) dbUpdates.estimated_calories = updates.estimatedCalories

      const parsed = RecipeUpdateSchema.parse(dbUpdates)

      const { error } = await supabase
        .from('recipes')
        .update(parsed)
        .eq('id', id)

      if (error) throw new Error(error.message)
      return fetchRecipe(id)
    },
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['recipes', id] })
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
      void queryClient.invalidateQueries({ queryKey: ['recipes', 'kept'] })
    },
  })
}

/** Soft-delete a recipe by setting status to 'removed'. */
export function useRemoveRecipe() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('recipes')
        .update({ status: 'removed' })
        .eq('id', id)

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
      void queryClient.invalidateQueries({ queryKey: ['recipes', 'kept'] })
    },
  })
}

/** Hard-delete ALL recipes and their ingredients (cascade handled by DB). */
export function useDeleteAllRecipes() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      // supabase-js v2 requires a filter clause on DELETE.
      // neq against the nil UUID matches every real row.
      const { error } = await supabase
        .from('recipes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

/** Hard-delete a recipe and all its ingredients (cascade handled by DB). */
export function useDeleteRecipe() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', id)

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

// ─── Ingredient-level mutations ───────────────────────────────────────────────

export interface UpdateIngredientPayload {
  id: string
  recipeId: string
  updates: Partial<Pick<DomainIngredient, 'name' | 'quantity' | 'unit' | 'confidence'>>
}

export interface AddIngredientPayload {
  recipeId: string
  ingredient: {
    name: string
    quantity?: string | null
    unit?: string | null
  }
}

/** Insert a new ingredient row for an existing recipe. */
export function useAddIngredient() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, AddIngredientPayload>({
    mutationFn: async ({ recipeId, ingredient }) => {
      const parsed = RecipeIngredientInsertSchema.parse({
        recipe_id: recipeId,
        name: ingredient.name,
        quantity: ingredient.quantity ?? null,
        unit: ingredient.unit ?? null,
        confidence: 'medium',
      })

      const { error } = await supabase
        .from('recipe_ingredients')
        .insert(parsed)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { recipeId }) => {
      void queryClient.invalidateQueries({ queryKey: ['recipes', recipeId] })
    },
  })
}

/** Update a single ingredient's editable fields. */
export function useUpdateIngredient() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, UpdateIngredientPayload>({
    mutationFn: async ({ id, updates }) => {
      const dbUpdates: Record<string, unknown> = {}
      if ('name' in updates) dbUpdates.name = updates.name
      if ('quantity' in updates) dbUpdates.quantity = updates.quantity
      if ('unit' in updates) dbUpdates.unit = updates.unit
      if ('confidence' in updates) dbUpdates.confidence = updates.confidence

      const { error } = await supabase
        .from('recipe_ingredients')
        .update(dbUpdates)
        .eq('id', id)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { recipeId }) => {
      void queryClient.invalidateQueries({ queryKey: ['recipes', recipeId] })
    },
  })
}

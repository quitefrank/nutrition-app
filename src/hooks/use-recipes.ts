'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RecipeSaveRequest, RecipeSaveResponse, ApiSuccess } from '@/types/api'
import type { Recipe } from '@/types/domain'

async function fetchRecipes(): Promise<Recipe[]> {
  const res = await fetch('/api/recipes')
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error ?? 'Failed to fetch recipes')
  }
  const json = await res.json()
  return (json as ApiSuccess<Recipe[]>).data
}

export function useRecipes() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: fetchRecipes,
  })
}

export function useSaveRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RecipeSaveRequest): Promise<ApiSuccess<RecipeSaveResponse>> => {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to save recipe')
      }
      const json = await res.json()
      return json as ApiSuccess<RecipeSaveResponse>
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

async function fetchRecipe(id: string): Promise<Recipe> {
  const res = await fetch(`/api/recipes/${id}`)
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error ?? 'Failed to fetch recipe')
  }
  const json = await res.json()
  return (json as ApiSuccess<Recipe>).data
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: ['recipes', id],
    queryFn: () => fetchRecipe(id),
    enabled: !!id,
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (recipeId: string): Promise<void> => {
      const res = await fetch(`/api/recipes/${recipeId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to delete recipe')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

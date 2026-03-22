'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { GroceryAddRequest, GroceryAddResponse, ApiSuccess } from '@/types/api'

export function useAddToGrocery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (recipeId: string): Promise<GroceryAddResponse> => {
      const res = await fetch('/api/grocery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId } satisfies GroceryAddRequest),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to add to grocery list')
      }
      const json = await res.json().catch(() => { throw new Error('Unexpected server response') })
      const data = (json as ApiSuccess<GroceryAddResponse>).data
      if (data == null) throw new Error('Unexpected response format')
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
      const total = data.added + data.merged
      if (total > 0) {
        toast.success(`${total} ingredients updated on your grocery list`)
      } else {
        toast.info('No ingredients to add')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

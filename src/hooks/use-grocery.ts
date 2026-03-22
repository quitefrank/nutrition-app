'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  GroceryAddRequest,
  GroceryAddResponse,
  GroceryListItem,
  GroceryCheckRequest,
  GroceryCheckResponse,
  ApiSuccess,
} from '@/types/api'

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

export function useGroceryItems() {
  return useQuery({
    queryKey: ['grocery-items'],
    queryFn: async (): Promise<GroceryListItem[]> => {
      const res = await fetch('/api/grocery')
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to fetch grocery list')
      }
      const json = await res.json()
      return (json as ApiSuccess<GroceryListItem[]>).data
    },
  })
}

export function useCheckGroceryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }): Promise<GroceryCheckResponse> => {
      const res = await fetch(`/api/grocery/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked } satisfies GroceryCheckRequest),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to update item')
      }
      const json = await res.json()
      return (json as ApiSuccess<GroceryCheckResponse>).data
    },
    onMutate: async ({ id, checked }) => {
      await queryClient.cancelQueries({ queryKey: ['grocery-items'] })
      const previous = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
      queryClient.setQueryData<GroceryListItem[]>(['grocery-items'], old => {
        if (!old) return old
        const updated = old.map(item => item.id === id ? { ...item, checked } : item)
        return [...updated].sort((a, b) => {
          if (a.checked !== b.checked) return a.checked ? 1 : -1
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['grocery-items'], ctx?.previous)
      toast.error('Failed to update item')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
    },
  })
}

export function useDeleteGroceryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/grocery/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to delete item')
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['grocery-items'] })
      const previous = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
      queryClient.setQueryData<GroceryListItem[]>(['grocery-items'], old => {
        if (!old) return old
        return old.filter(item => item.id !== id)
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['grocery-items'], ctx?.previous)
      toast.error('Failed to delete item')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
    },
  })
}

export function useClearChecked() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch('/api/grocery/bulk?checked=true', { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to clear checked items')
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['grocery-items'] })
      const previous = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
      queryClient.setQueryData<GroceryListItem[]>(['grocery-items'], old => {
        if (!old) return old
        return old.filter(item => !item.checked)
      })
      return { previous }
    },
    onError: (error: Error, _vars, ctx) => {
      queryClient.setQueryData(['grocery-items'], ctx?.previous)
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
    },
  })
}

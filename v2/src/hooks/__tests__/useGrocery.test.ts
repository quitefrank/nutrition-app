import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useGroceryItems,
  useCheckGroceryItem,
  useDeleteGroceryItem,
  useClearChecked,
  useAddToGrocery,
} from '../useGrocery'
import type { DomainGroceryItem } from '@/types/database'

// ─── Supabase mock ────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => {
  const from = vi.fn()
  return { supabase: { from } }
})

import { supabase } from '@/lib/supabase'

/**
 * Build a chainable, thenable Supabase query builder mock.
 * - Awaiting the builder itself resolves to `result` (covers .select().order() chains)
 * - Calling .single() returns a separate Promise resolving to `result`
 */
function makeBuilder(result: { data?: unknown; error?: { message: string } | null }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  const p = Promise.resolve(resolved)
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolved)),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  return builder
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

function createWrapperWithClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, wrapper }
}

const mockItem: DomainGroceryItem = {
  id: 'g1',
  name: 'Eggs',
  quantity: '2',
  unit: null,
  checked: false,
  recipeIds: [],
  createdAt: '2026-01-01T00:00:00Z',
}

const mockItemRow = {
  id: 'g1',
  name: 'Eggs',
  quantity: '2',
  unit: null,
  checked: false,
  recipe_ids: [],
  created_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── useGroceryItems ──────────────────────────────────────────────────────────

describe('useGroceryItems', () => {
  it('returns DomainGroceryItem[] from Supabase on success', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeBuilder({ data: [mockItemRow] }) as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useGroceryItems(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(supabase.from).toHaveBeenCalledWith('grocery_items')
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].id).toBe('g1')
    expect(result.current.data?.[0].name).toBe('Eggs')
  })

  it('surfaces error when Supabase returns error', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null, error: { message: 'DB connection failed' } }) as ReturnType<typeof supabase.from>
    )

    const { result } = renderHook(() => useGroceryItems(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('DB connection failed')
  })

  it('returns empty array when data is null', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeBuilder({ data: null }) as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useGroceryItems(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

// ─── useCheckGroceryItem ──────────────────────────────────────────────────────

describe('useCheckGroceryItem', () => {
  it('calls Supabase update on grocery_items with checked state', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useCheckGroceryItem(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync({ id: 'g1', checked: true })
    })

    expect(supabase.from).toHaveBeenCalledWith('grocery_items')
  })

  it('applies optimistic update immediately before network call', async () => {
    // Delay the network call so we can inspect the cache mid-flight
    let resolveNetwork!: () => void
    const pending = new Promise<void>((resolve) => { resolveNetwork = resolve })

    const p = pending.then(() => ({ data: null, error: null }))
    const builder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      single: vi.fn(() => p),
      then: p.then.bind(p),
      catch: p.catch.bind(p),
      finally: p.finally.bind(p),
    }
    vi.mocked(supabase.from).mockReturnValue(builder as ReturnType<typeof supabase.from>)

    const { qc, wrapper } = createWrapperWithClient()
    qc.setQueryData<DomainGroceryItem[]>(['grocery-items'], [mockItem])

    renderHook(() => useCheckGroceryItem(), { wrapper }).result.current.mutate({ id: 'g1', checked: true })

    // Without awaiting — check cache immediately (optimistic)
    await act(async () => { await Promise.resolve() })
    const cached = qc.getQueryData<DomainGroceryItem[]>(['grocery-items'])
    expect(cached?.[0].checked).toBe(true)

    resolveNetwork()
  })

  it('rolls back optimistic update on Supabase error', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null, error: { message: 'update failed' } }) as ReturnType<typeof supabase.from>
    )

    const { qc, wrapper } = createWrapperWithClient()
    qc.setQueryData<DomainGroceryItem[]>(['grocery-items'], [mockItem])

    const { result } = renderHook(() => useCheckGroceryItem(), { wrapper })

    await act(async () => {
      try { await result.current.mutateAsync({ id: 'g1', checked: true }) } catch { /* expected */ }
    })

    await waitFor(() => {
      const cached = qc.getQueryData<DomainGroceryItem[]>(['grocery-items'])
      expect(cached?.[0].checked).toBe(false) // rolled back
    })
  })

  it('invalidates [grocery-items] on settle', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)

    const { qc, wrapper } = createWrapperWithClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCheckGroceryItem(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'g1', checked: true })
    })

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['grocery-items'] })
    })
  })
})

// ─── useDeleteGroceryItem ─────────────────────────────────────────────────────

describe('useDeleteGroceryItem', () => {
  it('calls Supabase delete on grocery_items', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useDeleteGroceryItem(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync('g1')
    })

    expect(supabase.from).toHaveBeenCalledWith('grocery_items')
  })

  it('removes item from cache optimistically', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)

    const { qc, wrapper } = createWrapperWithClient()
    qc.setQueryData<DomainGroceryItem[]>(['grocery-items'], [mockItem])

    const { result } = renderHook(() => useDeleteGroceryItem(), { wrapper })

    act(() => { result.current.mutate('g1') })

    await act(async () => { await Promise.resolve() })
    expect(qc.getQueryData<DomainGroceryItem[]>(['grocery-items'])).toEqual([])
  })

  it('rolls back on error', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeBuilder({ data: null, error: { message: 'delete failed' } }) as ReturnType<typeof supabase.from>
    )

    const { qc, wrapper } = createWrapperWithClient()
    qc.setQueryData<DomainGroceryItem[]>(['grocery-items'], [mockItem])

    const { result } = renderHook(() => useDeleteGroceryItem(), { wrapper })

    await act(async () => {
      try { await result.current.mutateAsync('g1') } catch { /* expected */ }
    })

    await waitFor(() => {
      expect(qc.getQueryData<DomainGroceryItem[]>(['grocery-items'])).toEqual([mockItem])
    })
  })
})

// ─── useClearChecked ──────────────────────────────────────────────────────────

describe('useClearChecked', () => {
  it('removes checked items from cache optimistically', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)

    const checkedItem: DomainGroceryItem = { ...mockItem, id: 'g2', checked: true }
    const { qc, wrapper } = createWrapperWithClient()
    qc.setQueryData<DomainGroceryItem[]>(['grocery-items'], [mockItem, checkedItem])

    const { result } = renderHook(() => useClearChecked(), { wrapper })

    act(() => { result.current.mutate() })

    await act(async () => { await Promise.resolve() })
    const cached = qc.getQueryData<DomainGroceryItem[]>(['grocery-items'])
    expect(cached).toEqual([mockItem])
  })

  it('invalidates [grocery-items] on settle (success and error)', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)

    const { qc, wrapper } = createWrapperWithClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useClearChecked(), { wrapper })

    await act(async () => { await result.current.mutateAsync() })

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['grocery-items'] })
    })
  })
})

// ─── useAddToGrocery ──────────────────────────────────────────────────────────

describe('useAddToGrocery', () => {
  it('calls Supabase to fetch existing items then insert new ones', async () => {
    // First call: select existing items → empty
    // Second call: insert new item
    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeBuilder({ data: [] }) as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useAddToGrocery(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync({
        items: [{ name: 'Eggs', quantity: '2', unit: null }],
      })
    })

    expect(supabase.from).toHaveBeenCalledWith('grocery_items')
  })

  it('returns { added: 1, merged: 0 } when inserting a new item', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeBuilder({ data: [] }) as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useAddToGrocery(), { wrapper: createWrapper() })

    let response: { added: number; merged: number } | undefined
    await act(async () => {
      response = await result.current.mutateAsync({
        items: [{ name: 'Butter', quantity: '50', unit: 'g' }],
      })
    })

    expect(response?.added).toBe(1)
    expect(response?.merged).toBe(0)
  })

  it('returns { added: 0, merged: 1 } when item already exists', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(
        makeBuilder({ data: [{ ...mockItemRow, id: 'existing', name: 'Eggs', recipe_ids: [] }] }) as ReturnType<typeof supabase.from>
      )
      .mockReturnValueOnce(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useAddToGrocery(), { wrapper: createWrapper() })

    let response: { added: number; merged: number } | undefined
    await act(async () => {
      response = await result.current.mutateAsync({
        items: [{ name: 'eggs', quantity: '4', unit: null, recipeId: 'recipe-1' }],
      })
    })

    expect(response?.added).toBe(0)
    expect(response?.merged).toBe(1)
  })

  it('returns { added: 0, merged: 0 } for empty items array', async () => {
    const { result } = renderHook(() => useAddToGrocery(), { wrapper: createWrapper() })

    let response: { added: number; merged: number } | undefined
    await act(async () => {
      response = await result.current.mutateAsync({ items: [] })
    })

    expect(response?.added).toBe(0)
    expect(response?.merged).toBe(0)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('invalidates [grocery-items] on success', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(makeBuilder({ data: [] }) as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(makeBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>)

    const { qc, wrapper } = createWrapperWithClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useAddToGrocery(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ items: [{ name: 'Flour', quantity: '200', unit: 'g' }] })
    })

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['grocery-items'] })
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { retakeMergeAndSave } from './retakeMergeAndSave'

// ─── Supabase mock ────────────────────────────────────────────────────────────
//
// Strategy: mock `supabase.from(tableName)` to return a chain based on the
// table name. This avoids the fragile call-order counting of the old mock.

const mockVisitInsertChain = {
  select: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { id: 'visit-123' }, error: null }),
}

const mockRecipesSelectChain = {
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockResolvedValue({ data: [], error: null }),
}

const mockRecipesBulkInsertChain = {
  select: vi.fn().mockResolvedValue({ data: [], error: null }),
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'restaurant_visits') {
        return { insert: vi.fn(() => mockVisitInsertChain) }
      }
      if (table === 'recipes') {
        return {
          select: vi.fn(() => mockRecipesSelectChain),
          insert: vi.fn(() => mockRecipesBulkInsertChain),
        }
      }
      if (table === 'recipe_ingredients') {
        return { insert: vi.fn(() => Promise.resolve({ error: null })) }
      }
      return {}
    }),
  },
}))

// ─── QueryClient mock ─────────────────────────────────────────────────────────

const mockInvalidateQueries = vi.fn().mockResolvedValue(undefined)
const mockQueryClient = { invalidateQueries: mockInvalidateQueries }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRetakeDish(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    description: `${name} description`,
    calorieEstimate: 300,
    confidence: 0.85,
    ingredients: [{ name: 'ingredient', quantity: '100', unit: 'g', confidenceLevel: 'high' as const }],
    ...extra,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('retakeMergeAndSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset visit insert to succeed
    mockVisitInsertChain.select.mockReturnThis()
    mockVisitInsertChain.single.mockResolvedValue({ data: { id: 'visit-123' }, error: null })

    // Reset bulk recipe SELECT to return empty (no existing dishes)
    mockRecipesSelectChain.eq.mockReturnThis()
    mockRecipesSelectChain.neq.mockResolvedValue({ data: [], error: null })

    // Reset bulk recipe INSERT to succeed with no inserted rows by default
    mockRecipesBulkInsertChain.select.mockResolvedValue({ data: [], error: null })
  })

  it('in-memory dedup: does not insert dishes already in existingDishNames (case-insensitive)', async () => {
    mockRecipesSelectChain.neq.mockResolvedValue({ data: [], error: null })
    mockRecipesBulkInsertChain.select.mockResolvedValue({
      data: [{ id: 'recipe-1', name: 'Tiramisu' }],
      error: null,
    })

    const result = await retakeMergeAndSave({
      restaurantId: 'rest-1',
      newDishes: [
        makeRetakeDish('Pasta Carbonara'), // in existingDishNames → skip
        makeRetakeDish('Tiramisu'),        // new → insert
      ],
      existingDishNames: ['pasta carbonara'], // normalised lowercase
      queryClient: mockQueryClient as never,
    })

    // Only Tiramisu passes the in-memory filter → bulk insert called with 1 dish → returns 1
    expect(result).toBe(1)
  })

  it('P11: normalises existingDishNames internally (mixed-case input still deduped)', async () => {
    mockRecipesBulkInsertChain.select.mockResolvedValue({ data: [], error: null })

    const result = await retakeMergeAndSave({
      restaurantId: 'rest-1',
      newDishes: [makeRetakeDish('Pasta Carbonara')],
      existingDishNames: ['  PASTA CARBONARA  '], // un-normalised → function should normalise
      queryClient: mockQueryClient as never,
    })

    expect(result).toBe(0)
  })

  it('DB dedup: does not insert dish that exists in Supabase but not in existingDishNames', async () => {
    mockRecipesSelectChain.neq.mockResolvedValue({
      data: [{ name: 'Known Dish' }], // DB already has it
      error: null,
    })
    mockRecipesBulkInsertChain.select.mockResolvedValue({ data: [], error: null })

    const result = await retakeMergeAndSave({
      restaurantId: 'rest-1',
      newDishes: [makeRetakeDish('Known Dish')],
      existingDishNames: [],
      queryClient: mockQueryClient as never,
    })

    expect(result).toBe(0)
    // Bulk insert select should NOT have been called (trulyNewDishes is empty)
    expect(mockRecipesBulkInsertChain.select).not.toHaveBeenCalled()
  })

  it('P12: raw_menu_json uses ALL newDishes, not just the deduped subset', async () => {
    const { supabase } = await import('@/lib/supabase')

    let capturedInsertArg: Record<string, unknown> | null = null
    const visitFrom = (supabase.from as ReturnType<typeof vi.fn>)

    // Intercept the insert call on restaurant_visits to capture its argument
    visitFrom.mockImplementation((table: string) => {
      if (table === 'restaurant_visits') {
        return {
          insert: vi.fn((arg: Record<string, unknown>) => {
            capturedInsertArg = arg
            return mockVisitInsertChain
          }),
        }
      }
      if (table === 'recipes') {
        return {
          select: vi.fn(() => mockRecipesSelectChain),
          insert: vi.fn(() => mockRecipesBulkInsertChain),
        }
      }
      if (table === 'recipe_ingredients') {
        return { insert: vi.fn(() => Promise.resolve({ error: null })) }
      }
      return {}
    })

    await retakeMergeAndSave({
      restaurantId: 'rest-1',
      newDishes: [makeRetakeDish('Dish A'), makeRetakeDish('Dish B')],
      existingDishNames: ['dish b'], // Dish B excluded from insert, but should appear in raw_menu_json
      queryClient: mockQueryClient as never,
    })

    expect(capturedInsertArg).not.toBeNull()
    const parsed = JSON.parse(capturedInsertArg!.raw_menu_json as string) as Array<{ name: string }>
    const names = parsed.map((d) => d.name)
    expect(names).toContain('Dish A')
    expect(names).toContain('Dish B') // must be present even though it was deduped from insert
  })

  it('returns count of newly inserted recipes (bulk insert result length)', async () => {
    mockRecipesSelectChain.neq.mockResolvedValue({ data: [], error: null })
    mockRecipesBulkInsertChain.select.mockResolvedValue({
      data: [{ id: 'recipe-1', name: 'Dish A' }, { id: 'recipe-2', name: 'Dish B' }],
      error: null,
    })

    const result = await retakeMergeAndSave({
      restaurantId: 'rest-1',
      newDishes: [makeRetakeDish('Dish A'), makeRetakeDish('Dish B')],
      existingDishNames: [],
      queryClient: mockQueryClient as never,
    })

    expect(result).toBe(2)
  })

  it('returns 0 when all dishes are filtered by in-memory dedup', async () => {
    const result = await retakeMergeAndSave({
      restaurantId: 'rest-1',
      newDishes: [makeRetakeDish('Risotto'), makeRetakeDish('Pasta')],
      existingDishNames: ['risotto', 'pasta'],
      queryClient: mockQueryClient as never,
    })

    expect(result).toBe(0)
    // Bulk insert should never be reached
    expect(mockRecipesBulkInsertChain.select).not.toHaveBeenCalled()
  })

  it('still creates a visit row even when 0 new dishes are inserted', async () => {
    const { supabase } = await import('@/lib/supabase')

    await retakeMergeAndSave({
      restaurantId: 'rest-1',
      newDishes: [],
      existingDishNames: [],
      queryClient: mockQueryClient as never,
    })

    const visitCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls
      .filter(([t]: [string]) => t === 'restaurant_visits')
    expect(visitCalls.length).toBe(1)
  })

  it('P7: logs warning when visit insert fails but still proceeds', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockVisitInsertChain.single.mockResolvedValue({
      data: null,
      error: { message: 'visit insert failed' },
    })
    mockRecipesBulkInsertChain.select.mockResolvedValue({
      data: [{ id: 'recipe-1', name: 'Dish A' }],
      error: null,
    })

    const result = await retakeMergeAndSave({
      restaurantId: 'rest-1',
      newDishes: [makeRetakeDish('Dish A')],
      existingDishNames: [],
      queryClient: mockQueryClient as never,
    })

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('retakeMergeAndSave'),
      expect.any(String)
    )
    // Function should still complete (visit is best-effort)
    expect(result).toBe(1)
    warnSpy.mockRestore()
  })

  it('calls queryClient.invalidateQueries with correct key', async () => {
    await retakeMergeAndSave({
      restaurantId: 'rest-xyz',
      newDishes: [],
      existingDishNames: [],
      queryClient: mockQueryClient as never,
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['recipes', 'restaurant', 'rest-xyz'],
    })
  })

  it('handles bulk recipe insert error gracefully — logs warning, returns 0', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockRecipesBulkInsertChain.select.mockResolvedValue({
      data: null,
      error: { message: 'bulk insert failed' },
    })

    const result = await retakeMergeAndSave({
      restaurantId: 'rest-1',
      newDishes: [makeRetakeDish('Failing Dish')],
      existingDishNames: [],
      queryClient: mockQueryClient as never,
    })

    expect(result).toBe(0)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

/**
 * useEnrichment — degraded states (Story 6.5 AC4 + AC5)
 *
 * Verifies that the enrichment hook silently swallows all external API failures:
 *  - /api/scan/enrich non-ok responses
 *  - Network failures
 *  - Supabase write failures via Promise.allSettled
 *  - No events dispatched, no sessionStorage modifications, no unhandled rejections
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ─── Module mocks ─────────────────────────────────────────────────────────────

const { mockInvalidateQueries, mockEq, mockUpdate, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ error: null })
  const mockUpdate = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ update: mockUpdate }))
  const mockInvalidateQueries = vi.fn()
  return { mockInvalidateQueries, mockEq, mockUpdate, mockFrom }
})

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  }
})

// Supabase chained mock: supabase.from('recipes').update({...}).eq('id', ...)
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

// Import after mocks are registered
import { useEnrichment } from './useEnrichment'

// ─── sessionStorage mock ──────────────────────────────────────────────────────

const mockSS: Record<string, string> = {}
const sessionStorageMock = {
  getItem: vi.fn((key: string) => mockSS[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { mockSS[key] = val }),
  removeItem: vi.fn((key: string) => { delete mockSS[key] }),
  length: 0,
  key: () => null,
  clear: vi.fn(),
}
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock, writable: true })

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCAN_KEY = 'plately:scan:test-key'
const DISH_TO_RECIPE_MAP: Record<string, string> = {
  'dish-1': 'recipe-uuid-1',
}

const VALID_SCAN_DATA = JSON.stringify({
  allDishes: [{ id: 'dish-1', name: 'Pasta Carbonara', description: 'Classic Roman pasta' }],
  restaurantName: 'Test Bistro',
})

/** Enriched dish data returned by /api/scan/enrich */
function enrichedResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () => Promise.resolve({
      data: {
        dishes: [{
          id: 'dish-1',
          name: 'Pasta Carbonara',
          servings: 1,
          ingredients: [{ name: 'Egg', calories_kcal: 78, protein_g: 6, fat_g: 5, carbs_g: 1 }],
          photoUrl: 'https://example.com/photo.jpg',
          totalCalories: 600,
          totalProtein: 25,
          totalFat: 22,
          totalCarbs: 80,
          ...overrides,
        }],
      },
    }),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useEnrichment — degraded states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockSS).forEach(k => delete mockSS[k])
    mockSS[SCAN_KEY] = VALID_SCAN_DATA

    // Default: fetch is not configured — individual tests set it up
    global.fetch = vi.fn()
  })

  it('/api/scan/enrich 503 is handled silently — no error thrown, isEnriching returns to false', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 503 })

    const { result } = renderHook(() => useEnrichment())

    act(() => {
      result.current.enrich(SCAN_KEY, DISH_TO_RECIPE_MAP)
    })

    // isEnriching should return to false (finally block runs even on early return)
    await waitFor(() => expect(result.current.isEnriching).toBe(false))
    // No throw — hook stays stable
    expect(result.current.enrich).toBeDefined()
  })

  it('/api/scan/enrich network failure is handled silently', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const { result } = renderHook(() => useEnrichment())

    act(() => {
      result.current.enrich(SCAN_KEY, DISH_TO_RECIPE_MAP)
    })

    await waitFor(() => expect(result.current.isEnriching).toBe(false))
    // catch { } swallows the network error
    expect(result.current.enrich).toBeDefined()
  })

  it('enrichment failure does not dispatch plately:enriched event', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 503 })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { result } = renderHook(() => useEnrichment())
    act(() => { result.current.enrich(SCAN_KEY, DISH_TO_RECIPE_MAP) })
    await waitFor(() => expect(result.current.isEnriching).toBe(false))

    const enrichedEvents = dispatchSpy.mock.calls.filter(
      ([event]) => event instanceof CustomEvent && event.type === 'plately:enriched'
    )
    expect(enrichedEvents).toHaveLength(0)
  })

  it('enrichment failure does not modify sessionStorage', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 503 })

    const { result } = renderHook(() => useEnrichment())
    act(() => { result.current.enrich(SCAN_KEY, DISH_TO_RECIPE_MAP) })
    await waitFor(() => expect(result.current.isEnriching).toBe(false))

    // setItem should never have been called with enriched: true
    const setItemCalls = (sessionStorageMock.setItem as ReturnType<typeof vi.fn>).mock.calls
    const enrichedWrites = setItemCalls.filter(([, val]) => {
      try {
        return JSON.parse(val as string)?.enriched === true
      } catch {
        return false
      }
    })
    expect(enrichedWrites).toHaveLength(0)
  })

  it('Supabase write failure in Promise.allSettled does not throw', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(enrichedResponse())
    // Supabase update().eq() rejects — Promise.allSettled catches it
    mockEq.mockRejectedValueOnce(new Error('Supabase connection error'))

    const { result } = renderHook(() => useEnrichment())
    act(() => { result.current.enrich(SCAN_KEY, DISH_TO_RECIPE_MAP) })

    // Should still complete without throwing
    await waitFor(() => expect(result.current.isEnriching).toBe(false))
    // Hook is stable
    expect(result.current.enrich).toBeDefined()
  })

  it('Supabase write failure for one recipe does not block invalidateQueries', async () => {
    // Two dishes → two recipe IDs
    const twoDishesScanData = JSON.stringify({
      allDishes: [
        { id: 'dish-1', name: 'Pasta', description: '' },
        { id: 'dish-2', name: 'Salad', description: '' },
      ],
      restaurantName: 'Test',
    })
    mockSS[SCAN_KEY] = twoDishesScanData

    const twoRecipeMap = { 'dish-1': 'recipe-uuid-1', 'dish-2': 'recipe-uuid-2' }

    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          dishes: [
            { id: 'dish-1', name: 'Pasta', servings: 1, ingredients: [], photoUrl: 'https://x.com/1.jpg', totalCalories: 400, totalProtein: 15, totalFat: 10, totalCarbs: 60 },
            { id: 'dish-2', name: 'Salad', servings: 1, ingredients: [], photoUrl: 'https://x.com/2.jpg', totalCalories: 150, totalProtein: 5, totalFat: 3, totalCarbs: 20 },
          ],
        },
      }),
    })

    // First eq() call fails; second succeeds — Promise.allSettled handles both
    mockEq
      .mockRejectedValueOnce(new Error('Write failed for dish-1'))
      .mockResolvedValue({ error: null })

    const { result } = renderHook(() => useEnrichment())
    act(() => { result.current.enrich(SCAN_KEY, twoRecipeMap) })
    await waitFor(() => expect(result.current.isEnriching).toBe(false))

    // invalidateQueries IS still called — Promise.allSettled settled even with one failure
    expect(mockInvalidateQueries).toHaveBeenCalled()
  })

  it('queryClient.invalidateQueries is NOT called when enrichment fails before write step', async () => {
    // Enrich API returns non-ok → hook returns early before reaching the Supabase write step
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 503 })

    const { result } = renderHook(() => useEnrichment())
    act(() => { result.current.enrich(SCAN_KEY, DISH_TO_RECIPE_MAP) })
    await waitFor(() => expect(result.current.isEnriching).toBe(false))

    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })
})

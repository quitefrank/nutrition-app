/**
 * RestaurantScreen — Places recovery integration tests (Story 6.4)
 *
 * These tests verify the automatic Places recovery flow:
 * when a search-path auto-scan leaves unrecognised dishes, RestaurantScreen
 * silently calls POST /api/places/recover-menu once per session.
 *
 * Kept in a separate file following the project's per-story test pattern
 * (matches RestaurantScreen.retake.test.tsx, RestaurantScreen.manual.test.tsx).
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { RestaurantScreen } from './RestaurantScreen'
import type { DomainRecipe } from '@/types/database'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockUseRestaurants, mockUseRecipesByRestaurant, mockInvalidateQueries } = vi.hoisted(() => ({
  mockUseRestaurants: vi.fn(),
  mockUseRecipesByRestaurant: vi.fn(),
  mockInvalidateQueries: vi.fn(),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  }
})

vi.mock('@/hooks/useRestaurants', () => ({
  useRestaurants: mockUseRestaurants,
}))

vi.mock('@/hooks/useRecipes', () => ({
  useRecipesByRestaurant: mockUseRecipesByRestaurant,
  useRemoveRecipe: () => ({ mutate: vi.fn() }),
  useUpdateRecipe: () => ({ mutate: vi.fn() }),
  useRecipe: () => ({ data: null, isError: false }),
}))

vi.mock('@/hooks/useEnrichment', () => ({
  useEnrichment: () => ({ enrich: vi.fn() }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: vi.fn().mockResolvedValue({}) }),
  },
}))

vi.mock('@/lib/supabaseAutoSave', () => ({
  autoSaveToSupabase: vi.fn().mockResolvedValue({}),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_PLACE_ID = 'recovery-place-id'
const TEST_RESTAURANT_ID = 'recovery-rest-uuid'

/** A restaurant with a placeId — used for all recovery tests. */
const mockRestaurant = {
  id: TEST_RESTAURANT_ID,
  placeId: TEST_PLACE_ID,
  name: 'The Golden Bowl',
  address: '123 Main St',
  cuisineType: null,
  referenceImageUrl: null,
  atmosphericPaletteJson: null,
  rating: 4.5,
  userRatingsTotal: 120,
  createdAt: new Date().toISOString(),
}

/** A restaurant without a placeId — used for the AC6 guard test. */
const mockRestaurantNoPlaceId = { ...mockRestaurant, placeId: null }

function makeDomainRecipe(index: number): DomainRecipe {
  return {
    id: `recipe-${index}-uuid-0000-0000-0000-000000000000`,
    restaurantId: TEST_RESTAURANT_ID,
    visitId: null,
    name: `Dish ${index + 1}`,
    description: '',
    dishImageUrl: null,
    estimatedCalories: null,
    status: 'auto_captured' as const,
    photoStatus: 'placeholder' as const,
    geminiConfidence: 0.85,
    dishRating: null,
    dishReviewSnippet: null,
    totalProteinG: null,
    totalCarbsG: null,
    totalFatG: null,
    totalFibreG: null,
    createdAt: new Date().toISOString(),
    ingredients: [],
  }
}

/**
 * Write a search-path session entry — sets visitSource: 'search' so the recovery
 * effect's discriminator guard passes. Uses empty allDishes to avoid adding
 * session-only recipes on top of the Supabase recipes.
 */
function setUpSearchScanSession(options: {
  totalDetected: number
  restaurantPlaceId?: string
}) {
  sessionStorage.setItem('plately_scan_recovery_test', JSON.stringify({
    type: 'menu',
    restaurantName: 'The Golden Bowl',
    restaurantPlaceId: options.restaurantPlaceId ?? TEST_PLACE_ID,
    allDishes: [],
    totalDetected: options.totalDetected,
    scannedAt: Date.now(),
    visitSource: 'search',
  }))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RestaurantScreen — Places recovery (Story 6.4)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()

    // Default: restaurant with placeId, 3 Supabase recipes (gap vs. totalDetected: 10)
    mockUseRestaurants.mockReturnValue({ data: [mockRestaurant], isPending: false })
    mockUseRecipesByRestaurant.mockReturnValue({
      data: [makeDomainRecipe(0), makeDomainRecipe(1), makeDomainRecipe(2)],
      isPending: false,
    })

    // Default fetch: recovery returns 0 new dishes (silent)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { newDishCount: 0 } }),
    } as unknown as Response)
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('calls /api/places/recover-menu automatically when unrecognised dishes exist and restaurant has placeId', async () => {
    // Arrange: session gap (totalDetected: 10 > recipes.length: 3), visitSource: search
    setUpSearchScanSession({ totalDetected: 10 })

    render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        '/api/places/recover-menu',
        expect.objectContaining({ method: 'POST' })
      )
    })

    const body = JSON.parse(
      (vi.mocked(global.fetch).mock.calls.find(([url]) => url === '/api/places/recover-menu')![1] as RequestInit).body as string
    )
    expect(body.placeId).toBe(TEST_PLACE_ID)
    expect(body.restaurantId).toBe(TEST_RESTAURANT_ID)
  })

  it('does NOT call /api/places/recover-menu when all dishes were recognised (recipes.length >= totalDetected)', async () => {
    // Arrange: 3 recipes, totalDetected: 3 → no gap
    setUpSearchScanSession({ totalDetected: 3 })

    render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    // Flush microtasks so the effect has time to fire (if it were going to)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    const recoveryCalls = vi.mocked(global.fetch).mock.calls.filter(
      ([url]) => url === '/api/places/recover-menu'
    )
    expect(recoveryCalls).toHaveLength(0)
  })

  it('does NOT call /api/places/recover-menu when restaurant has no placeId (AC6)', async () => {
    setUpSearchScanSession({ totalDetected: 10 })
    mockUseRestaurants.mockReturnValue({ data: [mockRestaurantNoPlaceId], isPending: false })

    render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    const recoveryCalls = vi.mocked(global.fetch).mock.calls.filter(
      ([url]) => url === '/api/places/recover-menu'
    )
    expect(recoveryCalls).toHaveLength(0)
  })

  it('does NOT call /api/places/recover-menu more than once per session (ref guard — AC5)', async () => {
    setUpSearchScanSession({ totalDetected: 10 })

    const { rerender } = render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    // Wait for the first (and only expected) recovery call
    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        '/api/places/recover-menu',
        expect.any(Object)
      )
    })

    // Simulate React Query delivering 1 additional recipe (still a gap: 4 < 10)
    // — this changes recipes.length dep, re-evaluating the effect
    mockUseRecipesByRestaurant.mockReturnValue({
      data: Array.from({ length: 4 }, (_, i) => makeDomainRecipe(i)),
      isPending: false,
    })
    rerender(<RestaurantScreen placeId={TEST_PLACE_ID} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    const recoveryCalls = vi.mocked(global.fetch).mock.calls.filter(
      ([url]) => url === '/api/places/recover-menu'
    )
    // Ref guard prevents a second call
    expect(recoveryCalls).toHaveLength(1)
  })

  it('invalidates recipe query cache when recovery returns newDishCount > 0', async () => {
    setUpSearchScanSession({ totalDetected: 10 })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { newDishCount: 2 } }),
    } as unknown as Response)

    render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['recipes', 'restaurant'] })
      )
    })
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['recipes'] })
    )
  })

  it('does NOT invalidate cache or show error when recovery returns newDishCount: 0', async () => {
    setUpSearchScanSession({ totalDetected: 10 })
    // Default fetch already returns newDishCount: 0

    const { container } = render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    // Wait for recovery fetch to complete
    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        '/api/places/recover-menu',
        expect.any(Object)
      )
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    // No cache invalidation
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['recipes', 'restaurant'] })
    )
    // No error banner (role="alert" is the ScanConfidenceBanner, not an error)
    // Verify no new error element was introduced
    const errorElements = container.querySelectorAll('[role="alert"][data-error]')
    expect(errorElements).toHaveLength(0)
  })

  it('does NOT show an error banner when /api/places/recover-menu fetch fails (AC4)', async () => {
    setUpSearchScanSession({ totalDetected: 10 })
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

    const { queryByRole } = render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    // The ScanConfidenceBanner (role="alert") is the ONLY alert — no new error alert
    const alerts = queryByRole('alert')
    // Banner stays with original options (it's the ScanConfidenceBanner, not an error)
    // No additional error elements rendered
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
    // ScanConfidenceBanner should still be visible (original options intact)
    expect(alerts).toBeTruthy()
  })
})

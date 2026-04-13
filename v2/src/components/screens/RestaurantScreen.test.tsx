import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RestaurantScreen } from './RestaurantScreen'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// vi.hoisted ensures mock refs are available inside vi.mock factory functions.

const { mockUseRecipesByRestaurant } = vi.hoisted(() => ({
  mockUseRecipesByRestaurant: vi.fn(),
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
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

vi.mock('@/hooks/useRestaurants', () => ({
  useRestaurants: () => ({ data: [], isPending: false }),
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

/**
 * Write a camera-scan session entry to sessionStorage.
 * loadTotalDetected() reads keys prefixed with `plately_scan_`.
 * loadRecipesForRestaurant() reads any key with matching restaurantPlaceId + allDishes.
 */
function setUpScanSession(options: {
  restaurantPlaceId: string
  dishCount: number
  totalDetected: number
}) {
  sessionStorage.setItem('plately_scan_story61_test', JSON.stringify({
    type: 'menu',
    restaurantName: 'Test Restaurant',
    restaurantPlaceId: options.restaurantPlaceId,
    allDishes: Array.from({ length: options.dishCount }, (_, i) => ({ name: `Dish ${i + 1}` })),
    totalDetected: options.totalDetected,
    scannedAt: Date.now(),
  }))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScanConfidenceBanner integration — RestaurantScreen (Story 6.1)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockUseRecipesByRestaurant.mockReturnValue({ data: [], isPending: false })
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('banner is absent when totalDetected is 0 (search path — AC5)', () => {
    // No plately_scan_* key → loadTotalDetected returns 0 → condition false
    render(<RestaurantScreen placeId="test-place-id" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('banner is absent when all dishes recognised (recipes.length === totalDetected — AC2)', () => {
    setUpScanSession({ restaurantPlaceId: 'test-place-id', dishCount: 10, totalDetected: 10 })
    render(<RestaurantScreen placeId="test-place-id" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('banner is absent while recipesPending is true', () => {
    mockUseRecipesByRestaurant.mockReturnValue({ data: [], isPending: true })
    setUpScanSession({ restaurantPlaceId: 'test-place-id', dishCount: 8, totalDetected: 10 })
    render(<RestaurantScreen placeId="test-place-id" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('banner is present when totalDetected > recipes.length (scan path — AC1)', () => {
    setUpScanSession({ restaurantPlaceId: 'test-place-id', dishCount: 8, totalDetected: 10 })
    render(<RestaurantScreen placeId="test-place-id" />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('8 of 10 dishes read')).toBeTruthy()
  })

  it('banner dismisses after "Continue with N" is tapped (AC4)', async () => {
    // Arrange: 10 detected, only 8 recognised → banner shows
    setUpScanSession({ restaurantPlaceId: 'test-place-id', dishCount: 8, totalDetected: 10 })
    render(<RestaurantScreen placeId="test-place-id" />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('8 of 10 dishes read')).toBeTruthy()

    // Act: tap "Continue with 8" → setBannerDismissed(true)
    await userEvent.click(screen.getByRole('button', { name: /Continue with 8/i }))

    // Assert: banner gone
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

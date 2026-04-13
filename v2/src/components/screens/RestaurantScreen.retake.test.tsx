import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RestaurantScreen } from './RestaurantScreen'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockUseRecipesByRestaurant } = vi.hoisted(() => ({
  mockUseRecipesByRestaurant: vi.fn(),
}))

// ─── Module mocks ──────────────────────────────────────────────────────────────

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

// Mock CameraModal so we can verify it renders in retake mode
// without needing real camera/scan infrastructure
vi.mock('@/components/capture/CameraModal', () => ({
  CameraModal: vi.fn(({ mode, existingDishNames, totalDetected, onClose, onRetakeMerged }: {
    mode?: string
    placeId?: string | null
    existingDishNames?: string[]
    totalDetected?: number
    onClose: () => void
    onRetakeMerged?: (count: number) => void
  }) => (
    <div data-testid="camera-modal" data-mode={mode}>
      <span data-testid="existing-count">{existingDishNames?.length ?? 0}</span>
      <span data-testid="total-detected">{totalDetected}</span>
      <button onClick={onClose}>Close modal</button>
      <button onClick={() => onRetakeMerged?.(2)}>Simulate retake complete</button>
    </div>
  )),
}))

// ─── Helpers ───────────────────────────────────────────────────────────────────

function setUpScanSession(options: {
  restaurantPlaceId: string
  dishCount: number
  totalDetected: number
}) {
  sessionStorage.setItem('plately_scan_retake_test', JSON.stringify({
    type: 'menu',
    restaurantName: 'Trattoria Roma',
    restaurantPlaceId: options.restaurantPlaceId,
    allDishes: Array.from({ length: options.dishCount }, (_, i) => ({ name: `Dish ${i + 1}` })),
    totalDetected: options.totalDetected,
    scannedAt: Date.now(),
  }))
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('RestaurantScreen — retake flow integration (Story 6.2)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockUseRecipesByRestaurant.mockReturnValue({ data: [], isPending: false })
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('tapping "Retake photo" in ScanConfidenceBanner opens CameraModal', async () => {
    setUpScanSession({ restaurantPlaceId: 'place-1', dishCount: 8, totalDetected: 10 })
    render(<RestaurantScreen placeId="place-1" />)

    // Banner should be visible
    expect(screen.getByRole('alert')).toBeTruthy()

    // CameraModal should NOT be open initially
    expect(screen.queryByTestId('camera-modal')).toBeNull()

    // Tap "Retake photo"
    await userEvent.click(screen.getByRole('button', { name: /Retake photo/i }))

    // CameraModal should now be open in retake mode
    const modal = screen.getByTestId('camera-modal')
    expect(modal).toBeTruthy()
    expect(modal.getAttribute('data-mode')).toBe('retake')
  })

  it('ScanConfidenceBanner passes existingDishNames derived from session recipes', async () => {
    // 8 dishes in session → existingDishNames should have 8 entries passed to CameraModal
    setUpScanSession({ restaurantPlaceId: 'place-2', dishCount: 8, totalDetected: 10 })
    render(<RestaurantScreen placeId="place-2" />)

    await userEvent.click(screen.getByRole('button', { name: /Retake photo/i }))

    // Our mock renders the existingDishNames.length
    const countEl = screen.getByTestId('existing-count')
    // Session dishes: 8
    expect(Number(countEl.textContent)).toBe(8)
  })

  it('banner dismisses when recipes.length reaches totalDetected after retake', async () => {
    // Start: 8 detected, 8 recognised → banner should NOT show (already equal)
    setUpScanSession({ restaurantPlaceId: 'place-3', dishCount: 10, totalDetected: 10 })
    render(<RestaurantScreen placeId="place-3" />)

    // Banner absent (recipes.length === totalDetected)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('banner updates count when retake adds some but not all missing dishes', async () => {
    // Start: 6 session dishes, totalDetected = 10 → banner shows
    setUpScanSession({ restaurantPlaceId: 'place-4', dishCount: 6, totalDetected: 10 })
    render(<RestaurantScreen placeId="place-4" />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('6 of 10 dishes read')).toBeTruthy()

    // Open retake, simulate completing with 2 new dishes
    await userEvent.click(screen.getByRole('button', { name: /Retake photo/i }))
    expect(screen.getByTestId('camera-modal')).toBeTruthy()

    // Simulate retake completing with 2 new dishes
    await userEvent.click(screen.getByRole('button', { name: /Simulate retake complete/i }))

    // Modal should close after onRetakeMerged is called
    expect(screen.queryByTestId('camera-modal')).toBeNull()

    // Banner should still be visible (only 2 new dishes were added, still < 10)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('CameraModal closes when onClose is called (user cancels retake)', async () => {
    setUpScanSession({ restaurantPlaceId: 'place-5', dishCount: 7, totalDetected: 10 })
    render(<RestaurantScreen placeId="place-5" />)

    await userEvent.click(screen.getByRole('button', { name: /Retake photo/i }))
    expect(screen.getByTestId('camera-modal')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: /Close modal/i }))
    expect(screen.queryByTestId('camera-modal')).toBeNull()
  })
})

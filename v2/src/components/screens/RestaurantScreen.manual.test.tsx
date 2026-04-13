import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RestaurantScreen } from './RestaurantScreen'

const TEST_PLACE_ID = 'place-manual-63'
const TEST_RESTAURANT_ID = 'restaurant-uuid-63'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockUseRecipesByRestaurant,
  mockUseRestaurants,
  mockInvalidateQueries,
  mockSingle,
  mockInsert,
} = vi.hoisted(() => ({
  mockUseRecipesByRestaurant: vi.fn(),
  mockUseRestaurants: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockSingle: vi.fn(),
  mockInsert: vi.fn(),
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
    from: () => ({
      insert: mockInsert,
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
    }),
  },
}))

vi.mock('@/lib/supabaseAutoSave', () => ({
  autoSaveToSupabase: vi.fn().mockResolvedValue({}),
}))

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Write a camera-scan session entry that will show the ScanConfidenceBanner:
 * dishCount dishes recognised, totalDetected expected → banner shows because
 * dishCount < totalDetected.
 */
function setUpScanSession(options: {
  dishCount: number
  totalDetected: number
}) {
  sessionStorage.setItem('plately_scan_manual_test', JSON.stringify({
    type: 'menu',
    restaurantName: 'Test Restaurant',
    restaurantPlaceId: TEST_PLACE_ID,
    allDishes: Array.from({ length: options.dishCount }, (_, i) => ({ name: `Dish ${i + 1}` })),
    totalDetected: options.totalDetected,
    scannedAt: Date.now(),
  }))
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Manual dish entry — Story 6.3', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()

    // Default: restaurant exists in Supabase (so handleAddManually can insert)
    mockUseRestaurants.mockReturnValue({
      data: [{ id: TEST_RESTAURANT_ID, placeId: TEST_PLACE_ID, name: 'Test Restaurant', address: '123 Main St' }],
      isPending: false,
    })
    mockUseRecipesByRestaurant.mockReturnValue({ data: [], isPending: false })

    // Default Supabase insert chain: .insert().select().single() → success
    mockSingle.mockResolvedValue({ data: { id: 'new-recipe-id', name: 'Pad Thai' }, error: null })
    mockInsert.mockReturnValue({ select: () => ({ single: mockSingle }) })

    // Default fetch mock (for enrich endpoint)
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  // 1
  it('tapping "Add manually" in ScanConfidenceBanner opens ManualDishEntrySheet', async () => {
    setUpScanSession({ dishCount: 8, totalDetected: 10 })
    render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    // Banner visible — dishCount(8) < totalDetected(10)
    expect(screen.getByRole('alert')).toBeTruthy()

    // Sheet not open yet
    expect(screen.queryByRole('dialog', { name: /add dish manually/i })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /add manually/i }))

    expect(screen.getByRole('dialog', { name: /add dish manually/i })).toBeTruthy()
  })

  // 2
  it('ManualDishEntrySheet is not visible when banner is not shown', () => {
    // No scan session → totalDetected === 0 → banner suppressed
    render(<RestaurantScreen placeId={TEST_PLACE_ID} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('dialog', { name: /add dish manually/i })).toBeNull()
  })

  // 3
  it('saving a dish name calls supabase.insert with correct fields', async () => {
    setUpScanSession({ dishCount: 8, totalDetected: 10 })
    render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    await userEvent.click(screen.getByRole('button', { name: /add manually/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /dish name/i }), 'Pad Thai')
    await userEvent.click(screen.getByRole('button', { name: /add dish/i }))

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurant_id: TEST_RESTAURANT_ID,
          name: 'Pad Thai',
          status: 'auto_captured',
          photo_status: 'placeholder',
        })
      )
    })
  })

  // 4
  it('after save, invalidateQueries is called with ["recipes", "restaurant"]', async () => {
    setUpScanSession({ dishCount: 8, totalDetected: 10 })
    render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    await userEvent.click(screen.getByRole('button', { name: /add manually/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /dish name/i }), 'Pad Thai')
    await userEvent.click(screen.getByRole('button', { name: /add dish/i }))

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['recipes', 'restaurant'] })
      )
    })
  })

  // 5
  it('after save, /api/scan/enrich is called with the dish name and dishToRecipeMap', async () => {
    setUpScanSession({ dishCount: 8, totalDetected: 10 })
    render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    await userEvent.click(screen.getByRole('button', { name: /add manually/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /dish name/i }), 'Pad Thai')
    await userEvent.click(screen.getByRole('button', { name: /add dish/i }))

    // The enrich fetch is fire-and-forget — wait for it
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/scan/enrich',
        expect.objectContaining({ method: 'POST' })
      )
    })

    // Verify body contains the dish name and the correct recipe ID mapping
    const fetchCall = vi.mocked(global.fetch).mock.calls.find(
      ([url]) => url === '/api/scan/enrich'
    )
    expect(fetchCall).toBeTruthy()
    const body = JSON.parse((fetchCall![1] as RequestInit).body as string) as {
      dishes: Array<{ name: string }>
      dishToRecipeMap: Record<string, string>
    }
    expect(body.dishes[0].name).toBe('Pad Thai')
    // dishToRecipeMap maps tempId (UUID) → 'new-recipe-id'
    expect(Object.values(body.dishToRecipeMap)).toContain('new-recipe-id')
  })

  // 6
  it('sheet closes after successful save', async () => {
    setUpScanSession({ dishCount: 8, totalDetected: 10 })
    render(<RestaurantScreen placeId={TEST_PLACE_ID} />)

    await userEvent.click(screen.getByRole('button', { name: /add manually/i }))
    expect(screen.getByRole('dialog', { name: /add dish manually/i })).toBeTruthy()

    await userEvent.type(screen.getByRole('textbox', { name: /dish name/i }), 'Ramen')
    await userEvent.click(screen.getByRole('button', { name: /add dish/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /add dish manually/i })).toBeNull()
    })
  })
})

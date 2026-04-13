import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RestaurantCollectionScreen } from './RestaurantCollectionScreen'
import type { DomainRestaurant, DomainRecipe } from '@/types/database'

// ─── Mocks ─────────────────────────────────────────────────

const mockPush = vi.fn()
const mockOpenCamera = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/restaurants',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/hooks/useRestaurants', () => ({
  useRestaurantsWithRecipes: vi.fn(),
}))

// Provide a minimal CameraContext so useCameraContext() doesn't return the no-op default
vi.mock('@/contexts/CameraContext', () => ({
  useCameraContext: () => ({ openCamera: mockOpenCamera }),
  CameraContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}))

// ─── Test data ──────────────────────────────────────────────

const baseRecipe: DomainRecipe = {
  id: 'recipe-1',
  restaurantId: 'rest-1',
  visitId: null,
  name: 'Pad Thai',
  description: null,
  dishImageUrl: null,
  estimatedCalories: 520,
  status: 'auto_captured',
  photoStatus: 'placeholder',
  geminiConfidence: 0.9,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: null,
  totalCarbsG: null,
  totalFatG: null,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}

const baseRestaurant: DomainRestaurant = {
  id: 'rest-1',
  placeId: 'ChIJplace1',
  name: 'Sala Thai',
  address: '123 Main St',
  cuisineType: 'Thai',
  referenceImageUrl: null,
  atmosphericPaletteJson: null,
  rating: 4.5,
  userRatingsTotal: 200,
  createdAt: new Date().toISOString(),
}

const restaurant2: DomainRestaurant = {
  id: 'rest-2',
  placeId: 'ChIJplace2',
  name: 'Pho Saigon',
  address: '456 Elm St',
  cuisineType: 'Vietnamese',
  referenceImageUrl: 'https://example.com/pho.jpg',
  atmosphericPaletteJson: null,
  rating: 4.2,
  userRatingsTotal: 150,
  createdAt: new Date().toISOString(),
}

// ─── Helper ──────────────────────────────────────────────────

import { useRestaurantsWithRecipes } from '@/hooks/useRestaurants'

function setMockData(
  data: Array<DomainRestaurant & { recipes: DomainRecipe[] }> | null,
  { isPending = false, isError = false } = {}
) {
  vi.mocked(useRestaurantsWithRecipes).mockReturnValue({
    data: data ?? undefined,
    isPending,
    isError,
    refetch: vi.fn(),
    // fill required QueryObserverResult fields with minimal stubs
    status: isError ? 'error' : isPending ? 'pending' : 'success',
    fetchStatus: 'idle',
    error: isError ? new Error('fetch failed') : null,
    isLoading: isPending,
    isFetching: false,
    isSuccess: !isPending && !isError,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isStale: false,
    isPlaceholderData: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isFetched: true,
    isFetchedAfterMount: true,
    isPaused: false,
    promise: Promise.resolve(),
  } as unknown as ReturnType<typeof useRestaurantsWithRecipes>)
}

// ─── Tests ───────────────────────────────────────────────────

describe('RestaurantCollectionScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenCamera.mockReset()
  })

  describe('loading state', () => {
    it('renders aria-busy container when isPending', () => {
      setMockData(null, { isPending: true })
      render(<RestaurantCollectionScreen />)
      expect(document.querySelector('[aria-busy="true"]')).toBeTruthy()
    })

    it('shows aria-label "Loading restaurants" when pending', () => {
      setMockData(null, { isPending: true })
      render(<RestaurantCollectionScreen />)
      expect(document.querySelector('[aria-label="Loading restaurants"]')).toBeTruthy()
    })
  })

  describe('error state', () => {
    it('renders error state when isError', () => {
      setMockData(null, { isError: true })
      render(<RestaurantCollectionScreen />)
      expect(screen.getByRole('alert')).toBeTruthy()
      expect(screen.getByText(/couldn't load your restaurants/i)).toBeTruthy()
    })
  })

  describe('empty state', () => {
    it('renders empty state when no restaurants', () => {
      setMockData([])
      render(<RestaurantCollectionScreen />)
      expect(screen.getByText('Take home the food you love')).toBeTruthy()
      expect(screen.getByText(/scan a menu and every dish/i)).toBeTruthy()
    })

    it('shows scan CTA in empty state', () => {
      setMockData([])
      render(<RestaurantCollectionScreen />)
      expect(screen.getByRole('button', { name: /open camera to scan a menu/i })).toBeTruthy()
    })

    it('fires onScanPress callback when scan CTA is tapped', async () => {
      setMockData([])
      const onScanPress = vi.fn()
      const user = userEvent.setup()
      render(<RestaurantCollectionScreen onScanPress={onScanPress} />)
      await user.click(screen.getByRole('button', { name: /open camera to scan a menu/i }))
      expect(onScanPress).toHaveBeenCalledTimes(1)
    })

    it('falls back to context openCamera when no onScanPress prop is provided', async () => {
      setMockData([])
      const user = userEvent.setup()
      render(<RestaurantCollectionScreen />)
      await user.click(screen.getByRole('button', { name: /open camera to scan a menu/i }))
      expect(mockOpenCamera).toHaveBeenCalledTimes(1)
    })

    it('does not render a grid when empty', () => {
      setMockData([])
      render(<RestaurantCollectionScreen />)
      expect(screen.queryByRole('list')).toBeNull()
    })
  })

  describe('grid state', () => {
    it('renders a grid with restaurant cards', () => {
      setMockData([
        { ...baseRestaurant, recipes: [baseRecipe] },
        { ...restaurant2, recipes: [baseRecipe, { ...baseRecipe, id: 'recipe-2' }] },
      ])
      render(<RestaurantCollectionScreen />)
      expect(screen.getByText('Sala Thai')).toBeTruthy()
      expect(screen.getByText('Pho Saigon')).toBeTruthy()
    })

    it('renders correct dish counts', () => {
      setMockData([
        { ...baseRestaurant, recipes: [baseRecipe] },
        { ...restaurant2, recipes: [baseRecipe, { ...baseRecipe, id: 'recipe-2' }] },
      ])
      render(<RestaurantCollectionScreen />)
      expect(screen.getByText('1 dish')).toBeTruthy()
      expect(screen.getByText('2 dishes')).toBeTruthy()
    })

    it('renders list role for accessibility', () => {
      setMockData([{ ...baseRestaurant, recipes: [baseRecipe] }])
      render(<RestaurantCollectionScreen />)
      expect(screen.getByRole('list')).toBeTruthy()
    })

    it('renders one button per restaurant card plus the search icon button', () => {
      setMockData([
        { ...baseRestaurant, recipes: [baseRecipe] },
        { ...restaurant2, recipes: [baseRecipe] },
      ])
      render(<RestaurantCollectionScreen />)
      // 2 restaurant card buttons + 1 search icon button in the grid header
      expect(screen.getAllByRole('button').length).toBe(3)
    })
  })

  describe('navigation', () => {
    it('navigates to restaurant dish list on card tap using placeId', async () => {
      setMockData([{ ...baseRestaurant, recipes: [baseRecipe] }])
      const user = userEvent.setup()
      render(<RestaurantCollectionScreen />)
      await user.click(screen.getByRole('button', { name: /sala thai/i }))
      expect(mockPush).toHaveBeenCalledWith(
        `/restaurants/ChIJplace1?name=${encodeURIComponent('Sala Thai')}`
      )
    })

    it('navigates using UUID when placeId is null', async () => {
      setMockData([{ ...baseRestaurant, placeId: null, recipes: [baseRecipe] }])
      const user = userEvent.setup()
      render(<RestaurantCollectionScreen />)
      await user.click(screen.getByRole('button', { name: /sala thai/i }))
      expect(mockPush).toHaveBeenCalledWith(
        `/restaurants/rest-1?name=${encodeURIComponent('Sala Thai')}`
      )
    })
  })
})

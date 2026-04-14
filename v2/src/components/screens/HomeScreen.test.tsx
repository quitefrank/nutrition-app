import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeScreen } from './HomeScreen'
import type { DomainRestaurant, DomainRecipe } from '@/types/database'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockOpenCamera = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/hooks/useRestaurants', () => ({
  useRestaurantsWithRecipes: vi.fn(),
}))

vi.mock('@/contexts/CameraContext', () => ({
  useCameraContext: () => ({ openCamera: mockOpenCamera }),
  CameraContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}))


// ─── Test data ────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString()
const RECENT_DATE = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
const OLD_DATE = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()  // 10 days ago

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
  createdAt: RECENT_DATE,
}

const oldRecipe: DomainRecipe = {
  ...baseRecipe,
  id: 'recipe-old',
  createdAt: OLD_DATE,
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
  createdAt: NOW,
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
  createdAt: NOW,
}

function makeRestaurant(id: string, name: string): DomainRestaurant {
  return {
    id,
    placeId: `ChIJ${id}`,
    name,
    address: null,
    cuisineType: null,
    referenceImageUrl: null,
    atmosphericPaletteJson: null,
    rating: null,
    userRatingsTotal: null,
    createdAt: NOW,
  }
}

// ─── Helper: set mock data ────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HomeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenCamera.mockReset()
    mockPush.mockReset()
  })

  // ── AC9: Loading state ──────────────────────────────────────────────────────
  describe('loading state', () => {
    it('shows skeleton when isPending is true', () => {
      setMockData(null, { isPending: true })
      render(<HomeScreen />)
      expect(document.querySelector('[aria-busy="true"]')).toBeTruthy()
      expect(document.querySelector('[aria-label="Loading home screen"]')).toBeTruthy()
    })
  })

  // ── AC9: Error state ────────────────────────────────────────────────────────
  describe('error state', () => {
    it('shows ErrorState when isError is true', () => {
      setMockData(null, { isError: true })
      render(<HomeScreen />)
      expect(screen.getByRole('alert')).toBeTruthy()
      expect(screen.getByText(/couldn't load your home screen/i)).toBeTruthy()
    })
  })

  // ── AC1: State 0 — Empty state ──────────────────────────────────────────────
  describe('State 0 — empty state', () => {
    it('shows Playfair tagline when restaurants array is empty', () => {
      setMockData([])
      render(<HomeScreen />)
      expect(screen.getByText('Take home the food you love')).toBeTruthy()
    })

    it('shows supporting subtext', () => {
      setMockData([])
      render(<HomeScreen />)
      expect(screen.getByText(/scan a menu and every dish/i)).toBeTruthy()
    })

    it('shows "Scan a menu" primary CTA', () => {
      setMockData([])
      render(<HomeScreen />)
      expect(screen.getByRole('button', { name: /open camera to scan a menu/i })).toBeTruthy()
    })

    it('shows "Find a restaurant" ghost CTA', () => {
      setMockData([])
      render(<HomeScreen />)
      expect(screen.getByRole('button', { name: /find a restaurant by name/i })).toBeTruthy()
    })

    it('does not show HeroCard in State 0', () => {
      setMockData([])
      render(<HomeScreen />)
      // HeroCard renders an article with role="article"
      expect(screen.queryByRole('article')).toBeNull()
    })
  })

  // ── AC1: "Scan a menu" CTA calls openCamera ─────────────────────────────────
  describe('AC7: Scan a menu CTA calls openCamera', () => {
    it('calls openCamera when scan CTA is tapped in State 0', async () => {
      setMockData([])
      const user = userEvent.setup()
      render(<HomeScreen />)
      await user.click(screen.getByRole('button', { name: /open camera to scan a menu/i }))
      expect(mockOpenCamera).toHaveBeenCalledTimes(1)
    })
  })

  // ── AC7: "Find a restaurant" CTA navigates to /search ───────────────────────
  describe('AC7: Find a restaurant CTA navigates to /search', () => {
    it('calls router.push("/search") when "Find a restaurant" is tapped', async () => {
      setMockData([])
      const user = userEvent.setup()
      render(<HomeScreen />)
      await user.click(screen.getByRole('button', { name: /find a restaurant by name/i }))
      expect(mockPush).toHaveBeenCalledWith('/search')
    })
  })

  // ── AC2: State 1 — Restaurants exist, no recent activity ────────────────────
  describe('State 1 — restaurants with no recent activity', () => {
    it('renders "Your restaurants" section without HeroCard', () => {
      setMockData([{ ...baseRestaurant, recipes: [oldRecipe] }])
      render(<HomeScreen />)
      // "Your restaurants" section header
      expect(screen.getByText('Your restaurants')).toBeTruthy()
      // No HeroCard article
      expect(screen.queryByRole('article')).toBeNull()
    })

    it('shows RestaurantGridCards for each restaurant', () => {
      setMockData([
        { ...baseRestaurant, recipes: [oldRecipe] },
        { ...restaurant2, recipes: [{ ...oldRecipe, id: 'r2' }] },
      ])
      render(<HomeScreen />)
      expect(screen.getByText('Sala Thai')).toBeTruthy()
      expect(screen.getByText('Pho Saigon')).toBeTruthy()
    })

    it('shows "Scan for something new" section', () => {
      setMockData([{ ...baseRestaurant, recipes: [oldRecipe] }])
      render(<HomeScreen />)
      expect(screen.getByText('Scan for something new')).toBeTruthy()
    })

    it('does not show HeroCard when no restaurant has recent activity', () => {
      setMockData([{ ...baseRestaurant, recipes: [oldRecipe] }])
      render(<HomeScreen />)
      expect(screen.queryByRole('article')).toBeNull()
    })
  })

  // ── AC3: State 2 — Recent activity (HeroCard) ────────────────────────────────
  describe('State 2 — has recent dishes', () => {
    it('renders HeroCard when a restaurant has a recipe from within last 7 days', () => {
      setMockData([{ ...baseRestaurant, recipes: [baseRecipe] }])
      render(<HomeScreen />)
      // HeroCard is an article element
      expect(screen.getByRole('article')).toBeTruthy()
    })

    it('shows "Recent dishes" section in State 2', () => {
      setMockData([{ ...baseRestaurant, recipes: [baseRecipe] }])
      render(<HomeScreen />)
      expect(screen.getByText('Recent dishes')).toBeTruthy()
    })

    it('does not show "Scan for something new" section in State 2', () => {
      setMockData([{ ...baseRestaurant, recipes: [baseRecipe] }])
      render(<HomeScreen />)
      expect(screen.queryByText('Scan for something new')).toBeNull()
    })

    it('shows the recent restaurant name in HeroCard', () => {
      setMockData([{ ...baseRestaurant, recipes: [baseRecipe] }])
      render(<HomeScreen />)
      // The restaurant name should appear inside the HeroCard
      expect(screen.getByText('Sala Thai')).toBeTruthy()
    })

    it('renders remaining restaurants in "Your restaurants" section (State 2)', () => {
      setMockData([
        { ...baseRestaurant, recipes: [baseRecipe] },        // recent — goes to HeroCard
        { ...restaurant2, recipes: [{ ...oldRecipe, id: 'r2' }] }, // non-recent
      ])
      render(<HomeScreen />)
      expect(screen.getByText('Your restaurants')).toBeTruthy()
      expect(screen.getByText('Pho Saigon')).toBeTruthy()
    })
  })

  // ── AC4: "See all" link ──────────────────────────────────────────────────────
  describe('AC4: "See all (N)" link', () => {
    it('is visible when restaurant count is 5 or more', () => {
      const restaurants = Array.from({ length: 5 }, (_, i) =>
        makeRestaurant(`rest-${i + 1}`, `Restaurant ${i + 1}`)
      ).map((r) => ({ ...r, recipes: [{ ...oldRecipe, restaurantId: r.id }] }))

      setMockData(restaurants)
      render(<HomeScreen />)
      // HomeSection renders "See all (5)" when itemCount > 4
      expect(screen.getByText(/see all/i)).toBeTruthy()
    })

    it('is absent when restaurant count is 4 or fewer', () => {
      const restaurants = Array.from({ length: 4 }, (_, i) =>
        makeRestaurant(`rest-${i + 1}`, `Restaurant ${i + 1}`)
      ).map((r) => ({ ...r, recipes: [{ ...oldRecipe, restaurantId: r.id }] }))

      setMockData(restaurants)
      render(<HomeScreen />)
      expect(screen.queryByText(/see all/i)).toBeNull()
    })

    it('navigates to /restaurants when see all is clicked', async () => {
      const restaurants = Array.from({ length: 5 }, (_, i) =>
        makeRestaurant(`rest-${i + 1}`, `Restaurant ${i + 1}`)
      ).map((r) => ({ ...r, recipes: [{ ...oldRecipe, restaurantId: r.id }] }))

      setMockData(restaurants)
      const user = userEvent.setup()
      render(<HomeScreen />)
      await user.click(screen.getByText(/see all/i))
      expect(mockPush).toHaveBeenCalledWith('/restaurants')
    })
  })

  // ── AC6: Navigation ──────────────────────────────────────────────────────────
  describe('AC6: navigation', () => {
    it('navigates to restaurant page with placeId when RestaurantGridCard is tapped', async () => {
      setMockData([{ ...baseRestaurant, recipes: [oldRecipe] }])
      const user = userEvent.setup()
      render(<HomeScreen />)
      // RestaurantGridCard renders role="button" with aria-label containing the name
      await user.click(screen.getByRole('button', { name: /sala thai/i }))
      expect(mockPush).toHaveBeenCalledWith(
        `/restaurants/ChIJplace1?name=${encodeURIComponent('Sala Thai')}`
      )
    })

    it('navigates to restaurant page using UUID when placeId is null', async () => {
      setMockData([{ ...baseRestaurant, placeId: null, recipes: [oldRecipe] }])
      const user = userEvent.setup()
      render(<HomeScreen />)
      await user.click(screen.getByRole('button', { name: /sala thai/i }))
      expect(mockPush).toHaveBeenCalledWith(
        `/restaurants/rest-1?name=${encodeURIComponent('Sala Thai')}`
      )
    })

    it('navigates to /recipes/[id] when RecipeGridCard is tapped in State 2', async () => {
      setMockData([{ ...baseRestaurant, recipes: [baseRecipe] }])
      const user = userEvent.setup()
      render(<HomeScreen />)
      // RecipeGridCard renders with aria-label = recipe.name
      await user.click(screen.getByRole('button', { name: /pad thai/i }))
      expect(mockPush).toHaveBeenCalledWith('/recipes/recipe-1')
    })

    it('navigates to restaurant page when HeroCard is tapped', async () => {
      setMockData([{ ...baseRestaurant, recipes: [baseRecipe] }])
      const user = userEvent.setup()
      render(<HomeScreen />)
      const heroArticle = screen.getByRole('article')
      await user.click(heroArticle)
      expect(mockPush).toHaveBeenCalledWith(
        `/restaurants/ChIJplace1?name=${encodeURIComponent('Sala Thai')}`
      )
    })
  })

  // ── Scan CTA in State 1 also calls openCamera ────────────────────────────────
  describe('scan CTA in State 1', () => {
    it('calls openCamera when scan CTA in "Scan for something new" section is tapped', async () => {
      setMockData([{ ...baseRestaurant, recipes: [oldRecipe] }])
      const user = userEvent.setup()
      render(<HomeScreen />)
      // There should be a scan CTA button in State 1 inside the "Scan for something new" section
      const scanButtons = screen.getAllByRole('button', { name: /open camera to scan a menu/i })
      await user.click(scanButtons[0])
      expect(mockOpenCamera).toHaveBeenCalledTimes(1)
    })
  })

  // ── isWithin7Days boundary ────────────────────────────────────────────────────
  describe('isWithin7Days boundary', () => {
    it('triggers State 2 for a recipe created exactly 1 ms inside the 7-day window', () => {
      // Date.now() - (7 days - 1 ms) is strictly less than 7 days ago → inside window
      const justInsideMs = 7 * 24 * 60 * 60 * 1000 - 1
      const justInsideDate = new Date(Date.now() - justInsideMs).toISOString()
      const recipe = { ...baseRecipe, id: 'boundary-inside', createdAt: justInsideDate }
      setMockData([{ ...baseRestaurant, recipes: [recipe] }])
      render(<HomeScreen />)
      // State 2 renders a HeroCard (article element)
      expect(screen.getByRole('article')).toBeTruthy()
    })

    it('falls back to State 1 for a recipe created exactly at the 7-day boundary (exclusive <)', () => {
      // Date.now() - (7 days exactly) is NOT less than 7 days ago → outside window
      // isWithin7Days uses <, so exactly 7 * 24 * 60 * 60 * 1000 ms ago is excluded
      const exactBoundaryMs = 7 * 24 * 60 * 60 * 1000
      const exactBoundaryDate = new Date(Date.now() - exactBoundaryMs).toISOString()
      const recipe = { ...baseRecipe, id: 'boundary-exact', createdAt: exactBoundaryDate }
      setMockData([{ ...baseRestaurant, recipes: [recipe] }])
      render(<HomeScreen />)
      // State 1: no HeroCard, but "Your restaurants" section is present
      expect(screen.queryByRole('article')).toBeNull()
      expect(screen.getByText('Your restaurants')).toBeTruthy()
    })
  })
})

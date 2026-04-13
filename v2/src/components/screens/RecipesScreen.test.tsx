import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipesScreen } from './RecipesScreen'
import { useKeptRecipes } from '@/hooks/useRecipes'
import type { DomainRecipe } from '@/types/database'

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockRefetch = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/hooks/useRecipes', () => ({
  useKeptRecipes: vi.fn(),
}))

// ─── Test data ─────────────────────────────────────────────────────────────────

const mockRecipe: DomainRecipe = {
  id: 'recipe-1',
  restaurantId: 'rest-1',
  visitId: null,
  name: 'Pad Thai',
  description: null,
  dishImageUrl: null,
  estimatedCalories: 480,
  status: 'kept',
  photoStatus: 'placeholder',
  geminiConfidence: null,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: 18,
  totalCarbsG: 52,
  totalFatG: 12,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}

const mockRecipe2: DomainRecipe = {
  ...mockRecipe,
  id: 'recipe-2',
  name: 'Green Curry',
  estimatedCalories: 560,
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function setMockData(
  data: DomainRecipe[] | null,
  { isLoading = false, isError = false } = {}
) {
  vi.mocked(useKeptRecipes).mockReturnValue({
    data: data ?? undefined,
    isLoading,
    isError,
    // fill required QueryObserverResult fields with minimal stubs
    status: isError ? 'error' : isLoading ? 'pending' : 'success',
    fetchStatus: 'idle',
    error: isError ? new Error('fetch failed') : null,
    isFetching: false,
    isSuccess: !isLoading && !isError,
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
    isPending: isLoading,
    refetch: mockRefetch,
    promise: Promise.resolve(),
  } as unknown as ReturnType<typeof useKeptRecipes>)
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('RecipesScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "My Recipes" heading', () => {
    setMockData([mockRecipe])
    render(<RecipesScreen />)
    expect(screen.getByRole('heading', { name: /my recipes/i })).toBeTruthy()
  })

  it('renders RecipeGridCard for each kept recipe', () => {
    setMockData([mockRecipe, mockRecipe2])
    render(<RecipesScreen />)
    expect(screen.getByText('Pad Thai')).toBeTruthy()
    expect(screen.getByText('Green Curry')).toBeTruthy()
  })

  it('renders empty state when no kept recipes exist', () => {
    setMockData([])
    render(<RecipesScreen />)
    expect(
      screen.getByText(/dishes you've kept from your restaurant visits will appear here/i)
    ).toBeTruthy()
  })

  it('renders aria region for empty state', () => {
    setMockData([])
    render(<RecipesScreen />)
    expect(screen.getByRole('region', { name: /my recipes empty state/i })).toBeTruthy()
  })

  it('renders skeleton when loading', () => {
    setMockData(null, { isLoading: true })
    render(<RecipesScreen />)
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(document.querySelector('[aria-label="Loading recipes"]')).toBeTruthy()
  })

  it('renders 4 skeleton placeholder cards while loading', () => {
    setMockData(null, { isLoading: true })
    render(<RecipesScreen />)
    const skeleton = document.querySelector('[aria-label="Loading recipes"]')
    expect(skeleton?.querySelectorAll('[aria-hidden="true"]').length).toBe(4)
  })

  it('renders full error state when query errors with no cached data', () => {
    setMockData(null, { isError: true })
    render(<RecipesScreen />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/couldn't load your recipes/i)).toBeTruthy()
  })

  it('renders "Try again" button in full error state', () => {
    setMockData(null, { isError: true })
    render(<RecipesScreen />)
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('calls refetch when "Try again" is pressed', async () => {
    setMockData(null, { isError: true })
    const user = userEvent.setup()
    render(<RecipesScreen />)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('renders stale data grid + error banner when query errors with cached data', () => {
    setMockData([mockRecipe], { isError: true })
    render(<RecipesScreen />)
    expect(screen.getByText(/couldn't refresh/i)).toBeTruthy()
    expect(screen.getByText('Pad Thai')).toBeTruthy()
  })

  it('renders "Retry" button in error banner and calls refetch', async () => {
    setMockData([mockRecipe], { isError: true })
    const user = userEvent.setup()
    render(<RecipesScreen />)
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('navigates to /recipe/[id] when RecipeGridCard is pressed', async () => {
    setMockData([mockRecipe])
    const user = userEvent.setup()
    render(<RecipesScreen />)
    await user.click(screen.getByRole('button', { name: /pad thai/i }))
    expect(mockPush).toHaveBeenCalledWith('/recipe/recipe-1')
  })

  it('renders list role on the recipe grid', () => {
    setMockData([mockRecipe])
    render(<RecipesScreen />)
    expect(screen.getByRole('list', { name: /my recipes/i })).toBeTruthy()
  })

  it('renders listitem role for each recipe card wrapper', () => {
    setMockData([mockRecipe, mockRecipe2])
    render(<RecipesScreen />)
    expect(screen.getAllByRole('listitem').length).toBe(2)
  })
})

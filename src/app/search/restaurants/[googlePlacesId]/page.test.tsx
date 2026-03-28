import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Next.js mocks ───────────────────────────────────────────────────────────

const mockBack = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: mockBack }),
  useSearchParams: () => new URLSearchParams('restaurantName=Shake+Shack'),
}))

// ─── Animation / focus-trap mocks ────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) =>
      React.createElement('div', props as React.HTMLAttributes<HTMLDivElement>, children),
  },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
  useDragControls: () => ({ start: vi.fn() }),
}))

vi.mock('focus-trap-react', () => ({
  default: ({ children }: React.PropsWithChildren) => children,
}))

// ─── Hook mocks ──────────────────────────────────────────────────────────────

const mockUseRestaurantDishes = vi.fn()
vi.mock('@/hooks/use-search', () => ({
  useRestaurantDishes: (...args: unknown[]) => mockUseRestaurantDishes(...args),
}))

const mockSaveMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()
vi.mock('@/hooks/use-recipes', () => ({
  useSaveRecipe: () => ({ mutateAsync: mockSaveMutateAsync, isPending: false }),
  useDeleteRecipe: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
}))

const mockUseOnlineStatus = vi.fn(() => true)
vi.mock('@/hooks/use-online-status', () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))

// ─── React.use() mock for params ──────────────────────────────────────────────

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof React>('react')
  return {
    ...actual,
    use: (promise: Promise<unknown>) => {
      // Unwrap synchronously for params — React.use() works with already-resolved promises in tests
      if (promise && typeof (promise as { googlePlacesId?: unknown }).googlePlacesId === 'string') {
        return promise
      }
      // For Promise<{googlePlacesId}> objects
      return { googlePlacesId: 'test-place-id' }
    },
  }
})

// ─── Test data ────────────────────────────────────────────────────────────────

import type { DishResult } from '@/types/api'

const mockDishes: DishResult[] = [
  {
    name: 'Shake Burger',
    description: 'Classic beef burger',
    calorieEstimate: 580,
    ingredients: [],
    imageUrl: null,
  },
  {
    name: 'Crinkle Cut Fries',
    description: 'Crispy crinkle fries with seasoning',
    calorieEstimate: 340,
    ingredients: [],
    imageUrl: null,
  },
]

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

// Import Page component after mocks are registered
let Page: React.ComponentType<{ params: Promise<{ googlePlacesId: string }> }>

beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import('./page')
  Page = mod.default
})

const defaultParams = Promise.resolve({ googlePlacesId: 'test-place-id' })

describe('RestaurantDishListPage', () => {
  it('renders loading spinner while dishes are loading', () => {
    mockUseRestaurantDishes.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() })
    const Wrapper = createWrapper()
    render(React.createElement(Page, { params: defaultParams }), { wrapper: Wrapper })
    expect(screen.getByRole('status', { name: /loading dishes/i })).toBeDefined()
  })

  it('renders dish list after data loads', () => {
    mockUseRestaurantDishes.mockReturnValue({ data: mockDishes, isLoading: false, error: null, refetch: vi.fn() })
    const Wrapper = createWrapper()
    render(React.createElement(Page, { params: defaultParams }), { wrapper: Wrapper })
    expect(screen.getByText('Shake Burger')).toBeDefined()
    expect(screen.getByText('Crinkle Cut Fries')).toBeDefined()
  })

  it('renders restaurant name in header from searchParams', () => {
    mockUseRestaurantDishes.mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() })
    const Wrapper = createWrapper()
    render(React.createElement(Page, { params: defaultParams }), { wrapper: Wrapper })
    expect(screen.getByText('Shake Shack')).toBeDefined()
  })

  it('renders error state with retry button when fetch fails', () => {
    mockUseRestaurantDishes.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Dish list unavailable'),
      refetch: vi.fn(),
    })
    const Wrapper = createWrapper()
    render(React.createElement(Page, { params: defaultParams }), { wrapper: Wrapper })
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText('Try again')).toBeDefined()
  })

  it('calls refetch when retry button is clicked', () => {
    const mockRefetch = vi.fn()
    mockUseRestaurantDishes.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Dish list unavailable'),
      refetch: mockRefetch,
    })
    const Wrapper = createWrapper()
    render(React.createElement(Page, { params: defaultParams }), { wrapper: Wrapper })
    fireEvent.click(screen.getByText('Try again'))
    expect(mockRefetch).toHaveBeenCalledOnce()
  })

  it('tapping a dish card opens DishDetailSheet', async () => {
    mockUseRestaurantDishes.mockReturnValue({ data: mockDishes, isLoading: false, error: null, refetch: vi.fn() })
    const Wrapper = createWrapper()
    render(React.createElement(Page, { params: defaultParams }), { wrapper: Wrapper })

    fireEvent.click(screen.getByText('Shake Burger'))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })
  })

  it('calls save mutation with confidenceSource: search-generated and restaurantGooglePlacesId', async () => {
    mockUseRestaurantDishes.mockReturnValue({ data: mockDishes, isLoading: false, error: null, refetch: vi.fn() })
    mockSaveMutateAsync.mockResolvedValue({ data: { id: 'saved-recipe-id' } })

    const Wrapper = createWrapper()
    render(React.createElement(Page, { params: defaultParams }), { wrapper: Wrapper })

    // Open dish detail sheet
    fireEvent.click(screen.getByText('Shake Burger'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())

    // Click Save Recipe
    fireEvent.click(screen.getByLabelText('Save recipe for Shake Burger'))

    await waitFor(() => {
      expect(mockSaveMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Shake Burger',
          confidenceMetadata: { confidenceSource: 'search-generated' },
          restaurantGooglePlacesId: 'test-place-id',
          restaurantName: 'Shake Shack',
        })
      )
    })
  })

  it('shows offline message when device is offline', () => {
    mockUseOnlineStatus.mockReturnValue(false)
    mockUseRestaurantDishes.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() })
    const Wrapper = createWrapper()
    render(React.createElement(Page, { params: defaultParams }), { wrapper: Wrapper })
    expect(screen.getByText(/internet connection/i)).toBeDefined()
  })

  it('passes null to useRestaurantDishes when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false)
    mockUseRestaurantDishes.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() })
    const Wrapper = createWrapper()
    render(React.createElement(Page, { params: defaultParams }), { wrapper: Wrapper })
    expect(mockUseRestaurantDishes).toHaveBeenCalledWith(null)
  })
})

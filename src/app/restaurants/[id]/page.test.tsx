import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { Recipe } from '@/types/domain'

// --- Mocks ---
const mockUseRecipes = vi.fn()
const mockRouterBack = vi.fn()
const mockRouterPush = vi.fn()

vi.mock('@/hooks/use-recipes', () => ({
  useRecipes: () => mockUseRecipes(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mockRouterBack, push: mockRouterPush, replace: vi.fn() }),
}))

// Mock React.use() to resolve the params promise synchronously
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    use: (p: unknown) => {
      if (p instanceof Promise) {
        // Return a fixture; tests will stub via the params fixture
        return { id: 'rest-1' }
      }
      return (actual.use as (arg: unknown) => unknown)(p)
    },
  }
})

// --- Fixtures ---
const recipe1: Recipe = {
  id: 'r1',
  name: 'Ramen',
  restaurantId: 'rest-1',
  dishImageUrl: null,
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-22T00:00:00Z',
  restaurant: { id: 'rest-1', name: 'Ichiran', googlePlacesId: null, atmosphericPaletteJson: null, updatedAt: '2026-03-22T00:00:00Z' },
}

const recipe2: Recipe = {
  id: 'r2',
  name: 'Gyoza',
  restaurantId: 'rest-1',
  dishImageUrl: null,
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-21T00:00:00Z',
  restaurant: { id: 'rest-1', name: 'Ichiran', googlePlacesId: null, atmosphericPaletteJson: null, updatedAt: '2026-03-22T00:00:00Z' },
}

const recipeOtherRestaurant: Recipe = {
  id: 'r3',
  name: 'Duck Confit',
  restaurantId: 'rest-2',
  dishImageUrl: null,
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-20T00:00:00Z',
}

async function renderPage() {
  const { default: RestaurantProfilePage } = await import('./page')
  return render(
    React.createElement(RestaurantProfilePage, {
      params: Promise.resolve({ id: 'rest-1' }),
    })
  )
}

describe('RestaurantProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders restaurant name from first matching recipe restaurant.name', async () => {
    mockUseRecipes.mockReturnValue({ data: [recipe1, recipe2, recipeOtherRestaurant], isLoading: false })
    await renderPage()
    expect(screen.getByText('Ichiran')).toBeTruthy()
  })

  it('renders recipe count', async () => {
    mockUseRecipes.mockReturnValue({ data: [recipe1, recipe2, recipeOtherRestaurant], isLoading: false })
    await renderPage()
    expect(screen.getByText('2 saved recipes')).toBeTruthy()
  })

  it('renders singular "recipe" when count is 1', async () => {
    mockUseRecipes.mockReturnValue({ data: [recipe1, recipeOtherRestaurant], isLoading: false })
    await renderPage()
    expect(screen.getByText('1 saved recipe')).toBeTruthy()
  })

  it('renders a button per matching recipe', async () => {
    mockUseRecipes.mockReturnValue({ data: [recipe1, recipe2, recipeOtherRestaurant], isLoading: false })
    await renderPage()
    expect(screen.getByText('Ramen')).toBeTruthy()
    expect(screen.getByText('Gyoza')).toBeTruthy()
    expect(screen.queryByText('Duck Confit')).toBeNull()
  })

  it('tapping a recipe button navigates to /recipes/[id]', async () => {
    mockUseRecipes.mockReturnValue({ data: [recipe1, recipe2], isLoading: false })
    await renderPage()
    const ramenButton = screen.getByText('Ramen').closest('button')!
    fireEvent.click(ramenButton)
    expect(mockRouterPush).toHaveBeenCalledWith('/recipes/r1')
  })

  it('back button calls router.back()', async () => {
    mockUseRecipes.mockReturnValue({ data: [recipe1], isLoading: false })
    await renderPage()
    const backButton = screen.getByRole('button', { name: /go back/i })
    fireEvent.click(backButton)
    expect(mockRouterBack).toHaveBeenCalled()
  })

  it('renders loading state while isLoading is true', async () => {
    mockUseRecipes.mockReturnValue({ data: undefined, isLoading: true })
    await renderPage()
    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it('renders empty list when no recipes match restaurantId', async () => {
    mockUseRecipes.mockReturnValue({ data: [recipeOtherRestaurant], isLoading: false })
    await renderPage()
    expect(screen.getByText('0 saved recipes')).toBeTruthy()
    // Falls back to 'Restaurant' when no matching recipes
    expect(screen.getByText('Restaurant')).toBeTruthy()
  })
})

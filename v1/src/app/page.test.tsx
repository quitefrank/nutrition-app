import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import type { Recipe } from '@/types/domain'

// --- Mocks ---
const mockUseRecipes = vi.fn()
const mockDeleteMutateAsync = vi.fn()
const mockUseDeleteRecipe = vi.fn()
const mockSetAtmospheric = vi.fn()

vi.mock('@/hooks/use-recipes', () => ({
  useRecipes: () => mockUseRecipes(),
  useDeleteRecipe: () => mockUseDeleteRecipe(),
}))

vi.mock('@/contexts/atmospheric-context', () => ({
  useSetAtmospheric: () => mockSetAtmospheric,
}))

vi.mock('@/components/recipes/featured-recipe-card', () => ({
  FeaturedRecipeCard: ({ recipe }: { recipe: Recipe }) =>
    React.createElement('div', { 'data-testid': 'featured-recipe-card' }, recipe.name),
}))

vi.mock('@/components/recipes/recipe-card', () => ({
  RecipeCard: ({ recipe }: { recipe: Recipe }) =>
    React.createElement('div', { 'data-testid': 'recipe-card' }, recipe.name),
}))

vi.mock('@/components/recipes/swipe-to-delete', () => ({
  SwipeToDelete: ({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'swipe-to-delete' },
      React.createElement('button', { onClick: onDelete, 'data-testid': 'delete-btn' }, 'delete'),
      children,
    ),
}))

vi.mock('@/hooks/use-nearby-restaurant', () => ({
  useNearbyRestaurant: () => ({ nearbyRestaurant: null, isLoading: false, requestPermission: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

const mockRouterPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, back: vi.fn(), replace: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))

const { toast } = await import('sonner')

// --- Fixtures ---
const recipe1: Recipe = {
  id: 'r1',
  name: 'Duck Confit',
  restaurantId: null,
  dishImageUrl: 'https://example.com/duck.jpg',
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-22T00:00:00Z',
}

const recipe2: Recipe = {
  id: 'r2',
  name: 'Truffle Pasta',
  restaurantId: null,
  dishImageUrl: null,
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-21T00:00:00Z',
}

const recipe3: Recipe = {
  id: 'r3',
  name: 'Beef Tartare',
  restaurantId: null,
  dishImageUrl: null,
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-20T00:00:00Z',
}

async function renderHome() {
  const { default: Home } = await import('./page')
  return render(React.createElement(Home))
}

describe('Home page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDeleteRecipe.mockReturnValue({ mutateAsync: mockDeleteMutateAsync })
    mockDeleteMutateAsync.mockResolvedValue(undefined)
  })

  describe('empty state', () => {
    beforeEach(() => {
      mockUseRecipes.mockReturnValue({ data: [] })
    })

    it('renders empty state heading when recipes = []', async () => {
      await renderHome()
      expect(screen.getByText('Eaten somewhere great recently?')).toBeTruthy()
    })

    it('calls setAtmospheric with undefined when recipes = []', async () => {
      await renderHome()
      await waitFor(() => {
        expect(mockSetAtmospheric).toHaveBeenCalledWith(undefined)
      })
    })

    it('does not render FeaturedRecipeCard when recipes = []', async () => {
      await renderHome()
      expect(screen.queryByTestId('featured-recipe-card')).toBeNull()
    })
  })

  describe('populated state (1 recipe)', () => {
    beforeEach(() => {
      mockUseRecipes.mockReturnValue({ data: [recipe1] })
    })

    it('renders FeaturedRecipeCard with first recipe', async () => {
      await renderHome()
      expect(screen.getByTestId('featured-recipe-card')).toBeTruthy()
      expect(screen.getByTestId('featured-recipe-card').textContent).toBe('Duck Confit')
    })

    it('does not render "Your Collection" heading when only 1 recipe', async () => {
      await renderHome()
      expect(screen.queryByText('Your Collection')).toBeNull()
    })

    it('calls setAtmospheric with dishImageUrl of first recipe when recipes load', async () => {
      await renderHome()
      await waitFor(() => {
        expect(mockSetAtmospheric).toHaveBeenCalledWith(
          expect.objectContaining({ imageUrl: 'https://example.com/duck.jpg' })
        )
      })
    })
  })

  describe('populated state (multiple recipes)', () => {
    beforeEach(() => {
      mockUseRecipes.mockReturnValue({ data: [recipe1, recipe2, recipe3] })
    })

    it('renders FeaturedRecipeCard for first recipe', async () => {
      await renderHome()
      expect(screen.getByTestId('featured-recipe-card').textContent).toBe('Duck Confit')
    })

    it('renders RecipeCard for each remaining recipe in collection grid', async () => {
      await renderHome()
      const cards = screen.getAllByTestId('recipe-card')
      expect(cards).toHaveLength(2)
      expect(cards[0].textContent).toBe('Truffle Pasta')
      expect(cards[1].textContent).toBe('Beef Tartare')
    })

    it('renders "Your Collection" heading when rest.length > 0', async () => {
      await renderHome()
      expect(screen.getByText('Your Collection')).toBeTruthy()
    })
  })

  describe('delete interactions', () => {
    beforeEach(() => {
      mockUseRecipes.mockReturnValue({ data: [recipe1, recipe2] })
    })

    it('calls deleteRecipe.mutateAsync and shows toast on delete', async () => {
      await renderHome()
      const deleteButtons = screen.getAllByTestId('delete-btn')
      fireEvent.click(deleteButtons[0])
      await waitFor(() => {
        expect(mockDeleteMutateAsync).toHaveBeenCalledWith('r1')
        expect(toast).toHaveBeenCalledWith('Recipe deleted')
      })
    })

    it('shows error toast when mutation rejects', async () => {
      mockDeleteMutateAsync.mockRejectedValue(new Error('Network error'))
      await renderHome()
      const deleteButtons = screen.getAllByTestId('delete-btn')
      fireEvent.click(deleteButtons[0])
      await waitFor(() => {
        expect((toast as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalledWith('Failed to delete recipe')
      })
    })
  })

  describe('return-visit banner', () => {
    const recipeRest1a: Recipe = {
      id: 'ra1',
      name: 'Ramen',
      restaurantId: 'rest-1',
      dishImageUrl: null,
      confidenceMetadataJson: null,
      servingSize: 1,
      createdAt: '2026-03-22T00:00:00Z',
    }
    const recipeRest1b: Recipe = {
      id: 'ra2',
      name: 'Gyoza',
      restaurantId: 'rest-1',
      dishImageUrl: null,
      confidenceMetadataJson: null,
      servingSize: 1,
      createdAt: '2026-03-21T00:00:00Z',
    }
    const recipeNoRest: Recipe = {
      id: 'rn1',
      name: 'Mystery Dish',
      restaurantId: null,
      dishImageUrl: null,
      confidenceMetadataJson: null,
      servingSize: 1,
      createdAt: '2026-03-20T00:00:00Z',
    }

    it('shows return-visit banner when latest recipe has a restaurant with multiple saved recipes', async () => {
      mockUseRecipes.mockReturnValue({ data: [recipeRest1a, recipeRest1b] })
      await renderHome()
      expect(screen.getByRole('button', { name: /return visit banner/i })).toBeTruthy()
      expect(screen.getByText(/you've been here before/i)).toBeTruthy()
      expect(screen.getByText(/2 saved recipes/i)).toBeTruthy()
    })

    it('does not show banner when latest recipe has only 1 saved recipe at that restaurant', async () => {
      mockUseRecipes.mockReturnValue({ data: [recipeRest1a, recipeNoRest] })
      await renderHome()
      expect(screen.queryByRole('button', { name: /return visit banner/i })).toBeNull()
    })

    it('does not show banner when latest recipe has no restaurant', async () => {
      mockUseRecipes.mockReturnValue({ data: [recipeNoRest, recipeRest1a] })
      await renderHome()
      expect(screen.queryByRole('button', { name: /return visit banner/i })).toBeNull()
    })

    it('tapping banner navigates to /restaurants/[restaurantId]', async () => {
      mockUseRecipes.mockReturnValue({ data: [recipeRest1a, recipeRest1b] })
      await renderHome()
      const banner = screen.getByRole('button', { name: /return visit banner/i })
      fireEvent.click(banner)
      expect(mockRouterPush).toHaveBeenCalledWith('/restaurants/rest-1')
    })
  })
})

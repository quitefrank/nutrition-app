import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecipeDetail } from './recipe-detail'
import type { Recipe, DomainIngredient } from '@/types/domain'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => React.createElement('img', { src, alt }),
}))

const mockSetAtmospheric = vi.fn()
vi.mock('@/contexts/atmospheric-context', () => ({
  useSetAtmospheric: () => mockSetAtmospheric,
}))

const mockAddToGrocery = vi.fn()
vi.mock('@/hooks/use-grocery', () => ({
  useAddToGrocery: () => ({ mutate: mockAddToGrocery, isPending: false }),
}))

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function makeIngredient(overrides?: Partial<DomainIngredient>): DomainIngredient {
  return {
    id: 'ing-1',
    recipeId: 'recipe-1',
    name: 'Duck leg',
    quantity: '2',
    unit: 'pcs',
    confidenceLevel: 'high',
    caloriesKcal: null,
    proteinG: null,
    fatG: null,
    carbsG: null,
    ...overrides,
  }
}

function makeRecipe(overrides?: Partial<Recipe>): Recipe {
  return {
    id: 'recipe-1',
    name: 'Duck Confit',
    restaurantId: null,
    dishImageUrl: null,
    confidenceMetadataJson: null,
    servingSize: 2,
    createdAt: '2026-03-22T00:00:00Z',
    ingredients: [makeIngredient()],
    restaurant: null,
    ...overrides,
  }
}

describe('RecipeDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dish name', () => {
    render(<RecipeDetail recipe={makeRecipe()} />, { wrapper: createWrapper() })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Duck Confit')
  })

  it('renders restaurant name when present', () => {
    const recipe = makeRecipe({
      restaurant: { id: 'rest-1', name: 'Le Canard', googlePlacesId: null, atmosphericPaletteJson: null, updatedAt: '2026-03-22T00:00:00Z' },
    })
    render(<RecipeDetail recipe={recipe} />, { wrapper: createWrapper() })
    expect(screen.getByText('Le Canard')).toBeTruthy()
  })

  it('does not render restaurant name when restaurant is null', () => {
    render(<RecipeDetail recipe={makeRecipe({ restaurant: null })} />, { wrapper: createWrapper() })
    expect(screen.queryByText('Le Canard')).toBeNull()
  })

  it('renders image when dishImageUrl is set', () => {
    const recipe = makeRecipe({ dishImageUrl: 'https://example.com/duck.jpg' })
    render(<RecipeDetail recipe={recipe} />, { wrapper: createWrapper() })
    const img = screen.getByRole('img', { name: 'Duck Confit' })
    expect(img.getAttribute('src')).toBe('https://example.com/duck.jpg')
  })

  it('renders placeholder when dishImageUrl is null', () => {
    render(<RecipeDetail recipe={makeRecipe({ dishImageUrl: null })} />, { wrapper: createWrapper() })
    expect(screen.queryByRole('img', { name: 'Duck Confit' })).toBeNull()
  })

  it('renders all ingredient rows', () => {
    const recipe = makeRecipe({
      ingredients: [
        makeIngredient({ id: 'ing-1', name: 'Duck leg' }),
        makeIngredient({ id: 'ing-2', name: 'Thyme', quantity: '3', unit: 'sprigs' }),
      ],
    })
    render(<RecipeDetail recipe={recipe} />, { wrapper: createWrapper() })
    expect(screen.getByText('Duck leg')).toBeTruthy()
    expect(screen.getByText('Thyme')).toBeTruthy()
  })

  it('shows "varies by restaurant" text label for low-confidence ingredients (NFR16)', () => {
    const recipe = makeRecipe({
      ingredients: [makeIngredient({ confidenceLevel: 'low', name: 'Sauce' })],
    })
    render(<RecipeDetail recipe={recipe} />, { wrapper: createWrapper() })
    expect(screen.getByText('varies by restaurant')).toBeTruthy()
  })

  it('does not show "varies by restaurant" for high-confidence ingredients', () => {
    render(<RecipeDetail recipe={makeRecipe()} />, { wrapper: createWrapper() })
    expect(screen.queryByText('varies by restaurant')).toBeNull()
  })

  it('renders serving size', () => {
    render(<RecipeDetail recipe={makeRecipe({ servingSize: 2 })} />, { wrapper: createWrapper() })
    expect(screen.getByText('Serving size: 2×')).toBeTruthy()
  })

  it('"Add to Grocery List" button is enabled and calls addToGrocery on click', () => {
    render(<RecipeDetail recipe={makeRecipe()} />, { wrapper: createWrapper() })
    const btn = screen.getByRole('button', { name: /Add to Grocery List/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    expect(btn.getAttribute('aria-label')).toBe('Add to Grocery List')
    fireEvent.click(btn)
    expect(mockAddToGrocery).toHaveBeenCalledWith('recipe-1')
  })

  // IG-2: button disabled when recipe has no ingredients
  it('"Add to Grocery List" button is disabled when recipe has no ingredients', () => {
    render(<RecipeDetail recipe={makeRecipe({ ingredients: [] })} />, { wrapper: createWrapper() })
    const btn = screen.getByRole('button', { name: /Add to Grocery List/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('nutrition panel: shows "Nutrition unavailable" when all macros null', () => {
    render(<RecipeDetail recipe={makeRecipe()} />, { wrapper: createWrapper() })
    expect(screen.getByText('Nutrition unavailable')).toBeTruthy()
  })

  it('nutrition panel: shows "Partial nutrition data" when some macros null, some present', () => {
    const recipe = makeRecipe({
      ingredients: [
        makeIngredient({ id: 'ing-1', caloriesKcal: 200, proteinG: 10, fatG: 8, carbsG: 5 }),
        makeIngredient({ id: 'ing-2', name: 'Herb', caloriesKcal: null, proteinG: null, fatG: null, carbsG: null }),
      ],
    })
    render(<RecipeDetail recipe={recipe} />, { wrapper: createWrapper() })
    expect(screen.getByText(/Partial nutrition data/)).toBeTruthy()
  })

  it('nutrition panel: shows calorie total when all macros present', () => {
    const recipe = makeRecipe({
      servingSize: 1,
      ingredients: [
        makeIngredient({ id: 'ing-1', caloriesKcal: 300, proteinG: 15, fatG: 10, carbsG: 20 }),
        makeIngredient({ id: 'ing-2', name: 'Herb', caloriesKcal: 50, proteinG: 2, fatG: 1, carbsG: 5 }),
      ],
    })
    render(<RecipeDetail recipe={recipe} />, { wrapper: createWrapper() })
    expect(screen.getByText('350kcal')).toBeTruthy()
  })

  it('calls setAtmospheric with dishImageUrl on mount when present', () => {
    const recipe = makeRecipe({ dishImageUrl: 'https://example.com/duck.jpg' })
    render(<RecipeDetail recipe={recipe} />, { wrapper: createWrapper() })
    expect(mockSetAtmospheric).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: 'https://example.com/duck.jpg', tier: 'restaurant' })
    )
  })

  it('calls setAtmospheric with undefined when dishImageUrl is null', () => {
    render(<RecipeDetail recipe={makeRecipe({ dishImageUrl: null })} />, { wrapper: createWrapper() })
    expect(mockSetAtmospheric).toHaveBeenCalledWith(undefined)
  })

  // BS-3: zero ingredients should not render the high-confidence "Confirmed" message
  it('evidence block renders nothing (not "Confirmed") when ingredient list is empty', () => {
    render(<RecipeDetail recipe={makeRecipe({ ingredients: [] })} />, { wrapper: createWrapper() })
    expect(screen.queryByText('Confirmed by dish name, photo, and ingredients')).toBeNull()
  })

  // BS-4: low-confidence label must not claim "most ingredients confirmed" when < 80% high
  it('evidence block does not say "most ingredients confirmed" at low confidence', () => {
    const recipe = makeRecipe({
      ingredients: [
        makeIngredient({ id: 'ing-1', confidenceLevel: 'high' }),
        makeIngredient({ id: 'ing-2', confidenceLevel: 'low' }),
        makeIngredient({ id: 'ing-3', confidenceLevel: 'low' }),
      ],
    })
    render(<RecipeDetail recipe={recipe} />, { wrapper: createWrapper() })
    expect(screen.queryByText(/most ingredients confirmed/)).toBeNull()
  })

  // P-5: "Partial nutrition data" label when protein/fat/carbs null but caloriesKcal present
  it('nutrition panel shows "Partial nutrition data" when calories present but protein is null', () => {
    const recipe = makeRecipe({
      ingredients: [
        makeIngredient({ id: 'ing-1', caloriesKcal: 300, proteinG: null, fatG: null, carbsG: null }),
        makeIngredient({ id: 'ing-2', name: 'Herb', caloriesKcal: 50, proteinG: null, fatG: null, carbsG: null }),
      ],
    })
    render(<RecipeDetail recipe={recipe} />, { wrapper: createWrapper() })
    expect(screen.getByText(/Partial nutrition data/)).toBeTruthy()
  })
})

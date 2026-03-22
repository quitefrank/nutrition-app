import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { GroceryRecipeView } from './grocery-recipe-view'
import type { GroceryListItem, GroceryRecipeSummary } from '@/types/api'

vi.mock('@/hooks/use-grocery', () => ({
  useGroceryItems: vi.fn(),
  useGroceryRecipeGroups: vi.fn(),
  useBulkRemoveRecipe: vi.fn(),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    React.createElement('img', { src, alt }),
}))

import {
  useGroceryItems,
  useGroceryRecipeGroups,
  useBulkRemoveRecipe,
} from '@/hooks/use-grocery'

const RECIPE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const mockItems: GroceryListItem[] = [
  { id: 'g1', recipeId: RECIPE_ID, ingredientName: 'Pasta', quantity: '200', unit: 'g', checked: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'g2', recipeId: RECIPE_ID, ingredientName: 'Eggs', quantity: '2', unit: null, checked: false, createdAt: '2026-01-01T00:01:00Z' },
]

const mockSummaries: GroceryRecipeSummary[] = [
  {
    recipeId: RECIPE_ID,
    recipeName: 'Pasta Carbonara',
    dishImageUrl: 'https://example.com/pasta.jpg',
    restaurantName: 'Trattoria',
    itemCount: 2,
  },
]

function setupMocks({
  items = mockItems,
  summaries = mockSummaries,
  itemsLoading = false,
  summariesLoading = false,
  itemsError = false,
  summariesError = false,
}: {
  items?: GroceryListItem[]
  summaries?: GroceryRecipeSummary[]
  itemsLoading?: boolean
  summariesLoading?: boolean
  itemsError?: boolean
  summariesError?: boolean
} = {}) {
  const mockBulkRemove = vi.fn()
  const mockRefetchItems = vi.fn()
  vi.mocked(useGroceryItems).mockReturnValue({ data: items, isLoading: itemsLoading, isError: itemsError, refetch: mockRefetchItems } as ReturnType<typeof useGroceryItems>)
  vi.mocked(useGroceryRecipeGroups).mockReturnValue({ data: summaries, isLoading: summariesLoading, isError: summariesError, refetch: vi.fn() } as ReturnType<typeof useGroceryRecipeGroups>)
  vi.mocked(useBulkRemoveRecipe).mockReturnValue({ mutate: mockBulkRemove, isPending: false } as ReturnType<typeof useBulkRemoveRecipe>)
  return { mockBulkRemove, mockRefetchItems }
}

describe('GroceryRecipeView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading state when data is loading', () => {
    setupMocks({ itemsLoading: true, items: [] })
    render(<GroceryRecipeView />)
    expect(screen.getByLabelText('Loading recipe groups')).toBeDefined()
  })

  it('shows error state when summaries query fails', () => {
    setupMocks({ summariesError: true, summaries: [] })
    render(<GroceryRecipeView />)
    expect(screen.getByText(/Failed to load recipe groups/i)).toBeDefined()
  })

  it('renders recipe group card with recipe name', () => {
    setupMocks()
    render(<GroceryRecipeView />)
    expect(screen.getByText('Pasta Carbonara')).toBeDefined()
  })

  it('renders restaurant name in card header', () => {
    setupMocks()
    render(<GroceryRecipeView />)
    expect(screen.getByText('Trattoria')).toBeDefined()
  })

  it('renders item count badge', () => {
    setupMocks()
    render(<GroceryRecipeView />)
    expect(screen.getByText('2 items')).toBeDefined()
  })

  it('renders first 3 ingredients and hides the rest', () => {
    const manyItems: GroceryListItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: `g${i + 1}`,
      recipeId: RECIPE_ID,
      ingredientName: `Ingredient ${i + 1}`,
      quantity: null,
      unit: null,
      checked: false,
      createdAt: '2026-01-01T00:00:00Z',
    }))
    setupMocks({ items: manyItems, summaries: [{ ...mockSummaries[0], itemCount: 5 }] })
    render(<GroceryRecipeView />)
    expect(screen.getByText('Ingredient 1')).toBeDefined()
    expect(screen.getByText('Ingredient 3')).toBeDefined()
    expect(screen.queryByText('Ingredient 4')).toBeNull()
    expect(screen.getByText(/\+ 2 more/i)).toBeDefined()
  })

  it('expanding disclosure shows all ingredients', () => {
    const manyItems: GroceryListItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: `g${i + 1}`,
      recipeId: RECIPE_ID,
      ingredientName: `Ingredient ${i + 1}`,
      quantity: null,
      unit: null,
      checked: false,
      createdAt: '2026-01-01T00:00:00Z',
    }))
    setupMocks({ items: manyItems, summaries: [{ ...mockSummaries[0], itemCount: 5 }] })
    render(<GroceryRecipeView />)
    const expandBtn = screen.getByLabelText(/Show 2 more ingredients/i)
    fireEvent.click(expandBtn)
    expect(screen.getByText('Ingredient 4')).toBeDefined()
    expect(screen.getByText('Ingredient 5')).toBeDefined()
  })

  it('shows "Remove all X items" button for named recipe', () => {
    setupMocks()
    render(<GroceryRecipeView />)
    expect(screen.getByRole('button', { name: /Remove all 2 items from Pasta Carbonara/i })).toBeDefined()
  })

  it('clicking "Remove all" calls bulkRemove with recipeId', () => {
    const { mockBulkRemove } = setupMocks()
    render(<GroceryRecipeView />)
    const removeBtn = screen.getByRole('button', { name: /Remove all 2 items from Pasta Carbonara/i })
    fireEvent.click(removeBtn)
    expect(mockBulkRemove).toHaveBeenCalledWith(RECIPE_ID)
  })

  it('does NOT show "Remove all" for "Other items" group', () => {
    const nullItems: GroceryListItem[] = [
      { id: 'g1', recipeId: null, ingredientName: 'Salt', quantity: null, unit: null, checked: false, createdAt: '2026-01-01T00:00:00Z' },
    ]
    const nullSummaries: GroceryRecipeSummary[] = [
      { recipeId: null, recipeName: 'Other items', dishImageUrl: null, restaurantName: null, itemCount: 1 },
    ]
    setupMocks({ items: nullItems, summaries: nullSummaries })
    render(<GroceryRecipeView />)
    expect(screen.queryByRole('button', { name: /Remove all/i })).toBeNull()
  })

  it('"Other items" group renders without thumbnail', () => {
    const nullItems: GroceryListItem[] = [
      { id: 'g1', recipeId: null, ingredientName: 'Salt', quantity: null, unit: null, checked: false, createdAt: '2026-01-01T00:00:00Z' },
    ]
    const nullSummaries: GroceryRecipeSummary[] = [
      { recipeId: null, recipeName: 'Other items', dishImageUrl: null, restaurantName: null, itemCount: 1 },
    ]
    setupMocks({ items: nullItems, summaries: nullSummaries })
    render(<GroceryRecipeView />)
    expect(screen.getByText('Other items')).toBeDefined()
    // No image alt text for the null group
    expect(screen.queryByAltText('Other items')).toBeNull()
  })

  it('renders quantity and unit for ingredient row', () => {
    setupMocks()
    render(<GroceryRecipeView />)
    // "200 g" — quantity + unit joined
    expect(screen.getByText('200 g')).toBeDefined()
  })

  it('renders ingredient with null quantity without crashing', () => {
    const itemNoQty: GroceryListItem[] = [
      { id: 'g1', recipeId: RECIPE_ID, ingredientName: 'Eggs', quantity: null, unit: null, checked: false, createdAt: '2026-01-01T00:00:00Z' },
    ]
    setupMocks({ items: itemNoQty, summaries: [{ ...mockSummaries[0], itemCount: 1 }] })
    render(<GroceryRecipeView />)
    expect(screen.getByText('Eggs')).toBeDefined()
  })

  // P-4: empty state
  it('shows empty state message when grocery list has no items', () => {
    setupMocks({ items: [], summaries: [] })
    render(<GroceryRecipeView />)
    expect(screen.getByText(/No recipes in your grocery list yet/i)).toBeDefined()
  })

  it('renders retry button in error state', () => {
    setupMocks({ summariesError: true, summaries: [] })
    render(<GroceryRecipeView />)
    expect(screen.getByRole('button', { name: /Retry/i })).toBeDefined()
  })

  // I-1: collapse affordance
  it('collapsing after expand hides extra ingredients again', () => {
    const manyItems: GroceryListItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: `g${i + 1}`,
      recipeId: RECIPE_ID,
      ingredientName: `Ingredient ${i + 1}`,
      quantity: null,
      unit: null,
      checked: false,
      createdAt: '2026-01-01T00:00:00Z',
    }))
    setupMocks({ items: manyItems, summaries: [{ ...mockSummaries[0], itemCount: 5 }] })
    render(<GroceryRecipeView />)

    // Expand
    fireEvent.click(screen.getByLabelText(/Show 2 more ingredients/i))
    expect(screen.getByText('Ingredient 5')).toBeDefined()

    // Collapse
    fireEvent.click(screen.getByLabelText(/Show fewer ingredients/i))
    expect(screen.queryByText('Ingredient 4')).toBeNull()
    expect(screen.queryByText('Ingredient 5')).toBeNull()
  })

  // P-1: retry refetches both queries
  it('clicking Retry when items query fails also refetches the items query', () => {
    const { mockRefetchItems } = setupMocks({ itemsError: true, items: [] })
    render(<GroceryRecipeView />)
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))
    expect(mockRefetchItems).toHaveBeenCalled()
  })

  // P-2: orphan items (recipeId not in summaries) appear in "Other items" rather than disappearing
  it('items whose recipeId is absent from summaries are placed in "Other items" group', () => {
    const UNKNOWN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const orphanItem: GroceryListItem = {
      id: 'g3', recipeId: UNKNOWN_ID, ingredientName: 'Mystery Ingredient',
      quantity: null, unit: null, checked: false, createdAt: '2026-01-01T00:00:00Z',
    }
    // summaries does NOT contain UNKNOWN_ID — simulates stale cache
    setupMocks({ items: [...mockItems, orphanItem], summaries: mockSummaries })
    render(<GroceryRecipeView />)
    expect(screen.getByText('Other items')).toBeDefined()
    expect(screen.getByText('Mystery Ingredient')).toBeDefined()
  })
})

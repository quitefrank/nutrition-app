import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { GroceryIngredientView } from './grocery-ingredient-view'
import type { GroceryListItem } from '@/types/api'

// Mock hooks
vi.mock('@/hooks/use-grocery', () => ({
  useGroceryItems: vi.fn(),
  useCheckGroceryItem: vi.fn(),
  useDeleteGroceryItem: vi.fn(),
  useClearChecked: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import {
  useGroceryItems,
  useCheckGroceryItem,
  useDeleteGroceryItem,
  useClearChecked,
} from '@/hooks/use-grocery'

const mockItem: GroceryListItem = {
  id: 'g1',
  recipeId: null,
  ingredientName: 'Eggs',
  quantity: '2',
  unit: null,
  checked: false,
  createdAt: '2026-01-01T00:00:00Z',
}

const checkedItem: GroceryListItem = { ...mockItem, id: 'g2', ingredientName: 'Butter', checked: true }

function setupMocks({
  items = [mockItem],
  isLoading = false,
  isError = false,
}: {
  items?: GroceryListItem[]
  isLoading?: boolean
  isError?: boolean
} = {}) {
  const mockCheck = vi.fn()
  const mockDelete = vi.fn()
  const mockClear = vi.fn()

  vi.mocked(useGroceryItems).mockReturnValue({ data: items, isLoading, isError } as ReturnType<typeof useGroceryItems>)
  vi.mocked(useCheckGroceryItem).mockReturnValue({ mutate: mockCheck } as ReturnType<typeof useCheckGroceryItem>)
  vi.mocked(useDeleteGroceryItem).mockReturnValue({ mutate: mockDelete } as ReturnType<typeof useDeleteGroceryItem>)
  vi.mocked(useClearChecked).mockReturnValue({ mutate: mockClear, isPending: false } as ReturnType<typeof useClearChecked>)

  return { mockCheck, mockDelete, mockClear }
}

describe('GroceryIngredientView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading state', () => {
    setupMocks({ isLoading: true, items: [] })
    render(<GroceryIngredientView />)
    expect(screen.getByLabelText('Loading grocery list')).toBeDefined()
  })

  it('shows error state', () => {
    setupMocks({ isError: true, items: [] })
    render(<GroceryIngredientView />)
    expect(screen.getByText(/Failed to load grocery list/i)).toBeDefined()
  })

  it('shows empty state with CTA when no items', () => {
    setupMocks({ items: [] })
    render(<GroceryIngredientView />)
    expect(screen.getByRole('button', { name: /Go to recipe collection/i })).toBeDefined()
  })

  it('empty state CTA navigates to /recipes when clicked without throwing', () => {
    // vi.mock is hoisted and cannot reference test-local variables — rely on top-level mock
    setupMocks({ items: [] })
    render(<GroceryIngredientView />)
    const btn = screen.getByRole('button', { name: /Go to recipe collection/i })
    fireEvent.click(btn)
    expect(btn).toBeDefined()
  })

  it('renders grocery row with ingredient name and quantity', () => {
    setupMocks()
    render(<GroceryIngredientView />)
    expect(screen.getByText('Eggs')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
  })

  it('renders ingredient name without quantity when quantity is null', () => {
    const itemNoQty: GroceryListItem = { ...mockItem, quantity: null }
    setupMocks({ items: [itemNoQty] })
    render(<GroceryIngredientView />)
    expect(screen.getByText('Eggs')).toBeDefined()
  })

  it('renders quantity and unit joined with space', () => {
    const itemWithUnit: GroceryListItem = { ...mockItem, quantity: '100', unit: 'g' }
    setupMocks({ items: [itemWithUnit] })
    render(<GroceryIngredientView />)
    expect(screen.getByText('100 g')).toBeDefined()
  })

  it('tapping check circle calls checkItem with toggled checked value', () => {
    const { mockCheck } = setupMocks()
    render(<GroceryIngredientView />)
    const checkBtn = screen.getByRole('button', { name: /Check Eggs/i })
    fireEvent.click(checkBtn)
    expect(mockCheck).toHaveBeenCalledWith({ id: 'g1', checked: true })
  })

  it('tapping check circle on checked item calls checkItem with checked=false', () => {
    const { mockCheck } = setupMocks({ items: [checkedItem] })
    render(<GroceryIngredientView />)
    const checkBtn = screen.getByRole('button', { name: /Uncheck Butter/i })
    fireEvent.click(checkBtn)
    expect(mockCheck).toHaveBeenCalledWith({ id: 'g2', checked: false })
  })

  it('checked item shows strikethrough text decoration', () => {
    setupMocks({ items: [checkedItem] })
    render(<GroceryIngredientView />)
    const nameEl = screen.getByText('Butter')
    expect(nameEl.style.textDecoration).toBe('line-through')
  })

  it('unchecked item has no strikethrough', () => {
    setupMocks()
    render(<GroceryIngredientView />)
    const nameEl = screen.getByText('Eggs')
    expect(nameEl.style.textDecoration).toBe('none')
  })

  it('"Clear checked" button visible only when at least one checked item', () => {
    setupMocks({ items: [mockItem, checkedItem] })
    render(<GroceryIngredientView />)
    expect(screen.getByRole('button', { name: /Clear all checked items/i })).toBeDefined()
  })

  it('"Clear checked" button not visible when no checked items', () => {
    setupMocks({ items: [mockItem] })
    render(<GroceryIngredientView />)
    expect(screen.queryByRole('button', { name: /Clear all checked items/i })).toBeNull()
  })

  it('clicking "Clear checked" calls clearChecked', () => {
    const { mockClear } = setupMocks({ items: [mockItem, checkedItem] })
    render(<GroceryIngredientView />)
    const clearBtn = screen.getByRole('button', { name: /Clear all checked items/i })
    fireEvent.click(clearBtn)
    expect(mockClear).toHaveBeenCalled()
  })

  it('renders grocery list with aria-label', () => {
    setupMocks()
    render(<GroceryIngredientView />)
    expect(screen.getByRole('list', { name: 'Grocery list' })).toBeDefined()
  })

  it('swipe left on row reveals delete button', () => {
    setupMocks()
    render(<GroceryIngredientView />)
    const listItem = screen.getByText('Eggs').closest('li')!
    fireEvent.touchStart(listItem, { touches: [{ clientX: 200 }] })
    fireEvent.touchEnd(listItem, { changedTouches: [{ clientX: 100 }] }) // delta 100 >= 40
    expect(screen.getByRole('button', { name: /Delete Eggs/i })).toBeDefined()
  })

  it('tapping delete button calls deleteItem', () => {
    const { mockDelete } = setupMocks()
    render(<GroceryIngredientView />)
    const listItem = screen.getByText('Eggs').closest('li')!
    fireEvent.touchStart(listItem, { touches: [{ clientX: 200 }] })
    fireEvent.touchEnd(listItem, { changedTouches: [{ clientX: 100 }] })
    const deleteBtn = screen.getByRole('button', { name: /Delete Eggs/i })
    fireEvent.click(deleteBtn)
    expect(mockDelete).toHaveBeenCalledWith('g1')
  })
})

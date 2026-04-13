import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroceryScreen } from './GroceryScreen'

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockCheckMutate = vi.fn()
const mockDeleteMutate = vi.fn()
const mockClearCheckedMutate = vi.fn()

vi.mock('@/hooks/useGrocery', () => ({
  useGroceryItems: vi.fn(() => ({ data: undefined, isError: false })),
  useCheckGroceryItem: vi.fn(() => ({ mutate: mockCheckMutate, isPending: false })),
  useDeleteGroceryItem: vi.fn(() => ({ mutate: mockDeleteMutate, isPending: false })),
  useClearChecked: vi.fn(() => ({ mutate: mockClearCheckedMutate, isPending: false })),
}))

import { useGroceryItems } from '@/hooks/useGrocery'
import type { DomainGroceryItem } from '@/types/database'
import { addIngredientsToGrocery } from '@/lib/grocery-store'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setSupabaseData(data: DomainGroceryItem[] | undefined, isError = false) {
  vi.mocked(useGroceryItems).mockReturnValue({
    data,
    isError,
  } as ReturnType<typeof useGroceryItems>)
}

function makeSupabaseItem(overrides: Partial<DomainGroceryItem> = {}): DomainGroceryItem {
  return {
    id: 'sb-item-1',
    name: 'Cilantro',
    quantity: '1',
    unit: 'bunch',
    checked: false,
    recipeIds: [],
    dishName: 'Tacos',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('GroceryScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // Default: Supabase has not resolved yet (undefined data)
    setSupabaseData(undefined, false)
  })

  // ─── Heading always present ─────────────────────────────────────────────────

  it('renders the Grocery List heading', () => {
    render(<GroceryScreen />)
    expect(screen.getByText('Grocery List')).toBeTruthy()
  })

  // ─── Empty state ────────────────────────────────────────────────────────────

  it('shows empty state when there are no items', () => {
    render(<GroceryScreen />)
    expect(screen.getByText('Your list is empty')).toBeTruthy()
  })

  // ─── Local items (Supabase not configured / pending) ───────────────────────

  it('renders items from localStorage when Supabase data is undefined', () => {
    addIngredientsToGrocery(
      [{ name: 'Butter', quantity: '100', unit: 'g' }],
      'Croissant',
      'Bakery Corner'
    )
    render(<GroceryScreen />)
    expect(screen.getByText('Butter')).toBeTruthy()
  })

  it('shows grouped view by default (dish header and item name visible)', () => {
    addIngredientsToGrocery(
      [{ name: 'Eggs', quantity: '2', unit: null }],
      'Omelette',
      null
    )
    render(<GroceryScreen />)
    expect(screen.getByText('Omelette')).toBeTruthy()
    expect(screen.getByText('Eggs')).toBeTruthy()
  })

  // ─── Supabase items ─────────────────────────────────────────────────────────

  it('renders Supabase items when supabaseData is an array', () => {
    setSupabaseData([makeSupabaseItem()])
    render(<GroceryScreen />)
    expect(screen.getByText('Cilantro')).toBeTruthy()
  })

  it('shows the sync indicator (Synced) when Supabase data is active', () => {
    setSupabaseData([makeSupabaseItem()])
    render(<GroceryScreen />)
    expect(screen.getByText('Synced')).toBeTruthy()
  })

  it('does not show sync indicator when Supabase data is undefined', () => {
    setSupabaseData(undefined)
    render(<GroceryScreen />)
    expect(screen.queryByText('Synced')).toBeNull()
  })

  it('falls back to localStorage items when Supabase errors', () => {
    addIngredientsToGrocery([{ name: 'Olive Oil' }], 'Salad', null)
    setSupabaseData(undefined, true)

    render(<GroceryScreen />)
    expect(screen.getByText('Olive Oil')).toBeTruthy()
  })

  // ─── View mode toggle ───────────────────────────────────────────────────────

  it('toggles from grouped to flat view when the toggle button is clicked', () => {
    addIngredientsToGrocery(
      [{ name: 'Flour', quantity: '200', unit: 'g' }],
      'Bread',
      null
    )
    render(<GroceryScreen />)

    // Initially grouped — dish header visible
    expect(screen.getByText('Bread')).toBeTruthy()
    expect(screen.getByText('Flour')).toBeTruthy()

    // Toggle to flat view
    const toggleBtn = screen.getByRole('button', { name: /switch to flat view/i })
    fireEvent.click(toggleBtn)

    // In flat mode the toggle button label switches, and the item is still visible
    expect(screen.getByText('Flour')).toBeTruthy()
    expect(screen.getByRole('button', { name: /switch to grouped view/i })).toBeTruthy()
  })

  // ─── Clear buttons ──────────────────────────────────────────────────────────

  it('shows "Clear all" button when there are items', () => {
    addIngredientsToGrocery([{ name: 'Milk' }], 'Cereal', null)
    render(<GroceryScreen />)
    expect(screen.getByRole('button', { name: /clear all/i })).toBeTruthy()
  })

  it('does not show "Clear done" when no items are checked', () => {
    addIngredientsToGrocery([{ name: 'Eggs' }], 'Omelette', null)
    render(<GroceryScreen />)
    expect(screen.queryByRole('button', { name: /clear done/i })).toBeNull()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockBack = vi.fn()
const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: mockBack, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

const mockUseRecipe = vi.fn()
vi.mock('@/hooks/use-recipes', () => ({
  useRecipe: (id: string) => mockUseRecipe(id),
}))

vi.mock('@/components/recipes/recipe-detail', () => ({
  RecipeDetail: ({ recipe }: { recipe: { name: string } }) =>
    React.createElement('div', { 'data-testid': 'recipe-detail' }, recipe.name),
}))

// Mock React.use to resolve the params Promise synchronously
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    use: (p: Promise<{ id: string }> | { id: string }) => {
      if (p && typeof (p as Promise<{ id: string }>).then === 'function') {
        return { id: 'test-id' }
      }
      return p
    },
  }
})

import RecipeDetailPage from './page'

const baseRecipe = {
  id: 'test-id',
  name: 'Duck Confit',
  restaurantId: null,
  dishImageUrl: null,
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-22T00:00:00Z',
}

describe('RecipeDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders RecipeDetail when recipe data is available', () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeDetailPage params={Promise.resolve({ id: 'test-id' })} />)

    expect(screen.getByTestId('recipe-detail')).toBeTruthy()
    expect(screen.getByText('Duck Confit')).toBeTruthy()
  })

  it('renders loading state when isLoading is true', () => {
    mockUseRecipe.mockReturnValue({ data: undefined, isLoading: true, isError: false })

    render(<RecipeDetailPage params={Promise.resolve({ id: 'test-id' })} />)

    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByTestId('recipe-detail')).toBeNull()
  })

  it('renders error state when isError is true', () => {
    mockUseRecipe.mockReturnValue({ data: undefined, isLoading: false, isError: true })

    render(<RecipeDetailPage params={Promise.resolve({ id: 'test-id' })} />)

    expect(screen.getByText('Could not load this recipe.')).toBeTruthy()
    expect(screen.queryByTestId('recipe-detail')).toBeNull()
  })

  it('renders Edit button when recipe data is available', () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeDetailPage params={Promise.resolve({ id: 'test-id' })} />)

    expect(screen.getByRole('button', { name: /Edit recipe/i })).toBeTruthy()
  })

  it('does not render Edit button when loading', () => {
    mockUseRecipe.mockReturnValue({ data: undefined, isLoading: true, isError: false })

    render(<RecipeDetailPage params={Promise.resolve({ id: 'test-id' })} />)

    expect(screen.queryByRole('button', { name: /Edit recipe/i })).toBeNull()
  })

  it('back button navigates away (back or replace depending on history)', async () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeDetailPage params={Promise.resolve({ id: 'test-id' })} />)

    const backBtn = screen.getByRole('button', { name: /Go back/i })
    await userEvent.click(backBtn)

    // In jsdom, window.history.length is 1 so replace('/') is used as fallback
    const navigated = mockBack.mock.calls.length > 0 || mockReplace.mock.calls.length > 0
    expect(navigated).toBe(true)
  })
})

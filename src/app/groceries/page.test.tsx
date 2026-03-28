import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GroceriesPage from './page'

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
  )
}

// Mock child views — they have their own tests; here we test page structure only
vi.mock('@/components/grocery/grocery-ingredient-view', () => ({
  GroceryIngredientView: () => React.createElement('div', { 'data-testid': 'ingredient-view' }, 'Ingredient View'),
}))

vi.mock('@/components/grocery/grocery-recipe-view', () => ({
  GroceryRecipeView: () => React.createElement('div', { 'data-testid': 'recipe-view' }, 'Recipe View'),
}))

describe('GroceriesPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders toggle pill with both options', () => {
    renderWithClient(<GroceriesPage />)
    expect(screen.getByRole('button', { name: 'Ingredients' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'By Recipe' })).toBeDefined()
  })

  it('ingredient view is visible by default (opacity 1)', () => {
    renderWithClient(<GroceriesPage />)
    const ingredientContainer = screen.getByTestId('ingredient-view').parentElement!
    expect(ingredientContainer.style.opacity).toBe('1')
  })

  it('recipe view is hidden by default (opacity 0)', () => {
    renderWithClient(<GroceriesPage />)
    const recipeContainer = screen.getByTestId('recipe-view').parentElement!
    expect(recipeContainer.style.opacity).toBe('0')
  })

  it('both views are mounted simultaneously in the DOM', () => {
    renderWithClient(<GroceriesPage />)
    expect(screen.getByTestId('ingredient-view')).toBeDefined()
    expect(screen.getByTestId('recipe-view')).toBeDefined()
  })

  it('clicking "By Recipe" switches opacity — recipe view becomes visible', () => {
    renderWithClient(<GroceriesPage />)
    const recipeBtn = screen.getByRole('button', { name: 'By Recipe' })
    fireEvent.click(recipeBtn)

    const recipeContainer = screen.getByTestId('recipe-view').parentElement!
    expect(recipeContainer.style.opacity).toBe('1')
  })

  it('clicking "By Recipe" hides ingredient view (opacity 0)', () => {
    renderWithClient(<GroceriesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'By Recipe' }))

    const ingredientContainer = screen.getByTestId('ingredient-view').parentElement!
    expect(ingredientContainer.style.opacity).toBe('0')
  })

  it('clicking "Ingredients" after switching back shows ingredient view', () => {
    renderWithClient(<GroceriesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'By Recipe' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ingredients' }))

    const ingredientContainer = screen.getByTestId('ingredient-view').parentElement!
    expect(ingredientContainer.style.opacity).toBe('1')
  })

  it('active toggle button has aria-pressed=true', () => {
    renderWithClient(<GroceriesPage />)
    const ingredientsBtn = screen.getByRole('button', { name: 'Ingredients' })
    expect(ingredientsBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('"By Recipe" button gets aria-pressed=true after switching', () => {
    renderWithClient(<GroceriesPage />)
    const recipeBtn = screen.getByRole('button', { name: 'By Recipe' })
    fireEvent.click(recipeBtn)
    expect(recipeBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('inactive toggle button has pointerEvents none', () => {
    renderWithClient(<GroceriesPage />)
    // After switching to recipe, ingredient view should have pointerEvents=none
    fireEvent.click(screen.getByRole('button', { name: 'By Recipe' }))
    const ingredientContainer = screen.getByTestId('ingredient-view').parentElement!
    expect(ingredientContainer.style.pointerEvents).toBe('none')
  })

  it('invalidates grocery query keys after a delay when the online event fires', async () => {
    vi.useFakeTimers()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    render(
      <QueryClientProvider client={qc}>
        <GroceriesPage />
      </QueryClientProvider>
    )

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    // Not yet — delay not elapsed
    expect(invalidateSpy).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['grocery-items'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['grocery-recipe-groups'] })

    vi.useRealTimers()
  })
})

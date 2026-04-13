/**
 * RecipeGridCard — WCAG 2.1 AA colour and touch target compliance tests (Story 7-2)
 *
 * Tests the measurable constraints that can be verified in unit tests:
 *  - Calorie label colour uses --color-text-secondary (not --color-accent)
 *  - Card root has role="button"
 *  - Card root has minHeight ≥ 44 (touch target)
 *  - aria-label is set to the recipe name
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { RecipeGridCard } from './RecipeGridCard'
import type { DomainRecipe } from '@/types/database'

// Minimal recipe fixture — only fields used by RecipeGridCard
const baseRecipe: DomainRecipe = {
  id: 'test-id-1',
  name: 'Chicken Tikka Masala',
  status: 'kept',
  estimatedCalories: 480,
  photoStatus: 'placeholder',
  dishImageUrl: null,
  restaurantId: 'restaurant-id-1',
  visitId: null,
  description: null,
  geminiConfidence: null,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: null,
  totalCarbsG: null,
  totalFatG: null,
  totalFibreG: null,
  createdAt: '2026-04-13T00:00:00.000Z',
  ingredients: [],
  restaurant: null,
}

describe('RecipeGridCard — colour and touch target compliance', () => {
  it('calorie label does NOT use var(--color-accent) colour', () => {
    const { container } = render(
      <RecipeGridCard recipe={baseRecipe} onPress={() => {}} />
    )
    // Find all elements that render the calorie value
    const calorieText = container.querySelector('p:last-child')
    expect(calorieText).toBeTruthy()
    const style = (calorieText as HTMLElement).style
    // Must NOT be the accent colour
    expect(style.color).not.toBe('var(--color-accent)')
  })

  it('calorie label uses var(--color-text-secondary) colour', () => {
    const { container } = render(
      <RecipeGridCard recipe={baseRecipe} onPress={() => {}} />
    )
    const calorieText = container.querySelector('p:last-child')
    expect(calorieText).toBeTruthy()
    const style = (calorieText as HTMLElement).style
    expect(style.color).toBe('var(--color-text-secondary)')
  })

  it('card root element has role="button"', () => {
    const { getByRole } = render(
      <RecipeGridCard recipe={baseRecipe} onPress={() => {}} />
    )
    // getByRole throws if no element with role="button" is found
    const card = getByRole('button')
    expect(card).toBeTruthy()
  })

  it('card root element has minHeight of at least 44px', () => {
    const { getByRole } = render(
      <RecipeGridCard recipe={baseRecipe} onPress={() => {}} />
    )
    const card = getByRole('button')
    const minHeight = (card as HTMLElement).style.minHeight
    // minHeight should be set to 44 (as a number or string like "44px")
    const minHeightValue = parseInt(minHeight, 10)
    expect(minHeightValue).toBeGreaterThanOrEqual(44)
  })

  it('aria-label is set to the recipe name', () => {
    const { getByRole } = render(
      <RecipeGridCard recipe={baseRecipe} onPress={() => {}} />
    )
    const card = getByRole('button')
    expect(card.getAttribute('aria-label')).toBe(baseRecipe.name)
  })

  it('calorie label is omitted when estimatedCalories is null', () => {
    const noCalorieRecipe: DomainRecipe = { ...baseRecipe, estimatedCalories: null }
    const { container } = render(
      <RecipeGridCard recipe={noCalorieRecipe} onPress={() => {}} />
    )
    // The text content of the card should not include "cal"
    expect(container.textContent).not.toContain('cal')
  })
})

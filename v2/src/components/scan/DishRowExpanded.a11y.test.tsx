import { vi, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DishRowExpanded } from './DishRowExpanded'
import type { DomainRecipe } from '@/types/database'

const baseRecipe: DomainRecipe = {
  id: 'recipe-a11y',
  restaurantId: 'rest-1',
  visitId: null,
  name: 'Massaman Curry',
  description: 'Rich Thai massaman curry',
  dishImageUrl: null,
  estimatedCalories: 610,
  status: 'auto_captured',
  photoStatus: 'placeholder',
  geminiConfidence: 0.9,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: null,
  totalCarbsG: null,
  totalFatG: null,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}

const recipeWithIngredients: DomainRecipe = {
  ...baseRecipe,
  ingredients: [
    { id: 'i1', recipeId: 'recipe-a11y', name: 'Potato', quantity: '100', unit: 'g', usdaFdcId: null, caloriesPerServing: null, proteinG: 2, fatG: 0.1, carbsG: 17, confidence: 'high' },
  ],
}

const defaultProps = {
  recipe: baseRecipe,
  expandedRecipe: recipeWithIngredients,
  onCollapse: vi.fn(),
  onAddToRecipes: vi.fn(),
}

describe('DishRowExpanded — ARIA and keyboard accessibility', () => {
  it('collapse button has aria-label="Collapse"', () => {
    render(<DishRowExpanded {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy()
  })

  it('portion stepper group has role="group" and aria-label="Serving size"', () => {
    render(<DishRowExpanded {...defaultProps} />)
    const group = screen.getByRole('group', { name: /serving size/i })
    expect(group).toBeTruthy()
  })

  it('each portion stepper button has aria-pressed attribute', () => {
    render(<DishRowExpanded {...defaultProps} />)
    const portionNames = ['0.5 serving', '1 serving', '1.5 servings', '2 servings']
    portionNames.forEach((name) => {
      const btn = screen.getByRole('button', { name })
      // aria-pressed should be present (either "true" or "false")
      expect(btn.getAttribute('aria-pressed')).not.toBeNull()
    })
  })

  it('aria-pressed is "true" only for the selected portion value (default: 1×)', () => {
    render(<DishRowExpanded {...defaultProps} />)
    expect(screen.getByRole('button', { name: '0.5 serving' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: '1 serving' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '1.5 servings' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: '2 servings' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('aria-pressed updates when a different portion is selected', async () => {
    const user = userEvent.setup()
    render(<DishRowExpanded {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: '2 servings' }))
    expect(screen.getByRole('button', { name: '2 servings' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '1 serving' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('sr-only live region has aria-live="polite" and aria-atomic="true"', () => {
    const { container } = render(<DishRowExpanded {...defaultProps} />)
    // The sr-only div is hidden visually but present in the DOM
    const srOnlyDivs = container.querySelectorAll('.sr-only')
    const liveRegion = Array.from(srOnlyDivs).find(
      (el) => el.getAttribute('aria-live') === 'polite'
    )
    expect(liveRegion).toBeTruthy()
    expect(liveRegion!.getAttribute('aria-atomic')).toBe('true')
  })

  it('sr-only live region does NOT have aria-label (NFR13 compliance)', () => {
    const { container } = render(<DishRowExpanded {...defaultProps} />)
    const srOnlyDivs = container.querySelectorAll('.sr-only')
    const liveRegion = Array.from(srOnlyDivs).find(
      (el) => el.getAttribute('aria-live') === 'polite'
    )
    expect(liveRegion).toBeTruthy()
    expect(liveRegion!.getAttribute('aria-label')).toBeNull()
  })

  it('sr-only live region announces "Saved to My Recipes" via text content after save', async () => {
    // When recipe.status is "kept", the region should contain the announcement text
    const savedRecipe: DomainRecipe = { ...baseRecipe, status: 'kept' }
    const { container } = render(
      <DishRowExpanded {...defaultProps} recipe={savedRecipe} />
    )
    const srOnlyDivs = container.querySelectorAll('.sr-only')
    const liveRegion = Array.from(srOnlyDivs).find(
      (el) => el.getAttribute('aria-live') === 'polite'
    )
    expect(liveRegion).toBeTruthy()
    expect(liveRegion!.textContent).toContain('Saved to My Recipes')
  })

  it('section has id matching aria-controls from the companion DishRowCompact', () => {
    render(<DishRowExpanded {...defaultProps} />)
    const section = screen.getByRole('region', { name: /massaman curry details/i })
    expect(section.id).toBe('dish-details-recipe-a11y')
  })

  it('section has aria-label="[recipe name] details"', () => {
    render(<DishRowExpanded {...defaultProps} />)
    const section = screen.getByRole('region', { name: 'Massaman Curry details' })
    expect(section).toBeTruthy()
  })
})

// ─── Story 7-2: Touch target compliance ──────────────────────────────────────

describe('DishRowExpanded — touch target compliance (Story 7-2)', () => {
  it('each portion stepper button has minHeight ≥ 44px (no explicit height override)', () => {
    render(<DishRowExpanded {...defaultProps} />)
    const group = screen.getByRole('group', { name: /serving size/i })
    const buttons = Array.from(group.querySelectorAll('button'))
    expect(buttons).toHaveLength(4)
    for (const button of buttons) {
      // Must NOT have explicit height: 34 (the original violation)
      const explicitHeight = (button as HTMLElement).style.height
      if (explicitHeight) {
        expect(parseInt(explicitHeight, 10)).toBeGreaterThanOrEqual(44)
      }
      // minHeight must be ≥ 44
      const minH = (button as HTMLElement).style.minHeight
      expect(parseInt(minH, 10)).toBeGreaterThanOrEqual(44)
    }
  })

  it('collapse button does not have an explicit height below 44px', () => {
    render(<DishRowExpanded {...defaultProps} />)
    const collapseButton = screen.getByRole('button', { name: 'Collapse' })
    const h = (collapseButton as HTMLElement).style.height
    if (h) {
      expect(parseInt(h, 10)).toBeGreaterThanOrEqual(44)
    }
    // No explicit height is also compliant — the global min-height: 44px baseline applies
  })
})

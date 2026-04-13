import { vi, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DishRowCompact } from './DishRowCompact'
import type { DomainRecipe } from '@/types/database'

const baseRecipe: DomainRecipe = {
  id: 'recipe-aria-1',
  restaurantId: 'rest-1',
  visitId: null,
  name: 'Green Curry',
  description: 'Thai green curry with coconut milk',
  dishImageUrl: null,
  estimatedCalories: 480,
  status: 'auto_captured',
  photoStatus: 'placeholder',
  geminiConfidence: 0.85,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: null,
  totalCarbsG: null,
  totalFatG: null,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}

const defaultProps = {
  recipe: baseRecipe,
  isExpanded: false,
  onToggle: vi.fn(),
}

describe('DishRowCompact — ARIA roles and keyboard navigation', () => {
  it('has role="button"', () => {
    render(<DishRowCompact {...defaultProps} />)
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('has tabIndex={0}', () => {
    render(<DishRowCompact {...defaultProps} />)
    expect(screen.getByRole('button').getAttribute('tabindex')).toBe('0')
  })

  it('aria-expanded is "false" when isExpanded=false', () => {
    render(<DishRowCompact {...defaultProps} isExpanded={false} />)
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
  })

  it('aria-expanded is "true" when isExpanded=true', () => {
    render(<DishRowCompact {...defaultProps} isExpanded={true} />)
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')
  })

  it('aria-label includes dish name when estimatedCalories is null', () => {
    render(
      <DishRowCompact
        {...defaultProps}
        recipe={{ ...baseRecipe, estimatedCalories: null }}
      />
    )
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toContain('Green Curry')
    // No calorie count in label when null
    expect(btn.getAttribute('aria-label')).not.toContain('calories')
  })

  it('aria-label includes dish name and calorie count when estimatedCalories is present', () => {
    render(<DishRowCompact {...defaultProps} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toContain('Green Curry')
    expect(btn.getAttribute('aria-label')).toContain('480')
    expect(btn.getAttribute('aria-label')).toContain('calories')
  })

  it('aria-label format: "[Dish name], [N] calories"', () => {
    render(<DishRowCompact {...defaultProps} />)
    const label = screen.getByRole('button').getAttribute('aria-label') ?? ''
    expect(label).toMatch(/Green Curry.*480.*calories/i)
  })

  it('aria-controls points to dish-details-[recipe.id]', () => {
    render(<DishRowCompact {...defaultProps} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-controls')).toBe('dish-details-recipe-aria-1')
  })

  it('Enter keydown fires onToggle', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<DishRowCompact {...defaultProps} onToggle={onToggle} />)
    screen.getByRole('button').focus()
    await user.keyboard('{Enter}')
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('Space keydown fires onToggle', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<DishRowCompact {...defaultProps} onToggle={onToggle} />)
    screen.getByRole('button').focus()
    await user.keyboard(' ')
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('photo placeholder does not carry interactive role (decorative context)', () => {
    render(<DishRowCompact {...defaultProps} />)
    // The placeholder tile is presentational inside the button; it should not be a
    // separate interactive element — the outer button is the only interactive role.
    // Verify there is exactly one "button" role in the row.
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
  })

  it('macro chip spans do not have interactive roles (read-only text)', () => {
    render(
      <DishRowCompact
        {...defaultProps}
        totalProtein={12}
        totalCarbs={48}
        totalFat={14}
      />
    )
    // Macro chips are display-only spans — still exactly one interactive button
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    // Text content of macro chips is accessible (not aria-hidden)
    expect(screen.getByText('P 12g')).toBeTruthy()
    expect(screen.getByText('C 48g')).toBeTruthy()
    expect(screen.getByText('F 14g')).toBeTruthy()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DishRowExpanded } from './DishRowExpanded'
import type { DomainRecipe } from '@/types/database'

const mockRecipe: DomainRecipe = {
  id: 'timing-test-recipe',
  restaurantId: 'rest-1',
  visitId: null,
  name: 'Mushroom Risotto',
  description: 'Creamy arborio rice with wild mushrooms',
  dishImageUrl: null,
  estimatedCalories: 640,
  status: 'auto_captured',
  photoStatus: 'placeholder',
  geminiConfidence: 0.92,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: null,
  totalCarbsG: null,
  totalFatG: null,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}

const defaultTimingProps = {
  recipe: mockRecipe,
  expandedRecipe: null,
  totalProtein: 24,
  totalCarbs: 80,
  totalFat: 18,
  totalFibre: null,
  onCollapse: vi.fn(),
  onAddToRecipes: vi.fn(),
}

describe('DishRowExpanded — portion multiplier timing', () => {
  it('0.5× tap updates scaled calories within 100ms', async () => {
    const user = userEvent.setup()

    render(<DishRowExpanded {...defaultTimingProps} />)

    const button = screen.getByRole('button', { name: '0.5 serving' })

    const t0 = performance.now()
    await act(async () => {
      await user.click(button)
    })
    const elapsed = performance.now() - t0

    // 640 * 0.5 = 320
    expect(screen.getByText('320 cal')).toBeTruthy()
    expect(elapsed).toBeLessThan(100)
  })

  it('1× tap (default reset) updates within 100ms', async () => {
    const user = userEvent.setup()

    render(<DishRowExpanded {...defaultTimingProps} />)

    // First select 2× to change state
    await user.click(screen.getByRole('button', { name: '2 servings' }))

    // Now measure the reset to 1×
    const button = screen.getByRole('button', { name: '1 serving' })

    const t0 = performance.now()
    await act(async () => {
      await user.click(button)
    })
    const elapsed = performance.now() - t0

    // 640 * 1 = 640
    expect(screen.getByText('640 cal')).toBeTruthy()
    expect(elapsed).toBeLessThan(100)
  })

  it('1.5× tap updates scaled calories within 100ms', async () => {
    const user = userEvent.setup()

    render(<DishRowExpanded {...defaultTimingProps} />)

    const button = screen.getByRole('button', { name: '1.5 servings' })

    const t0 = performance.now()
    await act(async () => {
      await user.click(button)
    })
    const elapsed = performance.now() - t0

    // 640 * 1.5 = 960
    expect(screen.getByText('960 cal')).toBeTruthy()
    expect(elapsed).toBeLessThan(100)
  })

  it('2× tap updates scaled calories within 100ms', async () => {
    const user = userEvent.setup()

    render(<DishRowExpanded {...defaultTimingProps} />)

    const button = screen.getByRole('button', { name: '2 servings' })

    const t0 = performance.now()
    await act(async () => {
      await user.click(button)
    })
    const elapsed = performance.now() - t0

    // 640 * 2 = 1280
    expect(screen.getByText('1280 cal')).toBeTruthy()
    expect(elapsed).toBeLessThan(100)
  })
})

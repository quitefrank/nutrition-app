import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const EDIT_UUID = 'd4e5f6a7-b8c9-0123-defa-234567890123'

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: EDIT_UUID }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('dish=0'),
}))

vi.mock('@/hooks/useRecipes', () => ({
  useRecipe: () => ({ data: mockRecipe }),
  useUpdateRecipe: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useUpdateIngredient: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
  useAddIngredient: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
  useRemoveRecipe: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
}))

vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}))

vi.mock('@/components/ui/FrostedCard', () => ({
  FrostedCard: ({ children, className, noPadding }: { children: React.ReactNode; className?: string; noPadding?: boolean }) => (
    <div className={className} data-no-padding={noPadding}>{children}</div>
  ),
}))

// ─── Mock data ────────────────────────────────────────────────────────────────

import type { DomainRecipe } from '@/types/database'

const mockRecipe: DomainRecipe = {
  id: EDIT_UUID,
  restaurantId: 'rest-1',
  visitId: null,
  name: 'Pad Thai',
  description: 'Classic Thai noodles',
  dishImageUrl: null,
  estimatedCalories: 480,
  status: 'kept',
  photoStatus: 'placeholder',
  geminiConfidence: null,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: null,
  totalCarbsG: null,
  totalFatG: null,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
  ingredients: [
    {
      id: 'ing-1',
      recipeId: EDIT_UUID,
      name: 'Rice noodles',
      quantity: '150',
      unit: 'g',
      usdaFdcId: null,
      caloriesPerServing: null,
      proteinG: 3,
      fatG: 0.5,
      carbsG: 35,
      confidence: 'high',
    },
  ],
}

import RecipeEditPage from './page'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RecipeEditPage servings stepper — NFR13 compliance', () => {
  it('servings counter span has aria-live="polite"', async () => {
    const { container } = render(<RecipeEditPage />)
    await waitFor(() => {
      const liveSpan = container.querySelector('[aria-live="polite"]')
      expect(liveSpan).toBeTruthy()
    })
  })

  it('servings counter span does NOT have aria-label attribute (NFR13 fix verification)', async () => {
    const { container } = render(<RecipeEditPage />)
    await waitFor(() => {
      const liveSpan = container.querySelector('[aria-live="polite"]')
      expect(liveSpan).toBeTruthy()
      // NFR13: aria-label must NOT be present on an aria-live element
      expect(liveSpan!.getAttribute('aria-label')).toBeNull()
    })
  })

  it('text content includes unit ("serving" or "servings"), not just a numeric value', async () => {
    const { container } = render(<RecipeEditPage />)
    await waitFor(() => {
      const liveSpan = container.querySelector('[aria-live="polite"]')
      expect(liveSpan).toBeTruthy()
      const text = liveSpan!.textContent ?? ''
      // Must contain "serving" to be descriptive for screen readers
      expect(text.toLowerCase()).toContain('serving')
    })
  })

  it('text content updates when servings value changes', async () => {
    const user = userEvent.setup()
    const { container } = render(<RecipeEditPage />)

    await waitFor(() => {
      const liveSpan = container.querySelector('[aria-live="polite"]')
      expect(liveSpan).toBeTruthy()
    })

    const liveSpan = container.querySelector('[aria-live="polite"]')!
    const initialText = liveSpan.textContent ?? ''
    expect(initialText).toContain('1')

    // Tap the "+" button to increase servings
    const increaseBtn = screen.getByRole('button', { name: /increase serving size/i })
    await user.click(increaseBtn)

    await waitFor(() => {
      const updatedText = liveSpan.textContent ?? ''
      expect(updatedText).toContain('2')
      expect(updatedText.toLowerCase()).toContain('serving')
    })
  })

  it('decrease button has aria-label="Decrease serving size"', async () => {
    render(<RecipeEditPage />)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /decrease serving size/i })
      expect(btn).toBeTruthy()
    })
  })

  it('increase button has aria-label="Increase serving size"', async () => {
    render(<RecipeEditPage />)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /increase serving size/i })
      expect(btn).toBeTruthy()
    })
  })

  it('Cancel button has aria-label="Cancel editing"', async () => {
    render(<RecipeEditPage />)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /cancel editing/i })
      expect(btn).toBeTruthy()
    })
  })

  it('Save button has aria-label="Save changes"', async () => {
    render(<RecipeEditPage />)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /save changes/i })
      expect(btn).toBeTruthy()
    })
  })
})

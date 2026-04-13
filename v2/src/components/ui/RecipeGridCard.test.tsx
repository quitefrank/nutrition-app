import { vi, describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipeGridCard } from './RecipeGridCard'
import type { DomainRecipe } from '@/types/database'

// ─── Minimal typed mock data ──────────────────────────────────────────────────

const mockRecipe: DomainRecipe = {
  id: 'recipe-1',
  restaurantId: 'rest-1',
  visitId: null,
  name: 'Pad Thai',
  description: null,
  dishImageUrl: null,
  estimatedCalories: 480,
  status: 'auto_captured',
  photoStatus: 'placeholder',
  geminiConfidence: null,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: null,
  totalCarbsG: null,
  totalFatG: null,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}

const mockRecipeWithPhoto: DomainRecipe = {
  ...mockRecipe,
  dishImageUrl: 'https://example.com/pad-thai.jpg',
  photoStatus: 'confirmed',
}

const mockRecipeNoCalories: DomainRecipe = {
  ...mockRecipe,
  estimatedCalories: null,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RecipeGridCard', () => {
  it('renders dish name', () => {
    render(<RecipeGridCard recipe={mockRecipe} onPress={vi.fn()} />)
    expect(screen.getByText('Pad Thai')).toBeTruthy()
  })

  it('renders calorie count in terracotta when estimatedCalories is non-null', () => {
    render(<RecipeGridCard recipe={mockRecipe} onPress={vi.fn()} />)
    // "480 cal" should be rendered
    expect(screen.getByText('480 cal')).toBeTruthy()
  })

  it('omits calorie line when estimatedCalories is null', () => {
    render(<RecipeGridCard recipe={mockRecipeNoCalories} onPress={vi.fn()} />)
    expect(screen.queryByText(/cal$/)).toBeNull()
  })

  it('calls onPress when tapped', async () => {
    const onPress = vi.fn()
    const user = userEvent.setup()
    render(<RecipeGridCard recipe={mockRecipe} onPress={onPress} />)
    await user.click(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('calls onPress via fireEvent click', () => {
    const onPress = vi.fn()
    render(<RecipeGridCard recipe={mockRecipe} onPress={onPress} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('renders gradient fallback when photoStatus is "placeholder"', () => {
    render(<RecipeGridCard recipe={mockRecipe} onPress={vi.fn()} />)
    // No img element — fallback is an aria-hidden div gradient
    expect(screen.queryAllByRole('img').length).toBe(0)
  })

  it('renders gradient fallback when photoStatus is "suppressed"', () => {
    const suppressed: DomainRecipe = { ...mockRecipe, photoStatus: 'suppressed' }
    render(<RecipeGridCard recipe={suppressed} onPress={vi.fn()} />)
    expect(screen.queryAllByRole('img').length).toBe(0)
  })

  it('renders gradient fallback when dishImageUrl is null and photoStatus is confirmed', () => {
    const noUrl: DomainRecipe = { ...mockRecipe, photoStatus: 'confirmed', dishImageUrl: null }
    render(<RecipeGridCard recipe={noUrl} onPress={vi.fn()} />)
    expect(screen.queryAllByRole('img').length).toBe(0)
  })

  it('renders photo when photoStatus is "confirmed" and dishImageUrl is set', () => {
    render(<RecipeGridCard recipe={mockRecipeWithPhoto} onPress={vi.fn()} />)
    const img = document.querySelector('img')
    expect(img).toBeTruthy()
    expect((img as HTMLImageElement).src).toContain('https://example.com/pad-thai.jpg')
  })

  it('has role="button"', () => {
    render(<RecipeGridCard recipe={mockRecipe} onPress={vi.fn()} />)
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('has tabIndex=0', () => {
    render(<RecipeGridCard recipe={mockRecipe} onPress={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('tabindex')).toBe('0')
  })

  it('calls onPress on Enter key press', async () => {
    const onPress = vi.fn()
    const user = userEvent.setup()
    render(<RecipeGridCard recipe={mockRecipe} onPress={onPress} />)
    screen.getByRole('button').focus()
    await user.keyboard('{Enter}')
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('calls onPress on Space key press', async () => {
    const onPress = vi.fn()
    const user = userEvent.setup()
    render(<RecipeGridCard recipe={mockRecipe} onPress={onPress} />)
    screen.getByRole('button').focus()
    await user.keyboard(' ')
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

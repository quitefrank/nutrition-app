import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))

const mockBack = vi.fn()
const mockReplace = vi.fn()
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

const mockUseRecipe = vi.fn()
const mockUseUpdateRecipe = vi.fn()

vi.mock('@/hooks/use-recipes', () => ({
  useRecipe: (id: string) => mockUseRecipe(id),
  useUpdateRecipe: () => mockUseUpdateRecipe(),
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

import { toast } from 'sonner'
import RecipeEditPage from './page'

const baseRecipe = {
  id: 'test-id',
  name: 'Duck Confit',
  restaurantId: null,
  dishImageUrl: null,
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-22T00:00:00Z',
  ingredients: [
    { id: 'ing-1', recipeId: 'test-id', name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' as const, caloriesKcal: null, proteinG: null, fatG: null, carbsG: null },
    { id: 'ing-2', recipeId: 'test-id', name: 'to taste', quantity: null, unit: null, confidenceLevel: 'low' as const, caloriesKcal: null, proteinG: null, fatG: null, carbsG: null },
  ],
}

const defaultMutate = vi.fn()

describe('RecipeEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseUpdateRecipe.mockReturnValue({ mutate: defaultMutate, isPending: false })
  })

  it('renders loading state when isLoading is true', () => {
    mockUseRecipe.mockReturnValue({ data: undefined, isLoading: true, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it('renders error state when isError is true', () => {
    mockUseRecipe.mockReturnValue({ data: undefined, isLoading: false, isError: true })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    expect(screen.getByText('Could not load recipe for editing.')).toBeTruthy()
  })

  it('renders recipe name input pre-filled with recipe name', () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    const nameInput = screen.getByRole('textbox', { name: /Recipe name/i }) as HTMLInputElement
    expect(nameInput.value).toBe('Duck Confit')
  })

  it('renders serving size input pre-filled with recipe servingSize', () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    const servingInput = screen.getByRole('spinbutton', { name: /Serving size/i }) as HTMLInputElement
    expect(servingInput.value).toBe('1')
  })

  it('renders one input row per ingredient', () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    expect(screen.getByRole('textbox', { name: /Ingredient 1 name/i })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Ingredient 2 name/i })).toBeTruthy()
  })

  it('Save button is disabled when recipe name is empty', async () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    const nameInput = screen.getByRole('textbox', { name: /Recipe name/i })
    await userEvent.clear(nameInput)

    const saveBtn = screen.getByRole('button', { name: /Save changes/i }) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
  })

  it('Save button calls mutate with correct RecipeUpdateRequest payload', async () => {
    const mockMutate = vi.fn()
    mockUseUpdateRecipe.mockReturnValue({ mutate: mockMutate, isPending: false })
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    const saveBtn = screen.getByRole('button', { name: /Save changes/i })
    await userEvent.click(saveBtn)

    expect(mockMutate).toHaveBeenCalledWith(
      {
        id: 'test-id',
        payload: {
          name: 'Duck Confit',
          servingSize: 1,
          ingredients: [
            { id: 'ing-1', name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
            { id: 'ing-2', name: 'to taste', quantity: null, unit: null, confidenceLevel: 'low' },
          ],
        },
      },
      expect.any(Object)
    )
  })

  it('Cancel button calls router.back()', async () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
    await userEvent.click(cancelBtn)

    expect(mockBack).toHaveBeenCalled()
  })

  it('serving size change scales numeric ingredient quantities', async () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    const servingInput = screen.getByRole('spinbutton', { name: /Serving size/i })

    // Change serving size from 1 to 2 — quantities should double
    fireEvent.change(servingInput, { target: { value: '2' } })

    const ing1QuantityInput = screen.getByRole('textbox', { name: /Ingredient 1 quantity/i }) as HTMLInputElement
    expect(ing1QuantityInput.value).toBe('4')
  })

  it('non-numeric quantities are not scaled when serving size changes', async () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    const servingInput = screen.getByRole('spinbutton', { name: /Serving size/i })

    // Change serving size from 1 to 4
    fireEvent.change(servingInput, { target: { value: '4' } })

    // ing-2 has name 'to taste' but quantity null — the quantity input should remain empty
    const ing2QuantityInput = screen.getByRole('textbox', { name: /Ingredient 2 quantity/i }) as HTMLInputElement
    expect(ing2QuantityInput.value).toBe('')
  })

  // P1: error feedback on save failure
  it('shows error toast when mutation fails', async () => {
    const mockMutate = vi.fn().mockImplementation((_vars, options) => {
      options.onError(new Error('Failed to update recipe'))
    })
    mockUseUpdateRecipe.mockReturnValue({ mutate: mockMutate, isPending: false })
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    await userEvent.click(screen.getByRole('button', { name: /Save changes/i }))

    expect((toast as unknown as { error: ReturnType<typeof vi.fn> }).error)
      .toHaveBeenCalledWith('Failed to update recipe')
  })

  // P2: stale closure — compound serving size changes must scale correctly
  it('compound serving size changes scale quantities correctly (1x → 2x → 4x)', () => {
    mockUseRecipe.mockReturnValue({ data: baseRecipe, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    const servingInput = screen.getByRole('spinbutton', { name: /Serving size/i })

    fireEvent.change(servingInput, { target: { value: '2' } }) // "2" → "4"
    fireEvent.change(servingInput, { target: { value: '4' } }) // "4" → "8"

    const ing1Qty = screen.getByRole('textbox', { name: /Ingredient 1 quantity/i }) as HTMLInputElement
    expect(ing1Qty.value).toBe('8')
  })

  // P3: fraction quantities must scale correctly
  it('fraction quantity "1/2" is scaled correctly when serving size doubles', () => {
    const recipeWithFraction = {
      ...baseRecipe,
      ingredients: [
        { ...baseRecipe.ingredients[0], quantity: '1/2' },
      ],
    }
    mockUseRecipe.mockReturnValue({ data: recipeWithFraction, isLoading: false, isError: false })

    render(<RecipeEditPage params={Promise.resolve({ id: 'test-id' })} />)

    const servingInput = screen.getByRole('spinbutton', { name: /Serving size/i })
    fireEvent.change(servingInput, { target: { value: '2' } })

    const ing1Qty = screen.getByRole('textbox', { name: /Ingredient 1 quantity/i }) as HTMLInputElement
    expect(ing1Qty.value).toBe('1') // 1/2 × 2 = 1
  })
})

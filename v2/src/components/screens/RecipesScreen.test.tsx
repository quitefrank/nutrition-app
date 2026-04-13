import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipesScreen } from './RecipesScreen'
import { useKeptRecipes, useUpdateRecipe } from '@/hooks/useRecipes'
import type { DomainRecipe } from '@/types/database'

// ─── Hoisted mocks (available inside vi.mock factories) ────────────────────────

const { mockMutate } = vi.hoisted(() => ({ mockMutate: vi.fn() }))

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockRefetch = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/hooks/useRecipes', () => ({
  useKeptRecipes: vi.fn(),
  useUpdateRecipe: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
}))

// ─── Test data ─────────────────────────────────────────────────────────────────

const mockRecipe: DomainRecipe = {
  id: 'recipe-1',
  restaurantId: 'rest-1',
  visitId: null,
  name: 'Pad Thai',
  description: null,
  dishImageUrl: null,
  estimatedCalories: 480,
  status: 'kept',
  photoStatus: 'placeholder',
  geminiConfidence: null,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: 18,
  totalCarbsG: 52,
  totalFatG: 12,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}

const mockRecipe2: DomainRecipe = {
  ...mockRecipe,
  id: 'recipe-2',
  name: 'Green Curry',
  estimatedCalories: 560,
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function setMockData(
  data: DomainRecipe[] | null,
  { isLoading = false, isError = false } = {}
) {
  vi.mocked(useKeptRecipes).mockReturnValue({
    data: data ?? undefined,
    isLoading,
    isError,
    // fill required QueryObserverResult fields with minimal stubs
    status: isError ? 'error' : isLoading ? 'pending' : 'success',
    fetchStatus: 'idle',
    error: isError ? new Error('fetch failed') : null,
    isFetching: false,
    isSuccess: !isLoading && !isError,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isStale: false,
    isPlaceholderData: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isFetched: true,
    isFetchedAfterMount: true,
    isPaused: false,
    isPending: isLoading,
    refetch: mockRefetch,
    promise: Promise.resolve(),
  } as unknown as ReturnType<typeof useKeptRecipes>)
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('RecipesScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset useUpdateRecipe to the default non-pending state after any per-test override
    vi.mocked(useUpdateRecipe).mockReturnValue({ mutate: mockMutate, isPending: false } as any)
  })

  it('renders "My Recipes" heading', () => {
    setMockData([mockRecipe])
    render(<RecipesScreen />)
    expect(screen.getByRole('heading', { name: /my recipes/i })).toBeTruthy()
  })

  it('renders RecipeGridCard for each kept recipe', () => {
    setMockData([mockRecipe, mockRecipe2])
    render(<RecipesScreen />)
    expect(screen.getByText('Pad Thai')).toBeTruthy()
    expect(screen.getByText('Green Curry')).toBeTruthy()
  })

  it('renders empty state when no kept recipes exist', () => {
    setMockData([])
    render(<RecipesScreen />)
    expect(
      screen.getByText(/dishes you've kept from your restaurant visits will appear here/i)
    ).toBeTruthy()
  })

  it('renders aria region for empty state', () => {
    setMockData([])
    render(<RecipesScreen />)
    expect(screen.getByRole('region', { name: /my recipes empty state/i })).toBeTruthy()
  })

  it('renders skeleton when loading', () => {
    setMockData(null, { isLoading: true })
    render(<RecipesScreen />)
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(document.querySelector('[aria-label="Loading recipes"]')).toBeTruthy()
  })

  it('renders 4 skeleton placeholder cards while loading', () => {
    setMockData(null, { isLoading: true })
    render(<RecipesScreen />)
    const skeleton = document.querySelector('[aria-label="Loading recipes"]')
    expect(skeleton?.querySelectorAll('[aria-hidden="true"]').length).toBe(4)
  })

  it('renders full error state when query errors with no cached data', () => {
    setMockData(null, { isError: true })
    render(<RecipesScreen />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/couldn't load your recipes/i)).toBeTruthy()
  })

  it('renders "Try again" button in full error state', () => {
    setMockData(null, { isError: true })
    render(<RecipesScreen />)
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('calls refetch when "Try again" is pressed', async () => {
    setMockData(null, { isError: true })
    const user = userEvent.setup()
    render(<RecipesScreen />)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('renders stale data grid + error banner when query errors with cached data', () => {
    setMockData([mockRecipe], { isError: true })
    render(<RecipesScreen />)
    expect(screen.getByText(/couldn't refresh/i)).toBeTruthy()
    expect(screen.getByText('Pad Thai')).toBeTruthy()
  })

  it('renders "Retry" button in error banner and calls refetch', async () => {
    setMockData([mockRecipe], { isError: true })
    const user = userEvent.setup()
    render(<RecipesScreen />)
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('navigates to /recipe/[id] when RecipeGridCard is pressed', async () => {
    setMockData([mockRecipe])
    const user = userEvent.setup()
    render(<RecipesScreen />)
    await user.click(screen.getByRole('button', { name: /^pad thai$/i }))
    expect(mockPush).toHaveBeenCalledWith('/recipe/recipe-1')
  })

  it('renders list role on the recipe grid', () => {
    setMockData([mockRecipe])
    render(<RecipesScreen />)
    expect(screen.getByRole('list', { name: /my recipes/i })).toBeTruthy()
  })

  it('renders listitem role for each recipe card wrapper', () => {
    setMockData([mockRecipe, mockRecipe2])
    render(<RecipesScreen />)
    expect(screen.getAllByRole('listitem').length).toBe(2)
  })

  // ─── Edit mode and removal flow ───────────────────────────────────────────────

  describe('Edit mode and removal flow', () => {
    it('shows Edit button when recipes exist', () => {
      setMockData([mockRecipe])
      render(<RecipesScreen />)
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeTruthy()
    })

    it('does NOT show Edit button when recipes list is empty', () => {
      setMockData([])
      render(<RecipesScreen />)
      expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
    })

    it('does NOT show Edit button while loading (D1)', () => {
      setMockData(null, { isLoading: true })
      render(<RecipesScreen />)
      expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
    })

    it('toggles edit mode — shows remove icons when in edit mode', async () => {
      setMockData([mockRecipe])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      expect(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`)).toBeTruthy()
    })

    it('hides remove icons when edit mode is toggled off (Done)', async () => {
      setMockData([mockRecipe])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByRole('button', { name: /^done$/i }))
      expect(screen.queryByLabelText(`Remove ${mockRecipe.name} from My Recipes`)).toBeNull()
    })

    it('opens BottomSheet when remove icon is tapped', async () => {
      setMockData([mockRecipe])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`))
      expect(screen.getByRole('dialog')).toBeTruthy()
    })

    it('closes BottomSheet when Cancel is tapped', async () => {
      setMockData([mockRecipe])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`))
      await user.click(screen.getByRole('button', { name: /^cancel$/i }))
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('shows "Remove from My Recipes" button as step 3', async () => {
      setMockData([mockRecipe])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`))
      expect(screen.getByRole('button', { name: /^remove from my recipes$/i })).toBeTruthy()
    })

    it('shows "Yes, remove it" destructive button after step 3 is tapped', async () => {
      setMockData([mockRecipe])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`))
      await user.click(screen.getByRole('button', { name: /^remove from my recipes$/i }))
      expect(screen.getByRole('button', { name: /yes, remove it/i })).toBeTruthy()
    })

    it('calls useUpdateRecipe with status "auto_captured" when step 4 is confirmed (AC4/AC5)', async () => {
      // AC4: mutation sets status to auto_captured
      // AC5: auto_captured returns the dish to restaurant browse (filtered by neq('status','removed'))
      setMockData([mockRecipe])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`))
      await user.click(screen.getByRole('button', { name: /^remove from my recipes$/i }))
      await user.click(screen.getByRole('button', { name: /yes, remove it/i }))
      expect(mockMutate).toHaveBeenCalledWith(
        { id: 'recipe-1', updates: { status: 'auto_captured' } },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      )
    })

    it('recipe cards are not navigable while in edit mode (onPress is no-op)', async () => {
      setMockData([mockRecipe])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByRole('button', { name: /^pad thai$/i }))
      expect(mockPush).not.toHaveBeenCalled()
      // Tapping a card in edit mode must not open the removal sheet
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('stays in edit mode after successful removal so user can remove more (IG1)', async () => {
      mockMutate.mockImplementationOnce(
        (_args: unknown, { onSuccess }: { onSuccess: () => void }) => {
          onSuccess()
        }
      )
      setMockData([mockRecipe, mockRecipe2])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`))
      await user.click(screen.getByRole('button', { name: /^remove from my recipes$/i }))
      await user.click(screen.getByRole('button', { name: /yes, remove it/i }))
      // Sheet closed after success
      expect(screen.queryByRole('dialog')).toBeNull()
      // Still in edit mode — Done button remains visible
      expect(screen.getByRole('button', { name: /^done$/i })).toBeTruthy()
    })

    it('closes sheet when mutation fails (onError)', async () => {
      mockMutate.mockImplementationOnce(
        (_args: unknown, { onError }: { onError: () => void }) => {
          onError()
        }
      )
      setMockData([mockRecipe])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`))
      await user.click(screen.getByRole('button', { name: /^remove from my recipes$/i }))
      await user.click(screen.getByRole('button', { name: /yes, remove it/i }))
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('resets confirmation state when sheet is closed and reopened for a different recipe (P1)', async () => {
      setMockData([mockRecipe, mockRecipe2])
      const user = userEvent.setup()
      render(<RecipesScreen />)

      // Enter edit mode, open sheet for recipe 1, advance to step 4
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`))
      await user.click(screen.getByRole('button', { name: /^remove from my recipes$/i }))
      expect(screen.getByRole('button', { name: /yes, remove it/i })).toBeTruthy()

      // Cancel — close the sheet
      await user.click(screen.getByRole('button', { name: /^cancel$/i }))

      // Reopen for recipe 2 — must start at step 3, not step 4
      await user.click(screen.getByLabelText(`Remove ${mockRecipe2.name} from My Recipes`))
      expect(screen.getByRole('button', { name: /^remove from my recipes$/i })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /yes, remove it/i })).toBeNull()
    })

    // ─── Pending state (P1: step-3 guarded, Cancel guarded) ──────────────────

    describe('while mutation is pending', () => {
      beforeEach(() => {
        vi.mocked(useUpdateRecipe).mockReturnValue({ mutate: mockMutate, isPending: true } as any)
      })

      it('step-3 "Remove from My Recipes" button is disabled', async () => {
        setMockData([mockRecipe])
        const user = userEvent.setup()
        render(<RecipesScreen />)
        await user.click(screen.getByRole('button', { name: /^edit$/i }))
        await user.click(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`))
        expect((screen.getByRole('button', { name: /^remove from my recipes$/i }) as HTMLButtonElement).disabled).toBe(true)
      })

      it('Cancel button is disabled', async () => {
        setMockData([mockRecipe])
        const user = userEvent.setup()
        render(<RecipesScreen />)
        await user.click(screen.getByRole('button', { name: /^edit$/i }))
        await user.click(screen.getByLabelText(`Remove ${mockRecipe.name} from My Recipes`))
        expect((screen.getByRole('button', { name: /^cancel$/i }) as HTMLButtonElement).disabled).toBe(true)
      })
    })

    // ─── AC7: No swipe-to-delete affordance ───────────────────────────────────

    it('does not render swipe-to-delete affordance in normal mode (AC7)', () => {
      setMockData([mockRecipe])
      render(<RecipesScreen />)
      expect(screen.queryByLabelText('Delete recipe')).toBeNull()
    })

    it('does not render swipe-to-delete affordance in edit mode (AC7)', async () => {
      setMockData([mockRecipe])
      const user = userEvent.setup()
      render(<RecipesScreen />)
      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      expect(screen.queryByLabelText('Delete recipe')).toBeNull()
    })
  })
})

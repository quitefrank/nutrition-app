import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { DomainRecipe } from '@/types/database'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const KEPT_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const AUTO_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901'
const REMOVED_UUID = 'c3d4e5f6-a7b8-9012-cdef-123456789012'

const mockUseParams = vi.hoisted(() => vi.fn(() => ({ id: KEPT_UUID })))

vi.mock('next/navigation', () => ({
  useParams: mockUseParams,
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/hooks/useRecipes', () => ({
  useRecipe: vi.fn(),
  useRemoveRecipe: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/useGrocery', () => ({
  useAddToGrocery: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useGroceryItems: () => ({ data: [] }),
}))

vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}))

vi.mock('@/components/scan/RestaurantConfirmation', () => ({
  RestaurantConfirmation: () => null,
}))

vi.mock('@/components/ui/FrostedCard', () => ({
  FrostedCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

import { useRecipe } from '@/hooks/useRecipes'
import RecipePage from './page'

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockKeptRecipe: DomainRecipe = {
  id: KEPT_UUID,
  restaurantId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  visitId: null,
  name: 'Pad Thai',
  description: 'Classic Thai noodle dish',
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
  ingredients: [],
}

const mockAutoCapturedRecipe: DomainRecipe = {
  ...mockKeptRecipe,
  id: AUTO_UUID,
  status: 'auto_captured',
}

const mockRemovedRecipe: DomainRecipe = {
  ...mockKeptRecipe,
  id: REMOVED_UUID,
  status: 'removed',
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUseParams.mockReturnValue({ id: KEPT_UUID })
  // Default: no recipe loaded (each test overrides as needed)
  vi.mocked(useRecipe).mockReturnValue({
    data: undefined,
    isError: false,
    isLoading: false,
  } as ReturnType<typeof useRecipe>)
})

afterEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Cooking Instructions Gate', () => {
  it('renders "How to make it" section when recipe status is "kept"', async () => {
    vi.mocked(useRecipe).mockReturnValue({
      data: mockKeptRecipe,
      isError: false,
      isLoading: false,
    } as ReturnType<typeof useRecipe>)

    render(<RecipePage />)

    await waitFor(() => {
      expect(screen.getByText('How to Make It')).toBeTruthy()
    })
  })

  it('does NOT render "How to make it" section when recipe status is "auto_captured"', async () => {
    mockUseParams.mockReturnValue({ id: AUTO_UUID })
    vi.mocked(useRecipe).mockReturnValue({
      data: mockAutoCapturedRecipe,
      isError: false,
      isLoading: false,
    } as ReturnType<typeof useRecipe>)

    render(<RecipePage />)

    await waitFor(() => {
      expect(screen.getByText('Pad Thai')).toBeTruthy() // confirms page rendered
    })
    expect(screen.queryByText('How to Make It')).toBeNull()
  })

  it('does NOT render "How to make it" section for sessionStorage (non-UUID) ids', async () => {
    mockUseParams.mockReturnValue({ id: 'plately_scan_abc123' })

    const scanData = {
      type: 'dish',
      restaurantName: 'Test Restaurant',
      allDishes: [{ name: 'Pad Thai', description: null, ingredients: [] }],
      enriched: true,
    }
    sessionStorage.setItem('plately_scan_abc123', JSON.stringify(scanData))

    render(<RecipePage />)

    await waitFor(() => {
      expect(screen.getByText('Pad Thai')).toBeTruthy() // confirms page rendered
    })
    expect(screen.queryByText('How to Make It')).toBeNull()
  })

  it('cooking instructions placeholder shows "Cooking instructions coming soon" text', async () => {
    vi.mocked(useRecipe).mockReturnValue({
      data: mockKeptRecipe,
      isError: false,
      isLoading: false,
    } as ReturnType<typeof useRecipe>)

    render(<RecipePage />)

    await waitFor(() => {
      expect(screen.getByText('Cooking instructions coming soon')).toBeTruthy()
    })
  })

  it('does NOT render "How to make it" section when recipe status is "removed"', async () => {
    mockUseParams.mockReturnValue({ id: REMOVED_UUID })
    vi.mocked(useRecipe).mockReturnValue({
      data: mockRemovedRecipe,
      isError: false,
      isLoading: false,
    } as ReturnType<typeof useRecipe>)

    render(<RecipePage />)

    await waitFor(() => {
      expect(screen.getByText('Pad Thai')).toBeTruthy() // confirms page rendered
    })
    expect(screen.queryByText('How to Make It')).toBeNull()
  })

  it('placeholder container has role="region" labelled by the heading (G.1 structural hook)', async () => {
    vi.mocked(useRecipe).mockReturnValue({
      data: mockKeptRecipe,
      isError: false,
      isLoading: false,
    } as ReturnType<typeof useRecipe>)

    render(<RecipePage />)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /how to make it/i })).toBeTruthy()
    })
  })

  it('shows cooking slot when query re-fetches with promoted status (auto_captured → kept)', async () => {
    // Start: valid UUID but auto_captured — slot must be absent
    vi.mocked(useRecipe).mockReturnValue({
      data: { ...mockKeptRecipe, status: 'auto_captured' },
      isError: false,
      isLoading: false,
    } as ReturnType<typeof useRecipe>)

    const { rerender } = render(<RecipePage />)

    await waitFor(() => expect(screen.getByText('Pad Thai')).toBeTruthy())
    expect(screen.queryByText('How to Make It')).toBeNull()

    // Simulate React Query re-fetch after mutation promotes status to 'kept'
    vi.mocked(useRecipe).mockReturnValue({
      data: mockKeptRecipe,
      isError: false,
      isLoading: false,
    } as ReturnType<typeof useRecipe>)

    rerender(<RecipePage />)

    await waitFor(() => {
      expect(screen.getByText('How to Make It')).toBeTruthy()
    })
  })
})

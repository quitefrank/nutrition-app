import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/supabaseAutoSave', () => ({
  autoSaveToSupabase: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/components/ui/FrostedCard', () => ({
  FrostedCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function importOkResponse(recipe: object) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { recipe } }),
  } as Response
}

function importErrorResponse(code: string, message: string, status = 422) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message } }),
  } as Response
}

const MOCK_RECIPE = {
  name: 'Spaghetti Carbonara',
  description: 'Classic Roman pasta dish.',
  calorieEstimate: 650,
  servings: 2,
  ingredients: [
    { name: 'pasta', quantity: '200', unit: 'g', confidenceLevel: 'high' as const },
    { name: 'guanciale', quantity: '100', unit: 'g', confidenceLevel: 'high' as const },
  ],
}

import { ImportScreen } from './ImportScreen'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ImportScreen', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  // ─── Initial render ──────────────────────────────────────────────────────

  it('renders the URL input and Import Recipe button', () => {
    render(<ImportScreen />)
    expect(screen.getByRole('textbox', { name: /recipe url/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /import recipe/i })).toBeTruthy()
  })

  it('submit button is disabled when the input is empty', () => {
    render(<ImportScreen />)
    const btn = screen.getByRole('button', { name: /import recipe/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  // ─── Success flow ────────────────────────────────────────────────────────

  it('calls /api/import with the entered URL on form submit', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(importOkResponse(MOCK_RECIPE))

    render(<ImportScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /recipe url/i }), 'https://example.com/pasta')
    await user.click(screen.getByRole('button', { name: /import recipe/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/import',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ url: 'https://example.com/pasta' }),
        })
      )
    })
  })

  it('displays the recipe name after a successful import', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(importOkResponse(MOCK_RECIPE))

    render(<ImportScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /recipe url/i }), 'https://example.com/pasta')
    await user.click(screen.getByRole('button', { name: /import recipe/i }))

    await waitFor(() => {
      expect(screen.getByText('Spaghetti Carbonara')).toBeTruthy()
    })
  })

  it('displays the calorie chip when calorieEstimate is present', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(importOkResponse(MOCK_RECIPE))

    render(<ImportScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /recipe url/i }), 'https://example.com/pasta')
    await user.click(screen.getByRole('button', { name: /import recipe/i }))

    await waitFor(() => {
      expect(screen.getByText(/650 cal/i)).toBeTruthy()
    })
  })

  it('does not display a calorie chip when calorieEstimate is null', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      importOkResponse({ ...MOCK_RECIPE, calorieEstimate: null })
    )

    render(<ImportScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /recipe url/i }), 'https://example.com/pasta')
    await user.click(screen.getByRole('button', { name: /import recipe/i }))

    await waitFor(() => {
      expect(screen.getByText('Spaghetti Carbonara')).toBeTruthy()
    })
    expect(screen.queryByText(/cal/i)).toBeNull()
  })

  it('displays ingredients list after successful import', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(importOkResponse(MOCK_RECIPE))

    render(<ImportScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /recipe url/i }), 'https://example.com/pasta')
    await user.click(screen.getByRole('button', { name: /import recipe/i }))

    await waitFor(() => {
      expect(screen.getByRole('list', { name: /ingredients/i })).toBeTruthy()
    })
    expect(screen.getByText(/200 g pasta/i)).toBeTruthy()
  })

  // ─── "Add to Collection" ─────────────────────────────────────────────────

  it('"Add to Collection" writes a plately_scan_* key to sessionStorage and navigates to /recipe/:key', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(importOkResponse(MOCK_RECIPE))

    render(<ImportScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /recipe url/i }), 'https://example.com/pasta')
    await user.click(screen.getByRole('button', { name: /import recipe/i }))
    await waitFor(() => screen.getByText('Spaghetti Carbonara'))

    await user.click(screen.getByRole('button', { name: /add to collection/i }))

    const scanKeys = Object.keys(sessionStorage).filter((k) => k.startsWith('plately_scan_'))
    expect(scanKeys).toHaveLength(1)

    const stored = JSON.parse(sessionStorage.getItem(scanKeys[0])!)
    expect(stored.type).toBe('dish')
    expect(stored.enriched).toBe(true)
    expect(stored.allDishes[0].name).toBe('Spaghetti Carbonara')

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/recipe/plately_scan_'))
  })

  it('"Add to Collection" stores the source URL in the scan envelope', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(importOkResponse(MOCK_RECIPE))

    render(<ImportScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /recipe url/i }), 'https://example.com/pasta')
    await user.click(screen.getByRole('button', { name: /import recipe/i }))
    await waitFor(() => screen.getByText('Spaghetti Carbonara'))

    await user.click(screen.getByRole('button', { name: /add to collection/i }))

    const scanKey = Object.keys(sessionStorage).find((k) => k.startsWith('plately_scan_'))!
    const stored = JSON.parse(sessionStorage.getItem(scanKey)!)
    expect(stored.importedFromUrl).toBe('https://example.com/pasta')
  })

  // ─── Error flow ──────────────────────────────────────────────────────────

  it('shows "Import failed" and the error message when the API returns an error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      importErrorResponse('NO_RECIPE_FOUND', 'No recipe was found at that URL. Try a different page.')
    )

    render(<ImportScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /recipe url/i }), 'https://example.com/article')
    await user.click(screen.getByRole('button', { name: /import recipe/i }))

    await waitFor(() => {
      expect(screen.getByText(/import failed/i)).toBeTruthy()
      expect(screen.getByText(/no recipe was found/i)).toBeTruthy()
    })
  })

  it('shows error state with a "Try again" button when API error body is empty', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response)

    render(<ImportScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /recipe url/i }), 'https://example.com/pasta')
    await user.click(screen.getByRole('button', { name: /import recipe/i }))

    // Error state is shown — "Try again" button only appears on error
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
    })
  })

  // ─── "Try another URL" reset ─────────────────────────────────────────────

  it('"Try another URL" clears the recipe and resets to idle state', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(importOkResponse(MOCK_RECIPE))

    render(<ImportScreen />)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /recipe url/i }), 'https://example.com/pasta')
    await user.click(screen.getByRole('button', { name: /import recipe/i }))
    await waitFor(() => screen.getByText('Spaghetti Carbonara'))

    await user.click(screen.getByRole('button', { name: /try another url/i }))

    expect(screen.queryByText('Spaghetti Carbonara')).toBeNull()
    expect(screen.getByRole('button', { name: /import recipe/i })).toBeTruthy()
  })
})

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SearchScreen } from './SearchScreen'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/banners/SmartBanner', () => ({
  recordSearchVisit: vi.fn(),
}))

// useOnlineStatus mock — controlled per test
const mockUseOnlineStatus = vi.fn(() => true)
vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}))

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300

// ─── Tests ────────────────────────────────────────────────────────────────────

// Shared fetch spy — created once in beforeEach so all tests reference the same spy
let fetchSpy: ReturnType<typeof vi.spyOn>

describe('SearchScreen — offline behaviour', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockPush.mockClear()
    mockReplace.mockClear()
    mockUseOnlineStatus.mockReturnValue(true)

    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function getInput() {
    return screen.getByRole('textbox', { name: /search restaurants/i })
  }

  async function typeAndSettle(value: string) {
    fireEvent.change(getInput(), { target: { value } })
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 50)
    })
    // Flush any pending promise microtasks (fetch resolution etc.)
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('shows nothing special when query is short (< 3 chars) and offline', async () => {
    mockUseOnlineStatus.mockReturnValue(false)
    render(<SearchScreen />)

    await typeAndSettle('pa')

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows offline notice when 3+ chars typed and offline (not generic error)', async () => {
    mockUseOnlineStatus.mockReturnValue(false)
    render(<SearchScreen />)

    await typeAndSettle('pad thai')

    const notice = screen.getByRole('status')
    expect(notice).toBeTruthy()
    expect(notice.textContent).toContain('No internet connection')
    expect(notice.textContent).toContain('Restaurant search requires network access')
    // Must NOT show the generic error copy
    expect(screen.queryByText(/Search is temporarily unavailable/i)).toBeNull()
  })

  it('offline notice has role="status" and aria-live="polite"', async () => {
    mockUseOnlineStatus.mockReturnValue(false)
    render(<SearchScreen />)

    await typeAndSettle('sushi bar')

    const notice = screen.getByRole('status')
    expect(notice).toBeTruthy()
    expect(notice.getAttribute('aria-live')).toBe('polite')
  })

  it('does NOT call fetch() when offline and query meets threshold', async () => {
    mockUseOnlineStatus.mockReturnValue(false)
    render(<SearchScreen />)

    await typeAndSettle('bistro near me')

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows normal search flow when online', async () => {
    mockUseOnlineStatus.mockReturnValue(true)
    render(<SearchScreen />)

    await typeAndSettle('ramen house')

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/places/search',
      expect.objectContaining({ method: 'POST' })
    )
    // No offline notice
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('when going offline mid-search: offline notice appears and fetch not called again', async () => {
    mockUseOnlineStatus.mockReturnValue(true)
    const { rerender } = render(<SearchScreen />)

    await typeAndSettle('tapas bar')

    // Initial online fetch happened
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Simulate going offline
    mockUseOnlineStatus.mockReturnValue(false)
    await act(async () => {
      rerender(<SearchScreen />)
    })

    // Offline notice should appear (query is still 5+ chars)
    const notice = screen.getByRole('status')
    expect(notice).toBeTruthy()
    expect(notice.textContent).toContain('No internet connection')

    // fetch should not be called again after going offline
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import SearchPage from './page'
import { useOnlineStatus } from '@/hooks/use-online-status'

// SearchPage now delegates all rendering to SearchScreen — mock its dependencies

vi.mock('@/hooks/use-online-status')

vi.mock('@/hooks/use-search', () => ({
  useRestaurantSearch: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    fetchStatus: 'idle',
    status: 'pending',
    debouncedQuery: '',
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
  },
  useReducedMotion: () => false,
}))

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useOnlineStatus).mockReturnValue(true)
    localStorage.clear()
  })

  it('renders search stub when online', () => {
    render(<SearchPage />)
    expect(screen.getByText('Search')).toBeDefined()
  })

  it('shows offline message when not connected', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false)
    render(<SearchPage />)
    expect(screen.getByText('No internet connection')).toBeDefined()
  })

  it('offline message mentions search requires internet', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false)
    render(<SearchPage />)
    expect(screen.getByText(/Search requires an internet connection/)).toBeDefined()
  })

  it('does not render search stub when offline', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false)
    render(<SearchPage />)
    expect(screen.queryByText('Search')).toBeNull()
  })
})

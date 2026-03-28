import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import SearchPage from './page'
import { useOnlineStatus } from '@/hooks/use-online-status'

vi.mock('@/hooks/use-online-status')

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useOnlineStatus).mockReturnValue(true)
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

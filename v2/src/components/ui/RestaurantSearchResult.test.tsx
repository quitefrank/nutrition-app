import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { RestaurantSearchResult } from './RestaurantSearchResult'
import type { SearchResultData } from './RestaurantSearchResult'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const RESULT_WITH_RATING: SearchResultData = {
  placeId: 'place-1',
  name: 'The Burger Joint',
  address: '1 Main St, Toronto',
  rating: 4.5,
  userRatingsTotal: 200,
  photoUrl: null,
}

const RESULT_WITHOUT_RATING: SearchResultData = {
  placeId: 'place-2',
  name: 'Hidden Gem',
  address: '99 Side St',
  photoUrl: null,
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('RestaurantSearchResult', () => {
  const onSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders restaurant name', () => {
    render(<RestaurantSearchResult result={RESULT_WITH_RATING} onSelect={onSelect} />)
    expect(screen.getByText('The Burger Joint')).toBeDefined()
  })

  it('renders restaurant address', () => {
    render(<RestaurantSearchResult result={RESULT_WITH_RATING} onSelect={onSelect} />)
    expect(screen.getByText('1 Main St, Toronto')).toBeDefined()
  })

  it('renders rating chip when rating is present', () => {
    render(<RestaurantSearchResult result={RESULT_WITH_RATING} onSelect={onSelect} />)
    // Rating chip should show the formatted rating
    expect(screen.getByText('4.5')).toBeDefined()
  })

  it('omits rating chip when rating is absent', () => {
    render(<RestaurantSearchResult result={RESULT_WITHOUT_RATING} onSelect={onSelect} />)
    // No rating text should appear
    expect(screen.queryByLabelText(/Rating/)).toBeNull()
  })

  it('calls onSelect with the result object on click', async () => {
    render(<RestaurantSearchResult result={RESULT_WITH_RATING} onSelect={onSelect} />)
    const row = screen.getByRole('button', { name: 'The Burger Joint, 1 Main St, Toronto — add to collection' })
    await userEvent.click(row)
    expect(onSelect).toHaveBeenCalledWith(RESULT_WITH_RATING)
  })

  it('calls onSelect on Enter keypress', () => {
    render(<RestaurantSearchResult result={RESULT_WITH_RATING} onSelect={onSelect} />)
    const row = screen.getByRole('button', { name: 'The Burger Joint, 1 Main St, Toronto — add to collection' })
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(RESULT_WITH_RATING)
  })

  it('does NOT call onSelect on Space keypress', () => {
    render(<RestaurantSearchResult result={RESULT_WITH_RATING} onSelect={onSelect} />)
    const row = screen.getByRole('button', { name: 'The Burger Joint, 1 Main St, Toronto — add to collection' })
    fireEvent.keyDown(row, { key: ' ' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('has tabIndex=0 for keyboard navigation', () => {
    render(<RestaurantSearchResult result={RESULT_WITH_RATING} onSelect={onSelect} />)
    const row = screen.getByRole('button', { name: 'The Burger Joint, 1 Main St, Toronto — add to collection' })
    expect(row.getAttribute('tabindex')).toBe('0')
  })

  it('has aria-label with name, address, and action context', () => {
    render(<RestaurantSearchResult result={RESULT_WITH_RATING} onSelect={onSelect} />)
    expect(screen.getByLabelText('The Burger Joint, 1 Main St, Toronto — add to collection')).toBeDefined()
  })
})

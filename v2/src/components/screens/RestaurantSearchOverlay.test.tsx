import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────
// Must be declared before any imports that reference the mocked modules.

const mockUseRestaurantSearch = vi.hoisted(() =>
  vi.fn(() => ({
    results: [],
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }))
)

const mockMutateAsync = vi.hoisted(() => vi.fn())
const mockUseAutoScan = vi.hoisted(() =>
  vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    mutate: vi.fn(),
    isError: false,
    error: null,
  }))
)

vi.mock('@/hooks/useRestaurantSearch', () => ({
  useRestaurantSearch: mockUseRestaurantSearch,
}))

vi.mock('@/hooks/useAutoScan', () => ({
  useAutoScan: mockUseAutoScan,
}))

import { RestaurantSearchOverlay } from './RestaurantSearchOverlay'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_RESULTS = [
  { placeId: 'place-1', name: 'Sala Thai', address: '99 Queen St', rating: 4.7, photoUrl: null },
  { placeId: 'place-2', name: 'Pizza Palace', address: '1 Elm St', photoUrl: null },
]

// ─── Wrapper ───────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return Wrapper
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('RestaurantSearchOverlay', () => {
  const onDismiss = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to default: no results, not loading
    mockUseRestaurantSearch.mockReturnValue({
      results: [],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseAutoScan.mockReturnValue({
      mutateAsync: mockMutateAsync,
      mutate: vi.fn(),
      isError: false,
      error: null,
    })
  })

  it('renders the SearchBar', () => {
    render(<RestaurantSearchOverlay onDismiss={onDismiss} />, {
      wrapper: createWrapper(),
    })
    expect(screen.getByRole('searchbox', { name: 'Search for a restaurant' })).toBeDefined()
  })

  it('shows result rows when results are returned', () => {
    mockUseRestaurantSearch.mockReturnValue({
      results: MOCK_RESULTS,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<RestaurantSearchOverlay onDismiss={onDismiss} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByRole('button', { name: 'Sala Thai, 99 Queen St — add to collection' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Pizza Palace, 1 Elm St — add to collection' })).toBeDefined()
  })

  it('shows empty state when query >= 2 and results are empty', async () => {
    mockUseRestaurantSearch.mockReturnValue({
      results: [],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<RestaurantSearchOverlay onDismiss={onDismiss} />, {
      wrapper: createWrapper(),
    })

    const input = screen.getByRole('searchbox')
    await userEvent.type(input, 'xyzzy')

    await waitFor(() => {
      expect(screen.getByText(/No restaurants found for/)).toBeDefined()
    })
  })

  it('shows loading skeleton while isPending is true', async () => {
    mockUseRestaurantSearch.mockReturnValue({
      results: [],
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<RestaurantSearchOverlay onDismiss={onDismiss} />, {
      wrapper: createWrapper(),
    })

    // Type to trigger the loading state display
    const input = screen.getByRole('searchbox')
    await userEvent.type(input, 'pizza')

    // Loading skeletons are aria-hidden; we check that the search spinner is shown
    // by looking for the SearchBar loading indicator (not the result list)
    // The SearchBar isLoading prop will render aria-label="Loading" spinner
    await waitFor(() => {
      expect(screen.getByLabelText('Loading')).toBeDefined()
    })
  })

  it('calls auto-scan mutation when a result is selected', async () => {
    mockMutateAsync.mockResolvedValueOnce({})
    mockUseRestaurantSearch.mockReturnValue({
      results: MOCK_RESULTS,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<RestaurantSearchOverlay onDismiss={onDismiss} />, {
      wrapper: createWrapper(),
    })

    const resultRow = screen.getByRole('button', { name: 'Sala Thai, 99 Queen St — add to collection' })
    await userEvent.click(resultRow)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        placeId: 'place-1',
        name: 'Sala Thai',
      })
    })
  })

  it('calls onDismiss on successful auto-scan', async () => {
    mockMutateAsync.mockResolvedValueOnce({})
    mockUseRestaurantSearch.mockReturnValue({
      results: MOCK_RESULTS,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<RestaurantSearchOverlay onDismiss={onDismiss} />, {
      wrapper: createWrapper(),
    })

    const resultRow = screen.getByRole('button', { name: 'Sala Thai, 99 Queen St — add to collection' })
    await userEvent.click(resultRow)

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  })

  it('calls onDismiss when Escape key is pressed globally', () => {
    render(<RestaurantSearchOverlay onDismiss={onDismiss} />, {
      wrapper: createWrapper(),
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss when Cancel button in SearchBar is clicked', async () => {
    render(<RestaurantSearchOverlay onDismiss={onDismiss} />, {
      wrapper: createWrapper(),
    })

    const cancelBtn = screen.getByLabelText('Cancel search')
    await userEvent.click(cancelBtn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows error state when isError is true', () => {
    mockUseRestaurantSearch.mockReturnValue({
      results: [],
      isPending: false,
      isError: true,
      error: Object.assign(new Error('Search unavailable'), { code: 'PLACES_UNAVAILABLE' }),
      refetch: vi.fn(),
    })

    render(<RestaurantSearchOverlay onDismiss={onDismiss} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText('Try again')).toBeDefined()
  })

  it('calls refetch when "Try again" is clicked in the error state', async () => {
    const refetch = vi.fn()
    mockUseRestaurantSearch.mockReturnValue({
      results: [],
      isPending: false,
      isError: true,
      error: new Error('Search failed'),
      refetch,
    })

    render(<RestaurantSearchOverlay onDismiss={onDismiss} />, {
      wrapper: createWrapper(),
    })

    const retryBtn = screen.getByText('Try again')
    await userEvent.click(retryBtn)
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

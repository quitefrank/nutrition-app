import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SearchScreen } from './search-screen'

// Mock the hook
vi.mock('@/hooks/use-search', () => ({
  useRestaurantSearch: vi.fn(),
}))

// Mock next/navigation
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// Mock online status — default online
vi.mock('@/hooks/use-online-status', () => ({
  useOnlineStatus: vi.fn(() => true),
}))

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
  },
  useReducedMotion: () => false,
}))

import { useRestaurantSearch } from '@/hooks/use-search'
import { useOnlineStatus } from '@/hooks/use-online-status'

const mockUseRestaurantSearch = vi.mocked(useRestaurantSearch)
const mockUseOnlineStatus = vi.mocked(useOnlineStatus)

function idleResult() {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    fetchStatus: 'idle',
    status: 'pending',
    isSuccess: false,
    debouncedQuery: '',
  } as unknown as ReturnType<typeof useRestaurantSearch>
}

beforeEach(() => {
  vi.clearAllMocks()
  pushMock.mockClear()
  mockUseOnlineStatus.mockReturnValue(true)
  mockUseRestaurantSearch.mockReturnValue(idleResult())
  localStorage.clear()
})

describe('SearchScreen — empty state', () => {
  it('renders the Search heading', () => {
    render(React.createElement(SearchScreen))
    expect(screen.getByText('Search')).toBeTruthy()
  })

  it('renders search input with correct placeholder', () => {
    render(React.createElement(SearchScreen))
    const input = screen.getByPlaceholderText('Dish, restaurant...')
    expect(input).toBeTruthy()
  })

  it('renders suggestion copy', () => {
    render(React.createElement(SearchScreen))
    expect(screen.getByText(/carbonara/)).toBeTruthy()
  })

  it('does not render restaurant cards when idle', () => {
    render(React.createElement(SearchScreen))
    const cards = screen.queryAllByTestId('glass-card')
    // Only possible recent search cards, none for restaurants
    expect(cards.length).toBe(0)
  })
})

describe('SearchScreen — offline guard', () => {
  it('renders offline message and hides search UI when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false)
    render(React.createElement(SearchScreen))
    expect(screen.getByText('No internet connection')).toBeTruthy()
    expect(screen.queryByPlaceholderText('Dish, restaurant...')).toBeNull()
  })
})

describe('SearchScreen — recent searches', () => {
  it('shows recent search rows when query is empty and localStorage has entries', () => {
    localStorage.setItem('plately-recent-searches', JSON.stringify(['sushi', 'pizza']))
    render(React.createElement(SearchScreen))
    expect(screen.getByText('sushi')).toBeTruthy()
    expect(screen.getByText('pizza')).toBeTruthy()
  })

  it('tapping a recent search populates the input', () => {
    localStorage.setItem('plately-recent-searches', JSON.stringify(['sushi']))
    render(React.createElement(SearchScreen))
    fireEvent.click(screen.getByText('sushi'))
    const input = screen.getByPlaceholderText('Dish, restaurant...') as HTMLInputElement
    expect(input.value).toBe('sushi')
  })

  it('does not render recent search rows when query is non-empty', () => {
    localStorage.setItem('plately-recent-searches', JSON.stringify(['sushi']))
    render(React.createElement(SearchScreen))
    const input = screen.getByPlaceholderText('Dish, restaurant...')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ramen' } })
    expect(screen.queryByText('sushi')).toBeNull()
  })

  it('re-shows recent searches after input is blurred with empty query', () => {
    localStorage.setItem('plately-recent-searches', JSON.stringify(['sushi']))
    render(React.createElement(SearchScreen))
    const input = screen.getByPlaceholderText('Dish, restaurant...')
    fireEvent.focus(input)
    expect(screen.queryByText('sushi')).toBeNull()
    fireEvent.blur(input)
    expect(screen.getByText('sushi')).toBeTruthy()
  })
})

describe('SearchScreen — loading state', () => {
  it('shows loading indicator when isLoading is true', () => {
    mockUseRestaurantSearch.mockReturnValue({
      ...idleResult(),
      isLoading: true,
      fetchStatus: 'fetching',
    } as ReturnType<typeof useRestaurantSearch>)

    render(React.createElement(SearchScreen))
    // Trigger a query by typing 3+ chars
    const input = screen.getByPlaceholderText('Dish, restaurant...')
    fireEvent.change(input, { target: { value: 'abc' } })

    expect(screen.getByRole('status')).toBeTruthy()
  })
})

describe('SearchScreen — error state', () => {
  it('renders ErrorState with retry button on error', () => {
    const refetchMock = vi.fn()
    mockUseRestaurantSearch.mockReturnValue({
      ...idleResult(),
      isError: true,
      error: new Error('Search failed'),
      refetch: refetchMock,
    } as ReturnType<typeof useRestaurantSearch>)

    render(React.createElement(SearchScreen))
    const input = screen.getByPlaceholderText('Dish, restaurant...')
    fireEvent.change(input, { target: { value: 'abc' } })

    expect(screen.getByTestId('error-state')).toBeTruthy()
    // Suggestion copy still visible
    expect(screen.getByText(/carbonara/)).toBeTruthy()
  })

  it('calls refetch when retry button is tapped', () => {
    const refetchMock = vi.fn().mockResolvedValue({})
    mockUseRestaurantSearch.mockReturnValue({
      ...idleResult(),
      isError: true,
      error: new Error('Search failed'),
      refetch: refetchMock,
    } as ReturnType<typeof useRestaurantSearch>)

    render(React.createElement(SearchScreen))
    const input = screen.getByPlaceholderText('Dish, restaurant...')
    fireEvent.change(input, { target: { value: 'abc' } })

    const retryBtn = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryBtn)
    expect(refetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('SearchScreen — results', () => {
  const mockResults = [
    { googlePlacesId: 'place1', name: 'Sushi Palace', address: '1 Main St', imageUrl: null },
    { googlePlacesId: 'place2', name: 'Pizza Spot', address: '2 Elm St', imageUrl: 'https://img.example.com/img.jpg' },
  ]

  beforeEach(() => {
    mockUseRestaurantSearch.mockReturnValue({
      ...idleResult(),
      data: mockResults,
      isSuccess: true,
      status: 'success',
    } as ReturnType<typeof useRestaurantSearch>)
  })

  it('renders the correct number of restaurant cards', () => {
    render(React.createElement(SearchScreen))
    const input = screen.getByPlaceholderText('Dish, restaurant...')
    fireEvent.change(input, { target: { value: 'sushi' } })

    const cards = screen.getAllByTestId('glass-card')
    expect(cards.length).toBe(mockResults.length)
  })

  it('renders restaurant name and address in each card', () => {
    render(React.createElement(SearchScreen))
    const input = screen.getByPlaceholderText('Dish, restaurant...')
    fireEvent.change(input, { target: { value: 'sushi' } })

    expect(screen.getByText('Sushi Palace')).toBeTruthy()
    expect(screen.getByText('1 Main St')).toBeTruthy()
    expect(screen.getByText('Pizza Spot')).toBeTruthy()
  })

  it('calls router.push with correct path on card tap', () => {
    render(React.createElement(SearchScreen))
    const input = screen.getByPlaceholderText('Dish, restaurant...')
    fireEvent.change(input, { target: { value: 'sushi' } })

    const cards = screen.getAllByRole('button')
    fireEvent.click(cards[0])
    expect(pushMock).toHaveBeenCalledWith('/search/restaurants/place1?restaurantName=Sushi%20Palace')
  })

  it('suggestion copy remains visible with results', () => {
    render(React.createElement(SearchScreen))
    const input = screen.getByPlaceholderText('Dish, restaurant...')
    fireEvent.change(input, { target: { value: 'sushi' } })
    expect(screen.getByText(/carbonara/)).toBeTruthy()
  })
})

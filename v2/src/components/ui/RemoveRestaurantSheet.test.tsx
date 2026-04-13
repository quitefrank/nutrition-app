import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Mock useRemoveRestaurant ─────────────────────────────────────────────────

const mockMutate = vi.fn()
let mockIsPending = false
let mockIsError = false

vi.mock('@/hooks/useRemoveRestaurant', () => ({
  useRemoveRestaurant: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
    isError: mockIsError,
  }),
}))

// Import after mocks
import { RemoveRestaurantSheet } from './RemoveRestaurantSheet'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return Wrapper
}

const defaultProps = {
  restaurantId: '00000000-0000-4000-8000-000000000001',
  restaurantName: 'Sala Thai',
  dishCount: 3,
  isOpen: true,
  onClose: vi.fn(),
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RemoveRestaurantSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsPending = false
    mockIsError = false
  })

  describe('content', () => {
    it('displays the restaurant name in the confirmation copy', () => {
      const Wrapper = createWrapper()
      render(<RemoveRestaurantSheet {...defaultProps} />, { wrapper: Wrapper })
      expect(screen.getByText(/Sala Thai/)).toBeTruthy()
    })

    it('displays the correct dish count — plural "dishes"', () => {
      const Wrapper = createWrapper()
      render(<RemoveRestaurantSheet {...defaultProps} dishCount={3} />, { wrapper: Wrapper })
      expect(screen.getByText(/3 dishes/)).toBeTruthy()
    })

    it('displays singular "dish" when dishCount is 1', () => {
      const Wrapper = createWrapper()
      render(<RemoveRestaurantSheet {...defaultProps} dishCount={1} />, { wrapper: Wrapper })
      expect(screen.getByText(/1 dish/)).toBeTruthy()
    })

    it('does not render when isOpen is false', () => {
      const Wrapper = createWrapper()
      render(<RemoveRestaurantSheet {...defaultProps} isOpen={false} />, { wrapper: Wrapper })
      expect(screen.queryByText(/Sala Thai/)).toBeNull()
    })
  })

  describe('interactions', () => {
    it('calls mutation with restaurantId and then onClose on success', () => {
      const onClose = vi.fn()
      const Wrapper = createWrapper()
      render(
        <RemoveRestaurantSheet {...defaultProps} onClose={onClose} />,
        { wrapper: Wrapper }
      )

      const removeBtn = screen.getByRole('button', { name: /remove restaurant/i })
      fireEvent.click(removeBtn)

      expect(mockMutate).toHaveBeenCalledWith(
        defaultProps.restaurantId,
        expect.objectContaining({ onSuccess: expect.any(Function) })
      )

      // Verify onClose is called once onSuccess fires
      const { onSuccess } = mockMutate.mock.calls[0][1] as { onSuccess: () => void }
      onSuccess()
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('calls onClose without mutation when Cancel is tapped', () => {
      const onClose = vi.fn()
      const Wrapper = createWrapper()
      render(
        <RemoveRestaurantSheet {...defaultProps} onClose={onClose} />,
        { wrapper: Wrapper }
      )

      const cancelBtn = screen.getByRole('button', { name: /cancel/i })
      fireEvent.click(cancelBtn)

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(mockMutate).not.toHaveBeenCalled()
    })
  })

  describe('AC5 — error state', () => {
    it('shows inline error message when isError is true', () => {
      mockIsError = true
      const Wrapper = createWrapper()
      render(<RemoveRestaurantSheet {...defaultProps} />, { wrapper: Wrapper })

      const alert = screen.getByRole('alert')
      expect(alert.textContent).toMatch(/couldn't remove this restaurant/i)
    })

    it('changes confirm button label to "Try again" when isError is true', () => {
      mockIsError = true
      const Wrapper = createWrapper()
      render(<RemoveRestaurantSheet {...defaultProps} />, { wrapper: Wrapper })

      expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /remove restaurant/i })).toBeNull()
    })

    it('does not call onClose when mutation fails (sheet stays open)', () => {
      // Simulate error: mutate calls onSuccess only — if onSuccess is never
      // invoked, onClose should not be called.
      mockIsError = true
      const onClose = vi.fn()
      const Wrapper = createWrapper()
      render(
        <RemoveRestaurantSheet {...defaultProps} onClose={onClose} />,
        { wrapper: Wrapper }
      )

      // Click Try again — mutate fires but onSuccess won't be called because
      // the mock doesn't invoke callbacks
      const retryBtn = screen.getByRole('button', { name: /try again/i })
      fireEvent.click(retryBtn)

      // onClose must NOT have been called (sheet remains open)
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})

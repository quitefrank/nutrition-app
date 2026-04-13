import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AutoCaptureToast } from './AutoCaptureToast'

describe('AutoCaptureToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders restaurant name and dish count', () => {
    const onDismiss = vi.fn()
    render(
      <AutoCaptureToast
        restaurantName="Sala Thai"
        dishCount={6}
        onDismiss={onDismiss}
      />
    )
    expect(screen.getByText(/Sala Thai/)).toBeTruthy()
    expect(screen.getByText(/6 dishes saved/)).toBeTruthy()
  })

  it('has role="status" and aria-live="polite"', () => {
    render(
      <AutoCaptureToast
        restaurantName="Napoli"
        dishCount={3}
        onDismiss={vi.fn()}
      />
    )
    const toast = screen.getByRole('status')
    expect(toast).toBeTruthy()
    expect(toast.getAttribute('aria-live')).toBe('polite')
  })

  it('calls onDismiss after 2500ms', async () => {
    const onDismiss = vi.fn()
    render(
      <AutoCaptureToast
        restaurantName="Napoli"
        dishCount={3}
        onDismiss={onDismiss}
      />
    )
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2500) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not call onDismiss before 2500ms', () => {
    const onDismiss = vi.fn()
    render(
      <AutoCaptureToast
        restaurantName="Napoli"
        dishCount={3}
        onDismiss={onDismiss}
      />
    )
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('renders singular dish count correctly', () => {
    render(
      <AutoCaptureToast
        restaurantName="Solo Bistro"
        dishCount={1}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText(/1 dish saved/)).toBeTruthy()
  })
})

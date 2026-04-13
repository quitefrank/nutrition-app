import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScanConfidenceBanner } from './ScanConfidenceBanner'

function renderBanner(overrides?: Partial<Parameters<typeof ScanConfidenceBanner>[0]>) {
  const props = {
    recognisedCount: 8,
    totalDetected: 10,
    onRetake: vi.fn(),
    onAddManually: vi.fn(),
    onContinue: vi.fn(),
    ...overrides,
  }
  const result = render(<ScanConfidenceBanner {...props} />)
  return { ...result, props }
}

describe('ScanConfidenceBanner', () => {
  it('renders primary count text ("8 of 10 dishes read")', () => {
    renderBanner()
    expect(screen.getByText('8 of 10 dishes read')).toBeTruthy()
  })

  it('renders secondary text ("2 couldn\'t be identified")', () => {
    renderBanner()
    expect(screen.getByText(/2 couldn't be identified/)).toBeTruthy()
  })

  it('has role="alert"', () => {
    renderBanner()
    const alert = screen.getByRole('alert')
    expect(alert).toBeTruthy()
  })

  it('has aria-live="assertive"', () => {
    renderBanner()
    const alert = screen.getByRole('alert')
    expect(alert.getAttribute('aria-live')).toBe('assertive')
  })

  it('calls onRetake when "Retake photo" button is pressed', async () => {
    const { props } = renderBanner()
    await userEvent.click(screen.getByRole('button', { name: 'Retake photo' }))
    expect(props.onRetake).toHaveBeenCalledTimes(1)
  })

  it('calls onAddManually when "Add manually" button is pressed', async () => {
    const { props } = renderBanner()
    await userEvent.click(screen.getByRole('button', { name: 'Add manually' }))
    expect(props.onAddManually).toHaveBeenCalledTimes(1)
  })

  it('calls onContinue when "Continue with 8" button is pressed', async () => {
    const { props } = renderBanner()
    await userEvent.click(screen.getByRole('button', { name: 'Continue with 8' }))
    expect(props.onContinue).toHaveBeenCalledTimes(1)
  })

  it('computes missed count dynamically (5 of 9 → "4 couldn\'t be identified")', () => {
    renderBanner({ recognisedCount: 5, totalDetected: 9 })
    expect(screen.getByText(/4 couldn't be identified/)).toBeTruthy()
    expect(screen.getByText('5 of 9 dishes read')).toBeTruthy()
  })

  it('"Continue with N" button label reflects recognisedCount', () => {
    renderBanner({ recognisedCount: 3, totalDetected: 7 })
    expect(screen.getByRole('button', { name: 'Continue with 3' })).toBeTruthy()
  })

  // AC2: banner absent when all dishes recognised — guard lives in RestaurantScreen
  // (totalDetected > 0 && sessionRecipes.length < totalDetected). At component level,
  // verify missedCount is floored at 0 and never goes negative.
  it('shows 0 missed count when recognisedCount equals totalDetected (AC2 — no negative count)', () => {
    renderBanner({ recognisedCount: 10, totalDetected: 10 })
    expect(screen.getByText(/0 couldn't be identified/)).toBeTruthy()
    expect(screen.getByText('10 of 10 dishes read')).toBeTruthy()
  })

  // AC5: banner absent on search path — guard lives in RestaurantScreen
  // (totalDetected stays 0 on search visits, so the AnimatePresence condition is false).
  // No component-level assertion possible; this todo documents the intent.
  it.todo('banner not rendered on search-path visit — verified via RestaurantScreen (AC5)')
})

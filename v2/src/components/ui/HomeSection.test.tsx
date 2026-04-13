import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HomeSection } from './HomeSection'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HomeSection', () => {
  it('renders title', () => {
    render(
      <HomeSection title="Restaurants" itemCount={3} onSeeAll={vi.fn()}>
        <div>content</div>
      </HomeSection>
    )
    expect(screen.getByText('Restaurants')).toBeTruthy()
  })

  it('renders role="region" with aria-label matching title', () => {
    render(
      <HomeSection title="My Recipes" itemCount={2} onSeeAll={vi.fn()}>
        <div>content</div>
      </HomeSection>
    )
    const region = screen.getByRole('region', { name: 'My Recipes' })
    expect(region).toBeTruthy()
  })

  it('hides "See all" when itemCount <= 4', () => {
    render(
      <HomeSection title="Restaurants" itemCount={4} onSeeAll={vi.fn()}>
        <div>content</div>
      </HomeSection>
    )
    expect(screen.queryByText(/see all/i)).toBeNull()
  })

  it('hides "See all" when itemCount is 0', () => {
    render(
      <HomeSection title="Restaurants" itemCount={0} onSeeAll={vi.fn()}>
        <div>content</div>
      </HomeSection>
    )
    expect(screen.queryByText(/see all/i)).toBeNull()
  })

  it('shows "See all (N)" when itemCount > 4', () => {
    render(
      <HomeSection title="Restaurants" itemCount={5} onSeeAll={vi.fn()}>
        <div>content</div>
      </HomeSection>
    )
    expect(screen.getByText('See all (5)')).toBeTruthy()
  })

  it('shows "See all (N)" with correct count when itemCount is large', () => {
    render(
      <HomeSection title="Restaurants" itemCount={12} onSeeAll={vi.fn()}>
        <div>content</div>
      </HomeSection>
    )
    expect(screen.getByText('See all (12)')).toBeTruthy()
  })

  it('calls onSeeAll when "See all" is tapped', () => {
    const onSeeAll = vi.fn()
    render(
      <HomeSection title="Restaurants" itemCount={6} onSeeAll={onSeeAll}>
        <div>content</div>
      </HomeSection>
    )
    fireEvent.click(screen.getByText('See all (6)'))
    expect(onSeeAll).toHaveBeenCalledOnce()
  })

  it('renders children in content slot', () => {
    render(
      <HomeSection title="Restaurants" itemCount={2} onSeeAll={vi.fn()}>
        <div data-testid="slot-content">Hello</div>
      </HomeSection>
    )
    expect(screen.getByTestId('slot-content')).toBeTruthy()
    expect(screen.getByText('Hello')).toBeTruthy()
  })
})

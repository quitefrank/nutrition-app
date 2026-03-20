import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GlassTabBar, type TabId } from './glass-tab-bar'

describe('GlassTabBar', () => {
  it('renders 3 tab buttons', () => {
    render(<GlassTabBar activeTab="home" onTabChange={vi.fn()} />)
    expect(screen.getByTestId('tab-home')).toBeDefined()
    expect(screen.getByTestId('tab-search')).toBeDefined()
    expect(screen.getByTestId('tab-grocery')).toBeDefined()
  })

  it('marks active tab with aria-current="page"', () => {
    render(<GlassTabBar activeTab="search" onTabChange={vi.fn()} />)
    expect(screen.getByTestId('tab-search').getAttribute('aria-current')).toBe('page')
    expect(screen.getByTestId('tab-home').getAttribute('aria-current')).toBeNull()
  })

  it('calls onTabChange with correct id when tab is clicked', () => {
    const onTabChange = vi.fn()
    render(<GlassTabBar activeTab="home" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByTestId('tab-grocery'))
    expect(onTabChange).toHaveBeenCalledWith('grocery' as TabId)
  })

  it('renders with data-testid', () => {
    render(<GlassTabBar activeTab="home" onTabChange={vi.fn()} />)
    expect(screen.getByTestId('glass-tab-bar')).toBeDefined()
  })

  it('renders fabSlot when provided', () => {
    render(
      <GlassTabBar
        activeTab="home"
        onTabChange={vi.fn()}
        fabSlot={<button data-testid="fab-button">cam</button>}
      />
    )
    expect(screen.getByTestId('tab-bar-fab')).toBeDefined()
    expect(screen.getByTestId('fab-button')).toBeDefined()
  })

  it('does not render fab slot area when not provided', () => {
    render(<GlassTabBar activeTab="home" onTabChange={vi.fn()} />)
    expect(screen.queryByTestId('tab-bar-fab')).toBeNull()
  })

  // P-7: Inactive tab uses --text-tertiary token (not hardcoded opacity)
  it('applies text-tertiary color to inactive tabs', () => {
    render(<GlassTabBar activeTab="home" onTabChange={vi.fn()} />)
    const inactiveTab = screen.getByTestId('tab-search')
    expect(inactiveTab.style.color).toBe('var(--text-tertiary)')
  })

  it('applies text-primary color to active tab', () => {
    render(<GlassTabBar activeTab="home" onTabChange={vi.fn()} />)
    const activeTab = screen.getByTestId('tab-home')
    expect(activeTab.style.color).toBe('var(--text-primary)')
  })
})

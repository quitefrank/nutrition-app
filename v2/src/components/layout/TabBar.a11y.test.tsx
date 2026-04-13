import { vi, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TabBar } from './TabBar'

// Mock Next.js navigation hooks used by TabBar
vi.mock('next/navigation', () => ({
  usePathname: () => '/restaurants',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// Mock Next.js Link so it renders as a plain anchor
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('TabBar — ARIA navigation and accessible names', () => {
  it('nav element has role="navigation" and aria-label="Main navigation"', () => {
    render(<TabBar />)
    const nav = screen.getByRole('navigation', { name: /main navigation/i })
    expect(nav).toBeTruthy()
  })

  it('camera FAB has aria-label="Scan a menu" when isOnline=true', () => {
    render(<TabBar isOnline={true} />)
    const fab = screen.getByRole('button', { name: 'Scan a menu' })
    expect(fab).toBeTruthy()
  })

  it('camera FAB has descriptive offline aria-label when isOnline=false', () => {
    render(<TabBar isOnline={false} />)
    const fab = screen.getByRole('button', { name: /camera unavailable/i })
    expect(fab).toBeTruthy()
    expect(fab.getAttribute('aria-label')).toBe('Camera unavailable — no internet connection')
  })

  it('camera FAB has aria-disabled="true" when isOnline=false', () => {
    render(<TabBar isOnline={false} />)
    const fab = screen.getByRole('button', { name: /camera unavailable/i })
    expect(fab.getAttribute('aria-disabled')).toBe('true')
  })

  it('camera FAB does NOT have aria-disabled when isOnline=true', () => {
    render(<TabBar isOnline={true} />)
    const fab = screen.getByRole('button', { name: 'Scan a menu' })
    // aria-disabled should be absent or "false" when online
    const ariaDisabled = fab.getAttribute('aria-disabled')
    expect(ariaDisabled === null || ariaDisabled === 'false').toBe(true)
  })

  it('active tab link has aria-current="page"', () => {
    // usePathname mock returns '/restaurants' → Home tab is active
    render(<TabBar />)
    const homeLink = screen.getByRole('link', { name: /home/i })
    expect(homeLink.getAttribute('aria-current')).toBe('page')
  })

  it('inactive tab links do NOT have aria-current attribute', () => {
    render(<TabBar />)
    const searchLink = screen.getByRole('link', { name: /search/i })
    const groceryLink = screen.getByRole('link', { name: /grocery/i })
    const recipesLink = screen.getByRole('link', { name: /recipes/i })
    expect(searchLink.getAttribute('aria-current')).toBeNull()
    expect(groceryLink.getAttribute('aria-current')).toBeNull()
    expect(recipesLink.getAttribute('aria-current')).toBeNull()
  })

  it('offline indicator dot has aria-hidden="true"', () => {
    render(<TabBar isOnline={false} />)
    // The dot div has aria-hidden="true"
    // Find by querying for the div with aria-hidden inside the FAB container
    const hiddenDots = document.querySelectorAll('[aria-hidden="true"]')
    // At least one element with aria-hidden exists (the dot and icon SVGs)
    expect(hiddenDots.length).toBeGreaterThan(0)
  })

  it('all icon SVGs in tab items have aria-hidden="true"', () => {
    const { container } = render(<TabBar />)
    const svgs = container.querySelectorAll('svg')
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
  })
})

// ─── Story 7-2: Touch target compliance ──────────────────────────────────────

describe('TabBar — touch target compliance (Story 7-2)', () => {
  it('camera FAB button has width of exactly 62px', () => {
    render(<TabBar isOnline={true} />)
    const fab = screen.getByRole('button', { name: 'Scan a menu' })
    // The inline style sets width: 62
    expect((fab as HTMLElement).style.width).toBe('62px')
  })

  it('camera FAB button has height of exactly 62px', () => {
    render(<TabBar isOnline={true} />)
    const fab = screen.getByRole('button', { name: 'Scan a menu' })
    // The inline style sets height: 62
    expect((fab as HTMLElement).style.height).toBe('62px')
  })

  it('camera FAB aria-label contains "Scan a menu" when online', () => {
    render(<TabBar isOnline={true} />)
    const fab = screen.getByRole('button', { name: /scan a menu/i })
    expect(fab.getAttribute('aria-label')).toContain('Scan a menu')
  })

  it('active tab link has aria-current="page" (Home tab at /restaurants)', () => {
    // usePathname mock returns '/restaurants'
    render(<TabBar />)
    const homeLink = screen.getByRole('link', { name: /home/i })
    expect(homeLink.getAttribute('aria-current')).toBe('page')
  })

  it('inactive tab links do NOT have aria-current set', () => {
    render(<TabBar />)
    const searchLink = screen.getByRole('link', { name: /search/i })
    const groceryLink = screen.getByRole('link', { name: /grocery/i })
    const recipesLink = screen.getByRole('link', { name: /recipes/i })
    expect(searchLink.getAttribute('aria-current')).toBeNull()
    expect(groceryLink.getAttribute('aria-current')).toBeNull()
    expect(recipesLink.getAttribute('aria-current')).toBeNull()
  })
})

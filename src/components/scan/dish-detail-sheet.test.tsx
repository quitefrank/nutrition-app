import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DishDetailSheet } from './dish-detail-sheet'
import type { DishResult } from '@/types/api'

// framer-motion — mock to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) =>
      React.createElement('div', props as React.HTMLAttributes<HTMLDivElement>, children),
  },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
  useDragControls: () => ({ start: vi.fn() }),
}))

// focus-trap-react — required whenever BottomSheet is rendered
vi.mock('focus-trap-react', () => ({
  default: ({ children }: React.PropsWithChildren) => children,
}))

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockBack = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useSearchParams: () => new URLSearchParams('scanId=test-scan-id'),
  usePathname: () => '/scan/results',
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement('a', { href, ...props }, children),
}))

const mockDish: DishResult = {
  name: 'Duck Confit',
  description: 'Crispy duck leg with cherry jus',
  calorieEstimate: 620,
  ingredients: [
    { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
    { name: 'Thyme', quantity: null, unit: null, confidenceLevel: 'high' },
    { name: 'Garlic', quantity: '4', unit: 'cloves', confidenceLevel: 'medium' },
    { name: 'Salt blend', quantity: null, unit: null, confidenceLevel: 'low' },
  ],
  imageUrl: null,
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const defaultProps = {
  dish: mockDish,
  open: true,
  onClose: vi.fn(),
  scanId: 'test-scan-id',
  dishIndex: 0,
}

describe('DishDetailSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when open is false', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, open: false }),
      { wrapper: Wrapper }
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a dialog when open is true', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('renders dish name when open', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText('Duck Confit')).toBeDefined()
  })

  it('renders placeholder div when imageUrl is null', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    // No img role should exist when imageUrl is null
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('renders img element when imageUrl is provided', () => {
    const Wrapper = createWrapper()
    const dishWithImage: DishResult = { ...mockDish, imageUrl: 'https://example.com/duck.jpg' }
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, dish: dishWithImage }),
      { wrapper: Wrapper }
    )
    expect(screen.getByRole('img')).toBeDefined()
  })

  it('evidence block shows high-confidence text for menu scan (no ingredients)', () => {
    const Wrapper = createWrapper()
    const menuDish: DishResult = { ...mockDish, ingredients: [] }
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, dish: menuDish }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/Identified from your scan/)).toBeDefined()
  })

  it('evidence block shows high-confidence text with calorie when ≥80% high', () => {
    const Wrapper = createWrapper()
    // All high confidence — 2/2 = 100% high
    const highConfidenceDish: DishResult = {
      ...mockDish,
      ingredients: [
        { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
        { name: 'Thyme', quantity: null, unit: null, confidenceLevel: 'high' },
      ],
    }
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, dish: highConfidenceDish }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/Identified from your scan · 620 cal/)).toBeDefined()
  })

  it('evidence block shows medium-confidence text with ingredient pills when <80% high', () => {
    const Wrapper = createWrapper()
    // 1/4 high = 25% — below threshold
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/ingredients match common preparation/)).toBeDefined()
    // Should show the high-confidence ingredient as a pill
    expect(screen.getByText('Duck leg')).toBeDefined()
  })

  it('evidence block never uses warning colours (no amber/orange/red)', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    const dialog = screen.getByRole('dialog')
    // Confirm no warning-colour inline styles
    expect(dialog.innerHTML).not.toContain('amber')
    expect(dialog.innerHTML).not.toContain('orange')
    // No explicit red/warning classes
    expect(dialog.innerHTML).not.toMatch(/color:\s*red/)
  })

  it('divider element is present', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    expect(screen.getByTestId('divider')).toBeDefined()
  })

  it('Save Recipe button has correct aria-label', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    expect(screen.getByLabelText('Save recipe for Duck Confit')).toBeDefined()
  })

  it('See Full Details button is present', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText('See Full Details')).toBeDefined()
  })

  it('Save Recipe button routes to /scan/dish with scanId and dishIndex', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByLabelText('Save recipe for Duck Confit'))
    expect(mockPush).toHaveBeenCalledWith('/scan/dish?scanId=test-scan-id&dishIndex=0')
  })

  it('See Full Details link points to /scan/dish with scanId and dishIndex', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    const link = screen.getByRole('link', { name: /see full details/i })
    expect(link.getAttribute('href')).toBe('/scan/dish?scanId=test-scan-id&dishIndex=0')
  })

  it('BottomSheet dialog has aria-label from dish name', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('Duck Confit')
  })

  it('uses correct dishIndex for See Full Details link href', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, dishIndex: 2, scanId: 'abc-123' }),
      { wrapper: Wrapper }
    )
    const link = screen.getByRole('link', { name: /see full details/i })
    expect(link.getAttribute('href')).toBe('/scan/dish?scanId=abc-123&dishIndex=2')
  })

  it('See Full Details is rendered as an anchor link, not a button', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    const link = screen.getByRole('link', { name: /see full details/i })
    expect(link).toBeDefined()
    expect(link.tagName.toLowerCase()).toBe('a')
  })

  it('evidence block falls back to high-confidence text when medium path has no high-confidence ingredients', () => {
    const Wrapper = createWrapper()
    // All medium confidence — isHigh=false (0/2 = 0% < 80%), evidencePills=[] (no high ingredients)
    const allMediumDish: DishResult = {
      ...mockDish,
      ingredients: [
        { name: 'Sauce', quantity: null, unit: null, confidenceLevel: 'medium' },
        { name: 'Base', quantity: null, unit: null, confidenceLevel: 'medium' },
      ],
    }
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, dish: allMediumDish }),
      { wrapper: Wrapper }
    )
    // Should NOT render the orphaned medium-confidence heading with no pills
    expect(screen.queryByText(/ingredients match common preparation/)).toBeNull()
    // Should fall back to the high-confidence single-line text instead
    expect(screen.getByText(/Identified from your scan/)).toBeDefined()
  })
})

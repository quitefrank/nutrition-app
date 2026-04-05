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

  // ─── AC1: Alt text format ────────────────────────────────────────────────────

  it('full-bleed image has descriptive alt "Name — description" when description present (AC1)', () => {
    const Wrapper = createWrapper()
    const dishWithImage: DishResult = { ...mockDish, imageUrl: 'https://example.com/duck.jpg' }
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, dish: dishWithImage }),
      { wrapper: Wrapper }
    )
    const img = screen.getByRole('img')
    expect(img.getAttribute('alt')).toBe('Duck Confit — Crispy duck leg with cherry jus')
  })

  it('full-bleed image falls back to name-only alt when description is empty (AC1)', () => {
    const Wrapper = createWrapper()
    const dishNoDesc: DishResult = { ...mockDish, description: '', imageUrl: 'https://example.com/duck.jpg' }
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, dish: dishNoDesc }),
      { wrapper: Wrapper }
    )
    const img = screen.getByRole('img')
    expect(img.getAttribute('alt')).toBe('Duck Confit')
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

  it('Save Recipe button calls onClose when no onSave prop is provided', () => {
    const mockOnClose = vi.fn()
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, onClose: mockOnClose }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByLabelText('Save recipe for Duck Confit'))
    expect(mockOnClose).toHaveBeenCalledOnce()
    expect(mockPush).not.toHaveBeenCalled()
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

  it('hides See Full Details link when scanId is omitted', () => {
    const Wrapper = createWrapper()
    const propsWithoutScanId = { dish: mockDish, open: true, onClose: vi.fn() }
    render(
      React.createElement(DishDetailSheet, propsWithoutScanId),
      { wrapper: Wrapper }
    )
    expect(screen.queryByText('See Full Details')).toBeNull()
  })

  it('renders Nutrition unavailable label when nutritionAvailable is false', () => {
    const Wrapper = createWrapper()
    const menuDish: DishResult = { ...mockDish, ingredients: [], calorieEstimate: null }
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, dish: menuDish, nutritionAvailable: false }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/Nutrition unavailable/)).toBeDefined()
  })

  it('does not render Nutrition unavailable when nutritionAvailable is true', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, nutritionAvailable: true }),
      { wrapper: Wrapper }
    )
    expect(screen.queryByText(/Nutrition unavailable/)).toBeNull()
  })

  it('does not render Nutrition unavailable when nutritionAvailable is undefined (default)', () => {
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    expect(screen.queryByText(/Nutrition unavailable/)).toBeNull()
  })

  it('shows calorie estimate in evidence when nutritionAvailable is not false', () => {
    const Wrapper = createWrapper()
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
    expect(screen.getByText(/620 cal/)).toBeDefined()
  })

  it('onSave is called with dish when Save Recipe button is clicked', () => {
    const mockOnSave = vi.fn()
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, onSave: mockOnSave }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByLabelText('Save recipe for Duck Confit'))
    expect(mockOnSave).toHaveBeenCalledOnce()
    expect(mockOnSave).toHaveBeenCalledWith(mockDish)
  })

  it('onClose is called when Save Recipe button is clicked', () => {
    const mockOnClose = vi.fn()
    const mockOnSave = vi.fn()
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, onClose: mockOnClose, onSave: mockOnSave }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByLabelText('Save recipe for Duck Confit'))
    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('Save Recipe no longer triggers navigation when onSave prop is provided', () => {
    const mockOnSave = vi.fn()
    const Wrapper = createWrapper()
    render(
      React.createElement(DishDetailSheet, { ...defaultProps, onSave: mockOnSave }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByLabelText('Save recipe for Duck Confit'))
    expect(mockPush).not.toHaveBeenCalled()
  })

  // ─── AC8: Confidence indicator — icon + text (never colour alone) ────────────

  it('evidence block high-confidence path includes SVG icon alongside text (AC8)', () => {
    const Wrapper = createWrapper()
    const menuDish: DishResult = { ...mockDish, ingredients: [] }
    const { container } = render(
      React.createElement(DishDetailSheet, { ...defaultProps, dish: menuDish }),
      { wrapper: Wrapper }
    )
    // Icon must be present (SVG with aria-hidden so screen readers ignore it — text carries meaning)
    const icons = container.querySelectorAll('svg[aria-hidden="true"]')
    expect(icons.length).toBeGreaterThan(0)
    // Text must also be present
    expect(screen.getByText(/Identified from your scan/)).toBeDefined()
  })

  it('evidence block medium-confidence path includes SVG icon alongside text (AC8)', () => {
    const Wrapper = createWrapper()
    // 1/4 high ingredients = below 80% threshold → medium path
    const { container } = render(
      React.createElement(DishDetailSheet, { ...defaultProps }),
      { wrapper: Wrapper }
    )
    const icons = container.querySelectorAll('svg[aria-hidden="true"]')
    expect(icons.length).toBeGreaterThan(0)
    expect(screen.getByText(/ingredients match common preparation/)).toBeDefined()
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

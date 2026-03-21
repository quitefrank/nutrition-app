import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ScanResults } from './scan-results'
import type { ScanResult, DishResult } from '@/types/api'

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

const mockScanResult: ScanResult = {
  scanId: 'test-scan-id',
  type: 'menu',
  dishes: [mockDish],
  confidenceSource: 'gemini-only',
}

function createWrapper(scanId: string, result: ScanResult) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['scan-result', scanId], result)
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return TestWrapper
}

describe('ScanResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders dish count label for 1 dish', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText('1 dish found')).toBeDefined()
  })

  it('renders plural dish count label for multiple dishes', () => {
    const multiResult: ScanResult = {
      ...mockScanResult,
      dishes: [mockDish, { ...mockDish, name: 'Risotto' }],
    }
    const Wrapper = createWrapper('test-scan-id', multiResult)
    render(
      React.createElement(ScanResults, { result: multiResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText('2 dishes found')).toBeDefined()
  })

  it('renders dish name', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText('Duck Confit')).toBeDefined()
  })

  it('renders dish description', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText('Crispy duck leg with cherry jus')).toBeDefined()
  })

  it('renders calorie estimate', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText('620 cal')).toBeDefined()
  })

  it('renders thumbnail placeholder div (not img) when imageUrl is null', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    // No img element should exist since imageUrl is null
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('retake button has aria-label "Retake scan"', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByLabelText('Retake scan')).toBeDefined()
  })

  it('retake: calls router.push("/") when retake is clicked', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByLabelText('Retake scan'))
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('retake: dispatches plately:openCamera event after 300ms', () => {
    vi.useFakeTimers()
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByLabelText('Retake scan'))
    expect(dispatchSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'plately:openCamera' })
    )
  })

  it('tapping a dish card opens the DishDetailSheet', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    // Initially no dialog
    expect(screen.queryByRole('dialog')).toBeNull()
    // Click the dish card (GlassCard renders a div with data-testid="glass-card")
    fireEvent.click(screen.getByTestId('glass-card'))
    // DishDetailSheet (via BottomSheet) should now show a dialog
    expect(screen.getByRole('dialog')).toBeDefined()
  })
})

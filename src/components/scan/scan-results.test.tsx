import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ScanResults } from './scan-results'
import type { ScanResult, DishResult } from '@/types/api'

// Mock use-recipes hooks
const { mockSaveMutateAsync, mockDeleteMutateAsync } = vi.hoisted(() => ({
  mockSaveMutateAsync: vi.fn(),
  mockDeleteMutateAsync: vi.fn(),
}))

vi.mock('@/hooks/use-recipes', () => ({
  useSaveRecipe: () => ({
    mutateAsync: mockSaveMutateAsync,
  }),
  useDeleteRecipe: () => ({
    mutateAsync: mockDeleteMutateAsync,
  }),
}))

// Mock sonner toast
const { mockToast } = vi.hoisted(() => ({
  mockToast: Object.assign(vi.fn().mockReturnValue('mock-toast-id'), { error: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: mockToast }))

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

function createWrapperWithClient(scanId: string, result: ScanResult) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['scan-result', scanId], result)
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return { queryClient, TestWrapper }
}

const mockEnrichedResult: ScanResult = {
  scanId: 'test-scan-id',
  type: 'menu',
  confidenceSource: 'multi-source',
  dishes: [{
    name: 'Duck Confit',
    description: 'Crispy duck leg with cherry jus',
    calorieEstimate: 620,
    imageUrl: 'https://lh3.googleusercontent.com/mock-photo',
    ingredients: [
      { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
      { name: 'Thyme', quantity: null, unit: null, confidenceLevel: 'high' },
      { name: 'Garlic', quantity: '4', unit: 'cloves', confidenceLevel: 'medium' },
      { name: 'Salt blend', quantity: null, unit: null, confidenceLevel: 'medium' },
    ],
  }],
}

describe('ScanResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockSaveMutateAsync.mockResolvedValue({
      data: { id: 'saved-recipe-id', name: 'Duck Confit', createdAt: '2026-03-22T00:00:00Z', servingSize: 1, restaurantId: null },
    })
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

  it('does not render partial banner when result has no totalDishCount', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not render partial banner when dishes.length equals totalDishCount', () => {
    const fullResult: ScanResult = { ...mockScanResult, totalDishCount: 1 }
    const Wrapper = createWrapper('test-scan-id', fullResult)
    render(
      React.createElement(ScanResults, { result: fullResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renders partial banner when dishes.length < totalDishCount', () => {
    const partialResult: ScanResult = { ...mockScanResult, totalDishCount: 5 }
    const Wrapper = createWrapper('test-scan-id', partialResult)
    render(
      React.createElement(ScanResults, { result: partialResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByRole('status')).toBeDefined()
  })

  it('banner text includes correct X of Y count', () => {
    const partialResult: ScanResult = { ...mockScanResult, totalDishCount: 5 }
    const Wrapper = createWrapper('test-scan-id', partialResult)
    render(
      React.createElement(ScanResults, { result: partialResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/We identified 1 of 5 dishes/)).toBeDefined()
  })

  it('banner retake button calls onRetake prop', () => {
    const partialResult: ScanResult = { ...mockScanResult, totalDishCount: 5 }
    const mockOnRetake = vi.fn()
    const Wrapper = createWrapper('test-scan-id', partialResult)
    render(
      React.createElement(ScanResults, { result: partialResult, scanId: 'test-scan-id', onRetake: mockOnRetake }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByLabelText('Retake scan to improve results'))
    expect(mockOnRetake).toHaveBeenCalledOnce()
  })

  // ─── Empty scan state tests (emptyReason differentiation) ───────────────────

  it('renders image_quality copy when dishes is empty and emptyReason is image_quality', () => {
    const emptyResult: ScanResult = { ...mockScanResult, dishes: [], emptyReason: 'image_quality' }
    const Wrapper = createWrapper('test-scan-id', emptyResult)
    render(
      React.createElement(ScanResults, { result: emptyResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/blurry/i)).toBeDefined()
    // dish count header should NOT be shown
    expect(screen.queryByText(/dish.*found/i)).toBeNull()
  })

  it('renders not_menu copy when dishes is empty and emptyReason is not_menu', () => {
    const emptyResult: ScanResult = { ...mockScanResult, dishes: [], emptyReason: 'not_menu' }
    const Wrapper = createWrapper('test-scan-id', emptyResult)
    render(
      React.createElement(ScanResults, { result: emptyResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/doesn't look like a menu/i)).toBeDefined()
  })

  it('renders no_dishes_found copy when dishes is empty and emptyReason is no_dishes_found', () => {
    const emptyResult: ScanResult = { ...mockScanResult, dishes: [], emptyReason: 'no_dishes_found' }
    const Wrapper = createWrapper('test-scan-id', emptyResult)
    render(
      React.createElement(ScanResults, { result: emptyResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/couldn't spot any dishes/i)).toBeDefined()
  })

  it('renders fallback copy when dishes is empty and emptyReason is null', () => {
    const emptyResult: ScanResult = { ...mockScanResult, dishes: [] }
    const Wrapper = createWrapper('test-scan-id', emptyResult)
    render(
      React.createElement(ScanResults, { result: emptyResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/couldn't spot any dishes/i)).toBeDefined()
  })

  it('empty state retake button calls onRetake prop', () => {
    const emptyResult: ScanResult = { ...mockScanResult, dishes: [], emptyReason: 'not_menu' }
    const mockOnRetake = vi.fn()
    const Wrapper = createWrapper('test-scan-id', emptyResult)
    render(
      React.createElement(ScanResults, { result: emptyResult, scanId: 'test-scan-id', onRetake: mockOnRetake }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByLabelText('Retake scan'))
    expect(mockOnRetake).toHaveBeenCalledOnce()
  })

  // ─── First-time scan tip banner ─────────────────────────────────────────────

  it('shows tip banner when localStorage key is absent', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/hold steady and scan one section at a time/i)).toBeDefined()
  })

  it('does not show tip banner when localStorage key is already set', () => {
    localStorage.setItem('plately_seen_scan_tip', 'true')
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.queryByText(/hold steady and scan one section at a time/i)).toBeNull()
  })

  it('dismissing tip banner sets localStorage key and hides the banner', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/hold steady and scan one section at a time/i)).toBeDefined()
    fireEvent.click(screen.getByLabelText('Dismiss tip'))
    expect(screen.queryByText(/hold steady and scan one section at a time/i)).toBeNull()
    expect(localStorage.getItem('plately_seen_scan_tip')).toBe('true')
  })

  // ─── Save flow + toast ──────────────────────────────────────────────────────

  it('shows "Recipe saved" toast with undo action after successful save', async () => {
    mockSaveMutateAsync.mockResolvedValue({
      data: { id: 'saved-recipe-id', name: 'Duck Confit', createdAt: '2026-03-22T00:00:00Z', servingSize: 1, restaurantId: null },
    })
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    // Open the DishDetailSheet
    fireEvent.click(screen.getByTestId('glass-card'))
    // Click Save Recipe
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Save recipe for Duck Confit'))
    })
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Recipe saved', expect.objectContaining({
        duration: 4000,
        action: expect.objectContaining({ label: 'Undo' }),
      }))
    })
  })

  it('undo action calls delete mutation and shows "Recipe removed" toast', async () => {
    mockSaveMutateAsync.mockResolvedValue({
      data: { id: 'saved-recipe-id', name: 'Duck Confit', createdAt: '2026-03-22T00:00:00Z', servingSize: 1, restaurantId: null },
    })
    mockDeleteMutateAsync.mockResolvedValue(undefined)

    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByTestId('glass-card'))
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Save recipe for Duck Confit'))
    })

    // Get the undo click handler from the toast call and invoke it
    await waitFor(() => expect(mockToast).toHaveBeenCalled())
    const toastCall = mockToast.mock.calls[0]
    const undoClickHandler = toastCall[1].action.onClick

    await act(async () => {
      await undoClickHandler()
    })

    expect(mockDeleteMutateAsync).toHaveBeenCalledWith('saved-recipe-id')
    // Toast updates the existing toast by re-using the same ID returned from the first call
    expect(mockToast).toHaveBeenCalledWith('Recipe removed', { id: 'mock-toast-id' })
  })

  it('shows error toast when save fails', async () => {
    mockSaveMutateAsync.mockRejectedValue(new Error('Network error'))

    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByTestId('glass-card'))
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Save recipe for Duck Confit'))
    })

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to save recipe')
    })
  })

  it('re-renders dish card with imageUrl after enrichment arrives via TQ cache update', async () => {
    const { queryClient, TestWrapper } = createWrapperWithClient('test-scan-id', mockScanResult)

    render(
      React.createElement(ScanResults, { result: mockScanResult, scanId: 'test-scan-id' }),
      { wrapper: TestWrapper }
    )

    // Initially — no img (imageUrl is null)
    expect(screen.queryByRole('img')).toBeNull()

    // Simulate enrichment arriving via setQueryData
    act(() => {
      queryClient.setQueryData<ScanResult>(['scan-result', 'test-scan-id'], mockEnrichedResult)
    })

    // After enrichment — dish card should show the img with descriptive alt text (AC1)
    await waitFor(() => expect(screen.getByRole('img', { name: 'Duck Confit — Crispy duck leg with cherry jus' })).toBeDefined())
  })

  // ─── AC1: Alt text format ────────────────────────────────────────────────────

  it('DishCard uses descriptive alt text "Name — description" when imageUrl and description present', () => {
    const enrichedDish: DishResult = { ...mockDish, imageUrl: 'https://example.com/duck.jpg' }
    const scanResult: ScanResult = { ...mockScanResult, dishes: [enrichedDish] }
    const Wrapper = createWrapper('test-scan-id', scanResult)
    render(
      React.createElement(ScanResults, { result: scanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    const img = screen.getByRole('img')
    expect(img.getAttribute('alt')).toBe('Duck Confit — Crispy duck leg with cherry jus')
  })

  it('DishCard falls back to name-only alt when description is empty', () => {
    const dishNoDesc: DishResult = { ...mockDish, description: '', imageUrl: 'https://example.com/duck.jpg' }
    const scanResult: ScanResult = { ...mockScanResult, dishes: [dishNoDesc] }
    const Wrapper = createWrapper('test-scan-id', scanResult)
    render(
      React.createElement(ScanResults, { result: scanResult, scanId: 'test-scan-id' }),
      { wrapper: Wrapper }
    )
    const img = screen.getByRole('img')
    expect(img.getAttribute('alt')).toBe('Duck Confit')
  })
})

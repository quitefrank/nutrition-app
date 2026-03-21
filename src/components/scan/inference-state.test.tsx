import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InferenceState } from './inference-state'
import type { ScanResult } from '@/types/api'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('scanId=test-scan-id'),
  usePathname: () => '/scan/results',
}))

const mockDishResult = {
  name: 'Carbonara',
  description: 'Classic pasta dish with eggs and guanciale',
  calorieEstimate: 580,
  ingredients: [
    { name: 'Pasta', quantity: '100', unit: 'g', confidenceLevel: 'low' as const },
    { name: 'Egg', quantity: null, unit: null, confidenceLevel: 'low' as const },
    { name: 'Guanciale', quantity: null, unit: null, confidenceLevel: 'low' as const },
  ],
  imageUrl: null,
}

const mockScanResult: ScanResult = {
  scanId: 'test-scan-id',
  type: 'dish',
  dishes: [mockDishResult],
  confidenceSource: 'inference',
}

function createWrapper(scanId: string, result: ScanResult, thumbnail?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['scan-result', scanId], result)
  if (thumbnail) {
    queryClient.setQueryData(['scan-thumbnail', scanId], thumbnail)
  }
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return TestWrapper
}

function createWrapperWithClient(scanId: string, result: ScanResult, thumbnail?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['scan-result', scanId], result)
  if (thumbnail) {
    queryClient.setQueryData(['scan-thumbnail', scanId], thumbnail)
  }
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return { queryClient, TestWrapper }
}

describe('InferenceState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders dish name in the question text', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(InferenceState, {
        result: mockScanResult,
        scanId: 'test-scan-id',
        onRetake: vi.fn(),
        onConfirm: vi.fn(),
      }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/this looks most like/)).toBeDefined()
    expect(screen.getByText('Carbonara')).toBeDefined()
  })

  it('renders question text', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(InferenceState, {
        result: mockScanResult,
        scanId: 'test-scan-id',
        onRetake: vi.fn(),
        onConfirm: vi.fn(),
      }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText('Does that match what you ordered?')).toBeDefined()
  })

  it('renders "Your photo" label', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(InferenceState, {
        result: mockScanResult,
        scanId: 'test-scan-id',
        onRetake: vi.fn(),
        onConfirm: vi.fn(),
      }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText('Your photo')).toBeDefined()
  })

  it('renders "Reference: [dish name]" label', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(InferenceState, {
        result: mockScanResult,
        scanId: 'test-scan-id',
        onRetake: vi.fn(),
        onConfirm: vi.fn(),
      }),
      { wrapper: Wrapper }
    )
    expect(screen.getByText('Reference: Carbonara')).toBeDefined()
  })

  it('renders user thumbnail image when thumbnailUrl is in TQ cache', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult, 'blob:thumb-url')
    render(
      React.createElement(InferenceState, {
        result: mockScanResult,
        scanId: 'test-scan-id',
        onRetake: vi.fn(),
        onConfirm: vi.fn(),
      }),
      { wrapper: Wrapper }
    )
    expect(screen.getByAltText('Your photo')).toBeDefined()
  })

  it('clicking "Yes, that\'s it" calls onConfirm and updates TQ cache to user-confirmed', () => {
    const { queryClient, TestWrapper } = createWrapperWithClient('test-scan-id', mockScanResult)
    const onConfirm = vi.fn()
    render(
      React.createElement(InferenceState, {
        result: mockScanResult,
        scanId: 'test-scan-id',
        onRetake: vi.fn(),
        onConfirm,
      }),
      { wrapper: TestWrapper }
    )
    fireEvent.click(screen.getByLabelText('Confirm dish identification'))
    expect(onConfirm).toHaveBeenCalledOnce()
    const cached = queryClient.getQueryData<ScanResult>(['scan-result', 'test-scan-id'])
    expect(cached?.confidenceSource).toBe('user-confirmed')
  })

  it('clicking "No, that\'s not right" reveals correction input', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(InferenceState, {
        result: mockScanResult,
        scanId: 'test-scan-id',
        onRetake: vi.fn(),
        onConfirm: vi.fn(),
      }),
      { wrapper: Wrapper }
    )
    expect(screen.queryByLabelText('Enter dish name for re-submission')).toBeNull()
    fireEvent.click(screen.getByText("No, that's not right"))
    expect(screen.getByLabelText('Enter dish name for re-submission')).toBeDefined()
  })

  it('correction input filled + "Try again" calls onRetake (MVP: correction = retake)', () => {
    const onRetake = vi.fn()
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(InferenceState, {
        result: mockScanResult,
        scanId: 'test-scan-id',
        onRetake,
        onConfirm: vi.fn(),
      }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByText("No, that's not right"))
    const input = screen.getByLabelText('Enter dish name for re-submission')
    fireEvent.change(input, { target: { value: 'Duck Confit' } })
    fireEvent.click(screen.getByText('Try again'))
    expect(onRetake).toHaveBeenCalledOnce()
  })

  it('"Retake scan" button calls onRetake', () => {
    const onRetake = vi.fn()
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(
      React.createElement(InferenceState, {
        result: mockScanResult,
        scanId: 'test-scan-id',
        onRetake,
        onConfirm: vi.fn(),
      }),
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByLabelText('Retake scan'))
    expect(onRetake).toHaveBeenCalledOnce()
  })

  it('reactive reference photo — shows img when imageUrl arrives via setQueryData', async () => {
    const { queryClient, TestWrapper } = createWrapperWithClient('test-scan-id', mockScanResult)
    render(
      React.createElement(InferenceState, {
        result: mockScanResult,
        scanId: 'test-scan-id',
        onRetake: vi.fn(),
        onConfirm: vi.fn(),
      }),
      { wrapper: TestWrapper }
    )

    // Initially no reference image (imageUrl is null)
    expect(screen.queryByAltText('Reference: Carbonara')).toBeNull()

    // Simulate enrichment arriving with imageUrl
    await act(async () => {
      queryClient.setQueryData<ScanResult>(['scan-result', 'test-scan-id'], {
        ...mockScanResult,
        dishes: [{ ...mockDishResult, imageUrl: 'https://example.com/carbonara.jpg' }],
      })
    })

    // Reference image should now appear
    await waitFor(() => expect(screen.getByAltText('Reference: Carbonara')).toBeDefined())
  })
})

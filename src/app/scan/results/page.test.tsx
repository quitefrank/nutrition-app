import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ScanResultsPage from './page'
import type { ScanResult } from '@/types/api'

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

// Mock ScanResults to isolate page-level logic
vi.mock('@/components/scan/scan-results', () => ({
  ScanResults: ({ result, scanId }: { result: ScanResult; scanId: string }) =>
    React.createElement('div', { 'data-testid': 'scan-results', 'data-scan-id': scanId },
      `Results for ${result.scanId}`
    ),
}))

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockBack = vi.fn()

// Mutable searchParams for per-test control
let mockSearchParams = new URLSearchParams('scanId=test-scan-id')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/scan/results',
}))

const mockScanResult: ScanResult = {
  scanId: 'test-scan-id',
  type: 'menu',
  dishes: [
    {
      name: 'Duck Confit',
      description: 'Crispy duck leg',
      calorieEstimate: 620,
      ingredients: [],
      imageUrl: null,
    },
  ],
  confidenceSource: 'gemini-only',
}

function createWrapper(scanId: string | null, result?: ScanResult) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (scanId && result) {
    queryClient.setQueryData(['scan-result', scanId], result)
  }
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('ScanResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = new URLSearchParams('scanId=test-scan-id')
  })

  it('renders ScanResults when scan result found in TQ cache', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(React.createElement(ScanResultsPage), { wrapper: Wrapper })
    expect(screen.getByTestId('scan-results')).toBeDefined()
    expect(screen.getByText('Results for test-scan-id')).toBeDefined()
  })

  it('redirects to / when scanResult not found in TQ cache', () => {
    // Cache is empty — no result seeded
    const Wrapper = createWrapper('test-scan-id')
    render(React.createElement(ScanResultsPage), { wrapper: Wrapper })
    expect(mockReplace).toHaveBeenCalledWith('/')
    expect(screen.queryByTestId('scan-results')).toBeNull()
  })

  it('redirects to / when scanId is missing from params', () => {
    // Override searchParams to have empty scanId
    mockSearchParams = new URLSearchParams('')
    const Wrapper = createWrapper(null)
    render(React.createElement(ScanResultsPage), { wrapper: Wrapper })
    expect(mockReplace).toHaveBeenCalledWith('/')
    expect(screen.queryByTestId('scan-results')).toBeNull()
  })

  it('passes correct scanId to ScanResults', () => {
    const Wrapper = createWrapper('test-scan-id', mockScanResult)
    render(React.createElement(ScanResultsPage), { wrapper: Wrapper })
    const scanResultsEl = screen.getByTestId('scan-results')
    expect(scanResultsEl.getAttribute('data-scan-id')).toBe('test-scan-id')
  })
})

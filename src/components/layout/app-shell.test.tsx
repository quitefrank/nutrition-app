import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './app-shell'
import { useScan } from '@/hooks/use-scan'

const mockPush = vi.fn()
let mockPathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}))

// Mock CameraModal — tested separately, avoid camera API dependencies in AppShell tests
vi.mock('@/components/scan/camera-modal', () => ({
  CameraModal: ({ onClose, onCapture }: { onClose: () => void; onCapture: (imageBase64: string, mimeType: string, thumbUrl: string) => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'camera-modal' },
      React.createElement(
        'button',
        { onClick: onClose, 'aria-label': 'Close camera' },
        'Close'
      ),
      React.createElement(
        'button',
        { onClick: () => onCapture('base64data', 'image/jpeg', 'blob:thumb'), 'aria-label': 'Simulate capture' },
        'Capture'
      )
    ),
}))

// Mock ProcessingStrip — tested separately
vi.mock('@/components/scan/processing-strip', () => ({
  ProcessingStrip: () => React.createElement('div', { 'data-testid': 'processing-strip' }),
}))

// Mock ErrorState — tested separately
vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({ onRetry, onUploadInstead }: { message: string; onRetry: () => void; onUploadInstead?: () => void }) =>
    React.createElement('div', { 'data-testid': 'error-state' },
      React.createElement('button', { onClick: onRetry, 'aria-label': 'Retry scan' }, 'Retry'),
      onUploadInstead && React.createElement('button', { onClick: onUploadInstead, 'aria-label': 'Try uploading a photo instead' }, 'Upload instead'),
    ),
}))

// Mock useScan so we can control status in tests
vi.mock('@/hooks/use-scan')

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function renderWithQueryClient(ui: React.ReactElement) {
  const Wrapper = createWrapper()
  return render(React.createElement(Wrapper, null, ui))
}

const mockSubmitScan = vi.fn()
const mockCancelScan = vi.fn()
const mockReset = vi.fn()
const mockRetry = vi.fn()

function mockUseScanWith(overrides: Partial<ReturnType<typeof useScan>> = {}) {
  vi.mocked(useScan).mockReturnValue({
    status: 'idle',
    scanId: null,
    thumbnailUrl: null,
    submitScan: mockSubmitScan,
    cancelScan: mockCancelScan,
    reset: mockReset,
    retry: mockRetry,
    ...overrides,
  })
}

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/'
    mockUseScanWith()
  })

  it('renders children', () => {
    renderWithQueryClient(
      React.createElement(AppShell, null, React.createElement('div', { 'data-testid': 'child' }, 'content'))
    )
    expect(screen.getByTestId('child')).toBeDefined()
  })

  it('renders the tab bar', () => {
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    expect(screen.getByTestId('glass-tab-bar')).toBeDefined()
  })

  it('navigates to home route on home tab change', () => {
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    fireEvent.click(screen.getByTestId('tab-home'))
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('navigates to /search on search tab change', () => {
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    fireEvent.click(screen.getByTestId('tab-search'))
    expect(mockPush).toHaveBeenCalledWith('/search')
  })

  it('navigates to /grocery on grocery tab change', () => {
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    fireEvent.click(screen.getByTestId('tab-grocery'))
    expect(mockPush).toHaveBeenCalledWith('/grocery')
  })

  it('opens camera modal when FAB is clicked', () => {
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    expect(screen.queryByTestId('camera-modal')).toBeNull()
    fireEvent.click(screen.getByLabelText('Open camera'))
    expect(screen.getByTestId('camera-modal')).toBeDefined()
  })

  it('closes camera modal when dismiss button is clicked', () => {
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    fireEvent.click(screen.getByLabelText('Open camera'))
    expect(screen.getByTestId('camera-modal')).toBeDefined()
    fireEvent.click(screen.getByLabelText('Close camera'))
    expect(screen.queryByTestId('camera-modal')).toBeNull()
  })

  it('derives active tab from pathname — home at /', () => {
    mockPathname = '/'
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    expect(screen.getByTestId('tab-home').getAttribute('aria-current')).toBe('page')
  })

  it('derives active tab from pathname — search at /search', () => {
    mockPathname = '/search'
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    expect(screen.getByTestId('tab-search').getAttribute('aria-current')).toBe('page')
  })

  it('derives active tab from pathname — grocery at /grocery', () => {
    mockPathname = '/grocery'
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    expect(screen.getByTestId('tab-grocery').getAttribute('aria-current')).toBe('page')
  })

  it('ErrorState is NOT rendered when showStrip is false (initial state)', () => {
    mockUseScanWith({ status: 'error' })
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    expect(screen.queryByTestId('error-state')).toBeNull()
  })

  it('ErrorState renders when status is error and showStrip is true', () => {
    mockUseScanWith({ status: 'error' })
    vi.useFakeTimers()
    try {
      renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
      // Open camera and simulate capture to trigger showStrip
      fireEvent.click(screen.getByLabelText('Open camera'))
      fireEvent.click(screen.getByLabelText('Simulate capture'))
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.getByTestId('error-state')).toBeDefined()
      expect(screen.queryByTestId('processing-strip')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ProcessingStrip renders when status is processing (not ErrorState)', () => {
    mockUseScanWith({ status: 'processing' })
    vi.useFakeTimers()
    try {
      renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
      fireEvent.click(screen.getByLabelText('Open camera'))
      fireEvent.click(screen.getByLabelText('Simulate capture'))
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.getByTestId('processing-strip')).toBeDefined()
      expect(screen.queryByTestId('error-state')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clicking retry in ErrorState triggers retry()', () => {
    mockUseScanWith({ status: 'error' })
    vi.useFakeTimers()
    try {
      renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
      fireEvent.click(screen.getByLabelText('Open camera'))
      fireEvent.click(screen.getByLabelText('Simulate capture'))
      act(() => { vi.advanceTimersByTime(300) })
      fireEvent.click(screen.getByLabelText('Retry scan'))
      expect(mockRetry).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clicking upload-instead in ErrorState calls cancelScan, hides strip, opens camera modal', () => {
    mockUseScanWith({ status: 'error' })
    vi.useFakeTimers()
    try {
      renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
      fireEvent.click(screen.getByLabelText('Open camera'))
      fireEvent.click(screen.getByLabelText('Simulate capture'))
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.getByTestId('error-state')).toBeDefined()
      fireEvent.click(screen.getByLabelText('Try uploading a photo instead'))
      expect(mockCancelScan).toHaveBeenCalledOnce()
      expect(screen.queryByTestId('error-state')).toBeNull()
      expect(screen.getByTestId('camera-modal')).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

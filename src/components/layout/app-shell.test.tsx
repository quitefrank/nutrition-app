import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// Mock useOnlineStatus — default online
vi.mock('@/hooks/use-online-status', () => ({
  useOnlineStatus: vi.fn(() => true),
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

import { useOnlineStatus } from '@/hooks/use-online-status'
const mockUseOnlineStatus = vi.mocked(useOnlineStatus)

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
    vi.unstubAllGlobals()
    sessionStorage.clear()
    mockPathname = '/'
    mockUseScanWith()
    mockUseOnlineStatus.mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  // ─── Notification permission tests (AC2, AC3) ────────────────────────────

  it('requests notification permission when processing strip first appears in session', () => {
    const requestPermissionMock = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: requestPermissionMock })

    mockUseScanWith({ status: 'processing' })
    vi.useFakeTimers()
    try {
      renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
      fireEvent.click(screen.getByLabelText('Open camera'))
      fireEvent.click(screen.getByLabelText('Simulate capture'))
      // runAllTimers fires the 300ms strip timer and the nested 0ms permission timer
      act(() => { vi.runAllTimers() })
      expect(requestPermissionMock).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not re-request notification permission if sessionStorage key is set', () => {
    sessionStorage.setItem('plately_notif_asked', 'true')
    const requestPermissionMock = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: requestPermissionMock })

    mockUseScanWith({ status: 'processing' })
    vi.useFakeTimers()
    try {
      renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
      fireEvent.click(screen.getByLabelText('Open camera'))
      fireEvent.click(screen.getByLabelText('Simulate capture'))
      act(() => { vi.runAllTimers() })
      expect(requestPermissionMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not request permission when Notification API is unavailable (SSR / older browser)', () => {
    // JSDOM has no Notification API by default — the guard should prevent any access.
    // Any previous stub is cleared in beforeEach via vi.unstubAllGlobals().
    // Deleting any leftover stub ensures the key is absent from window.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ('Notification' in window) delete (window as unknown as Record<string, unknown>)['Notification']

    mockUseScanWith({ status: 'processing' })
    vi.useFakeTimers()
    try {
      // Should not throw when Notification is absent from window
      expect(() => {
        renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
        fireEvent.click(screen.getByLabelText('Open camera'))
        fireEvent.click(screen.getByLabelText('Simulate capture'))
        act(() => { vi.runAllTimers() })
      }).not.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not show warning or degrade functionality when notification permission is denied (AC3)', () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })

    mockUseScanWith({ status: 'processing' })
    vi.useFakeTimers()
    try {
      renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
      fireEvent.click(screen.getByLabelText('Open camera'))
      fireEvent.click(screen.getByLabelText('Simulate capture'))
      act(() => { vi.runAllTimers() })
      // No permission request made — denied permission is skipped silently
      expect(vi.mocked(window.Notification.requestPermission)).not.toHaveBeenCalled()
      // No error or warning UI rendered
      expect(screen.queryByTestId('error-state')).toBeNull()
      // FAB still accessible (no functional degradation)
      expect(screen.getByLabelText('Open camera')).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  // ─── Offline FAB tests (AC4) ──────────────────────────────────────────────

  it('FAB is marked aria-disabled when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false)
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    const fab = screen.getByLabelText('Open camera')
    expect(fab.getAttribute('aria-disabled')).toBe('true')
  })

  it('camera modal does not open when FAB is tapped offline', () => {
    mockUseOnlineStatus.mockReturnValue(false)
    renderWithQueryClient(React.createElement(AppShell, null, React.createElement('div')))
    fireEvent.click(screen.getByLabelText('Open camera'))
    expect(screen.queryByTestId('camera-modal')).toBeNull()
  })
})

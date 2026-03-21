import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './app-shell'

const mockPush = vi.fn()
let mockPathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}))

// Mock CameraModal — tested separately, avoid camera API dependencies in AppShell tests
vi.mock('@/components/scan/camera-modal', () => ({
  CameraModal: ({ onClose }: { onClose: () => void; onCapture: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'camera-modal' },
      React.createElement(
        'button',
        { onClick: onClose, 'aria-label': 'Close camera' },
        'Close'
      )
    ),
}))

// Mock ProcessingStrip — tested separately
vi.mock('@/components/scan/processing-strip', () => ({
  ProcessingStrip: () => React.createElement('div', { 'data-testid': 'processing-strip' }),
}))

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

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/'
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
})

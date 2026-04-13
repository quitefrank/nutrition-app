/**
 * CameraModal — Gemini scan degraded states (Story 6.5 AC1)
 *
 * Augments CameraModal.test.tsx with comprehensive coverage of the
 * inline ScanErrorOverlay behaviour when /api/scan fails.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { CameraModal } from './CameraModal'

// ─── Navigator mocks ──────────────────────────────────────────────────────────

const mockGetUserMedia = vi.fn()
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
})

Object.defineProperty(global.navigator, 'permissions', {
  value: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
  writable: true,
})

// ─── Fetch mock ───────────────────────────────────────────────────────────────

global.fetch = vi.fn()

// ─── SessionStorage mock ──────────────────────────────────────────────────────

const mockSS: Record<string, string> = {}
Object.defineProperty(global, 'sessionStorage', {
  value: {
    getItem: vi.fn((key: string) => mockSS[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { mockSS[key] = val }),
    removeItem: vi.fn((key: string) => { delete mockSS[key] }),
    length: 0,
    key: () => null,
    clear: vi.fn(),
  },
  writable: true,
})

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/imageUtils', () => ({
  compressImage: vi.fn((blob: Blob) => Promise.resolve(blob)),
}))

vi.mock('@/lib/supabaseAutoSave', () => ({
  autoSaveToSupabase: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/retakeMergeAndSave', () => ({
  retakeMergeAndSave: vi.fn().mockResolvedValue(0),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeStream = {
  getTracks: () => [{ stop: vi.fn() }],
}

function makeScanError(code: string, status = 503) {
  return {
    ok: false,
    json: () => Promise.resolve({
      error: { message: `Scan service temporarily unavailable`, code },
    }),
    status,
  }
}

function makeProps(overrides: Partial<Parameters<typeof CameraModal>[0]> = {}) {
  return {
    open: false,
    onClose: vi.fn(),
    onProcessingStart: vi.fn(),
    onProcessingComplete: vi.fn(),
    onProcessingError: vi.fn(),
    ...overrides,
  }
}

async function triggerScanWithFile(errorResponse: object) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(errorResponse)
  const fileInput = screen.getByLabelText('Upload image file') as HTMLInputElement
  const file = new File(['fake-menu'], 'menu.jpg', { type: 'image/jpeg' })
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [file] } })
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CameraModal — Gemini scan degraded states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockSS).forEach(k => delete mockSS[k])
    mockGetUserMedia.mockResolvedValue(fakeStream)
  })

  it('shows ScanErrorOverlay when /api/scan returns 503 AI_UNAVAILABLE', async () => {
    render(<CameraModal {...makeProps({ open: true })} />)
    await waitFor(() => screen.getByRole('dialog'))
    await triggerScanWithFile(makeScanError('AI_UNAVAILABLE'))
    await waitFor(() => expect(screen.queryByTestId('scan-error-overlay')).not.toBeNull())
  })

  it('shows ScanErrorOverlay when /api/scan returns 503 SCAN_SERVICE_UNAVAILABLE', async () => {
    render(<CameraModal {...makeProps({ open: true })} />)
    await waitFor(() => screen.getByRole('dialog'))
    await triggerScanWithFile(makeScanError('SCAN_SERVICE_UNAVAILABLE'))
    await waitFor(() => expect(screen.queryByTestId('scan-error-overlay')).not.toBeNull())
  })

  it('shows ScanErrorOverlay on network failure (fetch throws)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<CameraModal {...makeProps({ open: true })} />)
    await waitFor(() => screen.getByRole('dialog'))

    const fileInput = screen.getByLabelText('Upload image file') as HTMLInputElement
    const file = new File(['fake-menu'], 'menu.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    await waitFor(() => expect(screen.queryByTestId('scan-error-overlay')).not.toBeNull())
  })

  it('ScanErrorOverlay has dusty rose tint (background contains rgba(188, 108, 110))', async () => {
    render(<CameraModal {...makeProps({ open: true })} />)
    await waitFor(() => screen.getByRole('dialog'))
    await triggerScanWithFile(makeScanError('AI_UNAVAILABLE'))
    const overlay = await waitFor(() => screen.getByTestId('scan-error-overlay'))
    const bg = (overlay as HTMLElement).style.background
    expect(bg).toContain('rgba(188, 108, 110')
  })

  it('ScanErrorOverlay renders "Try again" retry button', async () => {
    render(<CameraModal {...makeProps({ open: true })} />)
    await waitFor(() => screen.getByRole('dialog'))
    await triggerScanWithFile(makeScanError('AI_UNAVAILABLE'))
    await waitFor(() => expect(screen.queryByLabelText('Retry scan')).not.toBeNull())
    expect(screen.getByLabelText('Retry scan').textContent).toContain('Try again')
  })

  it('clicking retry clears ScanErrorOverlay and restarts camera', async () => {
    render(<CameraModal {...makeProps({ open: true })} />)
    await waitFor(() => screen.getByRole('dialog'))
    await triggerScanWithFile(makeScanError('AI_UNAVAILABLE'))
    await waitFor(() => expect(screen.queryByTestId('scan-error-overlay')).not.toBeNull())

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Retry scan'))
    })

    await waitFor(() => expect(screen.queryByTestId('scan-error-overlay')).toBeNull())
    // Camera restart was attempted (getUserMedia called again)
    expect(mockGetUserMedia).toHaveBeenCalled()
  })

  it('modal stays open (does not call onClose) when scan fails', async () => {
    const onClose = vi.fn()
    render(<CameraModal {...makeProps({ open: true, onClose })} />)
    await waitFor(() => screen.getByRole('dialog'))
    await triggerScanWithFile(makeScanError('AI_UNAVAILABLE'))
    await waitFor(() => expect(screen.queryByTestId('scan-error-overlay')).not.toBeNull())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('onProcessingError is NOT called when scan fails (inline error only)', async () => {
    const onProcessingError = vi.fn()
    render(<CameraModal {...makeProps({ open: true, onProcessingError })} />)
    await waitFor(() => screen.getByRole('dialog'))
    await triggerScanWithFile(makeScanError('AI_UNAVAILABLE'))
    await waitFor(() => expect(screen.queryByTestId('scan-error-overlay')).not.toBeNull())
    expect(onProcessingError).not.toHaveBeenCalled()
  })

  it('onProcessingError IS called when cameraError occurs (hardware failure)', async () => {
    // Camera hardware failure (getUserMedia rejection) calls onProcessingError so the
    // parent (AppShell) can close the modal and surface the error via ProcessingStrip.
    // This path is distinct from Gemini scan failures which show inline (ScanErrorOverlay).
    mockGetUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
    ;(navigator.permissions.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ state: 'granted' })

    const onProcessingError = vi.fn()
    render(<CameraModal {...makeProps({ open: true, onProcessingError })} />)
    await waitFor(() => screen.getByRole('dialog'))

    // Camera error text appears in the viewfinder
    await waitFor(() => expect(screen.queryByText(/camera unavailable/i)).not.toBeNull())
    // The ScanErrorOverlay is NOT shown for a hardware error
    expect(screen.queryByTestId('scan-error-overlay')).toBeNull()
    // P1: onProcessingError IS called for hardware failures (not for Gemini scan failures)
    expect(onProcessingError).toHaveBeenCalledWith(expect.stringMatching(/camera unavailable/i))
  })

  it('ScanErrorOverlay is absent when scan succeeds', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          type: 'menu',
          restaurantName: 'Test Bistro',
          dishes: [{ id: 'dish-1', name: 'Pasta', description: '', confidence: 0.95 }],
        },
      }),
    })

    render(<CameraModal {...makeProps({ open: true })} />)
    await waitFor(() => screen.getByRole('dialog'))

    const fileInput = screen.getByLabelText('Upload image file') as HTMLInputElement
    const file = new File(['fake-menu'], 'menu.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    // Give enough time for any async state update
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('scan-error-overlay')).toBeNull()
  })

  it('ScanErrorOverlay is absent when modal is first opened', async () => {
    render(<CameraModal {...makeProps({ open: true })} />)
    await waitFor(() => screen.getByRole('dialog'))
    expect(screen.queryByTestId('scan-error-overlay')).toBeNull()
  })

  it('ScanErrorOverlay is cleared when the modal closes and reopens', async () => {
    const { rerender } = render(<CameraModal {...makeProps({ open: true })} />)
    await waitFor(() => screen.getByRole('dialog'))
    await triggerScanWithFile(makeScanError('AI_UNAVAILABLE'))
    await waitFor(() => expect(screen.queryByTestId('scan-error-overlay')).not.toBeNull())

    // Close modal
    await act(async () => {
      rerender(<CameraModal {...makeProps({ open: false })} />)
    })

    // Reopen
    await act(async () => {
      rerender(<CameraModal {...makeProps({ open: true })} />)
    })
    await waitFor(() => screen.getByRole('dialog'))
    // Error is cleared on reopen
    expect(screen.queryByTestId('scan-error-overlay')).toBeNull()
  })
})

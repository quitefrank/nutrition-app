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
const sessionStorageMock = {
  getItem: vi.fn((key: string) => mockSS[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { mockSS[key] = val }),
  removeItem: vi.fn((key: string) => { delete mockSS[key] }),
  length: 0,
  key: () => null,
  clear: vi.fn(),
}
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock, writable: true })

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/imageUtils', () => ({
  compressImage: vi.fn((blob: Blob) => Promise.resolve(blob)),
}))

vi.mock('@/lib/supabaseAutoSave', () => ({
  autoSaveToSupabase: vi.fn().mockResolvedValue(null),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeStream = {
  getTracks: () => [{ stop: vi.fn() }],
}

function makeScanSuccess() {
  return {
    ok: true,
    json: () => Promise.resolve({
      data: {
        type: 'menu' as const,
        restaurantName: 'Test Bistro',
        dishes: [{ id: 'dish-1', name: 'Pasta', description: 'Tomato pasta', confidence: 0.95 }],
      },
    }),
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CameraModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockSS).forEach(k => delete mockSS[k])
    mockGetUserMedia.mockResolvedValue(fakeStream)
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeScanSuccess())
  })

  // ── rendering ──────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders null when open=false', () => {
      const { container } = render(<CameraModal {...makeProps({ open: false })} />)
      expect(container.querySelector('[role="dialog"]')).toBeNull()
    })

    it('renders modal when open=true with role="dialog" and aria-modal', async () => {
      render(<CameraModal {...makeProps({ open: true })} />)
      const dialog = await waitFor(() => screen.getByRole('dialog'))
      expect(dialog).toBeDefined()
      expect(dialog.getAttribute('aria-modal')).toBe('true')
    })
  })

  // ── dismiss ────────────────────────────────────────────────────────────────

  describe('dismiss', () => {
    it('X button calls onClose', async () => {
      const onClose = vi.fn()
      render(<CameraModal {...makeProps({ open: true, onClose })} />)
      await waitFor(() => screen.getByLabelText('Close camera'))
      fireEvent.click(screen.getByLabelText('Close camera'))
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('swipe-down > 80px calls onClose', async () => {
      const onClose = vi.fn()
      render(<CameraModal {...makeProps({ open: true, onClose })} />)
      const dialog = await waitFor(() => screen.getByRole('dialog'))
      fireEvent.pointerDown(dialog, { clientY: 100 })
      fireEvent.pointerUp(dialog, { clientY: 190 }) // delta = 90 > 80
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('swipe-down ≤ 80px does NOT call onClose', async () => {
      const onClose = vi.fn()
      render(<CameraModal {...makeProps({ open: true, onClose })} />)
      const dialog = await waitFor(() => screen.getByRole('dialog'))
      fireEvent.pointerDown(dialog, { clientY: 100 })
      fireEvent.pointerUp(dialog, { clientY: 175 }) // delta = 75 ≤ 80
      expect(onClose).not.toHaveBeenCalled()
    })

    it('swipe-down exactly 80px does NOT call onClose (guard is strict >80)', async () => {
      const onClose = vi.fn()
      render(<CameraModal {...makeProps({ open: true, onClose })} />)
      const dialog = await waitFor(() => screen.getByRole('dialog'))
      fireEvent.pointerDown(dialog, { clientY: 100 })
      fireEvent.pointerUp(dialog, { clientY: 180 }) // delta = 80, not > 80
      expect(onClose).not.toHaveBeenCalled()
    })

    it('pointerDown on child element does NOT trigger dismiss on pointerUp', async () => {
      const onClose = vi.fn()
      render(<CameraModal {...makeProps({ open: true, onClose })} />)
      await waitFor(() => screen.getByRole('dialog'))

      const closeBtn = screen.getByLabelText('Close camera')
      const dialog = screen.getByRole('dialog')

      // pointerDown on child (close button) — target ≠ currentTarget on dialog
      await act(async () => {
        fireEvent.pointerDown(closeBtn, { clientY: 100 })
      })
      // pointerUp on dialog with large delta — should NOT close via swipe
      await act(async () => {
        fireEvent.pointerUp(dialog, { clientY: 200 })
      })
      expect(onClose).not.toHaveBeenCalled()
    })

    it('dragStartY resets on close; no stale dismiss on reopen', async () => {
      const onClose = vi.fn()
      const { rerender } = render(<CameraModal {...makeProps({ open: true, onClose })} />)
      const dialog = await waitFor(() => screen.getByRole('dialog'))

      // Start a drag on the dialog background
      await act(async () => {
        fireEvent.pointerDown(dialog, { clientY: 100 })
      })

      // Close without completing the swipe (parent re-renders with open=false)
      await act(async () => {
        rerender(<CameraModal {...makeProps({ open: false, onClose })} />)
      })

      // Reopen
      await act(async () => {
        rerender(<CameraModal {...makeProps({ open: true, onClose })} />)
      })
      const newDialog = await waitFor(() => screen.getByRole('dialog'))

      // pointerUp with a large delta — without the reset, stale dragStartY=100 would
      // cause handleClose to fire (190-100=90 > 80). With the reset it's a no-op.
      await act(async () => {
        fireEvent.pointerUp(newDialog, { clientY: 190 })
      })
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  // ── sessionStorage key format ──────────────────────────────────────────────

  describe('sessionStorage key format', () => {
    it('after successful scan, sessionStorage key starts with "plately:scan:"', async () => {
      const onProcessingComplete = vi.fn()
      render(<CameraModal {...makeProps({ open: true, onProcessingComplete })} />)
      await waitFor(() => screen.getByRole('dialog'))

      const fileInput = screen.getByLabelText('Upload image file') as HTMLInputElement
      const file = new File(['fake-menu'], 'menu.jpg', { type: 'image/jpeg' })
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } })
      })

      await waitFor(() => expect(onProcessingComplete).toHaveBeenCalled())
      const scanKey = onProcessingComplete.mock.calls[0][0] as string
      expect(scanKey).toMatch(/^plately:scan:/)
    })
  })

  // ── error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('nested error format { error: { message } } is read correctly', async () => {
      const onProcessingError = vi.fn()
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'AI is unavailable', code: 'AI_UNAVAILABLE' } }),
      })

      render(<CameraModal {...makeProps({ open: true, onProcessingError })} />)
      await waitFor(() => screen.getByRole('dialog'))

      const fileInput = screen.getByLabelText('Upload image file') as HTMLInputElement
      const file = new File(['fake-menu'], 'menu.jpg', { type: 'image/jpeg' })
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } })
      })

      await waitFor(() => expect(onProcessingError).toHaveBeenCalled())
      expect(onProcessingError).toHaveBeenCalledWith('AI is unavailable')
      // Modal stays open — user can retake (AC5)
      expect(screen.queryByRole('dialog')).not.toBeNull()
    })

    it('flat error format { error: string } passes the message to onProcessingError (fallback)', async () => {
      const onProcessingError = vi.fn()
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Something went wrong' }),
      })

      render(<CameraModal {...makeProps({ open: true, onProcessingError })} />)
      await waitFor(() => screen.getByRole('dialog'))

      const fileInput = screen.getByLabelText('Upload image file') as HTMLInputElement
      const file = new File(['fake-menu'], 'menu.jpg', { type: 'image/jpeg' })
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } })
      })

      await waitFor(() => expect(onProcessingError).toHaveBeenCalled())
      expect(onProcessingError).toHaveBeenCalledWith('Something went wrong')
      // Modal stays open — user can retake (AC5)
      expect(screen.queryByRole('dialog')).not.toBeNull()
    })
  })

  // ── scan flow ─────────────────────────────────────────────────────────────

  describe('scan flow', () => {
    it('capture button is disabled when camera is not ready', async () => {
      // Make getUserMedia hang so camera never becomes ready
      mockGetUserMedia.mockReturnValue(new Promise(() => {}))
      ;(navigator.permissions.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ state: 'granted' })

      render(<CameraModal {...makeProps({ open: true })} />)
      await waitFor(() => screen.getByRole('dialog'))

      const captureBtn = screen.getByLabelText('Capture photo') as HTMLButtonElement
      expect(captureBtn.disabled).toBe(true)
    })
  })
})

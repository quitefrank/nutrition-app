import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
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

// ─── Hoisted mock refs ────────────────────────────────────────────────────────

const { mockRetakeMergeAndSave } = vi.hoisted(() => ({
  mockRetakeMergeAndSave: vi.fn().mockResolvedValue(3),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/imageUtils', () => ({
  compressImage: vi.fn((blob: Blob) => Promise.resolve(blob)),
}))

vi.mock('@/lib/supabaseAutoSave', () => ({
  autoSaveToSupabase: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/retakeMergeAndSave', () => ({
  retakeMergeAndSave: mockRetakeMergeAndSave,
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

function makeScanSuccess() {
  return {
    ok: true,
    json: () => Promise.resolve({
      data: {
        type: 'menu' as const,
        restaurantName: 'Test Bistro',
        dishes: [
          { id: 'dish-1', name: 'Tiramisu', description: 'Italian dessert', confidence: 0.9 },
          { id: 'dish-2', name: 'Carbonara', description: 'Pasta dish', confidence: 0.88 },
        ],
        totalDetected: 2,
      },
    }),
  }
}

function makeScanProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    onProcessingStart: vi.fn(),
    onProcessingComplete: vi.fn(),
    onProcessingError: vi.fn(),
    ...overrides,
  }
}

function makeRetakeProps(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'retake' as const,
    restaurantId: 'rest-abc',
    restaurantName: 'Test Bistro',
    existingDishNames: ['pasta carbonara'],
    totalDetected: 5,
    onClose: vi.fn(),
    onRetakeMerged: vi.fn(),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CameraModal — retake mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockSS).forEach(k => delete mockSS[k])
    mockGetUserMedia.mockResolvedValue(fakeStream)
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeScanSuccess())
    mockRetakeMergeAndSave.mockResolvedValue(3)
  })

  it('renders retake context header when mode="retake"', async () => {
    render(
      <CameraModal
        {...makeRetakeProps({
          existingDishNames: ['pasta carbonara', 'risotto'],
          totalDetected: 5,
        })}
      />
    )

    await waitFor(() => {
      // header shows captured count
      expect(screen.getByText(/2 dishes captured/i)).toBeTruthy()
    })
  })

  it('retake header shows correct captured count and remaining count', async () => {
    render(
      <CameraModal
        {...makeRetakeProps({
          existingDishNames: ['pasta carbonara', 'risotto'],
          totalDetected: 5,
        })}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/2 dishes captured/i)).toBeTruthy()
      // remaining = 5 - 2 = 3
      expect(screen.getByText(/remaining 3/i)).toBeTruthy()
    })
  })

  it('does NOT render retake header when mode="scan" (default)', async () => {
    render(<CameraModal {...makeScanProps()} />)

    await waitFor(() => screen.getByRole('dialog'))
    // Wait briefly to ensure no header appears
    expect(screen.queryByText(/dishes captured/i)).toBeNull()
  })

  it('calls onRetakeMerged with new recipe count after successful scan', async () => {
    const onRetakeMerged = vi.fn()
    mockRetakeMergeAndSave.mockResolvedValue(2)

    render(
      <CameraModal
        {...makeRetakeProps({ onRetakeMerged })}
      />
    )

    await waitFor(() => screen.getByRole('dialog'))

    const fileInput = screen.getByLabelText('Upload image file') as HTMLInputElement
    const file = new File(['fake-menu'], 'menu.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(onRetakeMerged).toHaveBeenCalledWith(2)
    })
  })

  it('writes a plately_scan_* sessionStorage entry with restaurantPlaceId after successful retake', async () => {
    mockRetakeMergeAndSave.mockResolvedValue(2)

    render(
      <CameraModal
        {...makeRetakeProps({
          restaurantId: 'rest-abc',
        })}
        placeId="place-xyz"
      />
    )

    await waitFor(() => screen.getByRole('dialog'))

    const fileInput = screen.getByLabelText('Upload image file') as HTMLInputElement
    const file = new File(['fake-menu'], 'menu.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    await waitFor(() => {
      // Check that sessionStorage.setItem was called with a plately_scan_* key
      const ssSetItem = sessionStorage.setItem as ReturnType<typeof vi.fn>
      const retakeEntry = ssSetItem.mock.calls.find(
        ([key]: [string]) => typeof key === 'string' && key.startsWith('plately_scan_')
      )
      expect(retakeEntry).toBeDefined()
      if (retakeEntry) {
        const parsed = JSON.parse(retakeEntry[1] as string)
        expect(parsed.restaurantPlaceId).toBe('place-xyz')
      }
    })
  })

  it('falls back to autoSaveToSupabase when restaurantId is null in retake mode', async () => {
    const { autoSaveToSupabase } = await import('@/lib/supabaseAutoSave')
    const onProcessingComplete = vi.fn()

    render(
      <CameraModal
        {...makeRetakeProps({
          restaurantId: null,
          onProcessingComplete,
          // also provide scan mode handlers so fallback can call them
          onProcessingStart: vi.fn(),
          onProcessingError: vi.fn(),
        })}
      />
    )

    await waitFor(() => screen.getByRole('dialog'))

    const fileInput = screen.getByLabelText('Upload image file') as HTMLInputElement
    const file = new File(['fake-menu'], 'menu.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(autoSaveToSupabase).toHaveBeenCalled()
    })
  })
})

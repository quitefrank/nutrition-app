import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ScanConfirmationOverlay } from './ScanConfirmationOverlay'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabaseAutoSave', () => ({
  autoSaveToSupabase: vi.fn(),
}))

vi.mock('@/components/scan/RestaurantConfirmation', () => ({
  RestaurantConfirmation: ({
    onConfirm,
    onSkip,
    extractedName,
  }: {
    onConfirm: (r: { placeId: string; name: string }) => void
    onSkip: () => void
    extractedName?: string | null
  }) => (
    <div data-testid="restaurant-confirmation">
      <span data-testid="extracted-name">{extractedName ?? ''}</span>
      <button onClick={() => onConfirm({ placeId: '', name: 'Test Restaurant' })}>
        Confirm
      </button>
      <button onClick={onSkip}>Skip</button>
    </div>
  ),
}))

vi.mock('@/components/scan/AutoCaptureToast', () => ({
  AutoCaptureToast: ({
    restaurantName,
    dishCount,
    onDismiss,
  }: {
    restaurantName: string
    dishCount: number
    onDismiss: () => void
  }) => (
    <div data-testid="auto-capture-toast">
      <span data-testid="toast-name">{restaurantName}</span>
      <span data-testid="toast-count">{dishCount}</span>
      <button data-testid="toast-dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  ),
}))

import { autoSaveToSupabase } from '@/lib/supabaseAutoSave'
const mockAutoSave = vi.mocked(autoSaveToSupabase)

// ─── sessionStorage helpers ────────────────────────────────────────────────────

const SCAN_KEY = 'plately:scan:test-uuid'
const SCAN_RESULT = {
  type: 'menu',
  restaurantName: 'Gemini Restaurant',
  allDishes: [{ name: 'Pad Thai' }, { name: 'Tom Yum' }],
  enriched: false,
}

function seedStorage(key: string, value: object) {
  sessionStorage.setItem(key, JSON.stringify(value))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScanConfirmationOverlay', () => {
  const onComplete = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockAutoSave.mockResolvedValue({ 'dish-1': 'recipe-uuid-1', 'dish-2': 'recipe-uuid-2' })
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  // ── P10: sessionStorage unavailable ──────────────────────────────────────

  it('calls onClose when scanKey does not exist in sessionStorage', async () => {
    // Do NOT seed sessionStorage
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
    expect(onComplete).not.toHaveBeenCalled()
    expect(screen.queryByTestId('restaurant-confirmation')).toBeNull()
  })

  // ── Happy path: confirm ────────────────────────────────────────────────────

  it('renders RestaurantConfirmation with extracted name', () => {
    seedStorage(SCAN_KEY, SCAN_RESULT)
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    expect(screen.getByTestId('restaurant-confirmation')).toBeTruthy()
    expect(screen.getByTestId('extracted-name').textContent).toBe('Gemini Restaurant')
  })

  it('calls autoSaveToSupabase after user confirms', async () => {
    seedStorage(SCAN_KEY, SCAN_RESULT)
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(mockAutoSave).toHaveBeenCalledWith(SCAN_KEY)
    })
  })

  it('shows AutoCaptureToast with correct name and dish count after save', async () => {
    seedStorage(SCAN_KEY, SCAN_RESULT)
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByTestId('auto-capture-toast')).toBeTruthy()
    })
    expect(screen.getByTestId('toast-name').textContent).toBe('Test Restaurant')
    // savedCount = Object.keys(map).length = 2
    expect(screen.getByTestId('toast-count').textContent).toBe('2')
  })

  it('calls onComplete with firstRecipeId when toast is dismissed (P1: single timer path)', async () => {
    seedStorage(SCAN_KEY, SCAN_RESULT)
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByTestId('auto-capture-toast')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('toast-dismiss'))
    expect(onComplete).toHaveBeenCalledWith('recipe-uuid-1')
    expect(onClose).not.toHaveBeenCalled()
  })

  // ── Save error path ────────────────────────────────────────────────────────

  it('calls onComplete(null) when autoSaveToSupabase throws', async () => {
    seedStorage(SCAN_KEY, SCAN_RESULT)
    mockAutoSave.mockRejectedValue(new Error('Network error'))
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(null)
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not show toast when save fails', async () => {
    seedStorage(SCAN_KEY, SCAN_RESULT)
    mockAutoSave.mockRejectedValue(new Error('Network error'))
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled()
    })
    expect(screen.queryByTestId('auto-capture-toast')).toBeNull()
  })

  // ── Skip path ─────────────────────────────────────────────────────────────

  it('calls autoSaveToSupabase when user skips', async () => {
    seedStorage(SCAN_KEY, SCAN_RESULT)
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => {
      expect(mockAutoSave).toHaveBeenCalledWith(SCAN_KEY)
    })
  })

  it('shows toast with snapshotted restaurant name on skip (P5: avoids stale re-read)', async () => {
    seedStorage(SCAN_KEY, SCAN_RESULT)
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => {
      expect(screen.getByTestId('auto-capture-toast')).toBeTruthy()
    })
    // Name is snapshotted from initial render (extractedName), not re-read post-save
    expect(screen.getByTestId('toast-name').textContent).toBe('Gemini Restaurant')
  })

  it('uses "Restaurant" as fallback name on skip when restaurantName is null', async () => {
    seedStorage(SCAN_KEY, { ...SCAN_RESULT, restaurantName: null })
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => {
      expect(screen.getByTestId('auto-capture-toast')).toBeTruthy()
    })
    expect(screen.getByTestId('toast-name').textContent).toBe('Restaurant')
  })

  it('calls onComplete(null) on save error from skip path', async () => {
    seedStorage(SCAN_KEY, SCAN_RESULT)
    mockAutoSave.mockRejectedValue(new Error('Network error'))
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(null)
    })
  })

  // ── Saving indicator ───────────────────────────────────────────────────────

  it('shows saving indicator while autoSaveToSupabase is in-flight (P8)', async () => {
    seedStorage(SCAN_KEY, SCAN_RESULT)
    // Use a promise that we control so we can observe the saving state
    let resolveSave!: (v: Record<string, string> | null) => void
    mockAutoSave.mockImplementation(
      () => new Promise<Record<string, string> | null>((res) => { resolveSave = res })
    )
    render(
      <ScanConfirmationOverlay scanKey={SCAN_KEY} onComplete={onComplete} onClose={onClose} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    // Saving indicator should appear, confirmation card should be hidden
    await waitFor(() => {
      expect(screen.getByText('Saving dishes…')).toBeTruthy()
    })
    expect(screen.queryByTestId('restaurant-confirmation')).toBeNull()

    // Resolve the save
    act(() => { resolveSave({ 'dish-1': 'recipe-uuid-1' }) })
    await waitFor(() => {
      expect(screen.getByTestId('auto-capture-toast')).toBeTruthy()
    })
  })
})

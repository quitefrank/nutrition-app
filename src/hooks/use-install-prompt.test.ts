import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstallPrompt } from './use-install-prompt'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DISMISS_KEY = 'pwa-install-dismissed-at'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

const createPromptEvent = () => {
  const event = new Event('beforeinstallprompt')
  Object.assign(event, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  })
  return event
}

function fireBeforeInstallPrompt() {
  const event = createPromptEvent()
  window.dispatchEvent(event)
  return event
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  // Default: NOT standalone
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as MediaQueryList)
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useInstallPrompt', () => {
  it('canInstall is false before beforeinstallprompt fires', () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
  })

  it('canInstall is true after beforeinstallprompt fires', async () => {
    const { result } = renderHook(() => useInstallPrompt())

    act(() => {
      fireBeforeInstallPrompt()
    })

    expect(result.current.canInstall).toBe(true)
  })

  it('canInstall is false when localStorage has a fresh dismissed timestamp on mount', () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())

    const { result } = renderHook(() => useInstallPrompt())

    act(() => {
      fireBeforeInstallPrompt()
    })

    expect(result.current.canInstall).toBe(false)
  })

  it('canInstall is true when localStorage has an expired dismissed timestamp on mount (IG1)', () => {
    const expiredAt = Date.now() - DISMISS_TTL_MS - 1000
    localStorage.setItem(DISMISS_KEY, expiredAt.toString())

    const { result } = renderHook(() => useInstallPrompt())

    act(() => {
      fireBeforeInstallPrompt()
    })

    expect(result.current.canInstall).toBe(true)
  })

  it('dismiss() sets localStorage timestamp and makes canInstall false', () => {
    const before = Date.now()
    const { result } = renderHook(() => useInstallPrompt())

    act(() => {
      fireBeforeInstallPrompt()
    })

    expect(result.current.canInstall).toBe(true)

    act(() => {
      result.current.dismiss()
    })

    const stored = localStorage.getItem(DISMISS_KEY)
    expect(stored).not.toBeNull()
    expect(parseInt(stored!, 10)).toBeGreaterThanOrEqual(before)
    expect(result.current.canInstall).toBe(false)
  })

  it('dismiss() also clears the deferred prompt reference (P5)', () => {
    const { result } = renderHook(() => useInstallPrompt())

    act(() => {
      fireBeforeInstallPrompt()
    })

    expect(result.current.canInstall).toBe(true)

    act(() => {
      result.current.dismiss()
    })

    // canInstall must be false even if a new beforeinstallprompt fires (dismissed wins)
    expect(result.current.canInstall).toBe(false)
  })

  it('promptInstall() calls event.prompt() and clears the deferred event', async () => {
    const { result } = renderHook(() => useInstallPrompt())

    let capturedEvent: ReturnType<typeof createPromptEvent> | undefined
    act(() => {
      capturedEvent = createPromptEvent() as ReturnType<typeof createPromptEvent>
      window.dispatchEvent(capturedEvent)
    })

    expect(result.current.canInstall).toBe(true)

    await act(async () => {
      await result.current.promptInstall()
    })

    expect((capturedEvent as ReturnType<typeof createPromptEvent> & { prompt: ReturnType<typeof vi.fn> }).prompt).toHaveBeenCalledOnce()
    // After prompting, deferredPrompt is cleared → canInstall false
    expect(result.current.canInstall).toBe(false)
  })

  it('promptInstall() persists localStorage dismissed timestamp after user accepts', async () => {
    const { result } = renderHook(() => useInstallPrompt())

    act(() => { fireBeforeInstallPrompt() })

    await act(async () => { await result.current.promptInstall() })

    const stored = localStorage.getItem(DISMISS_KEY)
    expect(stored).not.toBeNull()
    expect(parseInt(stored!, 10)).toBeGreaterThan(0)
  })

  it('promptInstall() persists localStorage dismissed timestamp when user dismisses native prompt', async () => {
    const { result } = renderHook(() => useInstallPrompt())

    const event = new Event('beforeinstallprompt')
    Object.assign(event, {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    })
    act(() => { window.dispatchEvent(event) })

    await act(async () => { await result.current.promptInstall() })

    const stored = localStorage.getItem(DISMISS_KEY)
    expect(stored).not.toBeNull()
  })

  it('promptInstall() calls dismiss() even if prompt() throws (P3 try/finally)', async () => {
    const { result } = renderHook(() => useInstallPrompt())

    const event = new Event('beforeinstallprompt')
    Object.assign(event, {
      prompt: vi.fn().mockRejectedValue(new Error('prompt blocked')),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    })
    act(() => { window.dispatchEvent(event) })

    await act(async () => {
      try {
        await result.current.promptInstall()
      } catch {
        // expected to throw — we care about side effects
      }
    })

    // dismiss() must have run → localStorage written
    expect(localStorage.getItem(DISMISS_KEY)).not.toBeNull()
    expect(result.current.canInstall).toBe(false)
  })

  it('promptInstall() ignores a second concurrent call (P6 guard)', async () => {
    const { result } = renderHook(() => useInstallPrompt())

    let resolvePrompt!: () => void
    const event = new Event('beforeinstallprompt')
    Object.assign(event, {
      prompt: vi.fn().mockReturnValue(new Promise<void>(res => { resolvePrompt = res })),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    act(() => { window.dispatchEvent(event) })

    // Start first call (does not await)
    let firstCallPromise!: Promise<void>
    act(() => {
      firstCallPromise = result.current.promptInstall()
    })

    // Second call while first is still in-flight
    await act(async () => {
      await result.current.promptInstall() // should be a no-op
    })

    // Only one prompt() call should have occurred
    const mockPrompt = (event as unknown as { prompt: ReturnType<typeof vi.fn> }).prompt
    expect(mockPrompt).toHaveBeenCalledTimes(1)

    // Clean up: resolve first call
    resolvePrompt()
    await act(async () => { await firstCallPromise })
  })

  it('canInstall is false when display-mode: standalone media query matches', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true, // standalone mode
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList)

    const { result } = renderHook(() => useInstallPrompt())

    act(() => {
      fireBeforeInstallPrompt()
    })

    expect(result.current.canInstall).toBe(false)
  })
})

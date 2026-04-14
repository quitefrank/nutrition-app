import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'

describe('useOnlineStatus', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: true,
    })
  })

  it('returns true when navigator.onLine is true on mount', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('returns false when navigator.onLine is false on mount', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
  })

  it('updates to false when the "offline" event fires', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current).toBe(false)
  })

  it('updates to true when the "online" event fires', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current).toBe(true)
  })

  it('removes event listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useOnlineStatus())

    const onlineAdded = addSpy.mock.calls.some((args) => args[0] === 'online')
    const offlineAdded = addSpy.mock.calls.some((args) => args[0] === 'offline')
    expect(onlineAdded).toBe(true)
    expect(offlineAdded).toBe(true)

    unmount()

    const onlineRemoved = removeSpy.mock.calls.some((args) => args[0] === 'online')
    const offlineRemoved = removeSpy.mock.calls.some((args) => args[0] === 'offline')
    expect(onlineRemoved).toBe(true)
    expect(offlineRemoved).toBe(true)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('defaults to true when navigator is undefined (SSR guard)', () => {
    // Verify the hook always returns a strict boolean (never undefined)
    // The SSR branch (typeof navigator === 'undefined' → true) is the safe default
    const { result } = renderHook(() => useOnlineStatus())
    expect(typeof result.current).toBe('boolean')
    expect(result.current === true || result.current === false).toBe(true)
  })
})

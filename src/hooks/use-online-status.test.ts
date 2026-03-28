import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useOnlineStatus } from './use-online-status'

describe('useOnlineStatus', () => {
  let onlineGetter: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    onlineGetter = vi.spyOn(navigator, 'onLine', 'get')
  })

  afterEach(() => {
    onlineGetter.mockRestore()
  })

  it('returns true when navigator.onLine is true', () => {
    onlineGetter.mockReturnValue(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('returns false when navigator.onLine is false', () => {
    onlineGetter.mockReturnValue(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
  })

  it('updates to false when the offline event fires', () => {
    onlineGetter.mockReturnValue(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    onlineGetter.mockReturnValue(false)
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
  })

  it('updates to true when the online event fires', () => {
    onlineGetter.mockReturnValue(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)

    onlineGetter.mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('removes event listeners on unmount', () => {
    onlineGetter.mockReturnValue(true)
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useOnlineStatus())
    unmount()
    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function))
    removeEventListenerSpy.mockRestore()
  })
})

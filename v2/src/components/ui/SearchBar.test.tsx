import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { SearchBar } from './SearchBar'
import { useDebounce } from '@/hooks/useDebounce'

// ─── Debounce tests ────────────────────────────────────────────────────────────

describe('Debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('onChange callback fires after 300ms, not on every keystroke', () => {
    // useDebounce holds the previous value until the delay elapses.
    // We verify this using fake timers: the debounced value should not update
    // immediately on each new value, only after 300ms of silence.
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: '' } }
    )

    expect(result.current).toBe('')

    // Simulate rapid keystrokes: 'p', 'pi', 'piz', 'pizz', 'pizza'
    rerender({ value: 'p' })
    rerender({ value: 'pi' })
    rerender({ value: 'piz' })
    rerender({ value: 'pizz' })
    rerender({ value: 'pizza' })

    // Before 300ms: debounced value is still the initial value
    expect(result.current).toBe('')

    // Advance time partially (200ms) — still debounced
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe('')

    // Advance past 300ms — debounced value updates to the latest value
    act(() => { vi.advanceTimersByTime(101) })
    expect(result.current).toBe('pizza')
  })
})

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('SearchBar', () => {
  const onChange = vi.fn()
  const onDismiss = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with the provided placeholder', () => {
    render(
      <SearchBar
        value=""
        onChange={onChange}
        onDismiss={onDismiss}
        placeholder="Find a place…"
      />
    )
    expect(screen.getByPlaceholderText('Find a place…')).toBeDefined()
  })

  it('renders with aria-label on the input', () => {
    render(<SearchBar value="" onChange={onChange} onDismiss={onDismiss} />)
    expect(screen.getByRole('searchbox', { name: 'Search for a restaurant' })).toBeDefined()
  })

  it('clear button is NOT rendered when value is empty', () => {
    render(<SearchBar value="" onChange={onChange} onDismiss={onDismiss} />)
    expect(screen.queryByLabelText('Clear search')).toBeNull()
  })

  it('clear button IS rendered when value is non-empty', () => {
    render(<SearchBar value="pizza" onChange={onChange} onDismiss={onDismiss} />)
    expect(screen.getByLabelText('Clear search')).toBeDefined()
  })

  it('clicking the clear button calls onChange with empty string', async () => {
    render(<SearchBar value="pizza" onChange={onChange} onDismiss={onDismiss} />)
    const clearBtn = screen.getByLabelText('Clear search')
    await userEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('pressing Escape calls onDismiss', async () => {
    render(<SearchBar value="" onChange={onChange} onDismiss={onDismiss} />)
    const input = screen.getByRole('searchbox')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('pressing a non-Escape key does NOT call onDismiss', async () => {
    render(<SearchBar value="" onChange={onChange} onDismiss={onDismiss} />)
    const input = screen.getByRole('searchbox')
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'a' })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('Cancel button calls onDismiss when clicked', async () => {
    render(<SearchBar value="" onChange={onChange} onDismiss={onDismiss} />)
    const cancelBtn = screen.getByLabelText('Cancel search')
    await userEvent.click(cancelBtn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows a loading indicator when isLoading is true', () => {
    render(<SearchBar value="pi" onChange={onChange} onDismiss={onDismiss} isLoading={true} />)
    // The spinner has aria-label="Loading"
    expect(screen.getByLabelText('Loading')).toBeDefined()
  })

  it('does NOT show loading indicator when isLoading is false', () => {
    render(<SearchBar value="pi" onChange={onChange} onDismiss={onDismiss} isLoading={false} />)
    expect(screen.queryByLabelText('Loading')).toBeNull()
  })

  it('typing calls onChange with the new value', async () => {
    render(<SearchBar value="" onChange={onChange} onDismiss={onDismiss} />)
    const input = screen.getByRole('searchbox')
    await userEvent.type(input, 'b')
    expect(onChange).toHaveBeenCalled()
  })
})

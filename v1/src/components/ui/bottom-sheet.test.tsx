import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomSheet } from './bottom-sheet'

describe('BottomSheet', () => {
  it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={vi.fn()}>content</BottomSheet>)
    expect(screen.queryByTestId('bottom-sheet')).toBeNull()
  })

  it('renders sheet and overlay when open', () => {
    render(<BottomSheet open={true} onClose={vi.fn()}>content</BottomSheet>)
    expect(screen.getByTestId('bottom-sheet')).toBeDefined()
    expect(screen.getByTestId('bottom-sheet-overlay')).toBeDefined()
  })

  it('renders children when open', () => {
    render(<BottomSheet open={true} onClose={vi.fn()}>sheet content</BottomSheet>)
    expect(screen.getByText('sheet content')).toBeDefined()
  })

  it('renders drag handle when open', () => {
    render(<BottomSheet open={true} onClose={vi.fn()}>x</BottomSheet>)
    expect(screen.getByTestId('drag-handle')).toBeDefined()
  })

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn()
    render(<BottomSheet open={true} onClose={onClose}>x</BottomSheet>)
    fireEvent.click(screen.getByTestId('bottom-sheet-overlay'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('has role=dialog when open', () => {
    render(<BottomSheet open={true} onClose={vi.fn()}>x</BottomSheet>)
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  // AC3: aria-modal on dialog
  it('has aria-modal="true" when open', () => {
    render(<BottomSheet open={true} onClose={vi.fn()}>x</BottomSheet>)
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
  })

  // IG-1: Accessible dialog name
  it('sets aria-label from label prop', () => {
    render(<BottomSheet open={true} onClose={vi.fn()} label="Dish detail">x</BottomSheet>)
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Dish detail')
  })

  it('defaults aria-label to Sheet when label prop is omitted', () => {
    render(<BottomSheet open={true} onClose={vi.fn()}>x</BottomSheet>)
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Sheet')
  })

  // P-1: Escape key dismissal
  it('calls onClose when Escape key is pressed while open', () => {
    const onClose = vi.fn()
    render(<BottomSheet open={true} onClose={onClose}>x</BottomSheet>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose on Escape when sheet is closed', () => {
    const onClose = vi.fn()
    render(<BottomSheet open={false} onClose={onClose}>x</BottomSheet>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  // P-4: Body data attribute for background scale
  it('sets data-sheet-open on body when open', () => {
    render(<BottomSheet open={true} onClose={vi.fn()}>x</BottomSheet>)
    expect(document.body.dataset.sheetOpen).toBe('true')
  })

  it('does not set data-sheet-open on body when closed', () => {
    render(<BottomSheet open={false} onClose={vi.fn()}>x</BottomSheet>)
    expect(document.body.dataset.sheetOpen).toBeUndefined()
  })
})

import { vi, describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomSheet } from './BottomSheet'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BottomSheet', () => {
  describe('visibility', () => {
    it('renders children when isOpen is true', () => {
      render(
        <BottomSheet isOpen={true} onClose={vi.fn()}>
          <p>Sheet content</p>
        </BottomSheet>
      )
      expect(screen.getByText('Sheet content')).toBeTruthy()
    })

    it('does not render children when isOpen is false', () => {
      render(
        <BottomSheet isOpen={false} onClose={vi.fn()}>
          <p>Hidden content</p>
        </BottomSheet>
      )
      expect(screen.queryByText('Hidden content')).toBeNull()
    })
  })

  describe('backdrop', () => {
    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn()
      render(
        <BottomSheet isOpen={true} onClose={onClose}>
          <p>Content</p>
        </BottomSheet>
      )
      const backdrop = document.querySelector('[data-testid="bottom-sheet-backdrop"]')
      expect(backdrop).toBeTruthy()
      fireEvent.click(backdrop!)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('keyboard', () => {
    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn()
      render(
        <BottomSheet isOpen={true} onClose={onClose}>
          <p>Content</p>
        </BottomSheet>
      )
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose for other keys', () => {
      const onClose = vi.fn()
      render(
        <BottomSheet isOpen={true} onClose={onClose}>
          <p>Content</p>
        </BottomSheet>
      )
      fireEvent.keyDown(document, { key: 'Enter' })
      fireEvent.keyDown(document, { key: 'Tab' })
      expect(onClose).not.toHaveBeenCalled()
    })

    it('does not call onClose on Escape when isOpen is false', () => {
      const onClose = vi.fn()
      render(
        <BottomSheet isOpen={false} onClose={onClose}>
          <p>Content</p>
        </BottomSheet>
      )
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('focus trap — Tab cycling', () => {
    it('wraps focus from last to first focusable element on Tab', () => {
      render(
        <BottomSheet isOpen={true} onClose={vi.fn()}>
          <button>First</button>
          <button>Second</button>
          <button>Last</button>
        </BottomSheet>
      )

      const panel = screen.getByRole('dialog')
      const buttons = panel.querySelectorAll<HTMLElement>('button')
      const lastBtn = buttons[buttons.length - 1]

      // Simulate focus on last button, then press Tab
      lastBtn.focus()
      fireEvent.keyDown(panel, { key: 'Tab', shiftKey: false })

      // Focus should have wrapped to the first button
      expect(document.activeElement).toBe(buttons[0])
    })

    it('wraps focus from first to last focusable element on Shift+Tab', () => {
      render(
        <BottomSheet isOpen={true} onClose={vi.fn()}>
          <button>First</button>
          <button>Second</button>
          <button>Last</button>
        </BottomSheet>
      )

      const panel = screen.getByRole('dialog')
      const buttons = panel.querySelectorAll<HTMLElement>('button')
      const firstBtn = buttons[0]
      const lastBtn = buttons[buttons.length - 1]

      // Simulate focus on first button, then press Shift+Tab
      firstBtn.focus()
      fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true })

      // Focus should have wrapped to the last button
      expect(document.activeElement).toBe(lastBtn)
    })

    it('does not wrap Tab when focused element is not the last', () => {
      render(
        <BottomSheet isOpen={true} onClose={vi.fn()}>
          <button>First</button>
          <button>Last</button>
        </BottomSheet>
      )

      const panel = screen.getByRole('dialog')
      const buttons = panel.querySelectorAll<HTMLElement>('button')
      const firstBtn = buttons[0]

      // Focus first, press Tab — should NOT preventDefault (browser handles natural tab)
      firstBtn.focus()
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, bubbles: true })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      panel.dispatchEvent(event)

      // Since firstBtn !== lastBtn, preventDefault should not have been called
      expect(preventDefaultSpy).not.toHaveBeenCalled()
    })
  })

  describe('dialog role', () => {
    it('has role=dialog when open', () => {
      render(
        <BottomSheet isOpen={true} onClose={vi.fn()} label="Test Dialog">
          <p>Content</p>
        </BottomSheet>
      )
      expect(screen.getByRole('dialog')).toBeTruthy()
    })
  })
})

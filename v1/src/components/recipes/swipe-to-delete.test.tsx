import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SwipeToDelete } from './swipe-to-delete'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, style, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      React.createElement('div', { style, className, ...props }, children),
  },
  useMotionValue: () => ({ get: () => 0 }),
  useTransform: () => ({ toString: () => '0' }),
  animate: vi.fn().mockReturnValue(Promise.resolve()),
}))

describe('SwipeToDelete', () => {
  it('renders children', () => {
    render(
      <SwipeToDelete onDelete={vi.fn()}>
        <span>Card content</span>
      </SwipeToDelete>
    )
    expect(screen.getByText('Card content')).toBeTruthy()
  })

  it('delete button is present in DOM', () => {
    render(
      <SwipeToDelete onDelete={vi.fn()}>
        <span>Card</span>
      </SwipeToDelete>
    )
    // Button is inside aria-hidden container — use hidden: true to access it
    expect(screen.getByRole('button', { name: /delete recipe/i, hidden: true })).toBeTruthy()
  })

  it('clicking delete button calls onDelete callback', async () => {
    const onDelete = vi.fn()
    render(
      <SwipeToDelete onDelete={onDelete}>
        <span>Card</span>
      </SwipeToDelete>
    )
    // Button is inside aria-hidden container — use hidden: true to access it
    const btn = screen.getByRole('button', { name: /delete recipe/i, hidden: true })
    fireEvent.click(btn)
    // animate returns a promise, so onDelete is called after resolve
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})

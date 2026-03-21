import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ProcessingStrip } from './processing-strip'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      onDragEnd,
      onClick,
      animate,
      initial,
      exit,
      transition,
      drag,
      dragConstraints,
      ...props
    }: React.PropsWithChildren<{
      onDragEnd?: (e: unknown, info: unknown) => void
      onClick?: () => void
      animate?: unknown
      initial?: unknown
      exit?: unknown
      transition?: unknown
      drag?: unknown
      dragConstraints?: unknown
    }>) =>
      React.createElement(
        'div',
        {
          ...props,
          onClick,
          'data-drag': drag ? 'true' : undefined,
        },
        children
      ),
    svg: ({
      children,
      animate,
      transition,
      ...props
    }: React.PropsWithChildren<{ animate?: unknown; transition?: unknown }>) =>
      React.createElement('svg', props, children),
    span: ({
      children,
      animate,
      transition,
      ...props
    }: React.PropsWithChildren<{ animate?: unknown; transition?: unknown }>) =>
      React.createElement('span', props, children),
  },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}))

const defaultProps = {
  status: 'processing' as const,
  thumbnailUrl: null,
  onTap: vi.fn(),
  onCancel: vi.fn(),
}

describe('ProcessingStrip', () => {
  it('renders with processing status showing "Identifying your menu"', () => {
    render(<ProcessingStrip {...defaultProps} />)
    expect(screen.getByText(/Identifying your menu/)).toBeDefined()
  })

  it('renders with ready status showing "Your results are ready"', () => {
    render(<ProcessingStrip {...defaultProps} status="ready" />)
    expect(screen.getByText('Your results are ready →')).toBeDefined()
  })

  it('renders thumbnail image when thumbnailUrl is provided', () => {
    render(<ProcessingStrip {...defaultProps} thumbnailUrl="blob:test-thumb" />)
    const img = screen.getByAltText('Captured scan')
    expect(img).toBeDefined()
    expect((img as HTMLImageElement).src).toContain('test-thumb')
  })

  it('does not render thumbnail when thumbnailUrl is null', () => {
    render(<ProcessingStrip {...defaultProps} thumbnailUrl={null} />)
    expect(screen.queryByAltText('Captured scan')).toBeNull()
  })

  it('onTap is NOT called when processing strip is clicked in processing state', () => {
    const onTap = vi.fn()
    render(<ProcessingStrip {...defaultProps} status="processing" onTap={onTap} />)
    fireEvent.click(screen.getByTestId('processing-strip'))
    expect(onTap).not.toHaveBeenCalled()
  })

  it('onTap IS called when processing strip is clicked in ready state', () => {
    const onTap = vi.fn()
    render(<ProcessingStrip {...defaultProps} status="ready" onTap={onTap} />)
    fireEvent.click(screen.getByTestId('processing-strip'))
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('has correct aria-label for processing status', () => {
    render(<ProcessingStrip {...defaultProps} status="processing" />)
    const strip = screen.getByTestId('processing-strip')
    expect(strip.getAttribute('aria-label')).toBe('Identifying your menu')
  })

  it('has correct aria-label for ready status', () => {
    render(<ProcessingStrip {...defaultProps} status="ready" />)
    const strip = screen.getByTestId('processing-strip')
    expect(strip.getAttribute('aria-label')).toBe('Your results are ready')
  })

  it('strip has aria-live="polite"', () => {
    render(<ProcessingStrip {...defaultProps} />)
    const strip = screen.getByTestId('processing-strip')
    expect(strip.getAttribute('aria-live')).toBe('polite')
  })
})

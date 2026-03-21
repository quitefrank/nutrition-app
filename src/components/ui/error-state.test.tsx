import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ErrorState } from './error-state'

describe('ErrorState', () => {
  it('renders message text', () => {
    render(React.createElement(ErrorState, {
      message: 'Scan service is temporarily unavailable',
      onRetry: vi.fn(),
    }))
    expect(screen.getByText('Scan service is temporarily unavailable')).toBeDefined()
  })

  it('renders retry button', () => {
    render(React.createElement(ErrorState, {
      message: 'Something went wrong',
      onRetry: vi.fn(),
    }))
    expect(screen.getByLabelText('Retry scan')).toBeDefined()
  })

  it('clicking retry button calls onRetry', () => {
    const onRetry = vi.fn()
    render(React.createElement(ErrorState, { message: 'Error', onRetry }))
    fireEvent.click(screen.getByLabelText('Retry scan'))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('upload alternative not rendered when onUploadInstead is not provided', () => {
    render(React.createElement(ErrorState, { message: 'Error', onRetry: vi.fn() }))
    expect(screen.queryByLabelText('Try uploading a photo instead')).toBeNull()
  })

  it('upload alternative rendered when onUploadInstead is provided', () => {
    render(React.createElement(ErrorState, {
      message: 'Error',
      onRetry: vi.fn(),
      onUploadInstead: vi.fn(),
    }))
    expect(screen.getByLabelText('Try uploading a photo instead')).toBeDefined()
  })

  it('clicking upload alternative calls onUploadInstead', () => {
    const onUploadInstead = vi.fn()
    render(React.createElement(ErrorState, {
      message: 'Error',
      onRetry: vi.fn(),
      onUploadInstead,
    }))
    fireEvent.click(screen.getByLabelText('Try uploading a photo instead'))
    expect(onUploadInstead).toHaveBeenCalledOnce()
  })

  it('renders data-testid="error-state"', () => {
    render(React.createElement(ErrorState, { message: 'Error', onRetry: vi.fn() }))
    expect(screen.getByTestId('error-state')).toBeDefined()
  })
})

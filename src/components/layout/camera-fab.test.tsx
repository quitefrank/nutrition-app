import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CameraFab } from './camera-fab'

describe('CameraFab', () => {
  it('renders button with aria-label="Open camera"', () => {
    render(<CameraFab onClick={vi.fn()} />)
    expect(screen.getByLabelText('Open camera')).toBeDefined()
  })

  it('calls onClick prop when tapped', () => {
    const onClick = vi.fn()
    render(<CameraFab onClick={onClick} />)
    fireEvent.click(screen.getByLabelText('Open camera'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

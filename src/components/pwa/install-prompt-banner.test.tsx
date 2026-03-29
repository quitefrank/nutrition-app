import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InstallPromptBanner } from './install-prompt-banner'

describe('InstallPromptBanner', () => {
  it('renders the install prompt text', () => {
    render(<InstallPromptBanner onInstall={vi.fn()} onDismiss={vi.fn()} />)
    expect(
      screen.getByText('Add Plately to your home screen for one-tap access')
    ).toBeDefined()
  })

  it('calls onInstall when Install button is clicked', async () => {
    const onInstall = vi.fn()
    render(<InstallPromptBanner onInstall={onInstall} onDismiss={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /install plately/i }))

    expect(onInstall).toHaveBeenCalledOnce()
  })

  it('calls onDismiss when Dismiss button is clicked', async () => {
    const onDismiss = vi.fn()
    render(<InstallPromptBanner onInstall={vi.fn()} onDismiss={onDismiss} />)

    await userEvent.click(screen.getByRole('button', { name: /dismiss install prompt/i }))

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('renders Install and Dismiss buttons', () => {
    render(<InstallPromptBanner onInstall={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByRole('button', { name: /install plately/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /dismiss install prompt/i })).toBeDefined()
  })

  it('is announced to screen readers via role="alert"', () => {
    render(<InstallPromptBanner onInstall={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeDefined()
  })
})

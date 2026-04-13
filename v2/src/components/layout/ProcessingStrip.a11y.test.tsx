import { vi, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProcessingStrip } from './ProcessingStrip'

// Router mock required because ProcessingStrip calls useRouter() for the ready-state tap
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('ProcessingStrip — NFR13 compliance and ARIA', () => {
  it('has role="status" and aria-live="polite"', () => {
    render(<ProcessingStrip state="processing" />)
    const status = screen.getByRole('status')
    expect(status).toBeTruthy()
    expect(status.getAttribute('aria-live')).toBe('polite')
  })

  it('does NOT have aria-label on the container element (NFR13 fix verification)', () => {
    render(<ProcessingStrip state="processing" />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-label')).toBeNull()
  })

  it('does NOT use aria-label to announce state after state transition (NFR13)', () => {
    const { rerender } = render(<ProcessingStrip state="processing" />)
    const statusEl = screen.getByRole('status')
    expect(statusEl.getAttribute('aria-label')).toBeNull()

    rerender(<ProcessingStrip state="ready" resultId="abc" />)
    const updatedStatus = screen.getByRole('status')
    expect(updatedStatus.getAttribute('aria-label')).toBeNull()
    expect(updatedStatus.textContent).toContain('Your dish is ready')
  })

  it('is not rendered when state is "idle"', () => {
    render(<ProcessingStrip state="idle" />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('"processing" state: text content is "Identifying your dish…"', () => {
    render(<ProcessingStrip state="processing" />)
    expect(screen.getByRole('status').textContent).toContain('Identifying your dish')
  })

  it('"confirming" state: text content is "Confirm restaurant name"', () => {
    render(<ProcessingStrip state="confirming" />)
    expect(screen.getByRole('status').textContent).toContain('Confirm restaurant name')
  })

  it('"ready" state: text content is "Your dish is ready — tap to view"', () => {
    render(<ProcessingStrip state="ready" resultId="test-id" />)
    expect(screen.getByRole('status').textContent).toContain('Your dish is ready')
  })

  it('"error" state: text content contains "Couldn\'t identify"', () => {
    render(<ProcessingStrip state="error" />)
    expect(screen.getByRole('status').textContent).toContain("Couldn't identify")
  })

  it('announces state transitions via text content mutation, not aria-label', () => {
    const { rerender } = render(<ProcessingStrip state="processing" />)
    expect(screen.getByRole('status').textContent).toContain('Identifying your dish')
    expect(screen.getByRole('status').getAttribute('aria-label')).toBeNull()

    rerender(<ProcessingStrip state="error" />)
    expect(screen.getByRole('status').textContent).toContain("Couldn't identify")
    expect(screen.getByRole('status').getAttribute('aria-label')).toBeNull()
  })

  it('custom message prop overrides default label text content', () => {
    render(<ProcessingStrip state="processing" message="Scanning menu…" />)
    expect(screen.getByRole('status').textContent).toContain('Scanning menu')
    // Still no aria-label (NFR13)
    expect(screen.getByRole('status').getAttribute('aria-label')).toBeNull()
  })

  it('all icon SVGs have aria-hidden="true"', () => {
    const { container } = render(<ProcessingStrip state="processing" />)
    const svgs = container.querySelectorAll('svg')
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
  })
})

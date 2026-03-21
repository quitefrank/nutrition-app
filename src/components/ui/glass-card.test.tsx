import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlassCard } from './glass-card'

describe('GlassCard', () => {
  it('renders children', () => {
    render(<GlassCard>test content</GlassCard>)
    expect(screen.getByText('test content')).toBeDefined()
  })

  it('renders with data-testid', () => {
    render(<GlassCard>x</GlassCard>)
    expect(screen.getByTestId('glass-card')).toBeDefined()
  })

  it('applies default variant radius class', () => {
    render(<GlassCard>x</GlassCard>)
    const card = screen.getByTestId('glass-card')
    expect(card.className).toContain('rounded-[var(--radius-md)]')
  })

  it('applies compact variant radius class', () => {
    render(<GlassCard variant="compact">x</GlassCard>)
    const card = screen.getByTestId('glass-card')
    expect(card.className).toContain('rounded-[var(--radius-sm)]')
  })

  it('merges additional classNames', () => {
    render(<GlassCard className="extra-class">x</GlassCard>)
    const card = screen.getByTestId('glass-card')
    expect(card.className).toContain('extra-class')
  })

  it('passes through HTML attributes', () => {
    render(<GlassCard id="my-card">x</GlassCard>)
    expect(screen.getByTestId('glass-card').id).toBe('my-card')
  })
})

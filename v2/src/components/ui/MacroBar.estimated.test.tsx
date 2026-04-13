import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MacroBar } from './MacroBar'

describe('MacroBar — isEstimated prop', () => {
  it('renders "Est." label for each non-null macro when isEstimated is true', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} isEstimated={true} />)
    const estLabels = screen.getAllByText('Est.')
    expect(estLabels).toHaveLength(4)
    // Each label has the right aria-label
    estLabels.forEach((el) => expect(el.getAttribute('aria-label')).toBe('estimated value'))
  })

  it('does NOT render "Est." label when isEstimated is false', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} isEstimated={false} />)
    expect(screen.queryByText('Est.')).toBeNull()
  })

  it('does NOT render "Est." label when isEstimated is omitted (defaults false)', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} />)
    expect(screen.queryByText('Est.')).toBeNull()
  })

  it('does NOT render "Est." label for null macro values (—) even when isEstimated is true', () => {
    // Only non-null cells should show Est.
    render(<MacroBar proteinG={12} carbsG={null} fatG={14} fibreG={null} isEstimated={true} />)
    const estLabels = screen.getAllByText('Est.')
    // Only protein and fat are non-null → 2 Est. labels
    expect(estLabels).toHaveLength(2)
    // Null cells show "—" with no Est.
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('"Est." label has aria-label="estimated value"', () => {
    render(<MacroBar proteinG={10} carbsG={20} fatG={5} fibreG={3} isEstimated={true} />)
    const labels = screen.getAllByLabelText('estimated value')
    expect(labels).toHaveLength(4)
  })

  it('all four macro cells render correctly when all macros are null and isEstimated is true', () => {
    render(<MacroBar proteinG={null} carbsG={null} fatG={null} fibreG={null} isEstimated={true} />)
    // All four show "—" — no Est. labels since all values are null
    expect(screen.getAllByText('—')).toHaveLength(4)
    expect(screen.queryByText('Est.')).toBeNull()
  })

  it('existing callers without isEstimated prop are unaffected (backward compatibility)', () => {
    // Simulate a call site that was not updated — prop omitted entirely
    const { container } = render(<MacroBar proteinG={30} carbsG={60} fatG={10} fibreG={4} />)
    expect(container.querySelectorAll('[aria-label="estimated value"]')).toHaveLength(0)
    expect(screen.getByText('30g')).toBeTruthy()
    expect(screen.getByText('60g')).toBeTruthy()
  })
})

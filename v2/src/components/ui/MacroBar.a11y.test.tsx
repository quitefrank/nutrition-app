/**
 * MacroBar — WCAG 2.1 AA colour compliance tests (Story 7-2)
 *
 * Tests the measurable constraints that can be verified in unit tests:
 *  - PROTEIN/CARBS/FAT/FIBRE column header labels use var(--color-text-tertiary)
 *  - Macro value spans use var(--color-text-primary)
 *  - "Est." label (when isEstimated=true) uses var(--color-text-tertiary)
 *  - "Est." label (when isEstimated=true) has aria-label="estimated value"
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MacroBar } from './MacroBar'

describe('MacroBar — colour compliance (Story 7-2)', () => {
  it('PROTEIN/CARBS/FAT/FIBRE column header labels use var(--color-text-tertiary)', () => {
    const { container } = render(
      <MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} />
    )
    const headerLabels = ['PROTEIN', 'CARBS', 'FAT', 'FIBRE']
    for (const label of headerLabels) {
      const el = screen.getByText(label)
      expect(el.style.color).toBe('var(--color-text-tertiary)')
    }
    // Sanity: all four must exist
    expect(container.querySelectorAll('span').length).toBeGreaterThanOrEqual(4)
  })

  it('column headers do NOT use var(--color-accent)', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} />)
    for (const label of ['PROTEIN', 'CARBS', 'FAT', 'FIBRE']) {
      const el = screen.getByText(label)
      expect(el.style.color).not.toBe('var(--color-accent)')
    }
  })

  it('macro value spans use var(--color-text-primary)', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} />)
    // Values are "12g", "48g", "14g", "5g"
    const valueTexts = ['12g', '48g', '14g', '5g']
    for (const text of valueTexts) {
      const el = screen.getByText(text)
      expect(el.style.color).toBe('var(--color-text-primary)')
    }
  })

  it('"—" placeholder spans use var(--color-text-primary)', () => {
    render(<MacroBar proteinG={null} carbsG={null} fatG={null} fibreG={null} />)
    const dashes = screen.getAllByText('—')
    for (const dash of dashes) {
      expect(dash.style.color).toBe('var(--color-text-primary)')
    }
  })

  it('"Est." label is not rendered when isEstimated is false (default)', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} />)
    // No "Est." spans should appear
    const estSpans = screen.queryAllByText('Est.')
    expect(estSpans).toHaveLength(0)
  })

  it('"Est." label uses var(--color-text-tertiary) when isEstimated=true', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} isEstimated />)
    const estSpans = screen.getAllByLabelText('estimated value')
    expect(estSpans.length).toBeGreaterThan(0)
    for (const span of estSpans) {
      expect(span.style.color).toBe('var(--color-text-tertiary)')
    }
  })

  it('"Est." label does NOT use var(--color-accent) when isEstimated=true', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} isEstimated />)
    const estSpans = screen.getAllByLabelText('estimated value')
    for (const span of estSpans) {
      expect(span.style.color).not.toBe('var(--color-accent)')
    }
  })

  it('"Est." label has aria-label="estimated value" when isEstimated=true', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} isEstimated />)
    // Should find exactly one "Est." per non-null macro cell
    const estElements = screen.getAllByLabelText('estimated value')
    expect(estElements.length).toBeGreaterThanOrEqual(1)
    for (const el of estElements) {
      expect(el.getAttribute('aria-label')).toBe('estimated value')
    }
  })

  it('"Est." label is only shown for non-null macro cells when isEstimated=true', () => {
    render(<MacroBar proteinG={12} carbsG={null} fatG={14} fibreG={null} isEstimated />)
    // Only protein (12g) and fat (14g) are non-null — 2 Est. labels
    const estElements = screen.getAllByLabelText('estimated value')
    expect(estElements).toHaveLength(2)
  })
})

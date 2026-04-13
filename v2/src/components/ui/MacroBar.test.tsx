import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MacroBar } from './MacroBar'

describe('MacroBar', () => {
  it('renders 4 cells (Protein, Carbs, Fat, Fibre)', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} />)
    expect(screen.getByText('PROTEIN')).toBeTruthy()
    expect(screen.getByText('CARBS')).toBeTruthy()
    expect(screen.getByText('FAT')).toBeTruthy()
    expect(screen.getByText('FIBRE')).toBeTruthy()
  })

  it('shows rounded gram values (Math.round applied)', () => {
    render(<MacroBar proteinG={12.7} carbsG={47.3} fatG={13.5} fibreG={4.2} />)
    expect(screen.getByText('13g')).toBeTruthy()
    expect(screen.getByText('47g')).toBeTruthy()
    expect(screen.getByText('14g')).toBeTruthy()
    expect(screen.getByText('4g')).toBeTruthy()
  })

  it('shows "—" for null protein; other cells show gram values', () => {
    render(<MacroBar proteinG={null} carbsG={48} fatG={14} fibreG={5} />)
    expect(screen.getAllByText('—').length).toBe(1)
    expect(screen.getByText('48g')).toBeTruthy()
    expect(screen.getByText('14g')).toBeTruthy()
    expect(screen.getByText('5g')).toBeTruthy()
  })

  it('shows "—" for null carbs; other cells show gram values', () => {
    render(<MacroBar proteinG={12} carbsG={null} fatG={14} fibreG={5} />)
    expect(screen.getAllByText('—').length).toBe(1)
    expect(screen.getByText('12g')).toBeTruthy()
    expect(screen.getByText('14g')).toBeTruthy()
    expect(screen.getByText('5g')).toBeTruthy()
  })

  it('shows "—" for null fat; other cells show gram values', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={null} fibreG={5} />)
    expect(screen.getAllByText('—').length).toBe(1)
    expect(screen.getByText('12g')).toBeTruthy()
    expect(screen.getByText('48g')).toBeTruthy()
    expect(screen.getByText('5g')).toBeTruthy()
  })

  it('shows "—" for null fibre; other cells show gram values', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={null} />)
    expect(screen.getAllByText('—').length).toBe(1)
    expect(screen.getByText('12g')).toBeTruthy()
    expect(screen.getByText('48g')).toBeTruthy()
    expect(screen.getByText('14g')).toBeTruthy()
  })

  it('shows "—" for all null values', () => {
    render(<MacroBar proteinG={null} carbsG={null} fatG={null} fibreG={null} />)
    expect(screen.getAllByText('—').length).toBe(4)
  })

  it('shows "—" for NaN values', () => {
    render(<MacroBar proteinG={NaN} carbsG={NaN} fatG={NaN} fibreG={NaN} />)
    expect(screen.getAllByText('—').length).toBe(4)
  })

  it('shows "—" for Infinity values', () => {
    render(<MacroBar proteinG={Infinity} carbsG={-Infinity} fatG={Infinity} fibreG={-Infinity} />)
    expect(screen.getAllByText('—').length).toBe(4)
  })

  it('cell labels are uppercase', () => {
    render(<MacroBar proteinG={null} carbsG={null} fatG={null} fibreG={null} />)
    expect(screen.getByText('PROTEIN').textContent).toBe('PROTEIN')
    expect(screen.getByText('CARBS').textContent).toBe('CARBS')
    expect(screen.getByText('FAT').textContent).toBe('FAT')
    expect(screen.getByText('FIBRE').textContent).toBe('FIBRE')
  })

  it('does not have role="button" (display-only, not interactive)', () => {
    render(<MacroBar proteinG={12} carbsG={48} fatG={14} fibreG={5} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

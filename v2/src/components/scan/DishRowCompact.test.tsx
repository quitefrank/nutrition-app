import { vi, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DishRowCompact } from './DishRowCompact'
import type { DomainRecipe } from '@/types/database'

const baseRecipe: DomainRecipe = {
  id: 'test-id',
  restaurantId: 'rest-id',
  visitId: null,
  name: 'Pad Thai',
  description: 'Classic Thai noodles',
  dishImageUrl: null,
  estimatedCalories: 520,
  status: 'auto_captured',
  photoStatus: 'placeholder',
  geminiConfidence: 0.9,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: null,
  totalCarbsG: null,
  totalFatG: null,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}

const defaultProps = {
  recipe: baseRecipe,
  isExpanded: false,
  onToggle: vi.fn(),
}

describe('DishRowCompact', () => {
  describe('rendering', () => {
    it('renders dish name', () => {
      render(<DishRowCompact {...defaultProps} />)
      expect(screen.getByText('Pad Thai')).toBeTruthy()
    })

    it('renders calorie count', () => {
      render(<DishRowCompact {...defaultProps} />)
      expect(screen.getByText('520 cal')).toBeTruthy()
    })

    it('renders macro chips when all three present', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={12}
          totalCarbs={48}
          totalFat={14}
        />
      )
      expect(screen.getByText('P 12g')).toBeTruthy()
      expect(screen.getByText('C 48g')).toBeTruthy()
      expect(screen.getByText('F 14g')).toBeTruthy()
    })

    it('does NOT render macro chips when protein is null', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={null}
          totalCarbs={48}
          totalFat={14}
        />
      )
      expect(screen.queryByText(/P \d+g/)).toBeNull()
      expect(screen.queryByText(/C \d+g/)).toBeNull()
      expect(screen.queryByText(/F \d+g/)).toBeNull()
    })

    it('does NOT render macro chips when carbs is null', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={12}
          totalCarbs={null}
          totalFat={14}
        />
      )
      expect(screen.queryByText(/P \d+g/)).toBeNull()
    })

    it('does NOT render macro chips when fat is null', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={12}
          totalCarbs={48}
          totalFat={null}
        />
      )
      expect(screen.queryByText(/P \d+g/)).toBeNull()
    })

    it('does NOT render macro chips when no macro props provided', () => {
      render(<DishRowCompact {...defaultProps} />)
      expect(screen.queryByText(/P \d+g/)).toBeNull()
      expect(screen.queryByText('Est.')).toBeNull()
    })

    it('shows "Est." badge when macro chips are shown', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={12}
          totalCarbs={48}
          totalFat={14}
        />
      )
      expect(screen.getByText('Est.')).toBeTruthy()
    })

    it('renders macro chips when a macro value is zero', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={0}
          totalCarbs={48}
          totalFat={14}
        />
      )
      expect(screen.getByText('P 0g')).toBeTruthy()
      expect(screen.getByText('C 48g')).toBeTruthy()
    })

    it('does NOT render macro chips when a macro value is NaN', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={NaN}
          totalCarbs={48}
          totalFat={14}
        />
      )
      expect(screen.queryByText(/P \d+g/)).toBeNull()
      expect(screen.queryByText('Est.')).toBeNull()
    })

    it('does NOT render macro chips when a macro value is negative', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={-5}
          totalCarbs={48}
          totalFat={14}
        />
      )
      expect(screen.queryByText(/P -?\d+g/)).toBeNull()
      expect(screen.queryByText('Est.')).toBeNull()
    })
  })

  describe('photo states', () => {
    it('renders placeholder tile when photoStatus is placeholder', () => {
      render(<DishRowCompact {...defaultProps} />)
      // PhotoFrame renders aria-label for placeholder state
      expect(screen.getByLabelText(/no photo for pad thai/i)).toBeTruthy()
    })

    it('renders PhotoFrame when photoStatus is confirmed', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          recipe={{ ...baseRecipe, photoStatus: 'confirmed', dishImageUrl: 'https://example.com/img.jpg' }}
        />
      )
      // The confirmed branch renders an img with alt text
      expect(screen.getByRole('img', { name: 'Pad Thai' })).toBeTruthy()
    })

    it('returns null when photoStatus is suppressed', () => {
      const { container } = render(
        <DishRowCompact
          {...defaultProps}
          recipe={{ ...baseRecipe, photoStatus: 'suppressed' }}
        />
      )
      expect(container.firstChild).toBeNull()
    })
  })

  describe('accessibility', () => {
    it('has role="button"', () => {
      render(<DishRowCompact {...defaultProps} />)
      expect(screen.getByRole('button')).toBeTruthy()
    })

    it('has aria-expanded="false" by default', () => {
      render(<DishRowCompact {...defaultProps} isExpanded={false} />)
      expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
    })

    it('has aria-expanded="true" when isExpanded is true', () => {
      render(<DishRowCompact {...defaultProps} isExpanded={true} />)
      expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')
    })

    it('aria-label includes dish name and calories', () => {
      render(<DishRowCompact {...defaultProps} />)
      const btn = screen.getByRole('button')
      expect(btn.getAttribute('aria-label')).toContain('Pad Thai')
      expect(btn.getAttribute('aria-label')).toContain('520')
    })
  })

  describe('interaction', () => {
    it('calls onToggle when clicked', async () => {
      const onToggle = vi.fn()
      const user = userEvent.setup()
      render(<DishRowCompact {...defaultProps} onToggle={onToggle} />)
      await user.click(screen.getByRole('button'))
      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('calls onToggle on Enter key press', async () => {
      const onToggle = vi.fn()
      const user = userEvent.setup()
      render(<DishRowCompact {...defaultProps} onToggle={onToggle} />)
      screen.getByRole('button').focus()
      await user.keyboard('{Enter}')
      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('calls onToggle on Space key press', async () => {
      const onToggle = vi.fn()
      const user = userEvent.setup()
      render(<DishRowCompact {...defaultProps} onToggle={onToggle} />)
      screen.getByRole('button').focus()
      await user.keyboard(' ')
      expect(onToggle).toHaveBeenCalledTimes(1)
    })
  })

  describe('macroSource badge', () => {
    it('renders "Est." when macroSource is undefined (default)', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={12}
          totalCarbs={48}
          totalFat={14}
        />
      )
      expect(screen.getByText('Est.')).toBeTruthy()
      expect(screen.queryByText('USDA')).toBeNull()
    })

    it('renders "Est." when macroSource is "ai"', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={12}
          totalCarbs={48}
          totalFat={14}
          macroSource="ai"
        />
      )
      expect(screen.getByText('Est.')).toBeTruthy()
      expect(screen.queryByText('USDA')).toBeNull()
    })

    it('renders "USDA" when macroSource is "usda"', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={12}
          totalCarbs={48}
          totalFat={14}
          macroSource="usda"
        />
      )
      expect(screen.getByText('USDA')).toBeTruthy()
      expect(screen.queryByText('Est.')).toBeNull()
    })

    it('renders "Partial Est." when macroSource is "partial"', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={12}
          totalCarbs={48}
          totalFat={14}
          macroSource="partial"
        />
      )
      expect(screen.getByText('Partial Est.')).toBeTruthy()
      expect(screen.queryByText('USDA')).toBeNull()
      expect(screen.queryByText('Est.')).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('renders without calorie data gracefully', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          recipe={{ ...baseRecipe, estimatedCalories: null }}
        />
      )
      expect(screen.getByText('Pad Thai')).toBeTruthy()
      expect(screen.queryByText(/cal/)).toBeNull()
    })

    it('renders without any macro or calorie data', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          recipe={{ ...baseRecipe, estimatedCalories: null }}
        />
      )
      // Should not throw; name still renders
      expect(screen.getByText('Pad Thai')).toBeTruthy()
      expect(screen.queryByText('Est.')).toBeNull()
    })

    it('rounds macro values to nearest integer', () => {
      render(
        <DishRowCompact
          {...defaultProps}
          totalProtein={12.7}
          totalCarbs={47.3}
          totalFat={13.5}
        />
      )
      expect(screen.getByText('P 13g')).toBeTruthy()
      expect(screen.getByText('C 47g')).toBeTruthy()
      expect(screen.getByText('F 14g')).toBeTruthy()
    })
  })
})

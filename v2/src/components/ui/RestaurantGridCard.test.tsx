import { vi, describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RestaurantGridCard } from './RestaurantGridCard'
import type { DomainRestaurant } from '@/types/database'

// ─── Test data ────────────────────────────────────────────────────────────────

const baseRestaurant: DomainRestaurant = {
  id: 'rest-1',
  placeId: 'ChIJ_test',
  name: 'Sala Thai',
  address: '123 Main St',
  cuisineType: 'Thai',
  referenceImageUrl: null,
  atmosphericPaletteJson: null,
  rating: 4.5,
  userRatingsTotal: 200,
  createdAt: new Date().toISOString(),
}

const defaultProps = {
  restaurant: baseRestaurant,
  dishCount: 3,
  onPress: vi.fn(),
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RestaurantGridCard', () => {
  describe('rendering', () => {
    it('renders restaurant name', () => {
      render(<RestaurantGridCard {...defaultProps} />)
      expect(screen.getByText('Sala Thai')).toBeTruthy()
    })

    it('renders dish count with plural "dishes"', () => {
      render(<RestaurantGridCard {...defaultProps} dishCount={3} />)
      expect(screen.getByText('3 dishes')).toBeTruthy()
    })

    it('renders dish count with singular "dish" for 1 recipe', () => {
      render(<RestaurantGridCard {...defaultProps} dishCount={1} />)
      expect(screen.getByText('1 dish')).toBeTruthy()
    })

    it('renders gradient fallback when referenceImageUrl is null', () => {
      render(<RestaurantGridCard {...defaultProps} />)
      // No img element — fallback is an aria-hidden div gradient
      expect(screen.queryAllByRole('img').length).toBe(0)
      expect(screen.getByText('Sala Thai')).toBeTruthy()
    })

    it('renders image when referenceImageUrl is provided', () => {
      render(
        <RestaurantGridCard
          {...defaultProps}
          restaurant={{ ...baseRestaurant, referenceImageUrl: 'https://example.com/photo.jpg' }}
        />
      )
      // img is aria-hidden — query via DOM directly
      const img = document.querySelector('img')
      expect(img).toBeTruthy()
      expect((img as HTMLImageElement).src).toContain('https://example.com/photo.jpg')
    })
  })

  describe('accessibility', () => {
    it('has role="button" on the interactive element', () => {
      render(<RestaurantGridCard {...defaultProps} />)
      expect(screen.getByRole('button')).toBeTruthy()
    })

    it('has correct aria-label with name and dish count', () => {
      render(<RestaurantGridCard {...defaultProps} dishCount={3} />)
      const btn = screen.getByRole('button')
      expect(btn.getAttribute('aria-label')).toBe('Sala Thai, 3 dishes')
    })

    it('aria-label uses singular "dish" for 1 recipe', () => {
      render(<RestaurantGridCard {...defaultProps} dishCount={1} />)
      const btn = screen.getByRole('button')
      expect(btn.getAttribute('aria-label')).toBe('Sala Thai, 1 dish')
    })

    it('has tabIndex=0', () => {
      render(<RestaurantGridCard {...defaultProps} />)
      const btn = screen.getByRole('button')
      expect(btn.getAttribute('tabindex')).toBe('0')
    })

    it('wraps in listitem role', () => {
      render(<RestaurantGridCard {...defaultProps} />)
      expect(screen.getByRole('listitem')).toBeTruthy()
    })
  })

  describe('interaction', () => {
    it('calls onPress when clicked', async () => {
      const onPress = vi.fn()
      const user = userEvent.setup()
      render(<RestaurantGridCard {...defaultProps} onPress={onPress} />)
      await user.click(screen.getByRole('button'))
      expect(onPress).toHaveBeenCalledTimes(1)
    })

    it('calls onPress via fireEvent click', () => {
      const onPress = vi.fn()
      render(<RestaurantGridCard {...defaultProps} onPress={onPress} />)
      fireEvent.click(screen.getByRole('button'))
      expect(onPress).toHaveBeenCalledOnce()
    })

    it('calls onPress on Enter key press', async () => {
      const onPress = vi.fn()
      const user = userEvent.setup()
      render(<RestaurantGridCard {...defaultProps} onPress={onPress} />)
      screen.getByRole('button').focus()
      await user.keyboard('{Enter}')
      expect(onPress).toHaveBeenCalledTimes(1)
    })

    it('calls onPress on Space key press', async () => {
      const onPress = vi.fn()
      const user = userEvent.setup()
      render(<RestaurantGridCard {...defaultProps} onPress={onPress} />)
      screen.getByRole('button').focus()
      await user.keyboard(' ')
      expect(onPress).toHaveBeenCalledTimes(1)
    })

    it('does not call onPress on other key presses', async () => {
      const onPress = vi.fn()
      const user = userEvent.setup()
      render(<RestaurantGridCard {...defaultProps} onPress={onPress} />)
      screen.getByRole('button').focus()
      await user.keyboard('{ArrowDown}')
      expect(onPress).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('renders with 0 recipes', () => {
      render(<RestaurantGridCard {...defaultProps} dishCount={0} />)
      expect(screen.getByText('0 dishes')).toBeTruthy()
    })

    it('renders without placeId', () => {
      render(
        <RestaurantGridCard
          {...defaultProps}
          restaurant={{ ...baseRestaurant, placeId: null }}
        />
      )
      expect(screen.getByText('Sala Thai')).toBeTruthy()
    })
  })
})

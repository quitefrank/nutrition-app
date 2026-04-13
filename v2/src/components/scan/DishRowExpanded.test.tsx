import { vi, describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DishRowExpanded } from './DishRowExpanded'
import type { DomainRecipe } from '@/types/database'

const baseRecipe: DomainRecipe = {
  id: 'recipe-1',
  restaurantId: 'rest-1',
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

const recipeWithIngredients: DomainRecipe = {
  ...baseRecipe,
  ingredients: [
    {
      id: 'i1', recipeId: 'recipe-1', name: 'Rice noodles', quantity: '150', unit: 'g',
      usdaFdcId: null, caloriesPerServing: null, proteinG: 3, fatG: 0.5, carbsG: 35, confidence: 'high',
    },
    {
      id: 'i2', recipeId: 'recipe-1', name: 'Egg', quantity: '1', unit: null,
      usdaFdcId: null, caloriesPerServing: null, proteinG: 6, fatG: 5, carbsG: 0.5, confidence: 'high',
    },
    {
      id: 'i3', recipeId: 'recipe-1', name: 'Bean sprouts', quantity: '50', unit: 'g',
      usdaFdcId: null, caloriesPerServing: null, proteinG: 1, fatG: 0.1, carbsG: 2, confidence: 'medium',
    },
  ],
}

const recipeWithManyIngredients: DomainRecipe = {
  ...baseRecipe,
  ingredients: [
    { id: 'i1', recipeId: 'recipe-1', name: 'Rice noodles', quantity: null, unit: null, usdaFdcId: null, caloriesPerServing: null, proteinG: null, fatG: null, carbsG: null, confidence: 'high' },
    { id: 'i2', recipeId: 'recipe-1', name: 'Egg', quantity: null, unit: null, usdaFdcId: null, caloriesPerServing: null, proteinG: null, fatG: null, carbsG: null, confidence: 'high' },
    { id: 'i3', recipeId: 'recipe-1', name: 'Bean sprouts', quantity: null, unit: null, usdaFdcId: null, caloriesPerServing: null, proteinG: null, fatG: null, carbsG: null, confidence: 'medium' },
    { id: 'i4', recipeId: 'recipe-1', name: 'Tamarind sauce', quantity: null, unit: null, usdaFdcId: null, caloriesPerServing: null, proteinG: null, fatG: null, carbsG: null, confidence: 'medium' },
    { id: 'i5', recipeId: 'recipe-1', name: 'Peanuts', quantity: null, unit: null, usdaFdcId: null, caloriesPerServing: null, proteinG: null, fatG: null, carbsG: null, confidence: 'high' },
    { id: 'i6', recipeId: 'recipe-1', name: 'Green onion', quantity: null, unit: null, usdaFdcId: null, caloriesPerServing: null, proteinG: null, fatG: null, carbsG: null, confidence: 'medium' },
  ],
}

const recipeWithNoIngredients: DomainRecipe = {
  ...baseRecipe,
  ingredients: [],
}

const defaultProps = {
  recipe: baseRecipe,
  expandedRecipe: recipeWithIngredients,
  onCollapse: vi.fn(),
  onAddToRecipes: vi.fn(),
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DishRowExpanded', () => {
  describe('rendering', () => {
    it('renders dish name in display font', () => {
      render(<DishRowExpanded {...defaultProps} />)
      expect(screen.getByText('Pad Thai')).toBeTruthy()
    })

    it('renders calorie count in terracotta', () => {
      render(<DishRowExpanded {...defaultProps} />)
      expect(screen.getByText('520 cal')).toBeTruthy()
    })

    it('renders MacroBar', () => {
      render(<DishRowExpanded {...defaultProps} totalProtein={12} totalCarbs={48} totalFat={14} />)
      expect(screen.getByText('PROTEIN')).toBeTruthy()
      expect(screen.getByText('CARBS')).toBeTruthy()
      expect(screen.getByText('FAT')).toBeTruthy()
      expect(screen.getByText('FIBRE')).toBeTruthy()
    })

    it('renders "Add to My Recipes" button', () => {
      render(<DishRowExpanded {...defaultProps} />)
      expect(screen.getByRole('button', { name: /add to my recipes/i })).toBeTruthy()
    })

    it('has aria-label with dish name on the section', () => {
      render(<DishRowExpanded {...defaultProps} />)
      // <section> with aria-label implicitly has role="region"
      const region = screen.getByRole('region', { name: /pad thai details/i })
      expect(region).toBeTruthy()
    })

    it('section id is scoped to the recipe id', () => {
      render(<DishRowExpanded {...defaultProps} />)
      const region = screen.getByRole('region', { name: /pad thai details/i })
      expect(region.id).toBe('dish-details-recipe-1')
    })
  })

  describe('ingredient list', () => {
    it('renders up to 5 ingredients from expandedRecipe', () => {
      render(<DishRowExpanded {...defaultProps} expandedRecipe={recipeWithIngredients} />)
      expect(screen.getByText(/Rice noodles/)).toBeTruthy()
      expect(screen.getByText(/Egg/)).toBeTruthy()
      expect(screen.getByText(/Bean sprouts/)).toBeTruthy()
    })

    it('shows skeleton when expandedRecipe is null', () => {
      const { container } = render(
        <DishRowExpanded
          recipe={baseRecipe}
          expandedRecipe={null}
          onCollapse={vi.fn()}
          onAddToRecipes={vi.fn()}
        />
      )
      // Skeleton divs have animate-pulse class
      expect(container.querySelector('.animate-pulse')).toBeTruthy()
    })

    it('shows error state when ingredientsError is true and expandedRecipe is null', () => {
      const { container } = render(
        <DishRowExpanded
          recipe={baseRecipe}
          expandedRecipe={null}
          ingredientsError={true}
          onCollapse={vi.fn()}
          onAddToRecipes={vi.fn()}
        />
      )
      expect(screen.getByText(/couldn't load ingredients/i)).toBeTruthy()
      // No skeleton when error
      expect(container.querySelector('.animate-pulse')).toBeNull()
    })

    it('shows error state when ingredientsError is true even when expandedRecipe is non-null', () => {
      const { container } = render(
        <DishRowExpanded
          {...defaultProps}
          expandedRecipe={recipeWithIngredients}
          ingredientsError={true}
        />
      )
      expect(screen.getByText(/couldn't load ingredients/i)).toBeTruthy()
      // No skeleton and no ingredient list when error takes priority
      expect(container.querySelector('.animate-pulse')).toBeNull()
      expect(screen.queryByText(/Rice noodles/)).toBeNull()
    })

    it('shows "+N more" when > 5 ingredients', () => {
      render(
        <DishRowExpanded
          {...defaultProps}
          expandedRecipe={recipeWithManyIngredients}
        />
      )
      expect(screen.getByText('+1 more')).toBeTruthy()
    })

    it('hides ingredient section when expandedRecipe has 0 ingredients', () => {
      render(
        <DishRowExpanded
          {...defaultProps}
          expandedRecipe={recipeWithNoIngredients}
        />
      )
      // No ingredient names rendered
      expect(screen.queryByText(/Rice noodles/)).toBeNull()
      // No skeleton
      expect(screen.queryByText(/more/)).toBeNull()
    })
  })

  describe('interaction', () => {
    it('calls onCollapse when collapse button clicked', async () => {
      const onCollapse = vi.fn()
      const user = userEvent.setup()
      render(
        <DishRowExpanded
          {...defaultProps}
          onCollapse={onCollapse}
        />
      )
      await user.click(screen.getByLabelText('Collapse'))
      expect(onCollapse).toHaveBeenCalledTimes(1)
    })

    it('disables collapse button after first click to prevent double-tap', async () => {
      const onCollapse = vi.fn()
      const user = userEvent.setup()
      render(
        <DishRowExpanded
          {...defaultProps}
          onCollapse={onCollapse}
        />
      )
      const collapseBtn = screen.getByLabelText('Collapse')
      await user.click(collapseBtn)
      expect(onCollapse).toHaveBeenCalledTimes(1)
      expect(collapseBtn.hasAttribute('disabled')).toBe(true)
    })

    it('calls onAddToRecipes when CTA clicked', async () => {
      const onAddToRecipes = vi.fn()
      const user = userEvent.setup()
      render(
        <DishRowExpanded
          {...defaultProps}
          onAddToRecipes={onAddToRecipes}
        />
      )
      await user.click(screen.getByRole('button', { name: /add to my recipes/i }))
      expect(onAddToRecipes).toHaveBeenCalledTimes(1)
    })
  })

  describe('reduced motion', () => {
    it('renders correctly (no animation hooks used in this component)', () => {
      render(<DishRowExpanded {...defaultProps} />)
      // DishRowExpanded delegates all motion to the parent AnimatePresence wrapper.
      // Component still renders dish name and CTA.
      expect(screen.getByText('Pad Thai')).toBeTruthy()
      expect(screen.getByRole('button', { name: /add to my recipes/i })).toBeTruthy()
    })

    it('collapse button has no inline transition style', () => {
      render(<DishRowExpanded {...defaultProps} />)
      const collapseBtn = screen.getByLabelText('Collapse')
      // Transition is handled by the parent motion.div, not the button itself
      expect(collapseBtn.style.transition).toBe('')
    })
  })

  describe('provenance indicator', () => {
    it('renders nothing when expandedRecipe is null (loading state)', () => {
      render(
        <DishRowExpanded
          recipe={baseRecipe}
          expandedRecipe={null}
          onCollapse={vi.fn()}
          onAddToRecipes={vi.fn()}
        />
      )
      // deriveMacroSource(null) returns null — badge not rendered
      expect(screen.queryByText('Est.')).toBeNull()
      expect(screen.queryByText('USDA')).toBeNull()
      expect(screen.queryByText('Partial Est.')).toBeNull()
    })

    it('renders "Est." when expandedRecipe has empty ingredients array (resolved, no USDA data)', () => {
      render(<DishRowExpanded {...defaultProps} expandedRecipe={recipeWithNoIngredients} />)
      // deriveMacroSource([]) returns 'ai' — data resolved, no USDA matches
      expect(screen.getByText('Est.')).toBeTruthy()
      expect(screen.queryByText('USDA')).toBeNull()
    })

    it('renders "Est." badge when all ingredients have usdaFdcId: null', () => {
      render(<DishRowExpanded {...defaultProps} expandedRecipe={recipeWithIngredients} />)
      // recipeWithIngredients has all usdaFdcId: null → 'ai' source
      expect(screen.getByText('Est.')).toBeTruthy()
      expect(screen.queryByText('USDA')).toBeNull()
    })

    it('renders "USDA" badge when all ingredients have usdaFdcId set', () => {
      const recipeAllUsda: DomainRecipe = {
        ...baseRecipe,
        ingredients: [
          { id: 'u1', recipeId: 'recipe-1', name: 'Rice noodles', quantity: '150', unit: 'g', usdaFdcId: 12345, caloriesPerServing: null, proteinG: 3, fatG: 0.5, carbsG: 35, confidence: 'high' },
          { id: 'u2', recipeId: 'recipe-1', name: 'Egg', quantity: '1', unit: null, usdaFdcId: 67890, caloriesPerServing: null, proteinG: 6, fatG: 5, carbsG: 0.5, confidence: 'high' },
        ],
      }
      render(<DishRowExpanded {...defaultProps} expandedRecipe={recipeAllUsda} />)
      expect(screen.getByText('USDA')).toBeTruthy()
      expect(screen.queryByText('Est.')).toBeNull()
    })

    it('renders "Partial Est." badge when some ingredients have usdaFdcId and some do not', () => {
      const recipePartialUsda: DomainRecipe = {
        ...baseRecipe,
        ingredients: [
          { id: 'p1', recipeId: 'recipe-1', name: 'Rice noodles', quantity: '150', unit: 'g', usdaFdcId: 12345, caloriesPerServing: null, proteinG: 3, fatG: 0.5, carbsG: 35, confidence: 'high' },
          { id: 'p2', recipeId: 'recipe-1', name: 'Egg', quantity: '1', unit: null, usdaFdcId: null, caloriesPerServing: null, proteinG: 6, fatG: 5, carbsG: 0.5, confidence: 'high' },
        ],
      }
      render(<DishRowExpanded {...defaultProps} expandedRecipe={recipePartialUsda} />)
      expect(screen.getByText('Partial Est.')).toBeTruthy()
      expect(screen.queryByText('USDA')).toBeNull()
    })

    it('MacroBar motion wrapper is present when macro values are non-null', () => {
      const { container } = render(
        <DishRowExpanded
          {...defaultProps}
          totalProtein={12}
          totalCarbs={48}
          totalFat={14}
        />
      )
      // The motion.div wrapping MacroBar renders as a plain div with data-testid in tests
      expect(container.querySelector('[data-testid="macrobar-motion-wrapper"]')).toBeTruthy()
    })

    it('calorie motion wrapper is present (AC4 — calorie animates alongside MacroBar)', () => {
      const { container } = render(
        <DishRowExpanded
          {...defaultProps}
          totalProtein={12}
          totalCarbs={48}
          totalFat={14}
        />
      )
      expect(container.querySelector('[data-testid="calorie-motion-wrapper"]')).toBeTruthy()
    })
  })

  describe('portion stepper', () => {
    it('default portion is 1× — MacroBar receives unscaled values', () => {
      render(<DishRowExpanded {...defaultProps} totalProtein={12} totalCarbs={48} totalFat={14} />)
      // Stepper group is present
      expect(screen.getByRole('group', { name: /serving size/i })).toBeTruthy()
      // Calorie display is unscaled
      expect(screen.getByText('520 cal')).toBeTruthy()
      // 1× pill is active by default
      expect(screen.getByRole('button', { name: '1 serving' }).getAttribute('aria-pressed')).toBe('true')
      // MacroBar shows unscaled values
      expect(screen.getByText('12g')).toBeTruthy()
      expect(screen.getByText('48g')).toBeTruthy()
      expect(screen.getByText('14g')).toBeTruthy()
    })

    it('tapping 2× scales calories × 2 in the calorie header', async () => {
      const user = userEvent.setup()
      render(<DishRowExpanded {...defaultProps} />)
      await user.click(screen.getByRole('button', { name: /2 servings/i }))
      expect(screen.getByText('1040 cal')).toBeTruthy()
    })

    it('tapping 2× scales protein, carbs, fat, fibre × 2 in MacroBar', async () => {
      const user = userEvent.setup()
      render(<DishRowExpanded {...defaultProps} totalProtein={12} totalCarbs={48} totalFat={14} totalFibre={10} />)
      await user.click(screen.getByRole('button', { name: /2 servings/i }))
      expect(screen.getByText('24g')).toBeTruthy()
      expect(screen.getByText('96g')).toBeTruthy()
      expect(screen.getByText('28g')).toBeTruthy()
      expect(screen.getByText('20g')).toBeTruthy()
    })

    it('tapping 0.5× halves the calorie display', async () => {
      const user = userEvent.setup()
      render(<DishRowExpanded {...defaultProps} />)
      await user.click(screen.getByRole('button', { name: /0.5 serving/i }))
      expect(screen.getByText('260 cal')).toBeTruthy()
    })

    it('collapsing resets portion to 1× (next render shows 1× pill as active)', async () => {
      const user = userEvent.setup()
      const onCollapse = vi.fn()
      render(<DishRowExpanded {...defaultProps} onCollapse={onCollapse} />)
      // Select 2× first
      await user.click(screen.getByRole('button', { name: /2 servings/i }))
      expect(screen.getByRole('button', { name: '2 servings' }).getAttribute('aria-pressed')).toBe('true')
      // Collapse resets portion to 1×
      await user.click(screen.getByLabelText('Collapse'))
      expect(screen.getByRole('button', { name: '1 serving' }).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByRole('button', { name: '2 servings' }).getAttribute('aria-pressed')).toBe('false')
    })

    it('when totalProtein is null, scaledProtein passed to MacroBar is also null (not 0)', async () => {
      const user = userEvent.setup()
      render(
        <DishRowExpanded
          {...defaultProps}
          totalProtein={null}
          totalCarbs={null}
          totalFat={null}
          totalFibre={null}
        />
      )
      await user.click(screen.getByRole('button', { name: /2 servings/i }))
      // All 4 macro cells show — because null propagates (not coerced to 0)
      const dashes = screen.getAllByText('—')
      expect(dashes).toHaveLength(4)
      // If null were coerced to 0, MacroBar would render "0g" — assert it does not
      expect(screen.queryByText('0g')).toBeNull()
    })

    it('portion pills have aria-pressed set correctly (active = true, inactive = false)', () => {
      render(<DishRowExpanded {...defaultProps} />)
      // Default: 1× is active, rest are inactive
      expect(screen.getByRole('button', { name: '0.5 serving' }).getAttribute('aria-pressed')).toBe('false')
      expect(screen.getByRole('button', { name: '1 serving' }).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByRole('button', { name: '1.5 servings' }).getAttribute('aria-pressed')).toBe('false')
      expect(screen.getByRole('button', { name: '2 servings' }).getAttribute('aria-pressed')).toBe('false')
    })
  })
})

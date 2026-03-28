'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useSetAtmospheric } from '@/contexts/atmospheric-context'
import { useAddToGrocery } from '@/hooks/use-grocery'
import type { Recipe, DomainIngredient } from '@/types/domain'

interface RecipeDetailProps {
  recipe: Recipe
}

export function RecipeDetail({ recipe }: RecipeDetailProps) {
  const setAtmospheric = useSetAtmospheric()

  useEffect(() => {
    if (recipe.dishImageUrl) {
      setAtmospheric({
        imageUrl: recipe.dishImageUrl,
        palette: null,
        tier: 'restaurant',
        backgroundColorFallback: '#0a0a0a',
      })
    } else {
      setAtmospheric(undefined)
    }
  }, [recipe.dishImageUrl, setAtmospheric])

  const ingredients = recipe.ingredients ?? []
  const { mutate: addToGrocery, isPending: isAddingToGrocery } = useAddToGrocery()

  return (
    <div className="flex flex-col flex-1 px-[var(--spacing-4)] py-[var(--spacing-4)]">
      {/* Dish image */}
      <div className="relative w-full rounded-[var(--radius-md)] overflow-hidden mb-[var(--spacing-4)]" style={{ height: '200px' }}>
        {recipe.dishImageUrl ? (
          <Image
            src={recipe.dishImageUrl}
            alt={recipe.name}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        ) : (
          <div className="w-full h-full" style={{ background: 'rgba(255,255,255,0.08)' }} aria-hidden="true" />
        )}
      </div>

      {/* Dish name */}
      <h1
        style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.2 }}
        className="mb-[var(--spacing-1)]"
      >
        {recipe.name}
      </h1>

      {/* Restaurant name */}
      {recipe.restaurant?.name && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }} className="mb-[var(--spacing-4)]">
          {recipe.restaurant.name}
        </p>
      )}

      {/* Evidence block — reconstructed from saved ingredient confidence */}
      <SavedEvidenceBlock ingredients={ingredients} />

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.10)', margin: 'var(--spacing-4) 0' }} />

      {/* Serving size */}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }} className="mb-[var(--spacing-3)]">
        Serving size: {recipe.servingSize}×
      </p>

      {/* Ingredient list */}
      <h2
        style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', fontWeight: 600 }}
        className="mb-[var(--spacing-2)]"
      >
        Ingredients
      </h2>
      <ul className="flex flex-col gap-[var(--spacing-2)] mb-[var(--spacing-6)]">
        {ingredients.map(ing => (
          <IngredientRow key={ing.id} ingredient={ing} />
        ))}
        {ingredients.length === 0 && (
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>No ingredients saved.</li>
        )}
      </ul>

      {/* Nutrition panel */}
      <NutritionPanel ingredients={ingredients} servingSize={recipe.servingSize} />

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.10)', margin: 'var(--spacing-4) 0' }} />

      {/* Add to Grocery List CTA */}
      <button
        onClick={() => addToGrocery(recipe.id)}
        disabled={isAddingToGrocery || ingredients.length === 0}
        style={{
          width: '100%',
          height: '56px',
          borderRadius: 'var(--radius-xl)',
          background: isAddingToGrocery ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)',
          color: isAddingToGrocery ? 'var(--text-tertiary)' : 'var(--text-primary)',
          fontWeight: 600,
          fontSize: 'var(--text-base)',
          border: 'none',
          cursor: isAddingToGrocery ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s, color 0.15s',
        }}
        aria-label="Add to Grocery List"
      >
        {isAddingToGrocery ? 'Adding…' : 'Add to Grocery List'}
      </button>
    </div>
  )
}

function IngredientRow({ ingredient }: { ingredient: DomainIngredient }) {
  return (
    <li className="flex items-center justify-between gap-[var(--spacing-2)]">
      <div className="flex items-center gap-[var(--spacing-2)] flex-1 min-w-0">
        {/* Low confidence indicator — colour + text label (NFR16) */}
        {ingredient.confidenceLevel === 'low' && (
          <span
            aria-label="varies by restaurant"
            title="varies by restaurant"
            style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}
          >
            ≈
          </span>
        )}
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }} className="truncate">
          {ingredient.name}
        </span>
        {ingredient.confidenceLevel === 'low' && (
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            varies by restaurant
          </span>
        )}
      </div>
      {(ingredient.quantity || ingredient.unit) && (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {[ingredient.quantity, ingredient.unit].filter(Boolean).join(' ')}
        </span>
      )}
    </li>
  )
}

// Evidence block for a previously saved recipe — reconstructed from DomainIngredient confidence levels
// Mirrors EvidenceBlock logic in dish-detail-sheet.tsx but works from DomainIngredient[] not DishResult
function SavedEvidenceBlock({ ingredients }: { ingredients: DomainIngredient[] }) {
  const highCount = ingredients.filter(i => i.confidenceLevel === 'high').length
  const total = ingredients.length
  if (total === 0) return null
  const isHigh = highCount / total >= 0.8
  const evidencePills = ingredients.filter(i => i.confidenceLevel === 'high').slice(0, 4)

  if (isHigh) {
    return (
      <p style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,0.60)' }} className="mb-[var(--spacing-3)]">
        Confirmed by dish name, photo, and ingredients
      </p>
    )
  }

  return (
    <div className="mb-[var(--spacing-3)]">
      <p style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,0.60)' }}>
        Identified from photo — some ingredients confirmed
      </p>
      {evidencePills.length > 0 && (
        <div className="flex flex-wrap gap-[var(--spacing-1)] mt-[var(--spacing-2)]">
          {evidencePills.map(ing => (
            <span
              key={ing.id}
              style={{
                fontSize: 'var(--text-2xs)',
                color: 'rgba(255,255,255,0.70)',
                background: 'rgba(255,255,255,0.10)',
                borderRadius: 'var(--radius-full)',
                padding: '2px 10px',
              }}
            >
              {ing.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Nutrition panel — handles three states:
// 1. All macros null → "Nutrition unavailable"
// 2. Some macros null → "Partial nutrition data" + available totals
// 3. All macros present → Full panel with totals
function NutritionPanel({ ingredients, servingSize }: { ingredients: DomainIngredient[]; servingSize: number }) {
  if (ingredients.length === 0) return null

  const anyMacros = ingredients.some(i => i.caloriesKcal !== null)
  const allMacrosNull = ingredients.every(i =>
    i.caloriesKcal === null && i.proteinG === null && i.fatG === null && i.carbsG === null
  )
  const partialMacros = anyMacros && ingredients.some(
    i => i.caloriesKcal === null || i.proteinG === null || i.fatG === null || i.carbsG === null
  )

  if (allMacrosNull) {
    return (
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }} className="mb-[var(--spacing-4)]">
        Nutrition unavailable
      </p>
    )
  }

  const divisor = Math.max(1, servingSize)
  const totalCalories = ingredients.reduce((sum, i) => sum + (i.caloriesKcal ?? 0), 0) / divisor
  const totalProtein = ingredients.reduce((sum, i) => sum + (i.proteinG ?? 0), 0) / divisor
  const totalFat = ingredients.reduce((sum, i) => sum + (i.fatG ?? 0), 0) / divisor
  const totalCarbs = ingredients.reduce((sum, i) => sum + (i.carbsG ?? 0), 0) / divisor

  return (
    <div className="mb-[var(--spacing-4)]">
      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }} className="mb-[var(--spacing-1)]">
        {partialMacros ? 'Partial nutrition data · per serving' : 'Per serving'}
        {divisor > 1 && ` (${divisor} servings total)`}
      </p>
      <div className="flex gap-[var(--spacing-4)]">
        <NutritionCell label="Calories" value={Math.round(totalCalories)} unit="kcal" />
        <NutritionCell label="Protein" value={Math.round(totalProtein * 10) / 10} unit="g" />
        <NutritionCell label="Fat" value={Math.round(totalFat * 10) / 10} unit="g" />
        <NutritionCell label="Carbs" value={Math.round(totalCarbs * 10) / 10} unit="g" />
      </div>
    </div>
  )
}

function NutritionCell({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex flex-col items-center">
      <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 600 }}>
        {value}{unit}
      </span>
      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>{label}</span>
    </div>
  )
}

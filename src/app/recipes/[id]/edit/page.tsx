'use client'

import { useRouter } from 'next/navigation'
import { use, useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useRecipe, useUpdateRecipe } from '@/hooks/use-recipes'
import type { RecipeUpdateRequest } from '@/types/api'
import type { DomainIngredient } from '@/types/domain'

interface PageProps {
  params: Promise<{ id: string }>
}

// Scale a quantity string by a factor. Returns null or non-numeric quantities unchanged.
// Handles fraction strings like "1/2", "3/4" correctly.
function scaleQuantity(quantity: string | null, factor: number): string | null {
  if (!quantity) return quantity
  const fractionMatch = quantity.match(/^(\d+)\/(\d+)$/)
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1], 10) / parseInt(fractionMatch[2], 10)
    const scaled = num * factor
    return Number.isInteger(scaled) ? String(scaled) : String(Math.round(scaled * 100) / 100)
  }
  const num = parseFloat(quantity)
  if (isNaN(num)) return quantity
  const scaled = num * factor
  return Number.isInteger(scaled) ? String(scaled) : String(Math.round(scaled * 100) / 100)
}

export default function RecipeEditPage({ params }: PageProps) {
  const { id } = use(params)
  const { data: recipe, isLoading, isError } = useRecipe(id)
  const { mutate: updateRecipe, isPending } = useUpdateRecipe()
  const router = useRouter()

  const [editedName, setEditedName] = useState('')
  const [editedServingSize, setEditedServingSize] = useState(1)
  const [editedIngredients, setEditedIngredients] = useState<DomainIngredient[]>([])
  const isInitialized = useRef(false)
  const servingSizeRef = useRef(1) // mirrors editedServingSize for stale-closure-free factor computation

  // Initialise state from recipe data exactly once when recipe loads
  useEffect(() => {
    if (recipe && !isInitialized.current) {
      isInitialized.current = true
      setEditedName(recipe.name)
      servingSizeRef.current = recipe.servingSize
      setEditedServingSize(recipe.servingSize)
      setEditedIngredients(recipe.ingredients ?? [])
    }
  }, [recipe])

  // Scale all ingredient quantities when serving size changes
  function handleServingSizeChange(newSize: number) {
    const factor = newSize / servingSizeRef.current
    servingSizeRef.current = newSize
    setEditedServingSize(newSize)
    setEditedIngredients(prev =>
      prev.map(ing => ({ ...ing, quantity: scaleQuantity(ing.quantity, factor) }))
    )
  }

  function handleIngredientChange(index: number, field: 'name' | 'quantity' | 'unit', value: string) {
    setEditedIngredients(prev =>
      prev.map((ing, i) => i === index ? { ...ing, [field]: value || null } : ing)
    )
  }

  function handleSave() {
    if (!editedName.trim()) return
    const payload: RecipeUpdateRequest = {
      name: editedName.trim(),
      servingSize: editedServingSize,
      ingredients: editedIngredients.map(ing => ({
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        confidenceLevel: ing.confidenceLevel,
      })),
    }
    updateRecipe({ id, payload }, {
      onSuccess: () => router.back(),
      onError: (error) => toast.error(error.message),
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>Loading…</p>
      </div>
    )
  }

  if (isError || !recipe) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-[var(--spacing-4)] px-[var(--spacing-4)] text-center">
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>Could not load recipe for editing.</p>
        <button onClick={() => router.back()} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', minHeight: '44px' }}>
          ← Go back
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-full">
      {/* Header */}
      <div className="px-[var(--spacing-4)] pt-[var(--spacing-4)] flex items-center justify-between">
        <button
          onClick={() => router.back()}
          disabled={isPending}
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', minHeight: '44px' }}
          aria-label="Cancel"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isPending || !editedName.trim()}
          style={{
            fontSize: 'var(--text-sm)', fontWeight: 600,
            color: isPending || !editedName.trim() ? 'var(--text-tertiary)' : 'var(--text-primary)',
            background: 'none', border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
            padding: '8px 0', minHeight: '44px',
          }}
          aria-label="Save changes"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex flex-col flex-1 px-[var(--spacing-4)] py-[var(--spacing-4)]">
        {/* Recipe name */}
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }} className="mb-[var(--spacing-1)]">
          Dish name
        </label>
        <input
          value={editedName}
          onChange={e => setEditedName(e.target.value)}
          style={{
            width: '100%', fontSize: 'var(--text-base)', color: 'var(--text-primary)',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: 'var(--spacing-4)',
          }}
          aria-label="Recipe name"
        />

        {/* Serving size */}
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }} className="mb-[var(--spacing-1)]">
          Serving size
        </label>
        <input
          type="number"
          min={1}
          step={1}
          value={editedServingSize}
          onChange={e => {
            const val = parseInt(e.target.value, 10)
            if (!isNaN(val) && val >= 1) handleServingSizeChange(val)
          }}
          style={{
            width: '80px', fontSize: 'var(--text-base)', color: 'var(--text-primary)',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: 'var(--spacing-4)',
          }}
          aria-label="Serving size"
        />

        {/* Ingredients */}
        <h2 style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', fontWeight: 600 }} className="mb-[var(--spacing-2)]">
          Ingredients
        </h2>
        <ul className="flex flex-col gap-[var(--spacing-3)]">
          {editedIngredients.map((ing, index) => (
            <li key={ing.id} className="flex gap-[var(--spacing-2)]">
              <input
                value={ing.name}
                onChange={e => handleIngredientChange(index, 'name', e.target.value)}
                placeholder="Ingredient name"
                style={{
                  flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius-sm)', padding: '10px',
                }}
                aria-label={`Ingredient ${index + 1} name`}
              />
              <input
                value={ing.quantity ?? ''}
                onChange={e => handleIngredientChange(index, 'quantity', e.target.value)}
                placeholder="Qty"
                style={{
                  width: '64px', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius-sm)', padding: '10px',
                }}
                aria-label={`Ingredient ${index + 1} quantity`}
              />
              <input
                value={ing.unit ?? ''}
                onChange={e => handleIngredientChange(index, 'unit', e.target.value)}
                placeholder="Unit"
                style={{
                  width: '64px', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius-sm)', padding: '10px',
                }}
                aria-label={`Ingredient ${index + 1} unit`}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

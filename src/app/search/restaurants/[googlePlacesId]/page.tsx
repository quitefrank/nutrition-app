'use client'

import { use, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { DishCard } from '@/components/scan/scan-results'
import { DishDetailSheet } from '@/components/scan/dish-detail-sheet'
import { useRestaurantDishes } from '@/hooks/use-search'
import { useSaveRecipe, useDeleteRecipe } from '@/hooks/use-recipes'
import { useOnlineStatus } from '@/hooks/use-online-status'
import type { DishResult, RecipeSaveRequest } from '@/types/api'

interface PageProps {
  params: Promise<{ googlePlacesId: string }>
}

export default function RestaurantDishListPage({ params }: PageProps) {
  const { googlePlacesId } = use(params)
  const searchParams = useSearchParams()
  const restaurantName = searchParams.get('restaurantName') ?? undefined
  const isOnline = useOnlineStatus()

  const [selectedDish, setSelectedDish] = useState<DishResult | null>(null)
  const [savedDishIds, setSavedDishIds] = useState<Record<string, string>>({})

  const { data: dishes, isLoading, error, refetch } = useRestaurantDishes(
    isOnline ? googlePlacesId : null
  )

  const saveMutation = useSaveRecipe()
  const deleteMutation = useDeleteRecipe()

  const handleSave = async (dish: DishResult) => {
    if (saveMutation.isPending) return
    const payload: RecipeSaveRequest = {
      name: dish.name,
      dishImageUrl: dish.imageUrl,
      confidenceMetadata: { confidenceSource: 'search-generated' },
      servingSize: 1,
      ingredients: dish.ingredients,
      restaurantGooglePlacesId: googlePlacesId,
      restaurantName: restaurantName,
    }
    try {
      const saved = await saveMutation.mutateAsync(payload)
      const key = `${dish.name}-${dishes?.indexOf(dish) ?? 0}`
      setSavedDishIds(prev => ({ ...prev, [key]: saved.data.id }))
      toast('Recipe saved')
    } catch {
      toast.error('Failed to save recipe')
    }
  }

  const handleRemove = async (dish: DishResult) => {
    const key = `${dish.name}-${dishes?.indexOf(dish) ?? 0}`
    const savedId = savedDishIds[key]
    if (!savedId || deleteMutation.isPending) return
    try {
      await deleteMutation.mutateAsync(savedId)
      setSavedDishIds(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      toast('Recipe removed')
    } catch {
      toast.error('Failed to remove recipe')
    }
  }

  if (!isOnline) {
    return (
      <div style={{ padding: '0 var(--spacing-4)' }}>
        <PageHeader title={restaurantName ?? 'Restaurant'} showBack />
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            paddingTop: 'var(--spacing-8)',
          }}
        >
          Search requires an internet connection.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 var(--spacing-4)', paddingBottom: '80px' }}>
      <PageHeader title={restaurantName ?? 'Restaurant'} showBack />

      {isLoading && (
        <div
          role="status"
          aria-label="Loading dishes"
          style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-6)' }}
        >
          <div
            className="animate-spin"
            style={{
              width: 32,
              height: 32,
              border: '3px solid var(--glass-border)',
              borderTopColor: 'var(--text-primary)',
              borderRadius: '50%',
            }}
          />
        </div>
      )}

      {error && !isLoading && (
        <div
          role="alert"
          data-testid="error-state"
          style={{ paddingTop: 'var(--spacing-4)' }}
        >
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--spacing-3)',
            }}
          >
            Could not load dishes. Please try again.
          </p>
          <button
            onClick={() => void refetch()}
            style={{
              width: '100%',
              height: '56px',
              borderRadius: 'var(--radius-xl)',
              background: 'rgba(255,255,255,0.90)',
              color: 'var(--text-on-button)',
              fontWeight: 600,
              fontSize: 'var(--text-base)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )}

      {dishes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
          {dishes.map((dish, i) => (
            <DishCard
              key={`${dish.name}-${i}`}
              dish={dish}
              onClick={() => setSelectedDish(dish)}
            />
          ))}
        </div>
      )}

      <DishDetailSheet
        dish={selectedDish}
        open={selectedDish !== null}
        onClose={() => setSelectedDish(null)}
        onSave={handleSave}
        savedId={selectedDish ? savedDishIds[`${selectedDish.name}-${dishes?.indexOf(selectedDish) ?? 0}`] : undefined}
        nutritionAvailable={false}
        onRemove={handleRemove}
      />
    </div>
  )
}

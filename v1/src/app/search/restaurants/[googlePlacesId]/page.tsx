'use client'

import { use, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { DishCard } from '@/components/scan/scan-results'
import { DishDetailSheet } from '@/components/scan/dish-detail-sheet'
import { useRestaurantDishStream } from '@/hooks/use-search'
import { useSaveRecipe, useDeleteRecipe, useRecipes } from '@/hooks/use-recipes'
import { useOnlineStatus } from '@/hooks/use-online-status'
import type { DishResult, RecipeSaveRequest } from '@/types/api'

interface PageProps {
  params: Promise<{ googlePlacesId: string }>
}

// ─── Scanning progress indicator ──────────────────────────────────────────────

function ScanProgressIndicator({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      aria-label={message ?? 'Scanning menu…'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--spacing-4)',
        padding: 'var(--spacing-8) var(--spacing-4)',
      }}
    >
      {/* Animated scan ring */}
      <div style={{ position: 'relative', width: 56, height: 56 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid var(--glass-card-border)',
          }}
        />
        <div
          className="animate-spin"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: 'var(--text-primary)',
          }}
        />
        {/* Camera icon dot */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--text-secondary)' }}
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </div>
      </div>

      {/* Status text */}
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          maxWidth: 240,
          lineHeight: 1.4,
          transition: 'opacity 0.3s ease',
        }}
      >
        {message ?? 'Scanning photos…'}
      </p>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function RestaurantDishListPage({ params }: PageProps) {
  const { googlePlacesId } = use(params)
  const searchParams = useSearchParams()
  const restaurantName = searchParams.get('restaurantName') ?? undefined
  const isOnline = useOnlineStatus()
  const router = useRouter()

  const [selectedDish, setSelectedDish] = useState<DishResult | null>(null)
  const [savedDishIds, setSavedDishIds] = useState<Record<string, string>>({})

  const { dishes, statusMessage, isStreaming, error, retry } = useRestaurantDishStream(
    isOnline ? googlePlacesId : null,
    restaurantName,
  )

  const { data: allRecipes = [] } = useRecipes()

  // Recipes saved from this restaurant
  const savedAtThisRestaurant = allRecipes.filter(
    r => r.restaurant?.googlePlacesId === googlePlacesId
  )

  // Write localStorage signal when there are saved recipes at this restaurant (AC: 3)
  useEffect(() => {
    if (savedAtThisRestaurant.length === 0) return

    const restaurantId = savedAtThisRestaurant[0].restaurantId
    if (!restaurantId) return

    try {
      localStorage.setItem('plately-search-visit', JSON.stringify({
        googlePlacesId,
        restaurantId,
        restaurantName: restaurantName ?? savedAtThisRestaurant[0].restaurant?.name ?? null,
        recipeCount: savedAtThisRestaurant.length,
        visitedAt: Date.now(),
      }))
    } catch {
      // localStorage unavailable — non-fatal
    }
  }, [savedAtThisRestaurant.length, googlePlacesId, restaurantName]) // eslint-disable-line react-hooks/exhaustive-deps

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
      window.dispatchEvent(new CustomEvent('plately:recipeSaved'))
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

      {/* Progressive scan indicator */}
      {isStreaming && <ScanProgressIndicator message={statusMessage} />}

      {/* Error state */}
      {error && !isStreaming && (
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
            {error}
          </p>
          <button
            onClick={retry}
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

      {/* Saved from here — shown when user has recipes from this restaurant (AC: 1, 3) */}
      {savedAtThisRestaurant.length > 0 && (
        <div style={{ marginBottom: 'var(--spacing-4)' }}>
          <h2
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              fontWeight: 600,
              marginBottom: 'var(--spacing-2)',
            }}
          >
            Saved from here
          </h2>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', listStyle: 'none', padding: 0, margin: 0 }}>
            {savedAtThisRestaurant.map(recipe => (
              <li key={recipe.id}>
                <button
                  onClick={() => router.push(`/recipes/${recipe.id}`)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--spacing-3)',
                    cursor: 'pointer',
                    minHeight: '44px',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                    {recipe.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dish list — shown once streaming completes */}
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

'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useRecipes } from '@/hooks/use-recipes'
import { PageHeader } from '@/components/layout/page-header'
import { GlassCard } from '@/components/ui/glass-card'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function RestaurantProfilePage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { data: recipes, isLoading } = useRecipes()
  const restaurantRecipes = (recipes ?? []).filter(r => r.restaurantId === id)
  const restaurantName = restaurantRecipes[0]?.restaurant?.name ?? 'Restaurant'

  // Restaurant image: prefer restaurant_image_url, fall back to dish image (AC: 1)
  const restaurantImageUrl =
    restaurantRecipes[0]?.restaurant?.restaurantImageUrl ??
    restaurantRecipes[0]?.dishImageUrl ??
    null

  // Google Places ID for "Explore dishes" link (AC: 1)
  const googlePlacesId = restaurantRecipes[0]?.restaurant?.googlePlacesId ?? null

  return (
    <div
      className="flex flex-col flex-1 min-h-full"
      style={{ paddingBottom: '80px' }}
    >
      <div className="px-[var(--spacing-4)]">
        <PageHeader title={restaurantName} showBack />
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', paddingBottom: 'var(--spacing-2)' }}>
          {restaurantRecipes.length} saved {restaurantRecipes.length === 1 ? 'recipe' : 'recipes'}
        </p>
      </div>

      {/* Restaurant image or placeholder (AC: 1) */}
      <div className="px-[var(--spacing-4)] mb-[var(--spacing-3)]">
        {restaurantImageUrl ? (
          <img
            src={restaurantImageUrl}
            alt={restaurantName}
            style={{
              width: '100%',
              height: '200px',
              objectFit: 'cover',
              borderRadius: 'var(--radius-sm)',
              display: 'block',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: '100%',
              height: '200px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '2.5rem', opacity: 0.3 }}>🍽</span>
          </div>
        )}
      </div>

      {/* Explore dishes link (AC: 1) */}
      {googlePlacesId && (
        <div className="px-[var(--spacing-4)] mb-[var(--spacing-4)]">
          <button
            onClick={() => router.push(`/search/restaurants/${googlePlacesId}?restaurantName=${encodeURIComponent(restaurantName)}`)}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-3) var(--spacing-4)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-sm)',
              textAlign: 'left',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            Explore dishes →
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>Loading…</p>
        </div>
      )}

      {/* Recipe list wrapped in GlassCard (AC: 1, 2) */}
      <ul className="flex flex-col gap-[var(--spacing-2)] px-[var(--spacing-4)]">
        {restaurantRecipes.map(recipe => (
          <li key={recipe.id}>
            <GlassCard variant="compact" animate={false} style={{ padding: 0 }}>
              <button
                onClick={() => router.push(`/recipes/${recipe.id}`)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: 'var(--spacing-3)',
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                  {recipe.name}
                </span>
              </button>
            </GlassCard>
          </li>
        ))}
      </ul>
    </div>
  )
}

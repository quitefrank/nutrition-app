'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useRecipes, useDeleteRecipe } from '@/hooks/use-recipes'
import { useSetAtmospheric } from '@/contexts/atmospheric-context'
import { FeaturedRecipeCard } from '@/components/recipes/featured-recipe-card'
import { RecipeCard } from '@/components/recipes/recipe-card'
import { SwipeToDelete } from '@/components/recipes/swipe-to-delete'
import { useNearbyRestaurant } from '@/hooks/use-nearby-restaurant'

interface SearchVisit {
  googlePlacesId: string
  restaurantId: string
  restaurantName: string | null
  recipeCount: number
  visitedAt: number
}

export default function Home() {
  const { data: recipes = [] } = useRecipes()
  const deleteMutation = useDeleteRecipe()
  const setAtmospheric = useSetAtmospheric()
  const router = useRouter()
  const { nearbyRestaurant, requestPermission } = useNearbyRestaurant()
  const [searchVisit, setSearchVisit] = useState<SearchVisit | null>(null)
  const hasRequestedLocationRef = useRef(false)

  // Load search-triggered visit from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('plately-search-visit')
      if (raw) {
        const parsed = JSON.parse(raw) as SearchVisit
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
        if (Date.now() - parsed.visitedAt <= TWENTY_FOUR_HOURS) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSearchVisit(parsed)
        }
      }
    } catch {
      // Malformed localStorage — ignore
    }
  }, [])

  // Atmospheric background: use most recent recipe's dish image
  useEffect(() => {
    const latest = recipes[0]
    if (latest?.dishImageUrl) {
      setAtmospheric({
        imageUrl: latest.dishImageUrl,
        palette: null,
        tier: 'restaurant',
        backgroundColorFallback: '#0a0a0a',
      })
    } else {
      setAtmospheric(undefined)  // fall back to neutral
    }
  }, [recipes, setAtmospheric])

  // Compute banner triggers at top level (no hooks inside conditionals)
  const latestRestaurantId = recipes[0]?.restaurantId ?? null
  const sameRestaurantRecipes = latestRestaurantId
    ? recipes.filter(r => r.restaurantId === latestRestaurantId)
    : []
  // Trigger 1 (highest priority): scan-triggered
  const showScanBanner = sameRestaurantRecipes.length > 1 && !!latestRestaurantId

  // Trigger 2: search-triggered — localStorage visit within 24h with saved recipes
  // Match on restaurantId OR googlePlacesId in case the restaurant was re-inserted with a new UUID
  const searchRestaurantHasRecipes = searchVisit
    ? recipes.some(r =>
        r.restaurantId === searchVisit.restaurantId ||
        r.restaurant?.googlePlacesId === searchVisit.googlePlacesId
      )
    : false
  const showSearchBanner = !showScanBanner && !!searchVisit && searchRestaurantHasRecipes

  // Trigger 3: location-triggered
  const showLocationBanner = !showScanBanner && !showSearchBanner && !!nearbyRestaurant

  // Request location permission after first recipe save if no scan/search banner (AC: 5, UX-DR9)
  // useRef guard ensures this fires at most once per session
  useEffect(() => {
    if (hasRequestedLocationRef.current) return
    if (recipes.length === 0 || showScanBanner || showSearchBanner) return
    if (typeof navigator === 'undefined' || !navigator.permissions) return
    void navigator.permissions.query({ name: 'geolocation' }).then((status) => {
      if (status.state === 'prompt') {
        hasRequestedLocationRef.current = true
        requestPermission()
      }
    })
  }, [recipes.length, showScanBanner, showSearchBanner]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(id: string) {
    if (deleteMutation.isPending) return
    try {
      await deleteMutation.mutateAsync(id)
      toast('Recipe deleted')
    } catch {
      toast.error('Failed to delete recipe')
    }
  }

  // Resolve single banner slot (highest-priority trigger wins)
  const showBanner = showScanBanner || showSearchBanner || showLocationBanner
  const bannerRestaurantId = showScanBanner
    ? latestRestaurantId!
    : showSearchBanner
    ? searchVisit!.restaurantId
    : showLocationBanner
    ? nearbyRestaurant!.id
    : null
  const bannerCount = showScanBanner
    ? sameRestaurantRecipes.length
    : showSearchBanner
    ? searchVisit!.recipeCount
    : showLocationBanner
    ? nearbyRestaurant!.recipeCount
    : 0
  const bannerRestaurantName = showScanBanner
    ? (recipes[0]?.restaurant?.name ?? null)
    : showSearchBanner
    ? (searchVisit!.restaurantName ?? null)
    : showLocationBanner
    ? nearbyRestaurant!.name
    : null

  // Populated state
  if (recipes.length > 0) {
    const [featured, ...rest] = recipes

    return (
      <div className="flex flex-col flex-1 gap-[var(--spacing-6)] px-[var(--spacing-4)] py-[var(--spacing-4)]">
        {/* Featured recipe — first/most recent */}
        <SwipeToDelete onDelete={() => handleDelete(featured.id)}>
          <FeaturedRecipeCard recipe={featured} />
        </SwipeToDelete>

        {/* Return-visit banner — single slot, highest-priority trigger wins (AC: 3, 4, 5) */}
        {showBanner && bannerRestaurantId && (
          <button
            onClick={() => router.push(`/restaurants/${bannerRestaurantId}`)}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-3) var(--spacing-4)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              textAlign: 'left',
              cursor: 'pointer',
              minHeight: '44px',
            }}
            aria-label={`Return visit banner${bannerRestaurantName ? ` for ${bannerRestaurantName}` : ''}`}
          >
            You&apos;ve been here before — {bannerCount} saved recipes
          </button>
        )}

        {/* Collection grid — all remaining recipes */}
        {rest.length > 0 && (
          <section>
            <h2
              style={{
                fontSize: 'var(--text-base)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
              }}
              className="mb-[var(--spacing-3)]"
            >
              Your Collection
            </h2>
            <div className="grid grid-cols-2 gap-[var(--spacing-2)]">
              {rest.map(recipe => (
                <SwipeToDelete key={recipe.id} onDelete={() => handleDelete(recipe.id)}>
                  <RecipeCard recipe={recipe} />
                </SwipeToDelete>
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  // Empty state — preserve existing JSX exactly
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-[var(--spacing-8)] px-[var(--spacing-4)] text-center">
      <h1
        style={{
          fontSize: 'var(--text-xl)',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}
      >
        Eaten somewhere great recently?
      </h1>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        Find the dish and save the recipe for next time.
      </p>
      <Link
        href="/search"
        className="glass-pill flex items-center justify-center w-full rounded-[var(--radius-xl)]"
        style={{
          height: '56px',
          fontSize: 'var(--text-base)',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}
      >
        Search for a dish
      </Link>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
        Or use the camera to scan a menu
      </p>
    </div>
  )
}

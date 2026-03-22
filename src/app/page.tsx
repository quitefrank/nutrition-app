'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useRecipes, useDeleteRecipe } from '@/hooks/use-recipes'
import { useSetAtmospheric } from '@/contexts/atmospheric-context'
import { FeaturedRecipeCard } from '@/components/recipes/featured-recipe-card'
import { RecipeCard } from '@/components/recipes/recipe-card'
import { SwipeToDelete } from '@/components/recipes/swipe-to-delete'

export default function Home() {
  const { data: recipes = [] } = useRecipes()
  const deleteMutation = useDeleteRecipe()
  const setAtmospheric = useSetAtmospheric()
  const router = useRouter()

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

  async function handleDelete(id: string) {
    if (deleteMutation.isPending) return
    try {
      await deleteMutation.mutateAsync(id)
      toast('Recipe deleted')
    } catch {
      toast.error('Failed to delete recipe')
    }
  }

  // Populated state
  if (recipes.length > 0) {
    const [featured, ...rest] = recipes

    // Return-visit banner: show when latest recipe has a restaurant and other recipes share it
    const latestRestaurantId = recipes[0]?.restaurantId ?? null
    const sameRestaurantRecipes = latestRestaurantId
      ? recipes.filter(r => r.restaurantId === latestRestaurantId)
      : []
    const showReturnVisitBanner = sameRestaurantRecipes.length > 1 && latestRestaurantId

    return (
      <div className="flex flex-col flex-1 gap-[var(--spacing-6)] px-[var(--spacing-4)] py-[var(--spacing-4)]">
        {/* Featured recipe — first/most recent */}
        <SwipeToDelete onDelete={() => handleDelete(featured.id)}>
          <FeaturedRecipeCard recipe={featured} />
        </SwipeToDelete>

        {/* Return-visit banner — shown between featured card and collection */}
        {showReturnVisitBanner && (
          <button
            onClick={() => router.push(`/restaurants/${latestRestaurantId}`)}
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
            aria-label="Return visit banner"
          >
            You&apos;ve been here before — {sameRestaurantRecipes.length} saved recipes
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

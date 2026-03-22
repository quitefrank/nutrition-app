'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useRecipes } from '@/hooks/use-recipes'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function RestaurantProfilePage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { data: recipes, isLoading } = useRecipes()
  const restaurantRecipes = (recipes ?? []).filter(r => r.restaurantId === id)
  const restaurantName = restaurantRecipes[0]?.restaurant?.name ?? 'Restaurant'

  return (
    <div className="flex flex-col flex-1 min-h-full">
      <div className="px-[var(--spacing-4)] pt-[var(--spacing-4)]">
        <button
          onClick={() => router.back()}
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 0',
            minHeight: '44px',
          }}
          aria-label="Go back"
        >
          ← Back
        </button>
      </div>
      <div className="px-[var(--spacing-4)] py-[var(--spacing-2)]">
        <h1 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', fontWeight: 700 }}>
          {restaurantName}
        </h1>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          {restaurantRecipes.length} saved {restaurantRecipes.length === 1 ? 'recipe' : 'recipes'}
        </p>
      </div>
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>Loading…</p>
        </div>
      )}
      <ul className="flex flex-col gap-[var(--spacing-2)] px-[var(--spacing-4)]">
        {restaurantRecipes.map(recipe => (
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
  )
}

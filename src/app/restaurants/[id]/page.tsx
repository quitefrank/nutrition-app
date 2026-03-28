'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useRecipes } from '@/hooks/use-recipes'
import { PageHeader } from '@/components/layout/page-header'

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
      <div className="px-[var(--spacing-4)]">
        <PageHeader title={restaurantName} showBack />
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', paddingBottom: 'var(--spacing-2)' }}>
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

'use client'

import { useRouter } from 'next/navigation'
import { use } from 'react'
import { useRecipe } from '@/hooks/use-recipes'
import { RecipeDetail } from '@/components/recipes/recipe-detail'

interface PageProps {
  params: Promise<{ id: string }>
}

function goBack(router: ReturnType<typeof useRouter>) {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
  } else {
    router.replace('/')
  }
}

export default function RecipeDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const { data: recipe, isLoading, isError } = useRecipe(id)
  const router = useRouter()

  return (
    <div className="flex flex-col flex-1 min-h-full">
      {/* Back navigation + Edit button */}
      <div className="px-[var(--spacing-4)] pt-[var(--spacing-4)] flex items-center justify-between">
        <button
          onClick={() => goBack(router)}
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'none',
            border: 'none', cursor: 'pointer', padding: '8px 0', minHeight: '44px' }}
          aria-label="Go back"
        >
          ← Back
        </button>
        {recipe && (
          <button
            onClick={() => router.push(`/recipes/${id}/edit`)}
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'none',
              border: 'none', cursor: 'pointer', padding: '8px', minHeight: '44px' }}
            aria-label="Edit recipe"
          >
            Edit
          </button>
        )}
      </div>

      {/* Loading: skeleton not shown — cache renders immediately (NFR03) */}
      {isLoading && (
        <div className="flex flex-col flex-1 items-center justify-center">
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>Loading…</p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col flex-1 items-center justify-center gap-[var(--spacing-4)] px-[var(--spacing-4)] text-center">
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
            Could not load this recipe.
          </p>
          <button
            onClick={() => goBack(router)}
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            ← Go back
          </button>
        </div>
      )}

      {/* Recipe detail */}
      {recipe && <RecipeDetail recipe={recipe} />}
    </div>
  )
}

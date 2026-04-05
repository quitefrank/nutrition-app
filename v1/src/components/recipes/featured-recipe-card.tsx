'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { Recipe } from '@/types/domain'

interface FeaturedRecipeCardProps {
  recipe: Recipe
}

export function FeaturedRecipeCard({ recipe }: FeaturedRecipeCardProps) {
  return (
    <Link href={`/recipes/${recipe.id}`} className="block">
      <div
        className="glass-card rounded-[var(--radius-md)] overflow-hidden"
        style={{ width: '100%' }}
      >
        {/* Hero image — ~180pt height */}
        <div className="relative w-full" style={{ height: '180px' }}>
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
            <div
              className="w-full h-full"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            />
          )}
          {/* Glass overlay for text legibility */}
          <div
            className="absolute inset-x-0 bottom-0 p-[var(--spacing-3)]"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
            }}
          >
            <p
              style={{
                fontSize: 'var(--text-lg)',
                color: 'var(--text-primary)',
                fontWeight: 600,
              }}
              className="line-clamp-1"
            >
              {recipe.name}
            </p>
            {recipe.restaurant?.name && (
              <p
                style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}
                className="truncate"
              >
                {recipe.restaurant.name}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

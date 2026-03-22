'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { Recipe } from '@/types/domain'

interface RecipeCardProps {
  recipe: Recipe
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Link href={`/recipes/${recipe.id}`} className="block">
      <div
        className="glass-card rounded-[var(--radius-sm)] overflow-hidden"
        style={{ minHeight: '160px' }}
      >
        {/* Dish image — ~110pt height */}
        <div className="relative w-full" style={{ height: '110px' }}>
          {recipe.dishImageUrl ? (
            <Image
              src={recipe.dishImageUrl}
              alt={recipe.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 180px"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            />
          )}
        </div>
        {/* Text content */}
        <div className="p-[var(--spacing-2)]">
          <p
            style={{
              fontSize: 'var(--text-base)',
              color: 'var(--text-primary)',
              fontWeight: 500,
              lineHeight: 1.3,
            }}
            className="line-clamp-2"
          >
            {recipe.name}
          </p>
          {recipe.restaurant?.name && (
            <p
              style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}
              className="mt-[var(--spacing-1)] truncate"
            >
              {recipe.restaurant.name}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

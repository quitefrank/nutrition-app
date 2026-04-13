'use client'

/**
 * RecipeGridCard — 2-column grid card for recipe collection.
 *
 * AC6 (Story 4.5): 68px photo area; dish name 12px semibold; calorie count 11px
 *   terracotta (omit if null); glass surface with lighter blur (blur(16px) saturate(1.3));
 *   16px radius; --shadow-card; scale(0.97) press animation using SPRING_CARD_EXPAND.
 * AC7: useReducedMotion() suppresses scale transform.
 *
 * Photo fallback: warm gradient when photoStatus !== 'confirmed' or dishImageUrl is null.
 * Lighter blur spec: blur(16px) saturate(1.3) — NOT var(--blur-base).
 * Safari PWA: -webkit-backdrop-filter alongside backdrop-filter.
 */

import { motion, useReducedMotion } from 'framer-motion'
import { SPRING_CARD_EXPAND } from '@/lib/springs'
import type { DomainRecipe } from '@/types/database'

// ─── Warm gradient fallback (terracotta tint — same as HeroCard/RestaurantGridCard) ─

const WARM_GRADIENT =
  'linear-gradient(135deg, rgba(196,98,45,0.22) 0%, rgba(228,174,110,0.18) 100%)'

// ─── Props ────────────────────────────────────────────────────────────────────

interface RecipeGridCardProps {
  recipe: DomainRecipe
  onPress: () => void
}

// ─── RecipeGridCard ───────────────────────────────────────────────────────────

export function RecipeGridCard({ recipe, onPress }: RecipeGridCardProps) {
  const reducedMotion = useReducedMotion()

  const hasPhoto = recipe.photoStatus === 'confirmed' && recipe.dishImageUrl

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPress()
    }
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={recipe.name}
      onClick={onPress}
      onKeyDown={handleKeyDown}
      className="overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
      style={{
        borderRadius: 16,
        background: 'var(--glass-base)',
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        boxShadow: 'var(--shadow-card)',
        border: 'var(--border-glass)',
        cursor: 'pointer',
        minHeight: 44,
      }}
      whileTap={reducedMotion ? {} : { scale: 0.97 }}
      transition={reducedMotion ? { duration: 0.15, ease: 'easeOut' } : SPRING_CARD_EXPAND}
    >
      {/* Photo area — 68px height */}
      <div style={{ width: '100%', height: 68, position: 'relative', overflow: 'hidden' }}>
        {hasPhoto ? (
          <img
            src={recipe.dishImageUrl as string}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            loading="lazy"
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: WARM_GRADIENT,
            }}
          />
        )}
      </div>

      {/* Text content */}
      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Dish name: 12px semibold */}
        <p
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            margin: 0,
          }}
        >
          {recipe.name}
        </p>

        {/* Calorie count: 11px — only when estimatedCalories is non-null */}
        {/* WCAG 2.1 AA: terracotta (#C4622D) requires font-size ≥ 14px at weight ≥ 600.
            11px does not meet the threshold — use text-secondary instead. */}
        {recipe.estimatedCalories !== null && recipe.estimatedCalories !== undefined && (
          <p
            style={{
              fontSize: '0.6875rem',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            {recipe.estimatedCalories} cal
          </p>
        )}
      </div>
    </motion.div>
  )
}

'use client'

/**
 * HeroCard — prominent card for the most recently visited restaurant.
 *
 * AC1: Full-width photo strip (148px State 1 / 112px State 2) with dark gradient
 *      overlay; restaurant name + meta bottom-left; dish thumbnail row (52×52px,
 *      up to 5 + overflow badge); footer with dish count + "View all ›".
 * AC2: Photo strip height animates via Framer Motion (400ms ease-out).
 * AC3: role="article" + aria-label="[Name], last visited [time]".
 * AC7: useReducedMotion() suppresses all scale/height animations.
 *
 * Glass surface: --glass-base + --blur-base + 22px radius + --shadow-float.
 * Safari PWA: -webkit-backdrop-filter alongside backdrop-filter.
 */

import { motion, useReducedMotion } from 'framer-motion'
import type { DomainRestaurant, DomainRecipe } from '@/types/database'

// ─── Local time formatter (do NOT promote to @/lib) ──────────────────────────

function formatLastVisited(isoString: string | null | undefined): string {
  if (!isoString) return 'recently'
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return 'recently'
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return `today at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ─── Warm gradient fallback (terracotta tint) ─────────────────────────────────
// Same palette as GalleryDishCard in HomeScreen.tsx

const WARM_GRADIENT =
  'linear-gradient(135deg, rgba(196,98,45,0.22) 0%, rgba(228,174,110,0.18) 100%)'

// ─── Photo strip dark gradient overlay ───────────────────────────────────────

const PHOTO_OVERLAY =
  'linear-gradient(to top, rgba(20,14,8,0.72) 0%, transparent 60%)'

// ─── HeroCard ─────────────────────────────────────────────────────────────────

interface HeroCardProps {
  restaurant: DomainRestaurant
  dishes: DomainRecipe[]
  dishCount: number
  state: 1 | 2
  lastVisitedAt?: string | null
  onViewAll: () => void
  onCardPress?: () => void
}

export function HeroCard({
  restaurant,
  dishes,
  dishCount,
  state,
  lastVisitedAt,
  onViewAll,
  onCardPress,
}: HeroCardProps) {
  const reducedMotion = useReducedMotion()

  const formattedTime = formatLastVisited(lastVisitedAt)
  const ariaLabel = `${restaurant.name}, last visited ${formattedTime}`

  const stripHeight = state === 1 ? 148 : 112
  const heightTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }

  // Dish thumbnail row — up to 5 thumbnails + optional overflow badge
  const visibleDishes = dishes.slice(0, 5)
  const overflowCount = dishes.length > 5 ? dishes.length - 5 : 0

  function handleCardKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (onCardPress && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onCardPress()
    }
  }

  return (
    <article
      role="article"
      aria-label={ariaLabel}
      onClick={onCardPress}
      onKeyDown={handleCardKeyDown}
      tabIndex={onCardPress ? 0 : undefined}
      style={{
        background: 'var(--glass-base)',
        backdropFilter: 'var(--blur-base)',
        WebkitBackdropFilter: 'var(--blur-base)',
        borderRadius: 22,
        boxShadow: 'var(--shadow-float)',
        border: 'var(--border-glass)',
        overflow: 'hidden',
        width: '100%',
        cursor: onCardPress ? 'pointer' : 'default',
      }}
    >
      {/* Photo strip with height animation */}
      <motion.div
        animate={{ height: stripHeight }}
        transition={heightTransition}
        style={{ position: 'relative', overflow: 'hidden', width: '100%' }}
      >
        {/* Background image or fallback gradient */}
        {restaurant.referenceImageUrl ? (
          <img
            src={restaurant.referenceImageUrl}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
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

        {/* Dark gradient overlay */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: PHOTO_OVERLAY,
          }}
        />

        {/* Restaurant name + meta — pinned bottom-left over gradient */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 14,
            right: 14,
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#ffffff',
              lineHeight: 1.2,
              marginBottom: 2,
            }}
          >
            {restaurant.name}
          </div>
          {(restaurant.cuisineType || restaurant.address) && (
            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.3,
              }}
            >
              {[restaurant.cuisineType, restaurant.address]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
      </motion.div>

      {/* Card body — dish thumbnail row */}
      {dishes.length > 0 && (
        <div
          style={{
            padding: '12px 14px 0',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
            display: 'flex',
            gap: 8,
          }}
          className="no-scrollbar"
        >
          {visibleDishes.map((dish) => (
            <DishThumbnail key={dish.id} dish={dish} />
          ))}
          {overflowCount > 0 && <OverflowBadge count={overflowCount} />}
        </div>
      )}

      {/* Footer row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px 14px',
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
          }}
        >
          {dishCount} {dishCount === 1 ? 'dish' : 'dishes'}
        </span>

        <button
          onClick={onViewAll}
          aria-label={`View all dishes at ${restaurant.name}`}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 12,
            fontWeight: 500,
            /* WCAG 2.1 AA: terracotta (#C4622D) requires font-size ≥ 14px AND font-weight ≥ 600.
               12px does not meet the size threshold — use text-tertiary instead. */
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer',
            minHeight: 44,
            minWidth: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          View all ›
        </button>
      </div>
    </article>
  )
}

// ─── Dish thumbnail ───────────────────────────────────────────────────────────

function DishThumbnail({ dish }: { dish: DomainRecipe }) {
  const hasPhoto = dish.photoStatus !== 'suppressed' && dish.dishImageUrl

  return (
    <div
      aria-hidden="true"
      style={{
        width: 52,
        height: 52,
        borderRadius: 11,
        flexShrink: 0,
        overflow: 'hidden',
        background: WARM_GRADIENT,
        position: 'relative',
      }}
    >
      {hasPhoto && (
        <img
          src={dish.dishImageUrl as string}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
    </div>
  )
}

// ─── Overflow badge ───────────────────────────────────────────────────────────

function OverflowBadge({ count }: { count: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 52,
        height: 52,
        borderRadius: 11,
        flexShrink: 0,
        background: WARM_GRADIENT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
      }}
    >
      +{count} more
    </div>
  )
}

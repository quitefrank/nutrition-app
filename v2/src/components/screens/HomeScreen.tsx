'use client'

/**
 * HomeScreen — progressive state home screen.
 *
 * Four states driven by useRestaurantsWithRecipes():
 *
 *   State 0 — Empty: No restaurants. Full-screen atmospheric empty state with
 *              tagline, scan CTA, and find-a-restaurant ghost CTA.
 *
 *   State 1 — Has restaurants, no recent activity: Scrollable feed with
 *              "Your restaurants" HomeSection (up to 4 cards) and a
 *              "Scan for something new" placeholder section.
 *
 *   State 2 — Has recent dishes (within 7 days): HeroCard at top for the most
 *              recently visited restaurant, "Recent dishes" HomeSection, then
 *              "Your restaurants" HomeSection for remaining restaurants.
 *
 *   State 3 — Modifier (5+ restaurants): Adds "See all (N)" link to the
 *              "Your restaurants" HomeSection in State 1 or 2.
 *
 * Story 4.6 — AC 1–9.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { HeroCard } from '@/components/ui/HeroCard'
import { HomeSection } from '@/components/ui/HomeSection'
import { RestaurantGridCard } from '@/components/ui/RestaurantGridCard'
import { RecipeGridCard } from '@/components/ui/RecipeGridCard'
import { ErrorState } from '@/components/ui/ErrorState'
import { RestaurantSearchOverlay } from '@/components/screens/RestaurantSearchOverlay'
import { useRestaurantsWithRecipes } from '@/hooks/useRestaurants'
import { useCameraContext } from '@/contexts/CameraContext'
import type { DomainRestaurant, DomainRecipe } from '@/types/database'

// ─── Animation variants ────────────────────────────────────────────────────────

const DEFAULT_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

const REDUCED_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isWithin7Days(dateStr: string): boolean {
  const d = new Date(dateStr)
  return !isNaN(d.getTime()) && Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000
}

function restaurantRoute(r: DomainRestaurant): string {
  return `/restaurants/${r.placeId ?? r.id}?name=${encodeURIComponent(r.name)}`
}

// ─── HomeScreen ────────────────────────────────────────────────────────────────

export function HomeScreen() {
  const router = useRouter()
  const { openCamera } = useCameraContext()
  const reducedMotion = useReducedMotion()
  const [searchOpen, setSearchOpen] = useState(false)

  const { data: restaurants, isPending, isError, refetch } = useRestaurantsWithRecipes()

  const restaurantList = restaurants ?? []

  // ── State derivation ──────────────────────────────────────────────────────────
  const hasRestaurants = restaurantList.length > 0

  const recentRestaurant = hasRestaurants
    ? restaurantList.find((r) => {
        const sorted = [...r.recipes].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        return sorted[0] && isWithin7Days(sorted[0].createdAt)
      })
    : undefined

  const hasRecent = !!recentRestaurant
  const hasManyRestaurants = restaurantList.length >= 5

  const variants = reducedMotion ? REDUCED_VARIANTS : DEFAULT_VARIANTS

  // ── State 1 / State 2 derived values ─────────────────────────────────────────
  // Restaurants to show in the "Your restaurants" section:
  //   State 2: exclude the recent restaurant (it already appears in HeroCard)
  //   State 1: all restaurants
  const otherRestaurants = hasRecent
    ? restaurantList.filter((r) => r.id !== recentRestaurant!.id)
    : restaurantList

  const displayedOtherRestaurants = otherRestaurants.slice(0, 4)

  // Recent dishes from the hero restaurant, sorted descending, up to 4
  const recentDishes: DomainRecipe[] = hasRecent
    ? [...recentRestaurant!.recipes]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4)
    : []

  // The most recent recipe's createdAt — used as lastVisitedAt for HeroCard
  const lastVisitedAt = recentDishes[0]?.createdAt ?? null

  return (
    <>
      <AnimatePresence mode="wait">
        {/* ── Loading ──────────────────────────────────────────────────────── */}
        {isPending && (
          <motion.div
            key="skeleton"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          >
            <SkeletonFeed />
          </motion.div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {isError && (
          <motion.div
            key="error"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="px-4 pt-8"
          >
            <ErrorState
              message="Couldn't load your home screen. Please try again."
              onRetry={() => void refetch()}
              retryLabel="Try again"
            />
          </motion.div>
        )}

        {/* ── State 0 — Empty ──────────────────────────────────────────────── */}
        {!isPending && !isError && !hasRestaurants && (
          <motion.div
            key="state-0"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            role="main"
            className="flex flex-col items-center justify-center pt-16 pb-8 gap-6 px-6"
          >
            {/* Camera icon */}
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 52, height: 52, background: 'var(--color-accent-light)' }}
              aria-hidden="true"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 9a2 2 0 0 1 2-2h.5l1.5-3h9l1.5 3H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"
                  stroke="var(--color-accent)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="13" r="3" stroke="var(--color-accent)" strokeWidth="1.6" />
              </svg>
            </div>

            {/* Playfair tagline */}
            <h2
              className="text-center"
              style={{
                fontFamily: 'var(--font-display), Georgia, serif',
                fontSize: '1.375rem',
                fontWeight: 600,
                lineHeight: 1.25,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              Take home the food you love
            </h2>

            {/* Supporting subtext */}
            <p
              className="text-center"
              style={{
                fontSize: '0.8125rem',
                lineHeight: 1.6,
                color: 'var(--color-text-secondary)',
                maxWidth: 210,
              }}
            >
              Scan a menu and every dish is instantly added to your collection.
            </p>

            {/* Paired CTAs — wrapper sizes to the wider button; both fill it equally */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 'fit-content' }}>
              {/* Terracotta scan CTA */}
              <motion.button
                aria-label="Open camera to scan a menu"
                onClick={openCamera}
                className="flex items-center justify-center gap-2 font-semibold"
                style={{
                  width: '100%',
                  height: 50,
                  paddingLeft: 28,
                  paddingRight: 28,
                  borderRadius: 9999,
                  background: 'var(--color-accent)',
                  color: '#fff',
                  fontSize: '0.9375rem',
                  fontFamily: 'var(--font-body), system-ui, sans-serif',
                  letterSpacing: '0.01em',
                  boxShadow: '0 4px 16px rgba(196,98,45,0.32)',
                  cursor: 'pointer',
                  border: 'none',
                }}
                whileTap={reducedMotion ? {} : { scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 9a2 2 0 0 1 2-2h.5l1.5-3h9l1.5 3H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                  <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.75" />
                </svg>
                Scan a menu
              </motion.button>

              {/* Ghost find-a-restaurant CTA */}
              <motion.button
                aria-label="Find a restaurant by name"
                onClick={() => setSearchOpen(true)}
                className="flex items-center justify-center gap-2 font-semibold"
                style={{
                  width: '100%',
                  height: 50,
                  paddingLeft: 28,
                  paddingRight: 28,
                  borderRadius: 9999,
                  background: 'transparent',
                  border: '1.5px solid var(--color-accent)',
                  color: 'var(--color-accent)',
                  fontSize: '0.9375rem',
                  fontFamily: 'var(--font-body), system-ui, sans-serif',
                  letterSpacing: '0.01em',
                  cursor: 'pointer',
                }}
                whileTap={reducedMotion ? {} : { scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Find a restaurant
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── State 1 / State 2 — Feed ──────────────────────────────────────── */}
        {!isPending && !isError && hasRestaurants && (
          <motion.main
            key={hasRecent ? 'state-2' : 'state-1'}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="flex flex-col gap-6 px-4 pt-4 pb-8"
          >
            {/* ── State 2 only: HeroCard + Recent dishes ────────────────────── */}
            {hasRecent && recentRestaurant && (
              <>
                <HeroCard
                  restaurant={recentRestaurant}
                  dishes={recentDishes}
                  dishCount={recentRestaurant.recipes.length}
                  state={1}
                  lastVisitedAt={lastVisitedAt}
                  onViewAll={() => router.push(restaurantRoute(recentRestaurant))}
                  onCardPress={() => router.push(restaurantRoute(recentRestaurant))}
                />

                {recentDishes.length > 0 && (
                  <HomeSection
                    title="Recent dishes"
                    itemCount={recentDishes.length}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      {recentDishes.map((recipe) => (
                        <RecipeGridCard
                          key={recipe.id}
                          recipe={recipe}
                          onPress={() => router.push(`/recipes/${recipe.id}`)}
                        />
                      ))}
                    </div>
                  </HomeSection>
                )}
              </>
            )}

            {/* ── "Your restaurants" section (State 1 and 2) ────────────────── */}
            {displayedOtherRestaurants.length > 0 && (
              <HomeSection
                title="Your restaurants"
                itemCount={otherRestaurants.length}
                onSeeAll={hasManyRestaurants ? () => router.push('/restaurants') : undefined}
              >
                <div className="grid grid-cols-2 gap-3">
                  {displayedOtherRestaurants.map((r) => (
                    <RestaurantGridCard
                      key={r.id}
                      restaurant={r}
                      dishCount={r.recipes.length}
                      onPress={() => router.push(restaurantRoute(r))}
                    />
                  ))}
                </div>
              </HomeSection>
            )}

            {/* ── State 1 only: "Scan for something new" placeholder ────────── */}
            {!hasRecent && (
              <HomeSection title="Scan for something new" itemCount={0}>
                <div className="flex flex-col items-center gap-3 py-4">
                  <motion.button
                    aria-label="Open camera to scan a menu"
                    onClick={openCamera}
                    className="flex items-center gap-2 font-semibold"
                    style={{
                      height: 44,
                      paddingLeft: 24,
                      paddingRight: 24,
                      borderRadius: 9999,
                      background: 'var(--color-accent)',
                      color: '#fff',
                      fontSize: '0.875rem',
                      fontFamily: 'var(--font-body), system-ui, sans-serif',
                      letterSpacing: '0.01em',
                      boxShadow: '0 4px 16px rgba(196,98,45,0.28)',
                      cursor: 'pointer',
                      border: 'none',
                    }}
                    whileTap={reducedMotion ? {} : { scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 9a2 2 0 0 1 2-2h.5l1.5-3h9l1.5 3H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                      <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.75" />
                    </svg>
                    Scan a menu
                  </motion.button>
                </div>
              </HomeSection>
            )}
          </motion.main>
        )}
      </AnimatePresence>

      {searchOpen && <RestaurantSearchOverlay onDismiss={() => setSearchOpen(false)} />}
    </>
  )
}

// ─── Skeleton loading state ────────────────────────────────────────────────────

function SkeletonFeed() {
  return (
    <div
      className="px-4 pt-4 pb-8 flex flex-col gap-6 animate-pulse"
      aria-busy="true"
      aria-label="Loading home screen"
    >
      {/* Hero skeleton */}
      <div
        aria-hidden="true"
        style={{
          height: 180,
          borderRadius: 22,
          background: 'var(--glass-base)',
          border: 'var(--border-glass)',
        }}
      />
      {/* Section header skeleton */}
      <div aria-hidden="true" style={{ height: 20, width: 140, borderRadius: 6, background: 'var(--glass-base)' }} />
      {/* Grid skeleton */}
      <div className="grid grid-cols-2 gap-3" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 110,
              borderRadius: 16,
              background: 'var(--glass-base)',
              border: 'var(--border-glass)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

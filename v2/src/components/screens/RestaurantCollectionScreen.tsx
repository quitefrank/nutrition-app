"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { RestaurantGridCard } from "@/components/ui/RestaurantGridCard";
import { RemoveRestaurantSheet } from "@/components/ui/RemoveRestaurantSheet";
import { ErrorState } from "@/components/ui/ErrorState";
import { useRestaurantsWithRecipes } from "@/hooks/useRestaurants";
import { useCameraContext } from "@/contexts/CameraContext";

// ─── Animation variants ─────────────────────────────────────
// Stagger pattern from RestaurantScreen.tsx (lines 47–58)

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 26, stiffness: 340 },
  },
};

// Reduced-motion container: all children appear simultaneously
const containerVariantsReduced = {
  hidden: {},
  show: { transition: { staggerChildren: 0 } },
};

// Reduced-motion item: opacity-only transition, no translate (UX-DR25)
const itemVariantsReduced = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15, ease: 'easeOut' as const } },
};

// ─── Types ──────────────────────────────────────────────────

interface RestaurantCollectionScreenProps {
  /** Called when the user taps the empty-state "Scan a menu" CTA. */
  onScanPress?: () => void;
}

// ─── RestaurantCollectionScreen ────────────────────────────

/**
 * Home tab — shows all restaurants that have at least one
 * non-removed recipe, as a 2-column grid of RestaurantGridCard components.
 *
 * Uses `useRestaurantsWithRecipes()` (query key: ['restaurants','with-recipes']).
 * Status filtering is done server-side in the hook — no client-side filter.
 *
 * AC: 1, 2, 3, 4, 5, 6
 */
export function RestaurantCollectionScreen({ onScanPress }: RestaurantCollectionScreenProps = {}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  // Fall back to the AppShell-provided context when no explicit prop is passed
  const { openCamera } = useCameraContext();
  const handleScanPress = onScanPress ?? openCamera;
  const { data: restaurantsWithRecipes, isPending, isError, refetch } = useRestaurantsWithRecipes();

  // Removal state — holds the restaurant pending confirmation, or null when closed
  const [removingRestaurant, setRemovingRestaurant] = useState<{
    id: string;
    name: string;
    dishCount: number;
  } | null>(null);

  // ── Loading state ───────────────────────────────────────────
  if (isPending) {
    return (
      <div
        className="collection-grid grid grid-cols-2 gap-3 px-4 pt-4"
        aria-busy="true"
        aria-label="Loading restaurants"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse"
            aria-hidden="true"
            style={{
              borderRadius: 16,
              background: "var(--glass-base)",
              backdropFilter: "var(--blur-base)",
              WebkitBackdropFilter: "var(--blur-base)",
              boxShadow: "var(--shadow-card)",
              border: "var(--border-glass)",
              overflow: "hidden",
            }}
          >
            {/* Photo area skeleton */}
            <div
              style={{
                height: 68,
                background: "var(--color-bg-elevated)",
              }}
            />
            {/* Text skeleton */}
            <div className="px-2.5 py-2 flex flex-col gap-1.5">
              <div
                style={{
                  height: 10,
                  borderRadius: 4,
                  background: "var(--color-bg-elevated)",
                  width: "75%",
                }}
              />
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: "var(--color-bg-elevated)",
                  width: "45%",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────
  if (isError) {
    return (
      <div className="px-4 pt-8">
        <ErrorState
          message="Couldn't load your restaurants. Please try again."
          onRetry={() => void refetch()}
          retryLabel="Try again"
        />
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────
  // Reuse the same copy + layout as HomeScreen State 0 (AC: 4)
  if (!restaurantsWithRecipes || restaurantsWithRecipes.length === 0) {
    return (
      <>
        <motion.div
          role="main"
          className="flex flex-col items-center justify-center pt-16 pb-8 gap-6 px-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* 52px icon */}
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 52,
              height: 52,
              background: "var(--color-accent-light)",
            }}
            aria-hidden="true"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 9a2 2 0 0 1 2-2h.5l1.5-3h9l1.5 3H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"
                stroke="var(--color-accent)" strokeWidth="1.6" strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="3" stroke="var(--color-accent)" strokeWidth="1.6" />
            </svg>
          </div>

          {/* Playfair 22px title */}
          <h2
            className="text-center"
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "1.375rem",
              fontWeight: 600,
              lineHeight: 1.25,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            Take home the food you love
          </h2>

          {/* 13px body */}
          <p
            className="text-center"
            style={{
              fontSize: "0.8125rem",
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              maxWidth: 210,
            }}
          >
            Scan a menu and every dish is instantly added to your collection.
          </p>

          {/* Paired CTAs — wrapper sizes to the wider button; both fill it equally */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 'fit-content' }}>
            {/* Terracotta pill CTA */}
            <motion.button
              aria-label="Open camera to scan a menu"
              onClick={handleScanPress}
              className="flex items-center justify-center gap-2 font-semibold"
              style={{
                width: '100%',
                height: 50,
                paddingLeft: 28,
                paddingRight: 28,
                borderRadius: 9999,
                background: "var(--color-accent)",
                color: "#fff",
                fontSize: "0.9375rem",
                fontFamily: "var(--font-body), system-ui, sans-serif",
                letterSpacing: "0.01em",
                boxShadow: "0 4px 16px rgba(196,98,45,0.32)",
                cursor: "pointer",
                border: "none",
              }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 9a2 2 0 0 1 2-2h.5l1.5-3h9l1.5 3H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.75" />
              </svg>
              Scan a menu
            </motion.button>

            {/* Ghost CTA: Find a restaurant (search path) */}
            <motion.button
              aria-label="Find a restaurant by name"
              onClick={() => router.push('/search')}
              className="flex items-center justify-center gap-2 font-semibold"
              style={{
                width: '100%',
                height: 50,
                paddingLeft: 28,
                paddingRight: 28,
                borderRadius: 9999,
                background: "transparent",
                border: "1.5px solid var(--color-accent)",
                color: "var(--color-accent)",
                fontSize: "0.9375rem",
                fontFamily: "var(--font-body), system-ui, sans-serif",
                letterSpacing: "0.01em",
                cursor: "pointer",
              }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Find a restaurant
            </motion.button>
          </div>
        </motion.div>

      </>
    );
  }

  // ── Grid state ──────────────────────────────────────────────
  return (
    <>
      {/* Sticky grid header with search icon */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '8px 16px 4px',
          background: 'transparent',
        }}
      >
        {/* WCAG 2.1 AA: explicit width/height 40px is below the 44×44px touch target minimum.
            Use minWidth/minHeight: 44 so the button expands to meet the requirement. */}
        <button
          type="button"
          aria-label="Find a restaurant by name"
          onClick={() => router.push('/search')}
          style={{
            minWidth: 44,
            minHeight: 44,
            borderRadius: '50%',
            border: '1.5px solid var(--color-accent)',
            background: 'transparent',
            color: 'var(--color-accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <motion.ul
        className="collection-grid grid grid-cols-2 gap-3 px-4 pt-2 pb-6 list-none m-0"
        role="list"
        variants={reducedMotion ? containerVariantsReduced : containerVariants}
        initial="hidden"
        animate="show"
      >
        <AnimatePresence>
          {restaurantsWithRecipes.map((restaurant) => (
            <motion.li
              key={restaurant.id}
              variants={reducedMotion ? itemVariantsReduced : itemVariants}
              className="list-none"
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            >
              <RestaurantGridCard
                restaurant={restaurant}
                dishCount={restaurant.recipes.length}
                onPress={() =>
                  router.push(
                    `/restaurants/${restaurant.placeId ?? restaurant.id}?name=${encodeURIComponent(restaurant.name)}`
                  )
                }
                onLongPress={() =>
                  setRemovingRestaurant({
                    id: restaurant.id,
                    name: restaurant.name,
                    dishCount: restaurant.recipes.length,
                  })
                }
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      {removingRestaurant && (
        <RemoveRestaurantSheet
          restaurantId={removingRestaurant.id}
          restaurantName={removingRestaurant.name}
          dishCount={removingRestaurant.dishCount}
          isOpen={true}
          onClose={() => setRemovingRestaurant(null)}
        />
      )}

    </>
  );
}

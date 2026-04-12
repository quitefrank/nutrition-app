"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { FrostedCard } from "@/components/ui/FrostedCard";
import { SwipeToDelete } from "@/components/ui/SwipeToDelete";
import { SmartBanner } from "@/components/banners/SmartBanner";
import { TipBanner } from "@/components/scan/TipBanner";
import { PartialResultsBanner } from "@/components/scan/PartialResultsBanner";
import { useRecipes, useRemoveRecipe } from "@/hooks/useRecipes";
import { useRestaurantsWithRecipes } from "@/hooks/useRestaurants";
import type { DomainRecipe, DomainRestaurant } from "@/types/database";

// ─── Animation variants ────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 28, stiffness: 280 },
  },
};

// ─── Types ─────────────────────────────────────────────────

interface Dish {
  id?: string;
  name: string;
  description?: string;
  calorieEstimate?: number | null;
  totalCalories?: number | null;
  photoUrl?: string | null;
  /** Set when the dish came from Supabase — lets navigation use UUID path */
  supabaseId?: string;
  /** Dish-level rating from Gemini Search grounding */
  dishRating?: number | null;
}

interface ScanGroup {
  scanKey: string;
  label: string;
  dishes: Dish[];
  restaurantName?: string | null;
  restaurantPlaceId?: string | null;
  partialResults?: boolean;
}

/** One section in the gallery — a restaurant with its dishes */
interface GalleryRestaurant {
  label: string;
  scanKey: string;
  placeId: string | null;
  rating: number | null;
  userRatingsTotal: number | null;
  dishes: Dish[];
}

// ─── Helpers ───────────────────────────────────────────────

function formatScanLabel(scanKey: string, restaurantName: string | null | undefined): string {
  if (restaurantName) return restaurantName;
  const ts = parseInt(scanKey.replace("plately_scan_", ""), 10);
  if (!Number.isFinite(ts)) return "Scan";
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = d.toDateString() === new Date(now.getTime() - 86400000).toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today at ${timeStr}`;
  if (isYesterday) return `Yesterday at ${timeStr}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` at ${timeStr}`;
}

function readScanGroups(): ScanGroup[] {
  try {
    const keys = Object.keys(sessionStorage)
      .filter((k) => k.startsWith("plately_scan_"))
      .sort((a, b) => {
        const ta = parseInt(a.replace("plately_scan_", ""), 10);
        const tb = parseInt(b.replace("plately_scan_", ""), 10);
        return tb - ta;
      });

    return keys.flatMap((scanKey) => {
      const raw = sessionStorage.getItem(scanKey);
      if (!raw) return [];
      try {
        const result = JSON.parse(raw) as {
          restaurantName?: string | null;
          restaurantPlaceId?: string | null;
          allDishes: Dish[];
          partialResults?: boolean;
        };
        if (!Array.isArray(result.allDishes) || result.allDishes.length === 0) return [];
        return [{
          scanKey,
          label: formatScanLabel(scanKey, result.restaurantName),
          dishes: result.allDishes,
          restaurantName: result.restaurantName ?? null,
          restaurantPlaceId: result.restaurantPlaceId ?? null,
          partialResults: result.partialResults ?? false,
        }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/**
 * Map a DomainRecipe from Supabase to the local Dish interface.
 */
function domainRecipeToDish(recipe: DomainRecipe): Dish {
  return {
    id: recipe.id,
    supabaseId: recipe.id,
    name: recipe.name,
    description: recipe.description ?? undefined,
    calorieEstimate: recipe.estimatedCalories,
    photoUrl: recipe.dishImageUrl,
    dishRating: recipe.dishRating,
  };
}

/**
 * Merge sessionStorage scan groups with Supabase recipes.
 *
 * Strategy:
 * 1. Start with all sessionStorage groups (current session, always fast).
 * 2. For each Supabase recipe, check if a dish with the same name already
 *    exists in the session groups (case-insensitive).
 *    - If it exists, replace the dish entry to bring in richer fields
 *      (persisted image URL, supabaseId for linking, dish rating).
 *    - If it does not exist, create a synthetic ScanGroup for it so it
 *      appears in the collection.
 */
function mergeWithSupabaseRecipes(
  sessionGroups: ScanGroup[],
  supabaseRecipes: DomainRecipe[],
  restaurantsWithRecipes: Array<DomainRestaurant & { recipes: DomainRecipe[] }>,
): ScanGroup[] {
  if (supabaseRecipes.length === 0) return sessionGroups;

  // Build a lookup of restaurant id → name for labelling synthetic groups
  const restaurantNameById = new Map<string, string>(
    restaurantsWithRecipes.map((r) => [r.id, r.name])
  );

  // Build a set of lowercase dish names already in session
  const sessionDishNames = new Set(
    sessionGroups.flatMap((g) => g.dishes.map((d) => d.name.toLowerCase().trim()))
  );

  // Enrich existing session dishes where a Supabase counterpart exists
  const enrichedGroups: ScanGroup[] = sessionGroups.map((group) => ({
    ...group,
    dishes: group.dishes.map((dish) => {
      const match = supabaseRecipes.find(
        (r) => r.name.toLowerCase().trim() === dish.name.toLowerCase().trim()
      );
      if (!match) return dish;
      return {
        ...dish,
        supabaseId: match.id,
        // Prefer persisted image URL if the local dish has none
        photoUrl: dish.photoUrl ?? match.dishImageUrl,
        calorieEstimate: dish.calorieEstimate ?? match.estimatedCalories,
        dishRating: match.dishRating,
      };
    }),
  }));

  // Collect Supabase recipes that have no session equivalent — group by restaurant
  const newRecipesByRestaurant = new Map<string, DomainRecipe[]>();
  for (const recipe of supabaseRecipes) {
    if (sessionDishNames.has(recipe.name.toLowerCase().trim())) continue;
    const existing = newRecipesByRestaurant.get(recipe.restaurantId) ?? [];
    existing.push(recipe);
    newRecipesByRestaurant.set(recipe.restaurantId, existing);
  }

  // Build placeId lookup so synthetic groups carry the Places ID immediately
  // (same source as restaurantNameById — no extra fetching)
  const restaurantPlaceIdById = new Map<string, string | null>(
    restaurantsWithRecipes.map((r) => [r.id, r.placeId])
  );

  // Create synthetic ScanGroups for Supabase-only recipes
  const syntheticGroups: ScanGroup[] = [];
  for (const [restaurantId, recipes] of newRecipesByRestaurant) {
    const label = restaurantNameById.get(restaurantId) ?? "Saved restaurant";
    const syntheticKey = `plately_supabase_${restaurantId}`;
    syntheticGroups.push({
      scanKey: syntheticKey,
      label,
      restaurantName: label,
      restaurantPlaceId: restaurantPlaceIdById.get(restaurantId) ?? null,
      dishes: recipes.map(domainRecipeToDish),
      partialResults: false,
    });
  }

  // Supabase-only groups go after session groups (session data is fresher)
  return [...enrichedGroups, ...syntheticGroups];
}

/**
 * Build the gallery restaurant list, one entry per unique restaurant,
 * carrying dishes, placeId, and Places rating for display.
 */
function buildGalleryRestaurants(
  groups: ScanGroup[],
  restaurantsWithRecipes: Array<DomainRestaurant & { recipes: DomainRecipe[] }>,
): GalleryRestaurant[] {
  const supabaseByName = new Map(
    restaurantsWithRecipes.map((r) => [r.name.toLowerCase().trim(), r])
  );
  const supabaseById = new Map(
    restaurantsWithRecipes.map((r) => [r.id, r])
  );

  const seen = new Set<string>();
  const result: GalleryRestaurant[] = [];

  for (const g of groups) {
    if (seen.has(g.label)) continue;
    seen.add(g.label);

    // Priority 1: placeId stored directly in the scan entry
    let placeId: string | null = g.restaurantPlaceId ?? null;

    // Priority 2: synthetic groups encode the Supabase restaurant UUID in the key
    if (!placeId && g.scanKey.startsWith("plately_supabase_")) {
      const restaurantId = g.scanKey.replace("plately_supabase_", "");
      placeId = supabaseById.get(restaurantId)?.placeId ?? null;
    }

    // Priority 3: name-based lookup (last resort)
    if (!placeId) {
      placeId = supabaseByName.get(g.label.toLowerCase().trim())?.placeId ?? null;
    }

    // Resolve Supabase restaurant for rating data
    const supabaseRestaurant =
      (g.scanKey.startsWith("plately_supabase_")
        ? supabaseById.get(g.scanKey.replace("plately_supabase_", ""))
        : null)
      ?? supabaseByName.get(g.label.toLowerCase().trim())
      ?? null;

    result.push({
      label: g.label,
      scanKey: g.scanKey,
      placeId,
      rating: supabaseRestaurant?.rating ?? null,
      userRatingsTotal: supabaseRestaurant?.userRatingsTotal ?? null,
      dishes: g.dishes,
    });
  }

  return result;
}

// ─── HomeScreen ────────────────────────────────────────────

export function HomeScreen() {
  const [sessionGroups, setSessionGroups] = useState<ScanGroup[]>([]);

  // Supabase data layers — degrade gracefully when not configured
  const { data: supabaseRecipes, isPending: recipesPending } = useRecipes();
  const { data: restaurantsWithRecipes } = useRestaurantsWithRecipes();

  const refresh = useCallback(() => {
    setSessionGroups(readScanGroups());
  }, []);

  useEffect(() => {
    refresh();
    // plately:enriched fires in-tab from CameraModal; cross-tab changes use native storage
    window.addEventListener("plately:enriched", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("plately:enriched", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  // Merge sessionStorage + Supabase data
  const groups = mergeWithSupabaseRecipes(
    sessionGroups,
    supabaseRecipes ?? [],
    restaurantsWithRecipes ?? [],
  );

  const isEmpty = groups.length === 0;

  // Derived banner data — uses merged groups but excludes synthetic entries
  const realSessionGroups = groups.filter((g) => g.scanKey.startsWith("plately_scan_"));
  const scanCount = realSessionGroups.reduce((acc, g) => acc + g.dishes.length, 0);
  const mostRecentPartial = realSessionGroups[0]?.partialResults ?? false;
  const scansForBanner = realSessionGroups.map((g) => ({
    restaurantName: g.restaurantName ?? null,
    allDishes: g.dishes,
    partialResults: g.partialResults,
  }));

  const galleryRestaurants = buildGalleryRestaurants(groups, restaurantsWithRecipes ?? []);
  const removeRecipe = useRemoveRecipe();

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="px-5 pt-[calc(var(--space-safe-top)+20px)] pb-4">
        <motion.h1
          className="text-[1.75rem] tracking-[-0.02em]"
          style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          Plately
        </motion.h1>
      </div>

      {/* Banners — shown between header and content */}
      {!isEmpty && realSessionGroups.length > 0 && (
        <>
          <SmartBanner scans={scansForBanner} />
          <TipBanner scanCount={scanCount} />
          <PartialResultsBanner hasPartialResults={mostRecentPartial} />
        </>
      )}

      {/* Content */}
      {isEmpty && recipesPending && sessionGroups.length === 0 ? (
        <div className="flex-1 px-4">
          <HomeScreenSkeleton />
        </div>
      ) : isEmpty ? (
        <div className="flex-1 px-4">
          <EmptyState />
        </div>
      ) : (
        <motion.div
          className="flex-1 flex flex-col gap-8 pb-8"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {galleryRestaurants.map((restaurant) => (
            <motion.div key={restaurant.scanKey} variants={itemVariants}>
              <RestaurantGallerySection
                restaurant={restaurant}
                onDeleteDish={(id) => void removeRecipe.mutate(id)}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

// ─── Gallery section (one per restaurant) ──────────────────

function RestaurantGallerySection({
  restaurant,
  onDeleteDish,
}: {
  restaurant: GalleryRestaurant;
  onDeleteDish: (id: string) => void;
}) {
  const router = useRouter();

  const handleHeaderTap = () => {
    if (!restaurant.placeId) return;
    router.push(
      `/restaurants/${encodeURIComponent(restaurant.placeId)}?name=${encodeURIComponent(restaurant.label)}`
    );
  };

  // Build the rating string: "★ 4.2 · 1,234 reviews"
  const ratingStr =
    restaurant.rating !== null
      ? `★ ${restaurant.rating.toFixed(1)}${
          restaurant.userRatingsTotal !== null
            ? ` · ${new Intl.NumberFormat().format(restaurant.userRatingsTotal)}`
            : ""
        }`
      : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Restaurant header row */}
      <motion.button
        onClick={handleHeaderTap}
        disabled={!restaurant.placeId}
        className="flex items-center justify-between px-5 text-left"
        style={{ cursor: restaurant.placeId ? "pointer" : "default" }}
        whileTap={restaurant.placeId ? { opacity: 0.7 } : {}}
      >
        <div className="flex-1 min-w-0 pr-2">
          <p
            className="text-[1.0625rem] font-semibold leading-tight truncate"
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              color: "var(--color-text-primary)",
            }}
          >
            {restaurant.label}
          </p>
          {ratingStr && (
            <p
              className="text-[12px] mt-0.5 font-medium"
              style={{ color: "var(--color-accent)" }}
            >
              {ratingStr}
            </p>
          )}
        </div>
        {restaurant.placeId && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="flex-shrink-0"
          >
            <path
              d="M9 18l6-6-6-6"
              stroke="var(--color-text-tertiary)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </motion.button>

      {/* Horizontal dish scroll */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-5 pb-1">
        {restaurant.dishes.map((dish, i) => {
          const href = dish.supabaseId
            ? `/recipe/${dish.supabaseId}?dish=0`
            : `/recipe/${restaurant.scanKey}?dish=${i}`;
          return (
            <GalleryDishCard
              key={dish.supabaseId ?? `${restaurant.scanKey}-${i}`}
              dish={dish}
              onClick={() => router.push(href)}
              onDelete={dish.supabaseId ? () => onDeleteDish(dish.supabaseId!) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Gallery dish card ──────────────────────────────────────

function GalleryDishCard({
  dish,
  onClick,
  onDelete,
}: {
  dish: Dish;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const card = (
    <motion.button
      onClick={onClick}
      aria-label={`View ${dish.name}`}
      className="flex-shrink-0 flex flex-col overflow-hidden rounded-[var(--radius-lg)] text-left"
      style={{ width: 148, background: "#1A1612" }}
      whileTap={{ scale: 0.96 }}
    >
      {/* Photo */}
      <div className="relative overflow-hidden flex-shrink-0" style={{ height: 116 }}>
        {dish.photoUrl ? (
          <img
            src={dish.photoUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(196,98,45,0.22) 0%, rgba(228,174,110,0.18) 100%)",
            }}
          >
            <PlateIconSmall />
          </div>
        )}

        {/* Dish rating badge */}
        {dish.dishRating !== null && dish.dishRating !== undefined && (
          <div
            className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(12,8,4,0.70)" }}
          >
            <span style={{ color: "var(--color-accent)", fontSize: 9, lineHeight: 1 }}>★</span>
            <span
              className="text-[10px] font-semibold leading-none"
              style={{ color: "#fff" }}
            >
              {dish.dishRating.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Text below photo */}
      <div
        className="flex flex-col px-2.5 pt-2 pb-2.5 gap-0.5"
        style={{ background: "rgba(250,245,238,0.97)" }}
      >
        <p
          className="text-[12px] font-semibold leading-tight"
          style={{
            color: "var(--color-text-primary)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {dish.name}
        </p>
        {(dish.totalCalories ?? dish.calorieEstimate) && (
          <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {dish.totalCalories ?? dish.calorieEstimate} cal
          </p>
        )}
      </div>
    </motion.button>
  );

  if (onDelete) {
    return <SwipeToDelete onDelete={onDelete}>{card}</SwipeToDelete>;
  }
  return card;
}

// ─── Icons & placeholders ───────────────────────────────────

function PlateIconSmall() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <svg width="36" height="36" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <circle
          cx="36"
          cy="40"
          r="22"
          fill="rgba(196,98,45,0.14)"
          stroke="rgba(196,98,45,0.22)"
          strokeWidth="1.5"
        />
        <circle cx="36" cy="40" r="14" fill="rgba(196,98,45,0.07)" />
        <path
          d="M27 38c2-2.5 4.5-3.5 7-2s5 1 7-2"
          stroke="rgba(196,98,45,0.45)"
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

// ─── Loading skeleton ───────────────────────────────────────

function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{ background: "rgba(180,170,158,0.10)", borderRadius: 8, ...style }}
      aria-hidden="true"
    />
  );
}

function HomeScreenSkeleton() {
  return (
    <div className="flex flex-col gap-8 pb-8 animate-pulse" aria-busy="true" aria-label="Loading">
      {/* Restaurant section skeleton × 2 */}
      {Array.from({ length: 2 }).map((_, si) => (
        <div key={si} className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex flex-col gap-1.5 px-1">
            <SkeletonBlock style={{ height: 18, width: 160 }} />
            <SkeletonBlock style={{ height: 13, width: 90 }} />
          </div>
          {/* Horizontal dish cards */}
          <div className="flex gap-3 overflow-hidden px-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 flex flex-col overflow-hidden rounded-xl" style={{ width: 148 }}>
                <SkeletonBlock style={{ height: 116, borderRadius: 0 }} />
                <SkeletonBlock style={{ height: 52, borderRadius: 0, background: "rgba(180,170,158,0.07)" }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────

function EmptyState({ onScanPress }: { onScanPress?: () => void }) {
  return (
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

      {/* 13px body, max 210px */}
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

      {/* Terracotta pill CTA */}
      <motion.button
        onClick={onScanPress}
        aria-label="Open camera to scan a menu"
        className="flex items-center gap-2 font-semibold"
        style={{
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
        }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
      >
        <span aria-hidden="true">📷</span>
        Scan a menu
      </motion.button>
    </motion.div>
  );
}

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
}

interface ScanGroup {
  scanKey: string;
  label: string;
  dishes: Dish[];
  restaurantName?: string | null;
  partialResults?: boolean;
}

interface DishEntry {
  dish: Dish;
  scanKey: string;
  dishIndex: number;
  restaurant: string;
}

interface RestaurantEntry {
  label: string;
  scanKey: string;
  photoUrl: string | null;
  /** Set when the entry came from Supabase */
  supabaseId?: string;
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
          allDishes: Dish[];
          partialResults?: boolean;
        };
        if (!Array.isArray(result.allDishes) || result.allDishes.length === 0) return [];
        return [{
          scanKey,
          label: formatScanLabel(scanKey, result.restaurantName),
          dishes: result.allDishes,
          restaurantName: result.restaurantName ?? null,
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
 *      (persisted image URL, supabaseId for linking).
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

  // Create synthetic ScanGroups for Supabase-only recipes (oldest-first so
  // the newest appears at the top when sorted by scanKey timestamp below)
  const syntheticGroups: ScanGroup[] = [];
  for (const [restaurantId, recipes] of newRecipesByRestaurant) {
    const label = restaurantNameById.get(restaurantId) ?? "Saved restaurant";
    // Use a synthetic scanKey that sorts before real session keys
    const syntheticKey = `plately_supabase_${restaurantId}`;
    syntheticGroups.push({
      scanKey: syntheticKey,
      label,
      restaurantName: label,
      dishes: recipes.map(domainRecipeToDish),
      partialResults: false,
    });
  }

  // Supabase-only groups go after session groups (session data is fresher)
  return [...enrichedGroups, ...syntheticGroups];
}

/**
 * Build the RestaurantEntry list, supplementing sessionStorage entries with
 * Supabase restaurant reference images where available.
 */
function buildRestaurantEntries(
  groups: ScanGroup[],
  restaurantsWithRecipes: Array<DomainRestaurant & { recipes: DomainRecipe[] }>,
): RestaurantEntry[] {
  const sessionEntries = groups.reduce<RestaurantEntry[]>((acc, g) => {
    if (!acc.some((r) => r.label === g.label)) {
      acc.push({ label: g.label, scanKey: g.scanKey, photoUrl: g.dishes[0]?.photoUrl ?? null });
    }
    return acc;
  }, []);

  if (restaurantsWithRecipes.length === 0) return sessionEntries;

  // Build a name → referenceImageUrl lookup from Supabase
  const supabaseImageByName = new Map(
    restaurantsWithRecipes.map((r) => [r.name.toLowerCase().trim(), r.referenceImageUrl])
  );

  return sessionEntries.map((entry) => {
    if (entry.photoUrl) return entry;
    const supabaseImage = supabaseImageByName.get(entry.label.toLowerCase().trim());
    return { ...entry, photoUrl: supabaseImage ?? null };
  });
}

// ─── HomeScreen ────────────────────────────────────────────

export function HomeScreen() {
  const [sessionGroups, setSessionGroups] = useState<ScanGroup[]>([]);
  const [showAll, setShowAll] = useState(false);

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

  // Derived data
  const heroDish = groups[0]?.dishes[0] ?? null;
  const heroRestaurant = groups[0]?.label ?? null;
  const heroScanKey = groups[0]?.scanKey ?? null;

  const allDishEntries: DishEntry[] = groups.flatMap((g) =>
    g.dishes.map((dish, i) => ({ dish, scanKey: g.scanKey, dishIndex: i, restaurant: g.label }))
  );
  const collectionEntries = allDishEntries.slice(1); // exclude hero
  const displayedEntries = showAll ? collectionEntries : collectionEntries.slice(0, 6);

  const restaurants = buildRestaurantEntries(groups, restaurantsWithRecipes ?? []);
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
          {/* Hero */}
          {heroDish && heroScanKey && (
            <motion.div variants={itemVariants}>
              <HeroCard dish={heroDish} restaurant={heroRestaurant} scanKey={heroScanKey} />
            </motion.div>
          )}

          {/* Your Collection */}
          {collectionEntries.length > 0 && (
            <motion.div variants={itemVariants} className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-5">
                <h2
                  className="text-[1.0625rem] font-semibold"
                  style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
                >
                  Your Collection
                </h2>
                {collectionEntries.length > 6 && (
                  <button
                    onClick={() => setShowAll((v) => !v)}
                    className="text-[13px] font-medium px-1"
                    style={{ color: "var(--color-text-tertiary)", minHeight: "unset", minWidth: "unset" }}
                  >
                    {showAll ? "Show Less" : "View All"}
                  </button>
                )}
              </div>
              <CollectionGrid
                entries={displayedEntries}
                onDeleteById={(id) => void removeRecipe.mutate(id)}
              />
            </motion.div>
          )}

          {/* Recent Restaurants */}
          {restaurants.length > 0 && (
            <motion.div variants={itemVariants} className="flex flex-col gap-3">
              <h2
                className="px-5 text-[1.0625rem] font-semibold"
                style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
              >
                Recent Restaurants
              </h2>
              <RestaurantsRow restaurants={restaurants} />
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── Hero card ─────────────────────────────────────────────

function HeroCard({ dish, restaurant, scanKey }: { dish: Dish; restaurant: string | null; scanKey: string }) {
  const router = useRouter();

  const href = dish.supabaseId
    ? `/recipe/${dish.supabaseId}?dish=0`
    : `recipe/${scanKey}?dish=0`;

  return (
    <motion.button
      onClick={() => router.push(href)}
      aria-label={`View ${dish.name}`}
      className="relative w-full overflow-hidden text-left"
      style={{ height: 240, background: "#1A1612" }}
      whileTap={{ opacity: 0.88 }}
    >
      {/* Photo */}
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
          style={{ background: "linear-gradient(135deg, #2A1A0E 0%, #3D2410 50%, #1A1612 100%)" }}
        />
      )}

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(12,8,4,0.88) 0%, rgba(12,8,4,0.4) 45%, transparent 100%)" }}
      />

      {/* Text */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
        <p
          className="text-[1.75rem] leading-tight mb-1"
          style={{ fontFamily: "var(--font-display), Georgia, serif", color: "#fff" }}
        >
          {dish.name}
        </p>
        {restaurant && (
          <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.65)" }}>
            {restaurant}
          </p>
        )}
      </div>
    </motion.button>
  );
}

// ─── Collection grid ───────────────────────────────────────

function CollectionGrid({
  entries,
  onDeleteById,
}: {
  entries: DishEntry[];
  onDeleteById: (id: string) => void;
}) {
  const router = useRouter();

  return (
    <div
      className="px-4"
      style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}
    >
      {entries.map(({ dish, scanKey, dishIndex, restaurant }) => {
        const href = dish.supabaseId
          ? `/recipe/${dish.supabaseId}?dish=0`
          : `/recipe/${scanKey}?dish=${dishIndex}`;
        return (
          <CollectionCard
            key={dish.supabaseId ?? `${scanKey}-${dishIndex}`}
            dish={dish}
            restaurant={restaurant}
            onClick={() => router.push(href)}
            onDelete={dish.supabaseId ? () => onDeleteById(dish.supabaseId!) : undefined}
          />
        );
      })}
    </div>
  );
}

function CollectionCard({
  dish,
  restaurant,
  onClick,
  onDelete,
}: {
  dish: Dish;
  restaurant: string;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const card = (
    <motion.button
      onClick={onClick}
      aria-label={`View ${dish.name}`}
      className="relative overflow-hidden rounded-[var(--radius-lg)] text-left w-full"
      style={{ aspectRatio: "3/4", background: "#1A1612" }}
      whileTap={{ scale: 0.96 }}
    >
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
          style={{ background: "linear-gradient(135deg, rgba(196,98,45,0.22) 0%, rgba(228,174,110,0.18) 100%)" }}
        >
          <PlateIconMedium />
        </div>
      )}

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(12,8,4,0.80) 0%, rgba(12,8,4,0.2) 55%, transparent 100%)" }}
      />

      {/* Text */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
        <p
          className="text-[13px] font-semibold leading-tight text-white mb-0.5"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {dish.name}
        </p>
        <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.6)" }}>
          {restaurant}
        </p>
      </div>
    </motion.button>
  );

  if (onDelete) {
    return <SwipeToDelete onDelete={onDelete}>{card}</SwipeToDelete>;
  }
  return card;
}

// ─── Recent Restaurants row ────────────────────────────────

function RestaurantsRow({ restaurants }: { restaurants: RestaurantEntry[] }) {
  const router = useRouter();

  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 px-4">
      {restaurants.map(({ label, scanKey, photoUrl }) => (
        <motion.button
          key={scanKey}
          onClick={() => router.push(`/recipe/${scanKey}?dish=0`)}
          aria-label={`View ${label}`}
          className="flex-shrink-0 flex flex-col items-center gap-2"
          style={{ width: 88 }}
          whileTap={{ scale: 0.94 }}
        >
          <div
            className="relative overflow-hidden rounded-[var(--radius-md)] w-full"
            style={{ height: 88 }}
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(196,98,45,0.15) 0%, rgba(228,174,110,0.20) 100%)" }}
              >
                <RestaurantPlaceholderIcon />
              </div>
            )}
          </div>
          <p
            className="text-[11px] font-semibold text-center leading-tight w-full"
            style={{
              color: "var(--color-text-secondary)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {label}
          </p>
        </motion.button>
      ))}
    </div>
  );
}

// ─── Icons & placeholders ───────────────────────────────────

function PlateIconMedium() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <svg width="48" height="48" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <circle cx="36" cy="40" r="22" fill="rgba(196,98,45,0.14)" stroke="rgba(196,98,45,0.22)" strokeWidth="1.5" />
        <circle cx="36" cy="40" r="14" fill="rgba(196,98,45,0.07)" />
        <path d="M27 38c2-2.5 4.5-3.5 7-2s5 1 7-2" stroke="rgba(196,98,45,0.45)" strokeWidth="1.75" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}

function RestaurantPlaceholderIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 9a2 2 0 0 1 2-2h.5l1.5-3h9l1.5 3H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"
        stroke="rgba(196,98,45,0.5)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3" stroke="rgba(196,98,45,0.5)" strokeWidth="1.5" />
    </svg>
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
      {/* Hero skeleton */}
      <SkeletonBlock style={{ height: 240, borderRadius: 0 }} />

      {/* Collection section */}
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="mx-1" style={{ height: 18, width: 130 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} style={{ aspectRatio: "3/4", borderRadius: 12 }} />
          ))}
        </div>
      </div>

      {/* Restaurants section */}
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="mx-1" style={{ height: 18, width: 160 }} />
        <div className="flex gap-3 overflow-hidden px-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 flex flex-col gap-2" style={{ width: 88 }}>
              <SkeletonBlock style={{ width: 88, height: 88, borderRadius: 10 }} />
              <SkeletonBlock style={{ height: 12, width: 70 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      className="flex flex-col items-center pt-12 pb-6 gap-5"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Hero illustration card */}
      <motion.div variants={itemVariants} className="w-full max-w-xs">
        <FrostedCard elevated className="flex flex-col items-center gap-3 py-8 px-6 text-center">
          <PlateIllustration />
          <div>
            <h2
              className="text-[1.25rem] mb-1"
              style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
            >
              Eaten somewhere great?
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              Scan the menu or search a restaurant to start building your collection.
            </p>
          </div>
        </FrostedCard>
      </motion.div>

      {/* Quick-start hint cards */}
      <motion.div variants={itemVariants} className="w-full max-w-xs flex flex-col gap-3">
        <HintCard
          icon={<CameraHintIcon />}
          title="Scan a menu"
          description="Point your camera at any menu — every dish is instantly saved."
        />
        <HintCard
          icon={<SearchHintIcon />}
          title="Search a restaurant"
          description="Find a place you've been, browse the menu, and add what you loved."
        />
      </motion.div>
    </motion.div>
  );
}

function HintCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <FrostedCard className="flex items-start gap-3 py-3.5">
      <div
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-[var(--radius-md)]"
        style={{ background: "var(--color-accent-light)" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          {description}
        </p>
      </div>
    </FrostedCard>
  );
}

/* ─── Illustrations ─── */

function PlateIllustration() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <circle cx="36" cy="40" r="24" fill="rgba(196, 98, 45, 0.08)" stroke="rgba(196, 98, 45, 0.18)" strokeWidth="1.5" />
      <circle cx="36" cy="40" r="18" fill="rgba(196, 98, 45, 0.05)" stroke="rgba(196, 98, 45, 0.12)" strokeWidth="1" />
      <path d="M28 38c2-3 5-4 8-2s6 1 8-2" stroke="rgba(196, 98, 45, 0.5)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M30 44c2-2 4-3 6-1s4 1 6-2" stroke="rgba(196, 98, 45, 0.35)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M16 16v10M14 16v6M18 16v6M16 22v10" stroke="rgba(106, 100, 88, 0.5)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M54 16l2 10-2 2v6" stroke="rgba(106, 100, 88, 0.5)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CameraHintIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 9a2 2 0 0 1 2-2h.5l1.5-3h9l1.5 3H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"
        stroke="var(--color-accent)" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3" stroke="var(--color-accent)" strokeWidth="1.6" />
    </svg>
  );
}

function SearchHintIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="var(--color-accent)" strokeWidth="1.6" />
      <path d="M16.5 16.5L21 21" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

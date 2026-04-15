"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AppShell } from "@/components/AppShell";
import { FrostedCard } from "@/components/ui/FrostedCard";
import { useAddToGrocery, useGroceryItems } from "@/hooks/useGrocery";
import { RestaurantConfirmation } from "@/components/scan/RestaurantConfirmation";
import type { RestaurantInfo } from "@/components/scan/RestaurantConfirmation";
import { useRecipe, useRemoveRecipe } from "@/hooks/useRecipes";
import type { DomainRecipe } from "@/types/database";

interface Ingredient {
  name: string;
  quantity?: string | null;
  unit?: string | null;
  confidenceLevel?: "high" | "medium" | "low";
  calories_kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
}

interface Dish {
  id?: string;
  name: string;
  description?: string;
  calorieEstimate?: number | null;
  confidence?: number;
  ingredients: Ingredient[];
  photoUrl?: string | null;
  servings?: number;
  totalCalories?: number | null;
  totalProtein?: number | null;
  totalFat?: number | null;
  totalCarbs?: number | null;
}

interface ScanResult {
  type: "menu" | "dish";
  restaurantName?: string | null;
  restaurantPlaceId?: string | null;
  restaurantAddress?: string | null;
  restaurantRating?: number | null;
  restaurantUserRatingsTotal?: number | null;
  allDishes: Dish[];
  enriched?: boolean;
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 28, stiffness: 280 } },
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

// ─── UUID detection ────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Map a DomainRecipe (from Supabase) to the ScanResult shape used by the
 * existing render layer. A Supabase recipe is treated as a single-dish
 * "dish" scan — no multi-dish selector chip is shown.
 */
function domainRecipeToScanResult(recipe: DomainRecipe): ScanResult {
  const ingredients: Ingredient[] = (recipe.ingredients ?? []).map((ing) => ({
    name: ing.name,
    quantity: ing.quantity,
    unit: ing.unit,
    calories_kcal: ing.caloriesPerServing,
    protein_g: ing.proteinG,
    fat_g: ing.fatG,
    carbs_g: ing.carbsG,
    confidenceLevel: ing.confidence,
  }));

  const sumNutrient = (fn: (i: Ingredient) => number | null | undefined): number | null => {
    const vals = ingredients.map(fn).filter((v): v is number => v != null);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10 : null;
  };

  const dish: Dish = {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description ?? undefined,
    calorieEstimate: recipe.estimatedCalories,
    photoUrl: recipe.dishImageUrl,
    ingredients,
    totalCalories: sumNutrient(i => i.calories_kcal) ?? recipe.estimatedCalories,
    totalProtein: sumNutrient(i => i.protein_g),
    totalFat: sumNutrient(i => i.fat_g),
    totalCarbs: sumNutrient(i => i.carbs_g),
  };

  return {
    type: "dish",
    restaurantName: recipe.restaurant?.name ?? null,
    restaurantPlaceId: recipe.restaurant?.placeId ?? null,
    restaurantAddress: recipe.restaurant?.address ?? null,
    allDishes: [dish],
    enriched: true,
  };
}

// ─── Inner page (uses useSearchParams) ────────────────────

function RecipePageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";
  const dishIndex = Math.max(0, Number(searchParams.get("dish") ?? "0"));

  // Detect the ID type:
  // - UUID → Supabase recipe (direct-link or cross-session navigation)
  // - "plately_scan_*" or "plately_supabase_*" → sessionStorage key
  const idIsUUID = isUUID(id);

  const [result, setResult] = useState<ScanResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirmationDismissed, setConfirmationDismissed] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const removeRecipe = useRemoveRecipe();
  const addToGroceryMutation = useAddToGrocery();
  const { data: groceryItems } = useGroceryItems();

  // ── Supabase path (UUID ids only) ──────────────────────────
  const { data: supabaseRecipe, isError: supabaseError, isLoading: supabaseLoading } =
    useRecipe(idIsUUID ? id : null);

  // Map Supabase recipe into ScanResult when it arrives
  useEffect(() => {
    if (!idIsUUID) return;
    if (supabaseRecipe) {
      setResult(domainRecipeToScanResult(supabaseRecipe));
      setNotFound(false);
    } else if (supabaseError && !supabaseLoading) {
      setNotFound(true);
    }
  }, [idIsUUID, supabaseRecipe, supabaseError, supabaseLoading]);

  // ── SessionStorage path (non-UUID ids) ────────────────────

  const loadFromStorage = useCallback(() => {
    if (!id || idIsUUID) return;
    const raw = sessionStorage.getItem(id);
    if (!raw) { setNotFound(true); return; }
    try {
      setResult(JSON.parse(raw));
    } catch {
      setNotFound(true);
    }
  }, [id, idIsUUID]);

  /** Persist the confirmed restaurant into sessionStorage and re-render */
  const handleRestaurantConfirm = useCallback(
    (restaurant: RestaurantInfo) => {
      if (!id || idIsUUID) return;
      const raw = sessionStorage.getItem(id);
      if (!raw) return;
      try {
        const parsed: ScanResult = JSON.parse(raw);
        const updated: ScanResult = {
          ...parsed,
          restaurantName: restaurant.name,
          restaurantPlaceId: restaurant.placeId,
          restaurantAddress: restaurant.address ?? null,
          restaurantRating: restaurant.rating ?? null,
          restaurantUserRatingsTotal: restaurant.userRatingsTotal ?? null,
        };
        sessionStorage.setItem(id, JSON.stringify(updated));
        setResult(updated);
      } catch {
        // ignore
      }
      setConfirmationDismissed(true);
    },
    [id, idIsUUID]
  );

  const handleRestaurantSkip = useCallback(() => {
    setConfirmationDismissed(true);
  }, []);

  useEffect(() => {
    if (!idIsUUID) loadFromStorage();
  }, [loadFromStorage, idIsUUID]);

  // Listen for enrichment updates — CustomEvent from same tab (sessionStorage only)
  useEffect(() => {
    if (idIsUUID) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (detail?.key === id) loadFromStorage();
    };
    window.addEventListener("plately:enriched", handler);
    return () => window.removeEventListener("plately:enriched", handler);
  }, [id, idIsUUID, loadFromStorage]);

  // Polling fallback: check every 3s until enriched (max 45s) — sessionStorage only
  useEffect(() => {
    if (!id || idIsUUID) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const raw = sessionStorage.getItem(id);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { enriched?: boolean };
          if (parsed.enriched) {
            loadFromStorage();
            clearInterval(interval);
            return;
          }
        } catch { /* ignore */ }
      }
      if (attempts >= 15) clearInterval(interval); // stop after 45s
    }, 3000);
    return () => clearInterval(interval);
  }, [id, idIsUUID, loadFromStorage]);

  // ── Delete handler (UUID recipes only, two-tap confirmation) ─────────────────

  function handleDeleteTap() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
      return;
    }
    void removeRecipe.mutateAsync(id).then(() => router.replace('/'));
  }

  // ── Not-found state ───────────────────────────────────────

  if (notFound) {
    return (
      <AppShell>
        <div className="min-h-full flex flex-col items-center justify-center gap-4 px-4">
          <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
            This dish result has expired.
          </p>
          <button
            onClick={() => router.replace("/")}
            className="text-sm font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            Back to Home
          </button>
        </div>
      </AppShell>
    );
  }

  // Loading state — shown while waiting for Supabase or sessionStorage
  if (!result) {
    return (
      <AppShell>
        <RecipeDetailSkeleton />
      </AppShell>
    );
  }

  const { type, restaurantName, restaurantPlaceId, allDishes, enriched } = result;
  const dish = allDishes[dishIndex] ?? allDishes[0];
  const isMenu = type === "menu" && allDishes.length > 1;
  const otherDishes = allDishes.filter((_, i) => i !== dishIndex);
  const atmosphericUrl = dish?.photoUrl ?? null;

  // When viewing a Supabase-backed recipe the restaurant ID is available
  // directly; pass it through so AtmosphericBackground can persist the
  // extracted palette without re-running extraction on every page load.
  const atmosphericRestaurantId = idIsUUID ? (supabaseRecipe?.restaurantId ?? undefined) : undefined;

  // Show the restaurant confirmation panel when no restaurant is identified.
  // Not shown for Supabase recipes (they already have restaurant context).
  const showConfirmation =
    !idIsUUID &&
    !confirmationDismissed &&
    !restaurantName &&
    !restaurantPlaceId;

  const hasRealMacros = dish?.ingredients?.some((i) => i.calories_kcal !== null && i.calories_kcal !== undefined);
  const displayCalories = dish?.totalCalories ?? dish?.calorieEstimate ?? null;
  // Derive from the grocery list query so state persists across navigation.
  // Resets automatically if the user removes all items tied to this recipe.
  const groceryAdded = dish?.id
    ? (groceryItems ?? []).some((item) => item.recipeIds.includes(dish.id!))
    : false;

  return (
    <AppShell atmosphericImageUrl={atmosphericUrl} atmosphericRestaurantId={atmosphericRestaurantId}>
      <motion.div
        className="min-h-full flex flex-col"
        variants={containerVariants}
        initial="hidden"
        animate="show"
        key={`${id}-${dishIndex}`}
      >
        {/* Header */}
        <div className="px-4 pt-[calc(var(--space-safe-top)+16px)] pb-3 flex items-center gap-3">
          <motion.button
            onClick={() => router.back()}
            aria-label="Back"
            className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0"
            style={{ background: "rgba(180,170,158,0.18)" }}
            whileTap={{ scale: 0.9 }}
          >
            <ChevronLeftIcon />
          </motion.button>
          <div className="flex-1 min-w-0">
            <motion.p
              variants={itemVariants}
              className="text-xs font-semibold uppercase tracking-widest truncate"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {restaurantName ?? (isMenu ? "Menu scan" : "Dish scan")}
            </motion.p>
          </div>
          {/* Edit link */}
          <motion.button
            onClick={() => router.push(`/recipe/${id}/edit?dish=${dishIndex}`)}
            aria-label="Edit recipe"
            className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0"
            style={{ background: "rgba(180,170,158,0.18)" }}
            whileTap={{ scale: 0.9 }}
            variants={itemVariants}
          >
            <PencilIcon />
          </motion.button>
          {/* Delete button — UUID (Supabase) recipes only; two-tap confirmation */}
          {idIsUUID && (
            <motion.button
              onClick={handleDeleteTap}
              disabled={removeRecipe.isPending}
              aria-label={deleteConfirm ? "Confirm delete" : "Delete recipe"}
              className="flex items-center justify-center h-9 rounded-full flex-shrink-0 px-3 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: deleteConfirm ? "rgba(220,38,38,0.12)" : "rgba(180,170,158,0.18)",
                color: deleteConfirm ? "rgb(220,38,38)" : "var(--color-text-tertiary)",
                minWidth: deleteConfirm ? undefined : 36,
              }}
              whileTap={{ scale: 0.9 }}
              variants={itemVariants}
            >
              {deleteConfirm ? "Delete?" : <TrashIcon />}
            </motion.button>
          )}
        </div>

        {/* Dish selector chips (menu scans with multiple dishes) */}
        {isMenu && (
          <motion.div variants={itemVariants} className="pb-3">
            <div className="flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
              {allDishes.map((d, i) => (
                <button
                  key={d.id ?? i}
                  onClick={() => router.replace(`/recipe/${id}?dish=${i}`)}
                  aria-label={`View ${d.name}`}
                  aria-current={i === dishIndex ? "true" : undefined}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: i === dishIndex ? "var(--color-accent)" : "rgba(180,170,158,0.18)",
                    color: i === dishIndex ? "#fff" : "var(--color-text-secondary)",
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Dish hero */}
        <motion.div variants={itemVariants} className="px-4 pb-4">
          <h1
            className="text-[2rem] leading-tight tracking-[-0.01em] mb-1.5"
            style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
          >
            {dish.name}
          </h1>
          {dish.description && dish.description !== "null" && (
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              {dish.description}
            </p>
          )}
        </motion.div>

        {/* Restaurant confirmation — shown when no restaurant is linked (sessionStorage scans only) */}
        {showConfirmation && (
          <motion.div variants={itemVariants} className="px-4 pb-4">
            <RestaurantConfirmation
              onConfirm={handleRestaurantConfirm}
              onSkip={handleRestaurantSkip}
            />
          </motion.div>
        )}

        {/* Stats row */}
        {(displayCalories || dish.servings) && (
          <motion.div variants={itemVariants} className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {displayCalories && (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}
                >
                  <FlameIcon />
                  {displayCalories} cal
                </span>
              )}
              {dish.servings && dish.servings > 1 && (
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-sm"
                  style={{ background: "rgba(180,170,158,0.15)", color: "var(--color-text-tertiary)" }}
                >
                  {dish.servings} servings
                </span>
              )}
            </div>
          </motion.div>
        )}

        {/* Macros summary */}
        {(dish.totalProtein || dish.totalFat || dish.totalCarbs) && (
          <motion.div variants={itemVariants} className="px-4 pb-4">
            <FrostedCard className="flex justify-around py-3 px-2">
              <MacroStat label="Protein" value={dish.totalProtein} unit="g" />
              <div style={{ width: 1, background: "rgba(180,170,158,0.22)" }} />
              <MacroStat label="Fat" value={dish.totalFat} unit="g" />
              <div style={{ width: 1, background: "rgba(180,170,158,0.22)" }} />
              <MacroStat label="Carbs" value={dish.totalCarbs} unit="g" />
            </FrostedCard>
          </motion.div>
        )}

        {/* Ingredients */}
        <motion.div variants={itemVariants} className="px-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Ingredients
            </h2>
            {!enriched && (
              <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--color-text-tertiary)" }}>
                <SpinnerDot />
                Loading nutrition data…
              </span>
            )}
            {enriched && !hasRealMacros && (
              <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                AI estimates
              </span>
            )}
          </div>

          {dish.ingredients.length > 0 ? (
            <FrostedCard noPadding className="overflow-hidden">
              {dish.ingredients.map((ing, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    borderBottom:
                      i < dish.ingredients.length - 1
                        ? "1px solid rgba(180,170,158,0.15)"
                        : undefined,
                  }}
                >
                  <span className="text-sm flex-1 min-w-0 pr-2" style={{ color: "var(--color-text-primary)" }}>
                    {ing.name}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {(ing.quantity || ing.unit) && (
                      <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                        {[ing.quantity, ing.unit].filter(Boolean).join(" ")}
                      </span>
                    )}
                    {ing.calories_kcal !== null && ing.calories_kcal !== undefined && (
                      /* WCAG 2.1 AA: text-xs (12px) + font-medium (500) does not meet the
                         terracotta threshold (≥14px AND ≥600). Use text-tertiary instead. */
                      <span className="text-xs font-medium" style={{ color: "var(--color-text-tertiary)" }}>
                        {ing.calories_kcal} kcal
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </FrostedCard>
          ) : (
            <FrostedCard>
              <p className="text-sm text-center py-2" style={{ color: "var(--color-text-tertiary)" }}>
                {enriched ? "No ingredients identified" : "Identifying ingredients…"}
              </p>
            </FrostedCard>
          )}
        </motion.div>

        {/* Cooking instructions gate — Story 5.4 */}
        {idIsUUID && supabaseRecipe?.status === 'kept' && (
          <motion.div variants={itemVariants} className="px-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <h2
                id="cooking-instructions-heading"
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                How to Make It
              </h2>
            </div>
            <CookingInstructionsPlaceholder />
          </motion.div>
        )}

        {/* Add to Grocery CTA */}
        {dish.ingredients.length > 0 && (
          <motion.div variants={itemVariants} className="px-4 pb-4 flex flex-col gap-2">
            <motion.button
              onClick={() => {
                if (groceryAdded || addToGroceryMutation.isPending) return;
                addToGroceryMutation.mutate({
                  items: dish.ingredients.map((ing) => ({
                    name: ing.name,
                    quantity: ing.quantity ?? null,
                    unit: ing.unit ?? null,
                    recipeId: dish.id,
                    dishName: dish.name,
                  })),
                });
              }}
              disabled={addToGroceryMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-full text-sm font-semibold disabled:opacity-70"
              style={{
                background: groceryAdded
                  ? "var(--color-accent-light)"
                  : addToGroceryMutation.isError
                  ? "rgba(251,234,234,0.95)"
                  : addToGroceryMutation.isPending
                  ? "var(--color-accent-light)"
                  : "var(--color-accent)",
                color: groceryAdded
                  ? "var(--color-accent)"
                  : addToGroceryMutation.isError
                  ? "#A03030"
                  : addToGroceryMutation.isPending
                  ? "var(--color-accent)"
                  : "#fff",
                transition: "background 0.25s ease, color 0.25s ease",
              }}
              whileTap={{ scale: 0.97 }}
            >
              {groceryAdded ? (
                <>
                  <CheckIcon />
                  Added to Grocery
                </>
              ) : addToGroceryMutation.isError ? (
                <>
                  <GroceryBagIcon />
                  Couldn&apos;t add — tap to retry
                </>
              ) : (
                <>
                  <GroceryBagIcon />
                  Add to Grocery List
                </>
              )}
            </motion.button>
          </motion.div>
        )}

        {/* Other dishes on this menu — tappable */}
        {isMenu && otherDishes.length > 0 && (
          <motion.div variants={itemVariants} className="px-4 pb-4">
            <h2
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Other dishes on this menu
            </h2>
            <FrostedCard noPadding className="overflow-hidden">
              {allDishes.map((d, i) => {
                if (i === dishIndex) return null;
                return (
                  <motion.button
                    key={d.id ?? i}
                    onClick={() => router.replace(`/recipe/${id}?dish=${i}`)}
                    aria-label={`View ${d.name}`}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    style={{
                      borderBottom:
                        i < allDishes.length - 1
                          ? "1px solid rgba(180,170,158,0.15)"
                          : undefined,
                    }}
                    whileTap={{ backgroundColor: "rgba(180,170,158,0.1)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                        {d.name}
                      </p>
                      {d.description && d.description !== "null" && (
                        <p className="text-xs truncate mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                          {d.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {(d.totalCalories ?? d.calorieEstimate) && (
                        <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                          {d.totalCalories ?? d.calorieEstimate} cal
                        </span>
                      )}
                      <ChevronRightIcon />
                    </div>
                  </motion.button>
                );
              })}
            </FrostedCard>
          </motion.div>
        )}

      </motion.div>
    </AppShell>
  );
}

// ─── Page wrapper (Suspense for useSearchParams) ───────────

export default function RecipePage() {
  return (
    <Suspense fallback={<AppShell><div className="min-h-full" /></AppShell>}>
      <RecipePageInner />
    </Suspense>
  );
}

// ─── Loading skeleton ───────────────────────────────────────

function RecipeDetailSkeleton() {
  return (
    <div
      className="min-h-full flex flex-col animate-pulse"
      aria-busy="true"
      aria-label="Loading"
    >
      {/* Header row */}
      <div className="px-4 pt-[calc(var(--space-safe-top)+16px)] pb-3 flex items-center gap-3">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-full"
          style={{ background: "rgba(180,170,158,0.12)" }}
          aria-hidden="true"
        />
        <div
          className="flex-1 h-4 rounded"
          style={{ background: "rgba(180,170,158,0.10)", maxWidth: 160 }}
          aria-hidden="true"
        />
      </div>

      {/* Dish name */}
      <div className="px-4 pb-4 flex flex-col gap-2">
        <div style={{ height: 38, width: "80%", background: "rgba(180,170,158,0.10)", borderRadius: 8 }} aria-hidden="true" />
        <div style={{ height: 16, width: "55%", background: "rgba(180,170,158,0.07)", borderRadius: 6 }} aria-hidden="true" />
      </div>

      {/* Stats pill */}
      <div className="px-4 pb-4">
        <div style={{ height: 34, width: 100, background: "rgba(180,170,158,0.10)", borderRadius: 999 }} aria-hidden="true" />
      </div>

      {/* Macros card */}
      <div className="px-4 pb-4">
        <div style={{ height: 60, background: "rgba(180,170,158,0.08)", borderRadius: 12 }} aria-hidden="true" />
      </div>

      {/* Ingredients list */}
      <div className="px-4 pb-4 flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{ height: 44, background: "rgba(180,170,158,0.07)", borderRadius: 8 }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function CookingInstructionsPlaceholder() {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1.5px dashed var(--color-card-border)",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "24px 16px",
        minHeight: 96,
      }}
      role="region"
      aria-labelledby="cooking-instructions-heading"
    >
      <p
        style={{
          fontSize: 13,
          color: "var(--color-text-disabled, var(--color-text-tertiary))",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: 220,
        }}
      >
        Cooking instructions coming soon
      </p>
    </div>
  )
}

function MacroStat({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2">
      <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
        {value !== null && value !== undefined ? `${value}${unit}` : "—"}
      </span>
      <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
        {label}
      </span>
    </div>
  );
}

function SpinnerDot() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: "spin 1s linear infinite" }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeDasharray="14 42" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

/* ─── Icons ─── */

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="var(--color-text-secondary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke="var(--color-text-secondary)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke="var(--color-text-secondary)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 18l6-6-6-6" stroke="var(--color-text-tertiary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GroceryBagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 7h12l-1.5 11H7.5L6 7Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2c0 0-4 4-4 9a5 5 0 0 0 10 0c0-3-2-5-2-5s-1 2-3 2c-1 0-2-1-2-2 0-1 1-4 1-4Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

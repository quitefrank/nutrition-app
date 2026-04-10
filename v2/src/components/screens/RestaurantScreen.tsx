"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { FrostedCard } from "@/components/ui/FrostedCard";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useRecipesByRestaurant } from "@/hooks/useRecipes";
import { autoSaveToSupabase } from "@/lib/supabaseAutoSave";
import { supabase } from "@/lib/supabase";
import type { DomainRestaurant, DomainRecipe } from "@/types/database";

// ─── Types ─────────────────────────────────────────────────

interface Dish {
  id?: string;
  name: string;
  description?: string;
  photoUrl?: string | null;
  calorieEstimate?: number | null;
}

interface SavedRecipe {
  /** Navigation key — either a Supabase UUID (for Supabase recipes) or a session scan key */
  scanKey: string;
  dishIndex: number;
  dish: Dish;
  restaurantName: string | null;
  restaurantAddress?: string | null;
  savedAt: number;
  isSupabase: boolean;
}

interface RestaurantScreenProps {
  placeId: string;
}

// ─── Animation variants ─────────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────

/**
 * Scan sessionStorage for all scan keys that contain dishes
 * associated with the given placeId.
 */
function loadRecipesForRestaurant(placeId: string): SavedRecipe[] {
  const recipes: SavedRecipe[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;

      let parsed: {
        type?: string;
        restaurantName?: string | null;
        restaurantAddress?: string | null;
        restaurantPlaceId?: string | null;
        allDishes?: Dish[];
      };
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }

      if (!parsed?.allDishes) continue;
      if (parsed.restaurantPlaceId !== placeId) continue;

      parsed.allDishes.forEach((dish, dishIndex) => {
        recipes.push({
          scanKey: key,
          dishIndex,
          dish,
          restaurantName: parsed.restaurantName ?? null,
          restaurantAddress: parsed.restaurantAddress ?? null,
          savedAt: Date.now(),
          isSupabase: false,
        });
      });
    }
  } catch {
    // sessionStorage unavailable
  }
  return recipes;
}

/**
 * Convert a Supabase DomainRecipe to the SavedRecipe shape used by the
 * render layer. Uses the recipe's UUID as the navigation key so that
 * /recipe/[uuid] loads it from Supabase.
 */
function domainRecipeToSaved(
  recipe: DomainRecipe,
  restaurant: DomainRestaurant | null
): SavedRecipe {
  return {
    scanKey: recipe.id,
    dishIndex: 0,
    dish: {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description ?? undefined,
      photoUrl: recipe.dishImageUrl,
      calorieEstimate: recipe.estimatedCalories,
    },
    restaurantName: restaurant?.name ?? null,
    restaurantAddress: restaurant?.address ?? null,
    savedAt: new Date(recipe.createdAt).getTime(),
    isSupabase: true,
  };
}

// ─── RestaurantScreen ──────────────────────────────────────

export function RestaurantScreen({ placeId }: RestaurantScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [sessionRecipes, setSessionRecipes] = useState<SavedRecipe[]>([]);
  const [loaded, setLoaded] = useState(false);

  // ── Auto-scan state ─────────────────────────────────────────
  const [autoScanStep, setAutoScanStep] = useState<'idle' | 'looking' | 'scanning' | 'finishing' | 'done' | 'error'>('idle');
  const [autoScanError, setAutoScanError] = useState<string | null>(null);
  const [fallbackDishPhotos, setFallbackDishPhotos] = useState<Array<{ name: string; url: string }>>([]);

  // ── Scanning a single fallback dish photo ───────────────────
  const [scanningPhotoUrl, setScanningPhotoUrl] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // ── Visit tracking ──────────────────────────────────────────
  // Guards against creating more than one visit record per page load.
  const visitCreatedRef = useRef(false);

  // ── SessionStorage ─────────────────────────────────────────
  useEffect(() => {
    setSessionRecipes(loadRecipesForRestaurant(placeId));
    setLoaded(true);
  }, [placeId]);

  // ── Supabase ───────────────────────────────────────────────
  // Look up the Supabase restaurant entity by its Google placeId.
  // useRestaurants() returns all restaurants; we find the matching one.
  const { data: allRestaurants, isPending: restaurantsPending } = useRestaurants();

  const supabaseRestaurant: DomainRestaurant | null =
    allRestaurants?.find((r) => r.placeId === placeId) ?? null;

  const { data: supabaseRecipeRows, isPending: recipesPending } = useRecipesByRestaurant(
    supabaseRestaurant?.id ?? null
  );

  // Map Supabase recipes to unified SavedRecipe shape
  const supabaseRecipes: SavedRecipe[] = (supabaseRecipeRows ?? []).map((r) =>
    domainRecipeToSaved(r, supabaseRestaurant)
  );

  // ── Merge strategy ─────────────────────────────────────────
  // Prefer Supabase recipes when available — they have persisted data.
  // Supplement with session items whose dish names don't already appear
  // in the Supabase list.
  const supabaseNames = new Set(
    supabaseRecipes.map((r) => r.dish.name.toLowerCase().trim())
  );

  const sessionOnlyRecipes = sessionRecipes.filter(
    (r) => !supabaseNames.has(r.dish.name.toLowerCase().trim())
  );

  const recipes: SavedRecipe[] =
    supabaseRecipes.length > 0
      ? [...supabaseRecipes, ...sessionOnlyRecipes]
      : sessionRecipes;

  // True while we're waiting for Supabase to confirm whether recipes exist.
  // Prevents flashing the empty/idle state before the auto-scan fires.
  const isInitializing =
    !loaded ||
    restaurantsPending ||
    (!!supabaseRestaurant && recipesPending);

  // ── Auto-scan on first visit ───────────────────────────────
  // Fires once Supabase confirms there are no persisted recipes for this
  // restaurant, so the user never has to press a button on a fresh page.
  useEffect(() => {
    if (!loaded) return;
    if (restaurantsPending) return;
    // If restaurant exists in DB, wait for its recipes to resolve too
    if (supabaseRestaurant && recipesPending) return;
    if (sessionRecipes.length > 0 || supabaseRecipes.length > 0) return;
    if (autoScanStep !== 'idle') return;

    void handleAutoScan();
  // handleAutoScan is stable (useCallback); include all reactive values
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, restaurantsPending, recipesPending, supabaseRestaurant,
      sessionRecipes.length, supabaseRecipes.length, autoScanStep]);

  // ── Create a search visit record (fire-and-forget) ────────
  // SEC-INJ-1.00: values passed via parameterised Supabase client calls.
  const createSearchVisit = useCallback(
    async (restaurantId: string) => {
      if (visitCreatedRef.current) return;
      visitCreatedRef.current = true;
      try {
        await supabase.from("restaurant_visits").insert({
          restaurant_id: restaurantId,
          visit_type: "search",
        });
      } catch (err) {
        // Non-blocking — visit record is best-effort
        console.warn(
          "[RestaurantScreen] visit insert failed (non-blocking):",
          err instanceof Error ? err.message : err
        );
      }
    },
    []
  );

  // Case A: Returning visitor — Supabase already has recipes for this
  // restaurant. Create a visit record once the restaurant ID is known.
  useEffect(() => {
    if (!supabaseRestaurant || recipesPending) return;
    if (supabaseRecipes.length === 0) return;
    void createSearchVisit(supabaseRestaurant.id);
  // createSearchVisit is stable (useCallback with no deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseRestaurant, recipesPending, supabaseRecipes.length]);

  // Case B: Auto-scan succeeded and produced dishes. We need the Supabase
  // restaurant ID at this point — it is available after autoSaveToSupabase
  // has run (which upserts the restaurant row). Wait for it via the query.
  useEffect(() => {
    if (autoScanStep !== 'done') return;
    if (!supabaseRestaurant) return;
    void createSearchVisit(supabaseRestaurant.id);
  // createSearchVisit is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScanStep, supabaseRestaurant]);

  // ── Derived display values ────────────────────────────────
  // Prefer Supabase restaurant name/address; fall back to sessionStorage data
  const restaurantName =
    supabaseRestaurant?.name ??
    recipes[0]?.restaurantName ??
    "Restaurant";

  const restaurantAddress =
    supabaseRestaurant?.address ??
    recipes[0]?.restaurantAddress ??
    null;

  const restaurantPhoto = supabaseRestaurant?.referenceImageUrl ?? null;

  // ── Trigger fully-automated menu scan ──────────────────────
  const handleAutoScan = useCallback(async () => {
    setAutoScanStep('looking');
    setAutoScanError(null);
    setFallbackDishPhotos([]);

    // Advance loading label after 3s ("scanning") and 10s ("finishing")
    const stepTimer = setTimeout(() => setAutoScanStep('scanning'), 3000);
    const stepTimer2 = setTimeout(() => setAutoScanStep('finishing'), 10000);

    try {
      const res = await fetch('/api/restaurants/auto-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId,
          restaurantName: restaurantName !== 'Restaurant' ? restaurantName : undefined,
        }),
      });

      clearTimeout(stepTimer);
      clearTimeout(stepTimer2);

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { code?: string; error?: string };
        const code = err.code ?? '';
        const message =
          code === 'NO_PHOTOS'
            ? 'No photos found for this restaurant.'
            : code === 'NO_MENU_FOUND'
            ? "Couldn't find a menu in this restaurant's photos."
            : 'Something went wrong. Please try again.';
        setAutoScanError(message);
        setAutoScanStep('error');
        return;
      }

      const json = await res.json() as {
        data: {
          restaurantName: string | null;
          dishes: Array<{
            id?: string;
            name: string;
            description?: string;
            calorieEstimate?: number | null;
            confidence?: number;
            photoUrl?: string | null;
            ingredients?: unknown[];
          }>;
          menuPhotoUrl: string | null;
          dishPhotos: Array<{ name: string; url: string }>;
        };
      };

      // Fallback: no menu found but dish photos indexed
      if (json.data.dishes.length === 0 && json.data.dishPhotos.length > 0) {
        setFallbackDishPhotos(json.data.dishPhotos);
        setAutoScanStep('done');
        return;
      }

      if (json.data.dishes.length === 0) {
        setAutoScanError("No dishes found in this restaurant's photos.");
        setAutoScanStep('error');
        return;
      }

      // Success — write to sessionStorage and refresh
      const scanKey = `plately_scan_${Date.now()}`;
      sessionStorage.setItem(
        scanKey,
        JSON.stringify({
          type: 'menu',
          restaurantName: json.data.restaurantName ?? restaurantName,
          restaurantPlaceId: placeId,
          allDishes: json.data.dishes,
          enriched: false,
        })
      );

      setSessionRecipes(loadRecipesForRestaurant(placeId));
      setAutoScanStep('done');
      autoSaveToSupabase(scanKey).then(() => {
        void queryClient.invalidateQueries({ queryKey: ['recipes', 'restaurant'] });
        void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      });
    } catch {
      clearTimeout(stepTimer);
      clearTimeout(stepTimer2);
      setAutoScanError('Something went wrong. Please try again.');
      setAutoScanStep('error');
    }
  }, [placeId, restaurantName]);

  // ── Scan a single dish photo from the fallback grid ────────
  const handleScanPhoto = useCallback(
    async (photoUrl: string) => {
      setScanningPhotoUrl(photoUrl);
      setScanError(null);
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoUrl,
            restaurantPlaceId: placeId,
            restaurantName: restaurantName !== 'Restaurant' ? restaurantName : undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          setScanError(err.error ?? 'Scan failed. Try another photo.');
          return;
        }

        const json = await res.json() as {
          data: {
            type: string;
            restaurantName: string | null;
            dishes: Array<{
              id?: string;
              name: string;
              description?: string;
              calorieEstimate?: number | null;
              confidence?: number;
              ingredients?: unknown[];
            }>;
          };
        };

        const scanKey = `plately_scan_${Date.now()}`;
        sessionStorage.setItem(
          scanKey,
          JSON.stringify({
            type: json.data.type,
            restaurantName: json.data.restaurantName ?? restaurantName,
            restaurantPlaceId: placeId,
            allDishes: json.data.dishes,
            enriched: false,
          })
        );

        setSessionRecipes(loadRecipesForRestaurant(placeId));
        autoSaveToSupabase(scanKey).then(() => {
          void queryClient.invalidateQueries({ queryKey: ['recipes', 'restaurant'] });
          void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
        });
      } catch {
        setScanError('Something went wrong. Try another photo.');
      } finally {
        setScanningPhotoUrl(null);
      }
    },
    [placeId, restaurantName]
  );

  return (
    <motion.div
      className="min-h-full flex flex-col"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <div className="px-4 pt-[calc(var(--space-safe-top)+16px)] pb-3 flex items-center gap-3">
        <motion.button
          variants={itemVariants}
          onClick={() => router.back()}
          aria-label="Back"
          className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0"
          style={{ background: "rgba(180,170,158,0.18)" }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronLeftIcon />
        </motion.button>

        <motion.div variants={itemVariants} className="flex items-center gap-3 flex-1 min-w-0">
          {/* Reference image thumbnail — shown when Supabase has a photo */}
          {restaurantPhoto && (
            <div
              className="flex-shrink-0 rounded-[var(--radius-sm)] overflow-hidden"
              style={{ width: 38, height: 38 }}
              aria-hidden="true"
            >
              <img
                src={restaurantPhoto}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1
              className="text-xl leading-tight tracking-[-0.01em] truncate"
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                color: "var(--color-text-primary)",
              }}
            >
              {restaurantName}
            </h1>
            {restaurantAddress && (
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-tertiary)" }}>
                {restaurantAddress}
              </p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Recipe count */}
      {loaded && (
        <motion.p
          variants={itemVariants}
          className="px-4 pb-3 text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {recipes.length} saved {recipes.length === 1 ? "recipe" : "recipes"}
        </motion.p>
      )}

      {/* Empty state */}
      {recipes.length === 0 && (
        <motion.div variants={itemVariants} className="flex flex-col flex-1 pb-24">
          {/* Skeleton while Supabase resolves (before auto-scan fires) */}
          {isInitializing && autoScanStep === 'idle' && (
            <div className="px-4 animate-pulse" aria-busy="true" aria-label="Loading">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-[var(--radius-md)]" aria-hidden="true">
                    <div style={{ height: 100, background: "rgba(180,170,158,0.10)" }} />
                    <div style={{ height: 60, background: "rgba(180,170,158,0.07)" }} className="p-3 flex flex-col gap-2">
                      <div style={{ height: 12, width: "75%", background: "rgba(180,170,158,0.12)", borderRadius: 6 }} />
                      <div style={{ height: 10, width: "40%", background: "rgba(180,170,158,0.08)", borderRadius: 6 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Initializing (waiting for Supabase) or actively scanning */}
          {!isInitializing && (autoScanStep === 'looking' || autoScanStep === 'scanning' || autoScanStep === 'finishing') && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <SpinnerIcon size={32} />
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {autoScanStep === 'finishing'
                  ? 'Almost there…'
                  : autoScanStep === 'scanning'
                  ? 'Scanning menu…'
                  : 'Looking for menu photos…'}
              </p>
            </div>
          )}

          {/* Error — retry button */}
          {!isInitializing && autoScanStep === 'error' && (
            <div className="flex flex-col items-center justify-center flex-1 px-8 gap-4 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "var(--color-accent-light)" }}
                aria-hidden="true"
              >
                <PlateIcon />
              </div>

              <AnimatePresence>
                {autoScanError && (
                  <motion.p
                    key="error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-sm px-3 py-2 rounded-lg"
                    style={{
                      background: "rgba(200,60,60,0.08)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {autoScanError}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                onClick={() => void handleAutoScan()}
                className="flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium"
                style={{
                  background: "var(--color-accent)",
                  color: "#fff",
                }}
              >
                <CameraIcon />
                Try again
              </button>
            </div>
          )}

          {/* Fallback: no menu found, show dish photos grid */}
          {autoScanStep === 'done' && fallbackDishPhotos.length > 0 && (
            <div className="px-4">
              <p className="text-xs mb-3" style={{ color: "var(--color-text-tertiary)" }}>
                No menu found in photos. Here are dishes we found:
              </p>

              <AnimatePresence>
                {scanError && (
                  <motion.p
                    key="scan-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs mb-3 px-3 py-2 rounded-lg"
                    style={{
                      background: "rgba(200,60,60,0.1)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {scanError}
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.div
                variants={containerVariants}
                className="grid grid-cols-2 gap-3"
              >
                {fallbackDishPhotos.map((photo, idx) => (
                  <motion.button
                    key={`${idx}-${photo.url}`}
                    variants={itemVariants}
                    onClick={() => {
                      if (!scanningPhotoUrl) void handleScanPhoto(photo.url);
                    }}
                    disabled={scanningPhotoUrl !== null}
                    className="text-left overflow-hidden rounded-[var(--radius-md)] relative"
                    style={{ background: "var(--color-surface)" }}
                    aria-label={`Scan ${photo.name}`}
                  >
                    <div className="relative" style={{ height: 100 }}>
                      <img
                        src={photo.url}
                        alt={photo.name}
                        className="w-full h-full object-cover"
                        style={{
                          opacity: scanningPhotoUrl && scanningPhotoUrl !== photo.url ? 0.4 : 1,
                          transition: "opacity 0.2s",
                        }}
                      />
                      {scanningPhotoUrl === photo.url && (
                        <div
                          className="absolute inset-0 flex items-center justify-center"
                          style={{ background: "rgba(0,0,0,0.35)" }}
                        >
                          <SpinnerIcon size={24} color="#fff" />
                        </div>
                      )}
                    </div>
                    <p
                      className="px-3 py-2 text-xs font-medium leading-snug"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {photo.name}
                    </p>
                  </motion.button>
                ))}
              </motion.div>
            </div>
          )}
        </motion.div>
      )}

      {recipes.length > 0 && (
        <motion.div
          variants={containerVariants}
          className="px-4 pb-4 grid grid-cols-2 gap-3"
        >
          {recipes.map((recipe, i) => (
            <motion.div key={`${recipe.scanKey}-${recipe.dishIndex}-${i}`} variants={itemVariants}>
              <RecipeCard
                recipe={recipe}
                onTap={() =>
                  router.push(`/recipe/${recipe.scanKey}?dish=${recipe.dishIndex}`)
                }
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Bottom padding for tab bar */}
      <div
        style={{
          height:
            "calc(var(--tab-bar-height) + var(--space-safe-bottom) + 24px)",
        }}
      />
    </motion.div>
  );
}

// ─── RecipeCard ─────────────────────────────────────────────

function RecipeCard({
  recipe,
  onTap,
}: {
  recipe: SavedRecipe;
  onTap: () => void;
}) {
  const { dish } = recipe;

  return (
    <FrostedCard
      noPadding
      className="overflow-hidden cursor-pointer"
      onClick={onTap}
      role="button"
      tabIndex={0}
      aria-label={`View ${dish.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap();
        }
      }}
    >
      {/* Photo */}
      {dish.photoUrl ? (
        <img
          src={dish.photoUrl}
          alt={dish.name}
          className="w-full object-cover"
          style={{ height: 100 }}
        />
      ) : (
        <div
          className="w-full flex items-center justify-center"
          style={{
            height: 100,
            background: "var(--color-surface)",
          }}
          aria-hidden="true"
        >
          <PlateIcon dim />
        </div>
      )}

      {/* Info */}
      <div className="p-3">
        <p
          className="text-sm font-medium leading-snug line-clamp-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          {dish.name}
        </p>
        {dish.calorieEstimate && (
          <p className="text-xs mt-1" style={{ color: "var(--color-text-tertiary)" }}>
            {dish.calorieEstimate} cal
          </p>
        )}
      </div>
    </FrostedCard>
  );
}

// ─── Icons ─────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 18l-6-6 6-6"
        stroke="var(--color-text-secondary)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon({ size = 24, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="animate-spin"
      style={{ color }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function PlateIcon({ dim }: { dim?: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ opacity: dim ? 0.25 : 0.6 }}
    >
      <circle cx="12" cy="12" r="9" stroke="var(--color-accent)" strokeWidth="1.5" />
      <path
        d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

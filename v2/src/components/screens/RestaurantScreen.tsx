"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { FrostedCard } from "@/components/ui/FrostedCard";
import { DishRowCompact } from "@/components/scan/DishRowCompact";
import { DishRowExpanded } from "@/components/scan/DishRowExpanded";
import { ScanConfidenceBanner } from "@/components/scan/ScanConfidenceBanner";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useRecipesByRestaurant, useRemoveRecipe, useRecipe, useUpdateRecipe } from "@/hooks/useRecipes";
import { autoSaveToSupabase } from "@/lib/supabaseAutoSave";
import { supabase } from "@/lib/supabase";
import { useEnrichment } from "@/hooks/useEnrichment";
import { SPRING_CARD_EXPAND } from "@/lib/springs";
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
 * Return the raw Gemini dish count (totalDetected) from the most recent
 * camera-scan session entry for this restaurant. Returns 0 when the restaurant
 * was reached via the search path (no camera scan) — the natural guard for
 * suppressing ScanConfidenceBanner on search-path visits (Story 2-7).
 */
function loadTotalDetected(placeId: string): number {
  try {
    let bestTotal = 0;
    let bestAt = -1;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith('plately_scan_')) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      let parsed: { restaurantPlaceId?: string | null; totalDetected?: number; scannedAt?: number };
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (parsed.restaurantPlaceId !== placeId) continue;
      if (typeof parsed.totalDetected !== 'number') continue;
      const at = parsed.scannedAt ?? 0;
      if (at > bestAt) { bestAt = at; bestTotal = parsed.totalDetected; }
    }
    return bestTotal;
  } catch {
    // sessionStorage unavailable
  }
  return 0;
}

/**
 * Return the menu photo URL (the Google Places photo Gemini read during
 * auto-scan) stored in the most recent session scan for this restaurant.
 */
function loadMenuPhotoUrl(placeId: string): string | null {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      let parsed: { restaurantPlaceId?: string | null; menuPhotoUrl?: string | null };
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (parsed.restaurantPlaceId !== placeId) continue;
      if (parsed.menuPhotoUrl) return parsed.menuPhotoUrl;
    }
  } catch {
    // sessionStorage unavailable
  }
  return null;
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
  const searchParams = useSearchParams();
  const nameFromUrl = searchParams.get("name") ?? null;
  const queryClient = useQueryClient();
  const { enrich } = useEnrichment();
  const removeRecipe = useRemoveRecipe();
  const updateRecipe = useUpdateRecipe();
  const reducedMotion = useReducedMotion();
  const [sessionRecipes, setSessionRecipes] = useState<SavedRecipe[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmRecipe, setConfirmRecipe] = useState<SavedRecipe | null>(null);
  const [menuPhotoUrl, setMenuPhotoUrl] = useState<string | null>(null);
  // totalDetected: raw Gemini dish count from camera-scan session (0 = search path)
  const [totalDetected, setTotalDetected] = useState(0);
  const [menuPhotoOpen, setMenuPhotoOpen] = useState(false);

  // ── Accordion state (Story 2-5) ────────────────────────────
  // Single expanded dish ID — null means all rows are collapsed.
  const [expandedDishId, setExpandedDishId] = useState<string | null>(null);

  // ── Auto-scan state ─────────────────────────────────────────
  const [autoScanStep, setAutoScanStep] = useState<'idle' | 'looking' | 'scanning' | 'finishing' | 'done' | 'error'>('idle');
  const [autoScanError, setAutoScanError] = useState<string | null>(null);
  const [fallbackDishPhotos, setFallbackDishPhotos] = useState<Array<{ name: string; url: string }>>([]);

  // ── Visit tracking ──────────────────────────────────────────
  // Guards against creating more than one visit record per page load.
  const visitCreatedRef = useRef(false);
  // Guards against scanning fallback photos more than once per page load.
  const fallbackScannedRef = useRef(false);
  // Guards against running the photo backfill more than once per page load.
  const photoBackfillRef = useRef(false);

  // ── SessionStorage ─────────────────────────────────────────
  useEffect(() => {
    setSessionRecipes(loadRecipesForRestaurant(placeId));
    setMenuPhotoUrl(loadMenuPhotoUrl(placeId));
    setTotalDetected(loadTotalDetected(placeId));
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

  // Lazy-load ingredients for the expanded dish (Story 2-5)
  const { data: expandedRecipe, isError: expandedRecipeError } = useRecipe(expandedDishId);

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

  // When merging Supabase and session recipes, prefer the session photo URL
  // when the Supabase row has dish_image_url: null (write-back may not have
  // completed yet). This prevents photos from disappearing on same-session revisits.
  const recipes: SavedRecipe[] =
    supabaseRecipes.length > 0
      ? [
          ...supabaseRecipes.map((sr) => {
            if (sr.dish.photoUrl) return sr;
            const sessionMatch = sessionRecipes.find(
              (s) => s.dish.name.toLowerCase().trim() === sr.dish.name.toLowerCase().trim()
            );
            if (!sessionMatch?.dish.photoUrl) return sr;
            return { ...sr, dish: { ...sr.dish, photoUrl: sessionMatch.dish.photoUrl } };
          }),
          ...sessionOnlyRecipes,
        ]
      : sessionRecipes;

  // ── Photo backfill ─────────────────────────────────────────
  // When any Supabase recipe is missing a photo, fire a one-shot enrichment
  // call for the missing subset to hydrate dish_image_url. We only skip if
  // ALL recipes already have photos — one photo present should not block the
  // others from being backfilled.
  useEffect(() => {
    if (recipesPending) return;
    if (supabaseRecipes.length === 0) return;
    if (supabaseRecipes.every((r) => r.dish.photoUrl)) return; // all photos present
    if (photoBackfillRef.current) return;
    photoBackfillRef.current = true;

    // Only backfill the recipes that are actually missing a photo
    const recipesNeedingPhotos = supabaseRecipes.filter((r) => !r.dish.photoUrl);
    if (recipesNeedingPhotos.length === 0) return;

    // Snapshot stable values at effect time
    const currentRestaurantName = restaurantName;
    const dishToRecipeMap: Record<string, string> = {};
    const dishes = recipesNeedingPhotos.map((r) => {
      const tempId = crypto.randomUUID();
      dishToRecipeMap[tempId] = r.scanKey; // scanKey IS the Supabase UUID for isSupabase recipes
      return { id: tempId, name: r.dish.name, description: r.dish.description };
    });

    void (async () => {
      try {
        const res = await fetch("/api/scan/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dishes, restaurantName: currentRestaurantName, dishToRecipeMap }),
        });
        if (!res.ok) return;
        const json = await res.json() as {
          data?: { dishes: Array<{ id?: string; photoUrl: string | null }> };
        };
        const enrichedDishes = json.data?.dishes ?? [];

        // Write photos to Supabase now that we have them, then refresh the grid
        const writes = enrichedDishes
          .filter((d) => d.id && d.photoUrl && dishToRecipeMap[d.id])
          .map((d) =>
            supabase
              .from("recipes")
              .update({ dish_image_url: d.photoUrl })
              .eq("id", dishToRecipeMap[d.id!])
          );

        if (writes.length > 0) {
          await Promise.allSettled(writes);
          void queryClient.invalidateQueries({ queryKey: ["recipes", "restaurant"] });
          void queryClient.invalidateQueries({ queryKey: ["recipes", "kept"] });
          void queryClient.invalidateQueries({ queryKey: ["recipes"] });
        }
      } catch {
        // Non-blocking — photo backfill is best-effort
      }
    })();
  // restaurantName and supabaseRecipes identity change on each render — use lengths/flags as deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipesPending, supabaseRecipes.length]);

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
    nameFromUrl ??
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
      const dishCount = json.data.dishes.length;
      const now = Date.now();
      const scanKey = `plately_scan_${now}`;
      sessionStorage.setItem(
        scanKey,
        JSON.stringify({
          type: 'menu',
          restaurantName: json.data.restaurantName ?? restaurantName,
          restaurantPlaceId: placeId,
          menuPhotoUrl: json.data.menuPhotoUrl ?? null,
          allDishes: json.data.dishes,
          enriched: false,
          totalDetected: dishCount,
          scannedAt: now,
        })
      );

      setSessionRecipes(loadRecipesForRestaurant(placeId));
      setMenuPhotoUrl(loadMenuPhotoUrl(placeId));
      setTotalDetected(dishCount);
      setAutoScanStep('done');
      autoSaveToSupabase(scanKey).then((dishToRecipeMap) => {
        void queryClient.invalidateQueries({ queryKey: ['recipes', 'restaurant'] });
        void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
        enrich(scanKey, dishToRecipeMap);
      });
    } catch {
      clearTimeout(stepTimer);
      clearTimeout(stepTimer2);
      setAutoScanError('Something went wrong. Please try again.');
      setAutoScanStep('error');
    }
  }, [placeId, restaurantName]);

  // ── Scan a single dish photo (auto-triggered, not user-driven) ──
  const handleScanPhoto = useCallback(
    async (photoUrl: string) => {
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

        if (!res.ok) return;

        const json = await res.json() as {
          data: {
            type: string;
            restaurantName: string | null;
            totalDetected?: number;
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

        if (json.data.dishes.length === 0) return;

        const scanPhotoTotal = json.data.totalDetected ?? json.data.dishes.length;
        const scanPhotoNow = Date.now();
        const scanKey = `plately_scan_${scanPhotoNow}_${Math.random().toString(36).slice(2, 7)}`;
        sessionStorage.setItem(
          scanKey,
          JSON.stringify({
            type: json.data.type,
            restaurantName: json.data.restaurantName ?? restaurantName,
            restaurantPlaceId: placeId,
            allDishes: json.data.dishes.map((d, i) => ({
              ...d,
              photoUrl: i === 0 ? photoUrl : null,
            })),
            enriched: false,
            totalDetected: scanPhotoTotal,
            scannedAt: scanPhotoNow,
          })
        );

        setSessionRecipes(loadRecipesForRestaurant(placeId));
        setTotalDetected(scanPhotoTotal);
        autoSaveToSupabase(scanKey).then((dishToRecipeMap) => {
          void queryClient.invalidateQueries({ queryKey: ['recipes', 'restaurant'] });
          void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
          enrich(scanKey, dishToRecipeMap);
        });
      } catch {
        // Non-blocking — best-effort dish photo scan
      }
    },
    [placeId, restaurantName]
  );

  // ── Auto-scan fallback dish photos (no user interaction needed) ──
  useEffect(() => {
    if (fallbackDishPhotos.length === 0) return;
    if (fallbackScannedRef.current) return;
    fallbackScannedRef.current = true;
    const toScan = fallbackDishPhotos.slice(0, 5);
    void Promise.allSettled(toScan.map((photo) => handleScanPhoto(photo.url)));
  }, [fallbackDishPhotos, handleScanPhoto]);

  const handleConfirmDelete = () => {
    if (!confirmRecipe) return;
    if (confirmRecipe.isSupabase) {
      void removeRecipe.mutate(confirmRecipe.scanKey);
    } else {
      setSessionRecipes((prev) =>
        prev.filter(
          (r) =>
            !(r.scanKey === confirmRecipe.scanKey && r.dishIndex === confirmRecipe.dishIndex)
        )
      );
    }
    setConfirmRecipe(null);
  };

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

      {/* Empty state */}
      {recipes.length === 0 && (
        <motion.div variants={itemVariants} className="flex flex-col flex-1 pb-24">
          {/* Skeleton while Supabase resolves (before auto-scan fires) */}
          {isInitializing && autoScanStep === 'idle' && (
            <div className="px-4 animate-pulse" aria-busy="true" aria-label="Loading">
              <div className="grid gap-3 grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="relative overflow-hidden rounded-[var(--radius-md)]" aria-hidden="true">
                    <div style={{ height: 140, background: "rgba(180,170,158,0.10)" }} />
                    <div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col gap-2">
                      <div style={{ height: 12, width: "75%", background: "rgba(180,170,158,0.18)", borderRadius: 6 }} />
                      <div style={{ height: 10, width: "40%", background: "rgba(180,170,158,0.12)", borderRadius: 6 }} />
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

          {/* Fallback: no menu found — auto-scanning dish photos in background */}
          {autoScanStep === 'done' && fallbackDishPhotos.length > 0 && sessionRecipes.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <SpinnerIcon size={28} />
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                Scanning dish photos…
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Menu photo thumbnail — shown whenever any recipes exist */}
      {recipes.length > 0 && menuPhotoUrl && (
        <motion.div className="px-4 pb-2" variants={itemVariants}>
          <button
            aria-label="View full menu photo"
            onClick={() => setMenuPhotoOpen(true)}
            className="w-full rounded-[20px] overflow-hidden relative"
            style={{
              border: "1px solid rgba(180,170,158,0.28)",
              boxShadow: "0 2px 12px rgba(80,60,40,0.08), 0 1px 3px rgba(80,60,40,0.06)",
            }}
          >
            {/* Blurred menu photo hint */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={menuPhotoUrl}
              alt=""
              className="w-full object-cover"
              style={{ height: 96, filter: "blur(2px) brightness(0.72)", transform: "scale(1.05)" }}
            />
            {/* Label overlay */}
            <div
              className="absolute inset-0 flex items-center justify-between px-4"
              style={{ background: "rgba(26,22,18,0.36)" }}
            >
              <div className="flex items-center gap-2.5">
                <ScrollTextIcon />
                <span className="text-[15px] font-semibold" style={{ color: "rgba(255,255,255,0.95)", fontFamily: "var(--font-sans)" }}>Menu</span>
              </div>
              <ChevronRightIcon />
            </div>
          </button>
        </motion.div>
      )}

      {/* Supabase-backed dish list: single-column accordion (Story 2-5) */}
      {supabaseRecipeRows && supabaseRecipeRows.length > 0 && (
        <motion.div variants={containerVariants} className="px-4 pb-4 flex flex-col gap-2">
          {supabaseRecipeRows.map((recipe) => {
            // Story 3.6: derive macroSource from denormalised macro totals on the recipe row.
            // All three non-null → enrichment ran → provenance is USDA.
            // Any null → not yet enriched → default to 'ai' (undefined omits the prop).
            const macroSource =
              recipe.totalProteinG != null &&
              recipe.totalCarbsG != null &&
              recipe.totalFatG != null
                ? ('usda' as const)
                : undefined

            return (
              <motion.div key={recipe.id} variants={itemVariants}>
                <DishRowCompact
                  recipe={recipe}
                  totalProtein={recipe.totalProteinG}
                  totalCarbs={recipe.totalCarbsG}
                  totalFat={recipe.totalFatG}
                  macroSource={macroSource}
                  isExpanded={expandedDishId === recipe.id}
                  onToggle={() =>
                    setExpandedDishId((prev) => (prev === recipe.id ? null : recipe.id))
                  }
                />
                <AnimatePresence initial={false}>
                  {expandedDishId === recipe.id && (
                    <motion.div
                      key={`expanded-${recipe.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{
                        height: "auto",
                        opacity: 1,
                        transition: reducedMotion ? { duration: 0 } : SPRING_CARD_EXPAND,
                      }}
                      exit={{
                        height: 0,
                        opacity: 0,
                        transition: reducedMotion ? { duration: 0 } : SPRING_CARD_EXPAND,
                      }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="mt-1.5">
                        <DishRowExpanded
                          recipe={recipe}
                          expandedRecipe={
                            expandedRecipe?.id === recipe.id ? expandedRecipe : null
                          }
                          ingredientsError={expandedRecipeError}
                          totalProtein={recipe.totalProteinG}
                          totalCarbs={recipe.totalCarbsG}
                          totalFat={recipe.totalFatG}
                          totalFibre={recipe.totalFibreG}
                          onCollapse={() => setExpandedDishId(null)}
                          onAddToRecipes={(onError) => {
                            updateRecipe.mutate(
                              { id: recipe.id, updates: { status: 'kept' } },
                              { onError }
                            )
                          }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Session-only recipes (not yet in Supabase): keep existing RecipeCard grid */}
      {sessionOnlyRecipes.length > 0 && (
        <motion.div
          variants={containerVariants}
          className="px-4 pb-4 grid gap-3 grid-cols-2"
        >
          {sessionOnlyRecipes.map((recipe, i) => (
            <motion.div key={`${recipe.scanKey}-${recipe.dishIndex}-${i}`} variants={itemVariants}>
              <RecipeCard
                recipe={recipe}
                onTap={() => router.push(`/recipe/${encodeURIComponent(recipe.scanKey)}?dish=${recipe.dishIndex}`)}
                onDelete={() => setConfirmRecipe(recipe)}
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

      {/* Scan confidence banner — camera-scan path only (AC2, AC3, AC5) */}
      {/* Compare total visible recipes (Supabase + session-only) so the banner
          dismisses correctly once all dishes have been persisted to Supabase. */}
      <AnimatePresence>
        {!recipesPending && totalDetected > 0 && recipes.length < totalDetected && (
          <ScanConfidenceBanner
            key="scan-confidence-banner"
            recognisedCount={recipes.length}
            totalDetected={totalDetected}
            onRetake={() => console.warn("[ScanConfidenceBanner] retake — Story 6.2")}
            onAddManually={() => console.warn("[ScanConfidenceBanner] add manually — Story 6.3")}
            onContinue={() => console.warn("[ScanConfidenceBanner] continue — Story 6.1")}
          />
        )}
      </AnimatePresence>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {confirmRecipe && (
          <motion.div
            key="confirm-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            onClick={() => setConfirmRecipe(null)}
            style={{ background: "rgba(26,22,18,0.5)" }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.93, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0, transition: { type: "spring", damping: 28, stiffness: 380 } }}
              exit={{ scale: 0.93, opacity: 0, y: 8, transition: { duration: 0.15 } }}
              className="w-full max-w-xs rounded-[24px] p-6 flex flex-col gap-5"
              style={{
                background: "rgba(255,252,247,0.96)",
                backdropFilter: "blur(32px) saturate(1.5)",
                border: "1px solid rgba(180,170,158,0.28)",
                boxShadow: "0 24px 60px rgba(26,22,18,0.20), 0 8px 24px rgba(26,22,18,0.12)",
              }}
            >
              <div className="flex flex-col gap-1.5">
                <p
                  className="text-base font-semibold"
                  style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
                >
                  Remove from collection?
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                  &ldquo;{confirmRecipe.dish.name}&rdquo; will be removed. This can&apos;t be undone.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleConfirmDelete}
                  className="w-full py-3.5 rounded-full text-sm font-semibold"
                  style={{ background: "#A03030", color: "#fff" }}
                >
                  Remove
                </button>
                <button
                  onClick={() => setConfirmRecipe(null)}
                  className="w-full py-3.5 rounded-full text-sm font-medium"
                  style={{ background: "rgba(180,170,158,0.15)", color: "var(--color-text-secondary)" }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Menu photo lightbox */}
      <AnimatePresence>
        {menuPhotoOpen && menuPhotoUrl && (
          <motion.div
            key="menu-photo-lightbox"
            className="fixed inset-0 z-50 flex flex-col"
            style={{ background: "#1A1612" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Close button */}
            <div className="absolute top-0 left-0 right-0 flex justify-end px-4 z-10"
                 style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
              <button
                onClick={() => setMenuPhotoOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(12px)" }}
                aria-label="Close menu photo"
              >
                <XIcon />
              </button>
            </div>
            {/* Full photo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={menuPhotoUrl}
              alt="Menu"
              className="w-full h-full object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── RecipeCard ─────────────────────────────────────────────

function RecipeCard({
  recipe,
  onTap,
  onDelete,
}: {
  recipe: SavedRecipe;
  onTap: () => void;
  onDelete?: () => void;
}) {
  const { dish } = recipe;

  return (
    <FrostedCard
      noPadding
      className="relative overflow-hidden cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
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
      {/* Photo + text overlay */}
      <div className="relative w-full" style={{ height: 140 }}>
        {dish.photoUrl ? (
          <img
            src={dish.photoUrl}
            alt={dish.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "var(--color-surface)" }}
            aria-hidden="true"
          >
            <PlateIcon dim />
          </div>
        )}

        {/* Gradient scrim — photo only */}
        {dish.photoUrl && (
          <div
            className="absolute inset-0"
            aria-hidden="true"
            style={{
              background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 48%, transparent 72%)",
            }}
          />
        )}

        {/* Title + calories */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p
            className="text-sm font-semibold leading-snug line-clamp-2"
            style={{ color: dish.photoUrl ? "#fff" : "var(--color-text-primary)" }}
          >
            {dish.name}
          </p>
          {dish.calorieEstimate && (
            <p
              className="text-xs mt-0.5"
              style={{ color: dish.photoUrl ? "rgba(255,255,255,0.72)" : "var(--color-text-tertiary)" }}
            >
              {dish.calorieEstimate} cal
            </p>
          )}
        </div>
      </div>

      {/* Delete button — inside the card so it isn't displaced by backdrop-filter stacking context */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Remove ${dish.name}`}
          className="absolute top-2 right-2 z-10 rounded-full flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            minWidth: "unset",
            minHeight: "unset",
            background: "rgba(255,252,247,0.90)",
            boxShadow: "0 1px 6px rgba(80,60,40,0.16)",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M1 1l8 8M9 1l-8 8" stroke="var(--color-text-secondary)" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      )}
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

function ScrollTextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 2H5a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 7v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H6z"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11 12h6M11 16h6M11 20h4" stroke="rgba(255,255,255,0.9)" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 18l6-6-6-6"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

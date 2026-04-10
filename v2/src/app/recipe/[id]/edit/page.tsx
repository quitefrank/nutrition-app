'use client';

/**
 * Recipe Edit Page — /recipe/[id]/edit?dish=<index>
 *
 * Reads the current scan result from sessionStorage (same key as the recipe
 * detail page: sessionStorage.getItem(id)). Allows editing:
 *  - Dish name
 *  - Serving size (stepper; changing it auto-scales all ingredient quantities)
 *  - Individual ingredient name, quantity, and unit
 *  - Add / remove ingredients
 *
 * On Save: writes the mutated ScanResult back to sessionStorage and navigates
 * back to /recipe/[id]?dish=<index>.
 * On Cancel: navigates back without saving.
 *
 * Serving size scaling formula:
 *   newQty = (originalQty / originalServings) * newServings
 *
 * Fractional quantities like "1/2", "3/4" are parsed correctly and re-formatted
 * as simple decimals (rounded to 2dp) after scaling. Non-numeric strings (e.g.
 * "a pinch") are left unchanged.
 */

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { AppShell } from '@/components/AppShell';
import { FrostedCard } from '@/components/ui/FrostedCard';
import { useRecipe, useUpdateRecipe, useUpdateIngredient, useAddIngredient } from '@/hooks/useRecipes';

// ─── UUID detection ───────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(value: string): boolean { return UUID_REGEX.test(value); }

// ─── Types (mirrored from recipe detail page) ─────────────────────────────────

interface Ingredient {
  /** Present when loaded from Supabase — used to persist per-ingredient updates. */
  id?: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  confidenceLevel?: 'high' | 'medium' | 'low';
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
  type: 'menu' | 'dish';
  restaurantName?: string | null;
  restaurantPlaceId?: string | null;
  restaurantAddress?: string | null;
  allDishes: Dish[];
  enriched?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a quantity string to a number.
 * Handles integers, decimals, and fraction strings ("1/2", "3 1/4", "¼" etc.)
 * Returns NaN for non-numeric strings.
 */
function parseQuantity(qty: string): number {
  const trimmed = qty.trim();

  // Simple fraction: "1/2", "3/4"
  const simpleFraction = trimmed.match(/^(\d+)\/(\d+)$/);
  if (simpleFraction) {
    return parseInt(simpleFraction[1], 10) / parseInt(simpleFraction[2], 10);
  }

  // Mixed number: "1 1/2", "2 3/4"
  const mixedFraction = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedFraction) {
    const whole = parseInt(mixedFraction[1], 10);
    const num = parseInt(mixedFraction[2], 10);
    const den = parseInt(mixedFraction[3], 10);
    return whole + num / den;
  }

  return parseFloat(trimmed);
}

/**
 * Scale a quantity string by factor.
 * Non-numeric / null quantities are returned unchanged.
 * Result is formatted as a fraction when it is a common fraction, otherwise
 * as a decimal rounded to 2 significant decimal places.
 */
function scaleQuantity(quantity: string | null | undefined, factor: number): string | null {
  if (!quantity) return quantity ?? null;
  const num = parseQuantity(quantity);
  if (isNaN(num)) return quantity; // non-numeric — leave as-is ("a pinch", "to taste")

  const scaled = num * factor;

  // Snap to common fractions (within 2 % tolerance)
  const commonFractions: Array<[number, string]> = [
    [0.125, '1/8'],
    [0.25, '1/4'],
    [0.333, '1/3'],
    [0.5, '1/2'],
    [0.667, '2/3'],
    [0.75, '3/4'],
  ];

  const frac = scaled % 1;
  const whole = Math.floor(scaled);
  if (frac > 0.01) {
    for (const [val, label] of commonFractions) {
      if (Math.abs(frac - val) < 0.02) {
        return whole > 0 ? `${whole} ${label}` : label;
      }
    }
  }

  // Integer result
  if (Number.isInteger(scaled)) return String(scaled);

  // Decimal — round to 2dp, strip trailing zeros
  return parseFloat(scaled.toFixed(2)).toString();
}

// ─── Inner page (uses useSearchParams) ───────────────────────────────────────

function EditPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const id = typeof params.id === 'string' ? params.id : params.id?.[0] ?? '';
  const dishIndex = Math.max(0, Number(searchParams.get('dish') ?? '0'));

  // UUID ids come from Supabase; non-UUID ids are sessionStorage keys
  const idIsUUID = isUUID(id);

  // Supabase hooks (only active for UUID ids)
  const { data: supabaseRecipe } = useRecipe(idIsUUID ? id : null);
  const updateRecipe = useUpdateRecipe();
  const updateIngredient = useUpdateIngredient();
  const addIngredient = useAddIngredient();

  // Raw scan result (used by both paths as a render source)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Editable fields
  const [dishName, setDishName] = useState('');
  const [servings, setServings] = useState(1);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // Track the serving size at which the current ingredient quantities were computed
  // so we can derive the correct scaling factor on each change.
  const servingsRef = useRef(1);
  const initialized = useRef(false);

  // ─── Load from sessionStorage (non-UUID ids only) ───────────────────────────

  const load = useCallback(() => {
    if (!id || idIsUUID) return; // UUID path uses Supabase
    const raw = sessionStorage.getItem(id);
    if (!raw) { setNotFound(true); return; }
    try {
      const parsed: ScanResult = JSON.parse(raw);
      setScanResult(parsed);
    } catch {
      setNotFound(true);
    }
  }, [id, idIsUUID]);

  useEffect(() => {
    load();
  }, [load]);

  // Seed editable state from sessionStorage ScanResult
  useEffect(() => {
    if (!scanResult || initialized.current) return;
    initialized.current = true;
    const dish = scanResult.allDishes[dishIndex] ?? scanResult.allDishes[0];
    if (!dish) return;

    setDishName(dish.name);
    const s = dish.servings ?? 1;
    setServings(s);
    servingsRef.current = s;
    setIngredients(dish.ingredients ? [...dish.ingredients] : []);
  }, [scanResult, dishIndex]);

  // Seed editable state from Supabase recipe (UUID ids only)
  useEffect(() => {
    if (!idIsUUID || !supabaseRecipe || initialized.current) return;
    initialized.current = true;

    const supabaseIngredients: Ingredient[] = (supabaseRecipe.ingredients ?? []).map((ing) => ({
      id: ing.id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      calories_kcal: ing.caloriesPerServing,
      protein_g: ing.proteinG,
      fat_g: ing.fatG,
      carbs_g: ing.carbsG,
      confidenceLevel: ing.confidence,
    }));

    setDishName(supabaseRecipe.name);
    setServings(1);
    servingsRef.current = 1;
    setIngredients(supabaseIngredients);
    setScanResult({
      type: 'dish',
      restaurantName: supabaseRecipe.restaurant?.name ?? null,
      restaurantPlaceId: null,
      restaurantAddress: null,
      allDishes: [{ id: supabaseRecipe.id, name: supabaseRecipe.name, ingredients: supabaseIngredients }],
      enriched: true,
    });
  }, [idIsUUID, supabaseRecipe]);

  // ─── Serving size change with auto-scaling ───────────────────────────────────

  function handleServingsChange(newServings: number) {
    if (newServings < 1) return;
    const factor = newServings / servingsRef.current;
    servingsRef.current = newServings;
    setServings(newServings);
    setIngredients((prev) =>
      prev.map((ing) => ({ ...ing, quantity: scaleQuantity(ing.quantity, factor) }))
    );
  }

  // ─── Ingredient editing ──────────────────────────────────────────────────────

  function handleIngredientField(
    index: number,
    field: 'name' | 'quantity' | 'unit',
    value: string
  ) {
    setIngredients((prev) =>
      prev.map((ing, i) =>
        i === index ? { ...ing, [field]: value || null } : ing
      )
    );
  }

  function handleAddIngredient() {
    setIngredients((prev) => [
      ...prev,
      { name: '', quantity: null, unit: null },
    ]);
  }

  function handleRemoveIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  function handleSave() {
    if (!dishName.trim() || isSaving) return;

    // ── Supabase path (UUID ids) ──────────────────────────────────────────────
    if (idIsUUID) {
      setIsSaving(true);
      updateRecipe
        .mutateAsync({ id, updates: { name: dishName.trim() } })
        .then(() => {
          // Fire-and-forget ingredient writes: update existing rows (have an id), insert new ones (no id)
          for (const ing of ingredients.filter((i) => i.name.trim())) {
            if (ing.id) {
              void updateIngredient.mutateAsync({
                id: ing.id,
                recipeId: id,
                updates: {
                  name: ing.name.trim(),
                  quantity: ing.quantity ?? undefined,
                  unit: ing.unit ?? undefined,
                },
              });
            } else {
              void addIngredient.mutateAsync({
                recipeId: id,
                ingredient: {
                  name: ing.name.trim(),
                  quantity: ing.quantity ?? null,
                  unit: ing.unit ?? null,
                },
              });
            }
          }
          router.replace(`/recipe/${id}?dish=0`);
        })
        .catch(() => setIsSaving(false));
      return;
    }

    // ── SessionStorage path (non-UUID ids) ────────────────────────────────────
    if (!scanResult) return;

    const updatedDish: Dish = {
      ...(scanResult.allDishes[dishIndex] ?? scanResult.allDishes[0]),
      name: dishName.trim(),
      servings,
      ingredients: ingredients.filter((ing) => ing.name.trim()),
    };

    const updatedDishes = scanResult.allDishes.map((d, i) =>
      i === dishIndex ? updatedDish : d
    );

    const updatedResult: ScanResult = { ...scanResult, allDishes: updatedDishes };
    sessionStorage.setItem(id, JSON.stringify(updatedResult));

    // Dispatch an update event so the recipe detail page refreshes immediately
    window.dispatchEvent(
      new CustomEvent('plately:enriched', { detail: { key: id } })
    );

    router.replace(`/recipe/${id}?dish=${dishIndex}`);
  }

  // ─── Cancel ──────────────────────────────────────────────────────────────────

  function handleCancel() {
    router.replace(`/recipe/${id}?dish=${dishIndex}`);
  }

  // ─── Loading / error states ───────────────────────────────────────────────────

  if (notFound) {
    return (
      <AppShell>
        <div className="min-h-full flex flex-col items-center justify-center gap-4 px-4">
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            Recipe not found in this session.
          </p>
          <button
            onClick={() => router.replace('/')}
            className="text-sm font-medium"
            style={{ color: 'var(--color-accent)', background: 'none', border: 'none' }}
          >
            Back to Home
          </button>
        </div>
      </AppShell>
    );
  }

  if (!scanResult) {
    return (
      <AppShell>
        <div className="min-h-full" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="scroll-content">
        {/* ── Header bar ── */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
          style={{
            paddingTop: 'calc(var(--space-safe-top) + 12px)',
            background: 'rgba(250,250,247,0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(180,170,158,0.15)',
          }}
        >
          <button
            onClick={handleCancel}
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', minHeight: 44 }}
            aria-label="Cancel editing"
          >
            Cancel
          </button>
          <h1
            className="text-base font-semibold"
            style={{ fontFamily: 'var(--font-display), Georgia, serif', color: 'var(--color-text-primary)' }}
          >
            Edit Recipe
          </h1>
          <button
            onClick={handleSave}
            disabled={!dishName.trim() || isSaving}
            className="text-sm font-semibold"
            style={{
              color: (dishName.trim() && !isSaving) ? 'var(--color-accent)' : 'var(--color-text-disabled)',
              background: 'none',
              border: 'none',
              minHeight: 44,
              cursor: (dishName.trim() && !isSaving) ? 'pointer' : 'not-allowed',
            }}
            aria-label="Save changes"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* ── Body ── */}
        <motion.div
          className="flex flex-col gap-5 px-4 pt-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          {/* Dish name */}
          <FrostedCard>
            <label
              htmlFor="dish-name"
              className="block text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Dish name
            </label>
            <input
              id="dish-name"
              type="text"
              value={dishName}
              onChange={(e) => setDishName(e.target.value)}
              placeholder="e.g. Mushroom Risotto"
              className="w-full text-base bg-transparent outline-none"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display), Georgia, serif' }}
              aria-label="Dish name"
            />
          </FrostedCard>

          {/* Serving size */}
          <FrostedCard>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Serving size
              <span className="ml-1.5 normal-case font-normal tracking-normal text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                — changing this scales all ingredient quantities
              </span>
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleServingsChange(servings - 1)}
                disabled={servings <= 1}
                aria-label="Decrease serving size"
                className="flex items-center justify-center w-10 h-10 rounded-full"
                style={{
                  background: servings <= 1 ? 'rgba(180,170,158,0.1)' : 'var(--color-accent-light)',
                  color: servings <= 1 ? 'var(--color-text-disabled)' : 'var(--color-accent)',
                  minHeight: 40,
                  minWidth: 40,
                }}
              >
                <MinusIcon />
              </button>
              <span
                className="text-2xl font-semibold tabular-nums w-8 text-center"
                style={{ fontFamily: 'var(--font-display), Georgia, serif', color: 'var(--color-text-primary)' }}
                aria-live="polite"
                aria-label={`${servings} serving${servings !== 1 ? 's' : ''}`}
              >
                {servings}
              </span>
              <button
                onClick={() => handleServingsChange(servings + 1)}
                aria-label="Increase serving size"
                className="flex items-center justify-center w-10 h-10 rounded-full"
                style={{ background: 'var(--color-accent-light)', color: 'var(--color-accent)', minHeight: 40, minWidth: 40 }}
              >
                <PlusIcon />
              </button>
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                serving{servings !== 1 ? 's' : ''}
              </span>
            </div>
          </FrostedCard>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Ingredients
              </h2>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {ingredients.length} item{ingredients.length !== 1 ? 's' : ''}
              </span>
            </div>

            <FrostedCard noPadding className="overflow-hidden">
              {ingredients.length === 0 && (
                <p
                  className="text-sm text-center py-5"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  No ingredients yet.
                </p>
              )}
              {ingredients.map((ing, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-4 py-3"
                  style={{
                    borderBottom:
                      index < ingredients.length - 1
                        ? '1px solid rgba(180,170,158,0.15)'
                        : undefined,
                  }}
                >
                  {/* Name */}
                  <input
                    type="text"
                    value={ing.name}
                    onChange={(e) => handleIngredientField(index, 'name', e.target.value)}
                    placeholder="Ingredient"
                    className="flex-1 min-w-0 text-sm bg-transparent outline-none"
                    style={{ color: 'var(--color-text-primary)' }}
                    aria-label={`Ingredient ${index + 1} name`}
                  />
                  {/* Quantity */}
                  <input
                    type="text"
                    value={ing.quantity ?? ''}
                    onChange={(e) => handleIngredientField(index, 'quantity', e.target.value)}
                    placeholder="Qty"
                    className="w-14 text-sm text-center bg-transparent outline-none"
                    style={{ color: 'var(--color-text-secondary)' }}
                    aria-label={`Ingredient ${index + 1} quantity`}
                  />
                  {/* Unit */}
                  <input
                    type="text"
                    value={ing.unit ?? ''}
                    onChange={(e) => handleIngredientField(index, 'unit', e.target.value)}
                    placeholder="Unit"
                    className="w-16 text-sm bg-transparent outline-none"
                    style={{ color: 'var(--color-text-secondary)' }}
                    aria-label={`Ingredient ${index + 1} unit`}
                  />
                  {/* Remove button */}
                  <button
                    onClick={() => handleRemoveIngredient(index)}
                    aria-label={`Remove ${ing.name || 'ingredient'}`}
                    className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full"
                    style={{ color: 'var(--color-text-tertiary)', background: 'none', minHeight: 32, minWidth: 32 }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </FrostedCard>

            {/* Add ingredient row */}
            <button
              onClick={handleAddIngredient}
              className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-[var(--radius-lg)] text-sm font-medium"
              style={{
                color: 'var(--color-accent)',
                border: '1.5px dashed rgba(196,98,45,0.35)',
                background: 'var(--color-accent-light)',
                minHeight: 44,
              }}
              aria-label="Add ingredient"
            >
              <PlusIcon />
              Add ingredient
            </button>
          </div>

          {/* Bottom spacer */}
          <div style={{ height: 'calc(var(--tab-bar-height) + var(--space-safe-bottom) + 24px)' }} />
        </motion.div>
      </div>
    </AppShell>
  );
}

// ─── Page wrapper (Suspense for useSearchParams) ──────────────────────────────

export default function RecipeEditPage() {
  return (
    <Suspense fallback={<AppShell><div className="min-h-full" /></AppShell>}>
      <EditPageInner />
    </Suspense>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

/**
 * Plately v2 — Database Types + Zod Schemas
 *
 * Schema overview:
 *   restaurants         — Google Places-enriched restaurant entities (deduped by place_id)
 *   restaurant_visits   — Each scan/search creates a visit record (v2: auto-save model)
 *   recipes             — Auto-captured dishes (status: auto_captured | kept | removed)
 *   recipe_ingredients  — Ingredients with USDA-sourced macro data
 *   grocery_items       — Aggregated shopping list entries
 *
 * Each table has three layers:
 *   1. Row interface  — mirrors the DB column shape exactly (snake_case)
 *   2. Zod schema     — runtime validation at every API boundary
 *   3. Inferred type  — TypeScript type derived from the Zod schema
 */

import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────────────────

/** Accepts ISO 8601 strings (what Supabase returns) */
const IsoDateString = z.string().datetime({ offset: true });

/** UUID v4 pattern */
const Uuid = z.string().uuid();

// ─── Recipe status enum ───────────────────────────────────────────────────────

export const RecipeStatusEnum = z.enum(["auto_captured", "kept", "removed"]);
export type RecipeStatus = z.infer<typeof RecipeStatusEnum>;

// ─── Photo status enum ────────────────────────────────────────────────────────

export const PhotoStatusEnum = z.enum(["confirmed", "placeholder", "suppressed"]);
export type PhotoStatus = z.infer<typeof PhotoStatusEnum>;

// ─── Ingredient confidence enum ───────────────────────────────────────────────

export const ConfidenceEnum = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceEnum>;

// ─── Restaurants ──────────────────────────────────────────────────────────────

export const RestaurantRowSchema = z.object({
  id: Uuid,
  place_id: z.string().nullable(),
  name: z.string(),
  address: z.string().nullable(),
  cuisine_type: z.string().nullable(),
  reference_image_url: z.string().url().nullable(),
  atmospheric_palette_json: z.string().nullable(),
  rating: z.number().nullable().optional(),
  user_ratings_total: z.number().int().nullable().optional(),
  created_at: IsoDateString,
});

export type Restaurant = z.infer<typeof RestaurantRowSchema>;

export const RestaurantInsertSchema = RestaurantRowSchema.omit({
  id: true,
  created_at: true,
}).partial({
  place_id: true,
  address: true,
  cuisine_type: true,
  reference_image_url: true,
  atmospheric_palette_json: true,
  rating: true,
  user_ratings_total: true,
});

export type RestaurantInsert = z.infer<typeof RestaurantInsertSchema>;

// ─── Restaurant Visits ────────────────────────────────────────────────────────

export const VisitTypeEnum = z.enum(["scan", "search"]);
export type VisitType = z.infer<typeof VisitTypeEnum>;

export const RestaurantVisitRowSchema = z.object({
  id: Uuid,
  restaurant_id: Uuid,
  visit_type: VisitTypeEnum,
  raw_menu_json: z.string().nullable(),
  visited_at: IsoDateString,
});

export type RestaurantVisit = z.infer<typeof RestaurantVisitRowSchema>;

export const RestaurantVisitInsertSchema = RestaurantVisitRowSchema.omit({
  id: true,
  visited_at: true,
}).partial({
  raw_menu_json: true,
});

export type RestaurantVisitInsert = z.infer<typeof RestaurantVisitInsertSchema>;

// ─── Recipes ──────────────────────────────────────────────────────────────────

export const RecipeRowSchema = z.object({
  id: Uuid,
  restaurant_id: Uuid,
  visit_id: Uuid.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  dish_image_url: z.string().url().nullable(),
  estimated_calories: z.number().int().nullable(),
  status: RecipeStatusEnum,
  photo_status: PhotoStatusEnum.default("placeholder"),
  gemini_confidence: z.number().min(0).max(1).nullable(),
  dish_rating: z.number().nullable().optional(),
  dish_review_snippet: z.string().nullable().optional(),
  // Story 3.6: denormalised macro totals written during Phase-2 enrichment.
  // Null = not yet enriched; 0 = zero grams (valid — enriched recipe with none of this macro).
  total_protein_g: z.number().nullable().optional(),
  total_carbs_g: z.number().nullable().optional(),
  total_fat_g: z.number().nullable().optional(),
  total_fibre_g: z.number().nullable().optional(),
  created_at: IsoDateString,
});

export type Recipe = z.infer<typeof RecipeRowSchema>;

export const RecipeInsertSchema = RecipeRowSchema.omit({
  id: true,
  created_at: true,
}).partial({
  visit_id: true,
  description: true,
  dish_image_url: true,
  estimated_calories: true,
  status: true,
  photo_status: true,
  gemini_confidence: true,
  dish_rating: true,
  dish_review_snippet: true,
});

export type RecipeInsert = z.infer<typeof RecipeInsertSchema>;

export const RecipeUpdateSchema = RecipeRowSchema.omit({
  id: true,
  created_at: true,
  restaurant_id: true,
  visit_id: true,
}).partial();

// ─── Recipe rating update (targeted subset) ───────────────────────────────────

export const RecipeRatingUpdateSchema = z.object({
  dish_rating: z.number().nullable(),
  dish_review_snippet: z.string().nullable(),
});

export type RecipeRatingUpdate = z.infer<typeof RecipeRatingUpdateSchema>;

export type RecipeUpdate = z.infer<typeof RecipeUpdateSchema>;

// ─── Recipe Ingredients ───────────────────────────────────────────────────────

export const RecipeIngredientRowSchema = z.object({
  id: Uuid,
  recipe_id: Uuid,
  name: z.string(),
  quantity: z.string().nullable(),
  unit: z.string().nullable(),
  usda_fdc_id: z.number().int().nullable(),
  calories_per_serving: z.number().nullable(),
  protein_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  confidence: ConfidenceEnum,
});

export type RecipeIngredient = z.infer<typeof RecipeIngredientRowSchema>;

export const RecipeIngredientInsertSchema = RecipeIngredientRowSchema.omit({
  id: true,
}).partial({
  quantity: true,
  unit: true,
  usda_fdc_id: true,
  calories_per_serving: true,
  protein_g: true,
  fat_g: true,
  carbs_g: true,
});

export type RecipeIngredientInsert = z.infer<typeof RecipeIngredientInsertSchema>;

// ─── Grocery Items ────────────────────────────────────────────────────────────

export const GroceryItemRowSchema = z.object({
  id: Uuid,
  name: z.string(),
  quantity: z.string().nullable(),
  unit: z.string().nullable(),
  checked: z.boolean(),
  recipe_ids: z.array(Uuid),
  dish_name: z.string().nullable(),
  created_at: IsoDateString,
});

export type GroceryItem = z.infer<typeof GroceryItemRowSchema>;

export const GroceryItemInsertSchema = GroceryItemRowSchema.omit({
  id: true,
  created_at: true,
}).partial({
  quantity: true,
  unit: true,
  recipe_ids: true,
  dish_name: true,
});

export type GroceryItemInsert = z.infer<typeof GroceryItemInsertSchema>;

export const GroceryItemUpdateSchema = GroceryItemRowSchema.omit({
  id: true,
  created_at: true,
}).partial();

export type GroceryItemUpdate = z.infer<typeof GroceryItemUpdateSchema>;

// ─── Supabase Database interface (typed client) ───────────────────────────────
// GenericTable requires a Relationships field (postgrest-js ≥ 1.17)

export interface Database {
  public: {
    Tables: {
      restaurants: {
        Row: Restaurant;
        Insert: RestaurantInsert;
        Update: Partial<RestaurantInsert>;
        Relationships: [];
      };
      restaurant_visits: {
        Row: RestaurantVisit;
        Insert: RestaurantVisitInsert;
        Update: Partial<RestaurantVisitInsert>;
        Relationships: [];
      };
      recipes: {
        Row: Recipe;
        Insert: RecipeInsert;
        Update: RecipeUpdate;
        Relationships: [];
      };
      recipe_ingredients: {
        Row: RecipeIngredient;
        Insert: RecipeIngredientInsert;
        Update: Partial<RecipeIngredientInsert>;
        Relationships: [];
      };
      grocery_items: {
        Row: GroceryItem;
        Insert: GroceryItemInsert;
        Update: GroceryItemUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: {
      recipe_status: RecipeStatus;
    };
  };
}

// ─── Domain / UI types (camelCase) ────────────────────────────────────────────
// These are what UI components work with after mapping from DB row types.

export interface DomainRestaurant {
  id: string;
  placeId: string | null;
  name: string;
  address: string | null;
  cuisineType: string | null;
  referenceImageUrl: string | null;
  atmosphericPaletteJson: Record<string, unknown> | null;
  rating: number | null;
  userRatingsTotal: number | null;
  createdAt: string;
}

export interface DomainRecipe {
  id: string;
  restaurantId: string;
  visitId: string | null;
  name: string;
  description: string | null;
  dishImageUrl: string | null;
  estimatedCalories: number | null;
  status: RecipeStatus;
  photoStatus: PhotoStatus;
  geminiConfidence: number | null;
  dishRating: number | null;
  dishReviewSnippet: string | null;
  /** Story 3.6: denormalised macro totals. Null until Phase-2 enrichment runs. */
  totalProteinG: number | null;
  totalCarbsG: number | null;
  totalFatG: number | null;
  totalFibreG: number | null;
  createdAt: string;
  /** Populated by join queries — not always present */
  ingredients?: DomainIngredient[];
  /** Populated by join queries — not always present */
  restaurant?: DomainRestaurant | null;
}

export interface DomainIngredient {
  id: string;
  recipeId: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  usdaFdcId: number | null;
  caloriesPerServing: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  confidence: Confidence;
}

export interface DomainGroceryItem {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  checked: boolean;
  recipeIds: string[];
  dishName: string | null;
  createdAt: string;
}

// ─── Mapper helpers ───────────────────────────────────────────────────────────

export function mapRestaurant(row: Restaurant): DomainRestaurant {
  let palette: Record<string, unknown> | null = null;
  if (row.atmospheric_palette_json) {
    try {
      palette = JSON.parse(row.atmospheric_palette_json) as Record<string, unknown>;
    } catch {
      // malformed JSON — treat as null
    }
  }
  return {
    id: row.id,
    placeId: row.place_id,
    name: row.name,
    address: row.address,
    cuisineType: row.cuisine_type,
    referenceImageUrl: row.reference_image_url,
    atmosphericPaletteJson: palette,
    rating: row.rating ?? null,
    userRatingsTotal: row.user_ratings_total ?? null,
    createdAt: row.created_at,
  };
}

export function mapRecipe(row: Recipe): DomainRecipe {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    visitId: row.visit_id,
    name: row.name,
    description: row.description,
    dishImageUrl: row.dish_image_url,
    estimatedCalories: row.estimated_calories,
    status: row.status,
    photoStatus: row.photo_status,
    geminiConfidence: row.gemini_confidence,
    dishRating: row.dish_rating ?? null,
    dishReviewSnippet: row.dish_review_snippet ?? null,
    totalProteinG: row.total_protein_g ?? null,
    totalCarbsG: row.total_carbs_g ?? null,
    totalFatG: row.total_fat_g ?? null,
    totalFibreG: row.total_fibre_g ?? null,
    createdAt: row.created_at,
  };
}

export function mapIngredient(row: RecipeIngredient): DomainIngredient {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    usdaFdcId: row.usda_fdc_id,
    caloriesPerServing: row.calories_per_serving,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    carbsG: row.carbs_g,
    confidence: row.confidence,
  };
}

export function mapGroceryItem(row: GroceryItem): DomainGroceryItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    checked: row.checked,
    recipeIds: row.recipe_ids,
    dishName: row.dish_name ?? null,
    createdAt: row.created_at,
  };
}

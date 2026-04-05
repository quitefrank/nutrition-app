/**
 * Plately v2 — Supabase Database Types
 *
 * Schema overview:
 *   restaurants       — Google Places-enriched restaurant entities (deduplicated by place_id)
 *   restaurant_visits — Each scan/search creates a visit record (v2: auto-save model)
 *   recipes           — Auto-captured dishes (status: auto_captured | kept | removed)
 *   recipe_ingredients — Ingredients with USDA-sourced macro data
 *   grocery_items     — Aggregated shopping list entries
 */

export type RecipeStatus = "auto_captured" | "kept" | "removed";

export interface Database {
  public: {
    Tables: {
      restaurants: {
        Row: Restaurant;
        Insert: Omit<Restaurant, "id" | "created_at">;
        Update: Partial<Omit<Restaurant, "id" | "created_at">>;
      };
      restaurant_visits: {
        Row: RestaurantVisit;
        Insert: Omit<RestaurantVisit, "id" | "visited_at">;
        Update: Partial<Omit<RestaurantVisit, "id" | "visited_at">>;
      };
      recipes: {
        Row: Recipe;
        Insert: Omit<Recipe, "id" | "created_at">;
        Update: Partial<Omit<Recipe, "id" | "created_at">>;
      };
      recipe_ingredients: {
        Row: RecipeIngredient;
        Insert: Omit<RecipeIngredient, "id">;
        Update: Partial<Omit<RecipeIngredient, "id">>;
      };
      grocery_items: {
        Row: GroceryItem;
        Insert: Omit<GroceryItem, "id" | "created_at">;
        Update: Partial<Omit<GroceryItem, "id" | "created_at">>;
      };
    };
  };
}

export interface Restaurant {
  id: string;
  place_id: string | null;           // Google Places ID (dedup key)
  name: string;
  address: string | null;
  cuisine_type: string | null;
  reference_image_url: string | null; // Google Places reference image
  atmospheric_palette_json: string | null; // Extracted color palette
  created_at: string;
}

export interface RestaurantVisit {
  id: string;
  restaurant_id: string;
  visit_type: "scan" | "search";      // How the visit was triggered
  raw_menu_json: string | null;       // Cached Gemini menu scan result
  visited_at: string;
}

export interface Recipe {
  id: string;
  restaurant_id: string;
  visit_id: string | null;
  name: string;
  description: string | null;
  dish_image_url: string | null;      // Reference image from Google Places or user
  estimated_calories: number | null;
  status: RecipeStatus;               // v2: auto_captured by default; user removes
  gemini_confidence: number | null;   // 0–1
  created_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  name: string;
  quantity: string | null;            // "2 cups", "1 tbsp", etc.
  unit: string | null;
  usda_fdc_id: number | null;
  calories_per_serving: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  confidence: "high" | "medium" | "low";
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  checked: boolean;
  recipe_ids: string[];               // Source recipes (for "By Recipe" view)
  created_at: string;
}

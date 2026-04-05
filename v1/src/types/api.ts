// API contract types — shapes returned by /api/* routes and used by client hooks.

// ─── Scan results ────────────────────────────────────────────────────────────

export interface IngredientResult {
  name: string
  quantity: string | null
  unit: string | null
  /** Gemini confidence for this ingredient */
  confidenceLevel: 'high' | 'medium' | 'low'
}

export interface DishResult {
  name: string
  description: string
  calorieEstimate: number | null
  ingredients: IngredientResult[] // [] for menu scans; populated by dish scan or enrich route
  imageUrl: string | null // null here; set by enrich route in Story 2.4
}

export interface ScanResult {
  scanId: string
  type: 'menu' | 'dish'
  dishes: DishResult[]
  confidenceSource: 'gemini-only' | 'multi-source' | 'user-confirmed' | 'inference'
  /** Total dishes visible on the menu (for partial results banner). Only present when
   *  fewer dishes were identified than are visible. Always >= dishes.length when present. */
  totalDishCount?: number
  /** Why the dishes array is empty. Only present when dishes.length === 0. */
  emptyReason?: 'image_quality' | 'not_menu' | 'no_dishes_found' | null
  /** Restaurant name extracted from the menu image by Gemini. Null if unidentifiable. */
  restaurantName?: string | null
  /** Resolved Google Places ID for the restaurant. Set by enrichment after name → Places lookup. */
  restaurantGooglePlacesId?: string | null
}

// ─── Response envelopes ───────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T
}

export interface ApiError {
  error: string
  /** Machine-readable code for client-side branching */
  code: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─── Enrichment API ───────────────────────────────────────────────────────────

export interface EnrichRequest {
  scanId: string
  dishes: Array<{
    name: string
    ingredients: IngredientResult[]
  }>
  /** Restaurant name from menu scan — used to resolve Places ID and fetch restaurant photos. */
  restaurantName?: string | null
  /** Pre-resolved Places ID (e.g. from user confirmation). Skips the text-search step if provided. */
  restaurantGooglePlacesId?: string | null
}

// ─── Scan API ─────────────────────────────────────────────────────────────────

export interface ScanRequest {
  imageBase64: string
  mimeType: string
  // mode removed — route path determines scan type
}

// ─── Recipe API ───────────────────────────────────────────────────────────────

export interface RecipeSaveRequest {
  name: string
  dishImageUrl: string | null
  confidenceMetadata: Record<string, unknown> | null
  servingSize: number
  ingredients: IngredientResult[]  // reuse existing IngredientResult — same shape
  restaurantName?: string | null
  restaurantGooglePlacesId?: string | null
}

export interface RecipeSaveResponse {
  id: string
  name: string
  createdAt: string
  servingSize: number
  restaurantId: string | null
}

export interface RecipeUpdateIngredient {
  id: string          // existing ingredient UUID — edit-in-place only (no add/remove in this story)
  name: string
  quantity: string | null
  unit: string | null
  confidenceLevel: 'high' | 'medium' | 'low'
}

export interface RecipeUpdateRequest {
  name: string
  servingSize: number
  ingredients: RecipeUpdateIngredient[]
}

// ─── Grocery API ──────────────────────────────────────────────────────────────

export interface GroceryAddRequest {
  recipeId: string
}

export interface GroceryAddResponse {
  added: number
  merged: number
}

// ─── Grocery List / Check / Delete ────────────────────────────────────────────

export interface GroceryListItem {
  id: string
  recipeId: string | null
  ingredientName: string
  quantity: string | null
  unit: string | null
  checked: boolean
  createdAt: string
}

export interface GroceryCheckRequest {
  checked: boolean
}

export interface GroceryCheckResponse {
  id: string
  checked: boolean
}

// ─── Search API (Story 5.1) ───────────────────────────────────────────────────

export interface RestaurantSearchResult {
  googlePlacesId: string
  name: string
  address: string
  imageUrl: string | null
}

export interface SearchDishResponse {
  dish: DishResult           // the existing DishResult type — not redefined
  nutritionAvailable: boolean
}

// ─── Nearby Restaurants API (Story 5.4) ──────────────────────────────────────

export interface NearbyRestaurantResult {
  id: string
  name: string
  googlePlacesId: string
  recipeCount: number
}

// ─── Grocery Recipe View (Story 4.3) ─────────────────────────────────────────

// Returned by GET /api/grocery/recipes
export interface GroceryRecipeSummary {
  recipeId: string | null       // null = "Other items" group
  recipeName: string            // "Other items" for the null group
  dishImageUrl: string | null
  restaurantName: string | null
  itemCount: number
}

// Client-side derived type — NOT returned from any API route.
// Constructed in grocery-recipe-view.tsx by joining GroceryListItem[] on recipeId.
export interface GroceryRecipeGroup {
  recipeId: string | null
  recipeName: string
  dishImageUrl: string | null
  restaurantName: string | null
  items: GroceryListItem[]
}

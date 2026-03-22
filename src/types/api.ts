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

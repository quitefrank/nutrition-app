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
  confidenceSource: 'gemini-only' | 'multi-source' | 'user-confirmed'
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

// ─── Scan API ─────────────────────────────────────────────────────────────────

export interface ScanRequest {
  imageBase64: string
  mimeType: string
  // mode removed — route path determines scan type
}

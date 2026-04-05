// Domain types — camelCase TypeScript representations of DB rows.
// These are what the UI layer works with after mapping from Database types.

export interface DomainRestaurant {
  id: string
  name: string
  googlePlacesId: string | null
  atmosphericPaletteJson: Record<string, unknown> | null
  restaurantImageUrl: string | null
  updatedAt: string
}

export interface DomainIngredient {
  id: string
  recipeId: string
  name: string
  quantity: string | null
  unit: string | null
  confidenceLevel: 'high' | 'medium' | 'low'
  caloriesKcal: number | null   // null until Story 3.6 populates
  proteinG: number | null
  fatG: number | null
  carbsG: number | null
}

export interface Recipe {
  id: string
  name: string
  restaurantId: string | null
  dishImageUrl: string | null
  confidenceMetadataJson: Record<string, unknown> | null
  servingSize: number
  createdAt: string
  /** Populated by join — not always present */
  ingredients?: DomainIngredient[]
  /** Populated by join — not always present */
  restaurant?: DomainRestaurant | null
}

export type AtmosphericPalette = {
  dominantColor: string       // hex color of dominant extracted colour
  sourceImageUrl: string      // the image URL used for extraction
}

export type AtmosphericState = {
  imageUrl: string | null         // null for tier 3 (neutral)
  palette: AtmosphericPalette | null
  tier: 'restaurant' | 'cuisine' | 'neutral'
  backgroundColorFallback: string // the hex base color (tier 2/3 color)
}

export interface DomainGroceryItem {
  id: string
  recipeId: string | null
  ingredientName: string
  quantity: string | null
  unit: string | null
  checked: boolean
  createdAt: string
}

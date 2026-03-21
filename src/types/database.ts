// Auto-generate this file with the Supabase CLI after running schema.sql:
//   npx supabase gen types typescript --project-id <your-project-ref> > src/types/database.ts
//
// Until then, this hand-written version matches schema.sql exactly.
// DO NOT hand-edit after generating from CLI.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      restaurants: {
        Row: {
          id: string
          name: string
          google_places_id: string | null
          atmospheric_palette_json: Json | null
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          google_places_id?: string | null
          atmospheric_palette_json?: Json | null
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          google_places_id?: string | null
          atmospheric_palette_json?: Json | null
          updated_at?: string
        }
      }
      recipes: {
        Row: {
          id: string
          name: string
          restaurant_id: string | null
          dish_image_url: string | null
          confidence_metadata_json: Json | null
          serving_size: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          restaurant_id?: string | null
          dish_image_url?: string | null
          confidence_metadata_json?: Json | null
          serving_size?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          restaurant_id?: string | null
          dish_image_url?: string | null
          confidence_metadata_json?: Json | null
          serving_size?: number
          created_at?: string
        }
      }
      recipe_ingredients: {
        Row: {
          id: string
          recipe_id: string
          name: string
          quantity: string | null
          unit: string | null
          confidence_level: 'high' | 'medium' | 'low'
        }
        Insert: {
          id?: string
          recipe_id: string
          name: string
          quantity?: string | null
          unit?: string | null
          confidence_level: 'high' | 'medium' | 'low'
        }
        Update: {
          id?: string
          recipe_id?: string
          name?: string
          quantity?: string | null
          unit?: string | null
          confidence_level?: 'high' | 'medium' | 'low'
        }
      }
      grocery_items: {
        Row: {
          id: string
          recipe_id: string | null
          ingredient_name: string
          quantity: string | null
          unit: string | null
          checked: boolean
          created_at: string
        }
        Insert: {
          id?: string
          recipe_id?: string | null
          ingredient_name: string
          quantity?: string | null
          unit?: string | null
          checked?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          recipe_id?: string | null
          ingredient_name?: string
          quantity?: string | null
          unit?: string | null
          checked?: boolean
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

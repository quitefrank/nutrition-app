// Auto-generate this file with the Supabase CLI after running schema.sql:
//   npx supabase gen types typescript --project-id <your-project-ref> > src/types/database.ts
//
// Until then, this hand-written version matches schema.sql exactly.
// DO NOT hand-edit after generating from CLI.
//
// ⚠️  IMPORTANT: The `Relationships` arrays below were added manually (Story 4.4)
// to fix Supabase 2.x type inference errors. If you regenerate this file from the
// CLI, verify the generated output includes Relationships for all FK columns before
// committing, or re-apply these entries manually.

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
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: 'recipes_restaurant_id_fkey'
            columns: ['restaurant_id']
            isOneToOne: false
            referencedRelation: 'restaurants'
            referencedColumns: ['id']
          }
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          recipe_id: string
          name: string
          quantity: string | null
          unit: string | null
          confidence_level: 'high' | 'medium' | 'low'
          calories_kcal: number | null
          protein_g: number | null
          fat_g: number | null
          carbs_g: number | null
        }
        Insert: {
          id?: string
          recipe_id: string
          name: string
          quantity?: string | null
          unit?: string | null
          confidence_level: 'high' | 'medium' | 'low'
          calories_kcal?: number | null
          protein_g?: number | null
          fat_g?: number | null
          carbs_g?: number | null
        }
        Update: {
          id?: string
          recipe_id?: string
          name?: string
          quantity?: string | null
          unit?: string | null
          confidence_level?: 'high' | 'medium' | 'low'
          calories_kcal?: number | null
          protein_g?: number | null
          fat_g?: number | null
          carbs_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'recipe_ingredients_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['id']
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: 'grocery_items_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

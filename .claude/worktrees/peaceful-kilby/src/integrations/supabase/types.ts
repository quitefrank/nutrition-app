export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      daily_log_items: {
        Row: {
          calories: number
          carbs: number
          created_at: string | null
          daily_log_id: string
          fat: number
          food_id: string | null
          grams_equivalent: number | null
          id: string
          protein: number
          quantity: number | null
          recipe_id: string | null
          servings: number | null
          unit: string | null
        }
        Insert: {
          calories: number
          carbs: number
          created_at?: string | null
          daily_log_id: string
          fat: number
          food_id?: string | null
          grams_equivalent?: number | null
          id?: string
          protein: number
          quantity?: number | null
          recipe_id?: string | null
          servings?: number | null
          unit?: string | null
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string | null
          daily_log_id?: string
          fat?: number
          food_id?: string | null
          grams_equivalent?: number | null
          id?: string
          protein?: number
          quantity?: number | null
          recipe_id?: string | null
          servings?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_log_items_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_log_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_log_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          created_at: string | null
          id: string
          log_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          log_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          log_date?: string
        }
        Relationships: []
      }
      foods: {
        Row: {
          brand: string | null
          calories_per_100g: number
          calories_per_serving: number | null
          carbs_per_100g: number
          carbs_per_serving: number | null
          created_at: string | null
          fat_per_100g: number
          fat_per_serving: number | null
          fdc_id: string
          id: string
          name: string
          protein_per_100g: number
          protein_per_serving: number | null
          serving_grams: number | null
          source: string
        }
        Insert: {
          brand?: string | null
          calories_per_100g: number
          calories_per_serving?: number | null
          carbs_per_100g: number
          carbs_per_serving?: number | null
          created_at?: string | null
          fat_per_100g: number
          fat_per_serving?: number | null
          fdc_id: string
          id?: string
          name: string
          protein_per_100g: number
          protein_per_serving?: number | null
          serving_grams?: number | null
          source?: string
        }
        Update: {
          brand?: string | null
          calories_per_100g?: number
          calories_per_serving?: number | null
          carbs_per_100g?: number
          carbs_per_serving?: number | null
          created_at?: string | null
          fat_per_100g?: number
          fat_per_serving?: number | null
          fdc_id?: string
          id?: string
          name?: string
          protein_per_100g?: number
          protein_per_serving?: number | null
          serving_grams?: number | null
          source?: string
        }
        Relationships: []
      }
      groceries: {
        Row: {
          created_at: string | null
          food_id: string
          id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          food_id: string
          id?: string
          status?: string
        }
        Update: {
          created_at?: string | null
          food_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "groceries_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_items: {
        Row: {
          calories: number
          carbs: number
          created_at: string | null
          fat: number
          food_id: string
          grams_equivalent: number
          id: string
          protein: number
          quantity: number
          recipe_id: string
          unit: string
        }
        Insert: {
          calories: number
          carbs: number
          created_at?: string | null
          fat: number
          food_id: string
          grams_equivalent: number
          id?: string
          protein: number
          quantity: number
          recipe_id: string
          unit: string
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string | null
          fat?: number
          food_id?: string
          grams_equivalent?: number
          id?: string
          protein?: number
          quantity?: number
          recipe_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string | null
          id: string
          name: string
          servings: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          servings?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          servings?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

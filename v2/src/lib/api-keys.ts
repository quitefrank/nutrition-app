import 'server-only'

export function getApiKeys() {
  return {
    gemini: process.env.GEMINI_API_KEY,
    places: process.env.GOOGLE_PLACES_API_KEY,
    usda: process.env.USDA_API_KEY,
    cseKey: process.env.GOOGLE_CSE_KEY,
    cseCx: process.env.GOOGLE_CSE_CX,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

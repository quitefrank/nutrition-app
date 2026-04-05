/**
 * One-time script: update serving_size on existing recipes that were saved
 * before the Gemini servings inference was added (all have serving_size=1).
 *
 * Asks Gemini how many servings each dish typically makes, then patches
 * the recipe row. The NutritionPanel divides stored calories by serving_size,
 * so this corrects per-serving display without touching ingredient data.
 *
 * Usage: node scripts/backfill-servings.mjs
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), '.env.local')
const envVars = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) envVars[match[1].trim()] = match[2].trim()
}

const SUPABASE_URL = envVars['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_KEY = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY']
const GEMINI_KEY = envVars['GEMINI_API_KEY']

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}
if (!GEMINI_KEY) {
  console.error('Missing GEMINI_API_KEY in .env.local')
  process.exit(1)
}

// ── Supabase REST headers ────────────────────────────────────────────────────
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

// ── Fetch all recipes ────────────────────────────────────────────────────────
async function fetchRecipes() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/recipes?select=id,name,serving_size`,
    { headers: { ...headers, Prefer: 'return=representation' } }
  )
  if (!res.ok) throw new Error(`Fetch recipes failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// ── Patch serving_size on a recipe ──────────────────────────────────────────
async function updateServingSize(id, servingSize) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/recipes?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ serving_size: servingSize }),
    }
  )
  if (!res.ok) throw new Error(`Patch failed for ${id}: ${res.status} ${await res.text()}`)
}

// ── Ask Gemini: how many servings does this dish make? ───────────────────────
async function inferServings(dishName) {
  const prompt = `You are a culinary expert. For the dish "${dishName}", how many people does a standard restaurant/home preparation typically serve?

Return ONLY valid JSON (no markdown, no explanation):
{ "servings": 4 }

Rules:
- servings: integer 1–12
- Use the most common preparation size (e.g. pasta for 4, steak for 1, pizza for 2–4)`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    if (!res.ok) {
      console.warn(`  Gemini error ${res.status} for "${dishName}"`)
      return null
    }
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(clean)
    const servings = typeof parsed?.servings === 'number' && parsed.servings >= 1
      ? Math.round(parsed.servings)
      : null
    return servings
  } catch (err) {
    console.warn(`  Inference failed for "${dishName}":`, err.message)
    return null
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const recipes = await fetchRecipes()
console.log(`\nFound ${recipes.length} recipe(s) to process.\n`)

let updated = 0
let skipped = 0

for (const recipe of recipes) {
  process.stdout.write(`  "${recipe.name}" (currently ${recipe.serving_size} serving(s))… `)
  const servings = await inferServings(recipe.name)
  if (servings === null || servings === recipe.serving_size) {
    console.log(servings === null ? 'SKIP (no result)' : `unchanged (${recipe.serving_size})`)
    skipped++
  } else {
    await updateServingSize(recipe.id, servings)
    console.log(`→ ${servings} serving(s)`)
    updated++
  }
  // 300ms between Gemini calls to respect rate limits
  await new Promise(r => setTimeout(r, 300))
}

console.log(`\nDone. Updated: ${updated}, Skipped/unchanged: ${skipped}`)

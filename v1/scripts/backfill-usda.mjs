/**
 * One-time script: backfill USDA nutritional data for recipe_ingredients
 * where calories_kcal IS NULL (saved before USDA_API_KEY was present).
 *
 * Also infers and inserts ingredients for recipes that have none
 * (saved from menu scans before Gemini inference was added).
 *
 * Usage: node scripts/backfill-usda.mjs
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
const USDA_KEY = envVars['USDA_API_KEY']
const GEMINI_KEY = envVars['GEMINI_API_KEY']

if (!SUPABASE_URL || !SUPABASE_KEY || !USDA_KEY) {
  console.error('Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, USDA_API_KEY in .env.local')
  process.exit(1)
}

// ── USDA helpers (mirrors src/app/api/recipes/route.ts) ─────────────────────
const GRAM_CONVERSIONS = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.3495, lb: 453.592 }

function resolveScale(quantity, unit, usdaServingSize, usdaServingSizeUnit) {
  const qNum = quantity ? parseFloat(quantity) : NaN
  const validQty = Number.isFinite(qNum) && qNum > 0
  const unitLower = unit?.toLowerCase().trim() ?? ''
  if (unitLower in GRAM_CONVERSIONS && validQty) return (qNum * GRAM_CONVERSIONS[unitLower]) / 100
  if (validQty && usdaServingSize > 0) {
    const servingUnit = usdaServingSizeUnit?.toLowerCase().trim() ?? ''
    if (['g', 'gram', 'grams'].includes(servingUnit)) return (qNum * usdaServingSize) / 100
  }
  return 1
}

async function lookupUsdaMacros(name, quantity, unit) {
  const nullResult = { caloriesKcal: null, proteinG: null, fatG: null, carbsG: null }
  if (!name?.trim()) return nullResult
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(name)}&pageSize=1&dataType=Foundation,SR%20Legacy`,
      { headers: { 'X-Api-Key': USDA_KEY }, signal: controller.signal }
    )
    if (!res.ok) return nullResult
    const data = await res.json()
    const food = data?.foods?.[0]
    if (!food) return nullResult
    const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : []
    const find = (id) => { const n = nutrients.find(n => n.nutrientId === id); return typeof n?.value === 'number' ? n.value : null }
    const per100 = { cal: find(1008), pro: find(1003), fat: find(1004), carb: find(1005) }
    const scale = resolveScale(quantity, unit, food.servingSize ?? null, food.servingSizeUnit ?? null)
    const round = (v) => v !== null ? Math.round(v * scale * 10) / 10 : null
    return { caloriesKcal: round(per100.cal), proteinG: round(per100.pro), fatG: round(per100.fat), carbsG: round(per100.carb) }
  } catch {
    return nullResult
  } finally {
    clearTimeout(timer)
  }
}

// ── Gemini inference ─────────────────────────────────────────────────────────
async function inferIngredients(dishName) {
  if (!GEMINI_KEY) return []
  const prompt = `You are a culinary expert. List the typical ingredients for the dish: "${dishName}".

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "ingredients": [
    { "name": "string", "quantity": "string or null", "unit": "string or null" }
  ]
}

Rules:
- List 5–12 ingredients typical for a standard restaurant preparation
- quantity: numeric string (e.g. "200") or null if uncertain
- unit: unit of measure (e.g. "g", "ml", "tbsp", "clove") or null if count/unknown
- If the dish name is not a recognisable food, return { "ingredients": [] }
- Return valid JSON only`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    if (!res.ok) { console.warn(`  Gemini error ${res.status} for "${dishName}"`); return [] }
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(clean)
    if (!Array.isArray(parsed?.ingredients)) return []
    return parsed.ingredients
      .filter(i => typeof i === 'object' && i !== null && typeof i.name === 'string' && i.name.trim())
      .map(i => ({ name: i.name.trim(), quantity: typeof i.quantity === 'string' ? i.quantity : null, unit: typeof i.unit === 'string' ? i.unit : null }))
  } catch (err) {
    console.warn(`  Inference failed for "${dishName}":`, err.message)
    return []
  }
}

// ── Supabase REST helpers ────────────────────────────────────────────────────
const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }

async function fetchIngredients() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/recipe_ingredients?calories_kcal=is.null&select=id,name,quantity,unit`,
    { headers: { ...headers, 'Prefer': 'return=representation' } }
  )
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function fetchRecipesWithNoIngredients() {
  // Get all recipes
  const recipesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/recipes?select=id,name`,
    { headers: { ...headers, 'Prefer': 'return=representation' } }
  )
  if (!recipesRes.ok) throw new Error(`Fetch recipes failed: ${recipesRes.status} ${await recipesRes.text()}`)
  const recipes = await recipesRes.json()

  // For each recipe, check if it has any ingredients
  const results = []
  for (const recipe of recipes) {
    const ingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/recipe_ingredients?recipe_id=eq.${recipe.id}&select=id`,
      { headers: { ...headers, 'Prefer': 'return=representation' } }
    )
    if (!ingRes.ok) continue
    const ings = await ingRes.json()
    if (ings.length === 0) results.push(recipe)
  }
  return results
}

async function updateIngredient(id, macros) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/recipe_ingredients?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        calories_kcal: macros.caloriesKcal,
        protein_g: macros.proteinG,
        fat_g: macros.fatG,
        carbs_g: macros.carbsG,
      }),
    }
  )
  if (!res.ok) throw new Error(`Update failed for ${id}: ${res.status} ${await res.text()}`)
}

async function insertIngredients(recipeId, ingredients) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/recipe_ingredients`,
    {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(ingredients.map(ing => ({
        recipe_id: recipeId,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        confidence_level: 'medium',
        calories_kcal: ing.caloriesKcal,
        protein_g: ing.proteinG,
        fat_g: ing.fatG,
        carbs_g: ing.carbsG,
      }))),
    }
  )
  if (!res.ok) throw new Error(`Insert failed for recipe ${recipeId}: ${res.status} ${await res.text()}`)
}

// ── Phase 1: backfill missing USDA macros ────────────────────────────────────
const ingredients = await fetchIngredients()
console.log(`\n── Phase 1: Update missing nutritional data ─────────────────`)
console.log(`Found ${ingredients.length} ingredient(s) with missing nutritional data.`)

let updated = 0
let skipped = 0

for (const ing of ingredients) {
  const macros = await lookupUsdaMacros(ing.name, ing.quantity, ing.unit)
  if (macros.caloriesKcal === null) {
    console.log(`  SKIP  ${ing.name} — no USDA match`)
    skipped++
  } else {
    await updateIngredient(ing.id, macros)
    console.log(`  OK    ${ing.name} → ${macros.caloriesKcal} kcal`)
    updated++
  }
  await new Promise(r => setTimeout(r, 300))
}

console.log(`Phase 1 done. Updated: ${updated}, Skipped: ${skipped}`)

// ── Phase 2: infer ingredients for recipes with none ─────────────────────────
console.log(`\n── Phase 2: Infer ingredients for ingredient-less recipes ───`)
if (!GEMINI_KEY) {
  console.log('GEMINI_API_KEY not set — skipping inference phase.')
} else {
  const emptyRecipes = await fetchRecipesWithNoIngredients()
  console.log(`Found ${emptyRecipes.length} recipe(s) with no ingredients.`)

  let inferred = 0
  for (const recipe of emptyRecipes) {
    console.log(`\n  "${recipe.name}"`)
    const ings = await inferIngredients(recipe.name)
    if (ings.length === 0) {
      console.log(`    SKIP — no ingredients inferred`)
      continue
    }
    // USDA lookup for each inferred ingredient
    const withMacros = []
    for (const ing of ings) {
      const macros = await lookupUsdaMacros(ing.name, ing.quantity, ing.unit)
      withMacros.push({ ...ing, ...macros })
      console.log(`    ${ing.name} → ${macros.caloriesKcal ?? '?'} kcal`)
      await new Promise(r => setTimeout(r, 300))
    }
    await insertIngredients(recipe.id, withMacros)
    console.log(`    ✓ Inserted ${withMacros.length} ingredients`)
    inferred++
    // Brief pause between recipes
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(`\nPhase 2 done. Recipes populated: ${inferred}`)
}

console.log('\nAll done.')

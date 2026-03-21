# Story 2.1: Gemini Scan API Routes

Status: review

## Story

As a developer,
I want Gemini-powered menu and dish scan API routes with the defined scan result contract,
So that the camera UI has reliable, correctly-shaped scan results to display.

## Acceptance Criteria

**Given** a valid image is submitted to `POST /api/scan/menu`
**When** Gemini processes the image
**Then** the route returns `{ data: { scanId: string, type: 'menu', dishes: DishResult[], confidenceSource: 'gemini-only' } }` with HTTP 200

**Given** a valid image is submitted to `POST /api/scan/dish`
**When** Gemini processes the image
**Then** the route returns `{ data: { scanId: string, type: 'dish', dishes: [DishResult], confidenceSource: 'gemini-only' } }` with HTTP 200

**Given** the `DishResult` shape
**When** returned by either route
**Then** each dish contains: `name: string`, `description: string`, `calorieEstimate: number | null`, `ingredients: IngredientResult[]`, `imageUrl: null` (always null at this stage — Google Places enrichment is Story 2.4)

**Given** the `IngredientResult` shape
**When** returned
**Then** each ingredient contains: `name: string`, `quantity: string | null`, `unit: string | null`, `confidenceLevel: 'high' | 'medium' | 'low'`

**Given** `getApiKeys()` is called inside both routes
**When** the Gemini API key is read
**Then** no key value appears in any response body, response header, or serialised output visible to the client

**Given** a scan image is received by either route
**When** the request lifecycle ends (success or failure)
**Then** no image binary data has been written to Supabase storage, a filesystem path, or any persistent location

**Given** Gemini is unavailable or the request times out
**When** the route catches the error
**Then** it returns `{ error: 'Gemini service unavailable', code: 'SCAN_SERVICE_UNAVAILABLE' }` with HTTP 503; no silent failure

**Given** Gemini returns a valid HTTP response but the response body cannot be parsed as the expected JSON structure
**When** the parse step fails (invalid JSON, missing `dishes` array, etc.)
**Then** the route returns `{ error: 'Gemini returned an unparseable response', code: 'GEMINI_RESPONSE_UNPARSEABLE' }` with HTTP 422; no silent 200 with empty dishes

**Given** any route-level error occurs
**When** the error response is sent
**Then** it always uses the `{ error: string, code: string }` shape with the correct HTTP status (400 bad request, 422 validation, 500 server error, 503 service unavailable); no other error shape is used

## Tasks / Subtasks

- [x] Task 1: Update `src/types/api.ts` — align types with epic contract
  - [x] Add `calorieEstimate: number | null` to `DishResult`
  - [x] Add `imageUrl: string | null` to `DishResult` (null from scan routes; set by enrich route in 2.4)
  - [x] Remove `overallConfidence` from `DishResult` (per-ingredient `confidenceLevel` is the confidence signal per epic spec)
  - [x] Add `ScanResult` interface: `{ scanId: string; type: 'menu' | 'dish'; dishes: DishResult[]; confidenceSource: 'gemini-only' | 'multi-source' | 'user-confirmed' }`
  - [x] Update `ScanResponse` (or replace with `ScanResult`) to match the new shape
  - [x] Keep `ScanRequest` (imageBase64, mimeType) — used by both routes; drop `mode` field as route path IS the mode
  - [x] **Note on ingredients for menu scans**: `ingredients` stays `IngredientResult[]` (not optional) — return `[]` for menu scan results; Gemini doesn't return ingredients from a menu photo. This is intentional — ingredients are populated from a dish scan or via the enrich route. Do NOT make ingredients optional to avoid null-checks throughout the UI.

- [x] Task 2: Install Gemini SDK
  - [x] Run: `npm install @google/generative-ai`
  - [x] No type changes needed — SDK ships with TypeScript types

- [x] Task 3: Create `src/app/api/scan/menu/route.ts` — menu scan handler
  - [x] `import 'server-only'` — top of file, prevents client bundling
  - [x] `import { getApiKeys } from '@/lib/api-keys'`
  - [x] `import { GoogleGenerativeAI } from '@google/generative-ai'`
  - [x] Request body: parse `{ imageBase64: string, mimeType: string }` — validate both fields present
  - [x] Call Gemini with `gemini-2.0-flash` model (see Gemini integration notes below)
  - [x] Use the menu scan prompt (see Prompts section below)
  - [x] Parse Gemini JSON response → map to `DishResult[]` with `imageUrl: null` and `ingredients: []`
  - [x] Generate `scanId` using `crypto.randomUUID()`
  - [x] Return: `NextResponse.json({ data: { scanId, type: 'menu', dishes, confidenceSource: 'gemini-only' } })`
  - [x] Wrap entire Gemini call in try/catch — return 503 on Gemini errors
  - [x] Missing fields validation: return 400 with `{ error: 'imageBase64 and mimeType are required', code: 'INVALID_REQUEST' }`
  - [x] No Supabase calls — no data is persisted in this story

- [x] Task 4: Create `src/app/api/scan/dish/route.ts` — dish scan handler
  - [x] Same imports and structure as menu route
  - [x] Use `gemini-2.0-flash` model
  - [x] Use the dish scan prompt (see Prompts section below)
  - [x] Parse Gemini JSON response → map to `DishResult[]` (single dish in array per spec: `dishes: [DishResult]`)
  - [x] Map Gemini ingredients to `IngredientResult[]` with `confidenceLevel` per ingredient
  - [x] Generate `scanId` using `crypto.randomUUID()`
  - [x] Return: `NextResponse.json({ data: { scanId, type: 'dish', dishes: [dish], confidenceSource: 'gemini-only' } })`
  - [x] Same error handling pattern as menu route

- [x] Task 5: Write tests
  - [x] `src/app/api/scan/menu/route.test.ts` — see Test Approach section below
  - [x] `src/app/api/scan/dish/route.test.ts` — see Test Approach section below

## Dev Notes

### Architecture Context

This story creates the server-side boundary — API routes are the ONLY place where Gemini API keys are used. The client never calls Gemini directly. This is enforced by `import 'server-only'` in `api-keys.ts` and the routes themselves.

**Key constraint:** No data is persisted in this story. `scanId` is a UUID generated per request and used only for client-side TanStack Query cache keying (Story 2.4 concern). The scan result lives in-memory on the client.

### File Locations

```
src/
  app/
    api/
      scan/
        menu/
          route.ts          ← NEW (Task 3)
          route.test.ts     ← NEW (Task 5)
        dish/
          route.ts          ← NEW (Task 4)
          route.test.ts     ← NEW (Task 5)
  types/
    api.ts                  ← MODIFY (Task 1)
```

The `src/app/api/` directory does not exist yet — create it with the full nested structure.

### Type Changes Required in `src/types/api.ts`

Current state has `DishResult.overallConfidence` which conflicts with the epic contract. The epic specifies confidence is per-ingredient (`IngredientResult.confidenceLevel`), not per-dish. After Task 1:

```typescript
// BEFORE (current api.ts — do not keep this shape):
export interface DishResult {
  name: string
  description: string | null
  ingredients: IngredientResult[]
  overallConfidence: 'high' | 'medium' | 'low'  // ← REMOVE
}

// AFTER:
export interface DishResult {
  name: string
  description: string
  calorieEstimate: number | null               // ← ADD
  ingredients: IngredientResult[]              // [] for menu scans
  imageUrl: string | null                      // ← ADD (null here; set by enrich in 2.4)
}

// ADD new response type:
export interface ScanResult {
  scanId: string
  type: 'menu' | 'dish'
  dishes: DishResult[]
  confidenceSource: 'gemini-only' | 'multi-source' | 'user-confirmed'
}

// UPDATE ScanResponse (or keep old + add new — prefer clean replacement):
// ScanResponse → replaced by ScanResult
// ScanRequest → keep but update: remove mode field (route path IS the mode)
export interface ScanRequest {
  imageBase64: string
  mimeType: string
  // mode removed — path determines scan type
}
```

**Check for `overallConfidence` references** before removing: grep the codebase for `overallConfidence`. Since this is the first story using scan types, it should be safe to remove.

### Gemini SDK Integration

**Install:** `npm install @google/generative-ai`

**Model:** Use `gemini-2.0-flash` (fast multimodal, good for menu/dish recognition). Do NOT hardcode the model string in the route body — define it as a constant at module scope.

```typescript
import 'server-only'
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getApiKeys } from '@/lib/api-keys'
import type { ScanRequest, ScanResult, DishResult } from '@/types/api'

const GEMINI_MODEL = 'gemini-2.0-flash'

export async function POST(request: Request) {
  const { gemini: apiKey } = getApiKeys()

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Scan service not configured', code: 'SCAN_SERVICE_UNAVAILABLE' },
      { status: 503 }
    )
  }

  let body: Partial<ScanRequest>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body', code: 'INVALID_REQUEST' },
      { status: 400 }
    )
  }

  const { imageBase64, mimeType } = body
  if (!imageBase64 || !mimeType) {
    return NextResponse.json(
      { error: 'imageBase64 and mimeType are required', code: 'INVALID_REQUEST' },
      { status: 400 }
    )
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: MENU_SCAN_PROMPT },  // or DISH_SCAN_PROMPT
    ])

    const text = result.response.text()
    const parsed = parseGeminiResponse(text)  // see Parsing section

    const scanResult: ScanResult = {
      scanId: crypto.randomUUID(),
      type: 'menu',
      dishes: parsed,
      confidenceSource: 'gemini-only',
    }

    return NextResponse.json({ data: scanResult })
  } catch (error) {
    console.error('[scan/menu] Gemini error:', error)
    return NextResponse.json(
      { error: 'Gemini service unavailable', code: 'SCAN_SERVICE_UNAVAILABLE' },
      { status: 503 }
    )
  }
}
```

**IMPORTANT:** Never log `apiKey`, `imageBase64`, or any sensitive data. Only log sanitised error messages.

### Gemini Prompts

Design the prompts to return JSON that maps cleanly to `DishResult[]`. Use system-style instruction + JSON schema in the text part.

**Menu Scan Prompt:**
```
You are a restaurant menu analyser. Analyse this menu image and identify all dishes shown.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "dishes": [
    {
      "name": "string — dish name as written on menu",
      "description": "string — brief description, or empty string if none shown",
      "calorieEstimate": number or null
    }
  ]
}

Rules:
- Include every dish visible on the menu
- calorieEstimate: extract if shown on menu, otherwise null
- description: use text from menu; if none, use an empty string ""
- If the image is not a menu, return { "dishes": [] }
- Return valid JSON only — no prose, no markdown fences
```

**Dish Scan Prompt:**
```
You are a food identification expert. Analyse this photo of a dish.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "dishes": [
    {
      "name": "string — dish name",
      "description": "string — brief description of the dish",
      "calorieEstimate": number or null,
      "ingredients": [
        {
          "name": "string",
          "quantity": "string or null",
          "unit": "string or null",
          "confidenceLevel": "high" | "medium" | "low"
        }
      ]
    }
  ]
}

Rules:
- Identify the single primary dish in the photo
- calorieEstimate: estimate calories for a typical serving, or null if uncertain
- ingredients: list the visible or strongly implied ingredients
- confidenceLevel per ingredient: "high" = clearly visible, "medium" = strongly implied, "low" = possible but uncertain
- If the image is not food, return { "dishes": [] }
- Return valid JSON only — no prose, no markdown fences
```

### Parsing Gemini Response

Gemini may wrap JSON in markdown code fences despite the instruction. Strip them defensively:

```typescript
function parseGeminiMenuResponse(text: string): DishResult[] {
  // Strip markdown fences if present
  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  let parsed: { dishes: unknown[] }
  try {
    parsed = JSON.parse(clean)
  } catch {
    console.error('[scan] Failed to parse Gemini response as JSON')
    return []
  }

  if (!Array.isArray(parsed?.dishes)) return []

  return parsed.dishes
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map((d) => ({
      name: typeof d.name === 'string' ? d.name : 'Unknown dish',
      description: typeof d.description === 'string' ? d.description : '',
      calorieEstimate: typeof d.calorieEstimate === 'number' ? d.calorieEstimate : null,
      ingredients: [],  // menu scan: no ingredients
      imageUrl: null,
    }))
}

function parseGeminiDishResponse(text: string): DishResult[] {
  // Same fence stripping
  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  let parsed: { dishes: unknown[] }
  try {
    parsed = JSON.parse(clean)
  } catch {
    return []
  }

  if (!Array.isArray(parsed?.dishes)) return []

  return parsed.dishes
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map((d) => ({
      name: typeof d.name === 'string' ? d.name : 'Unknown dish',
      description: typeof d.description === 'string' ? d.description : '',
      calorieEstimate: typeof d.calorieEstimate === 'number' ? d.calorieEstimate : null,
      ingredients: parseIngredients(d.ingredients),
      imageUrl: null,
    }))
}

function parseIngredients(raw: unknown): IngredientResult[] {
  if (!Array.isArray(raw)) return []
  const VALID_CONFIDENCE = new Set(['high', 'medium', 'low'])
  return raw
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map((i) => ({
      name: typeof i.name === 'string' ? i.name : 'Unknown',
      quantity: typeof i.quantity === 'string' ? i.quantity : null,
      unit: typeof i.unit === 'string' ? i.unit : null,
      confidenceLevel: VALID_CONFIDENCE.has(i.confidenceLevel as string)
        ? (i.confidenceLevel as 'high' | 'medium' | 'low')
        : 'low',
    }))
}
```

### Error Codes Reference

| Scenario | HTTP status | `code` value |
|---|---|---|
| Missing imageBase64 / mimeType | 400 | `INVALID_REQUEST` |
| Unsupported mimeType (not in image allowlist) | 400 | `INVALID_REQUEST` |
| imageBase64 payload exceeds size limit | 400 | `INVALID_REQUEST` |
| JSON parse error on request body | 400 | `INVALID_REQUEST` |
| Gemini API key missing from env | 503 | `SCAN_SERVICE_UNAVAILABLE` |
| Gemini timeout or API error | 503 | `SCAN_SERVICE_UNAVAILABLE` |
| Gemini returns unparseable / invalid JSON response | 422 | `GEMINI_RESPONSE_UNPARSEABLE` |
| Unhandled server error | 500 | `INTERNAL_ERROR` |

Never return HTTP 200 with an error body — use the correct status code always.

### Security Requirements (NFR05)

- `getApiKeys()` is `server-only` — safe to call in route handlers
- Never interpolate `apiKey` into error messages or logs
- Never include any part of the image data in error responses
- `import 'server-only'` at the top of each route file (belt-and-suspenders — route files ARE server-only but the import makes it explicit)

### Test Approach

**Environment:** Vitest with jsdom (`vitest.config.ts`). API routes run in Node environment but Vitest's jsdom environment is fine for route handler unit tests since we mock all I/O.

**Strategy:** Import and call the route handler function directly. Mock `@google/generative-ai` and `@/lib/api-keys`.

```typescript
// src/app/api/scan/menu/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

// Mock api-keys (server-only import will error in test env — mock the module)
vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ gemini: 'test-key', places: null, usda: null })),
}))

// Mock Gemini SDK
const mockGenerateContent = vi.fn()
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({
      generateContent: mockGenerateContent,
    }),
  })),
}))

// Mock server-only (prevents import error in test env)
vi.mock('server-only', () => ({}))

function makeRequest(body: object) {
  return new Request('http://localhost/api/scan/menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/scan/menu', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when imageBase64 is missing', async () => {
    const res = await POST(makeRequest({ mimeType: 'image/jpeg' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  it('returns 503 when Gemini key is not configured', async () => {
    const { getApiKeys } = await import('@/lib/api-keys')
    vi.mocked(getApiKeys).mockReturnValueOnce({ gemini: undefined, places: null, usda: null })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('SCAN_SERVICE_UNAVAILABLE')
  })

  it('returns 200 with dishes on valid Gemini response', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          dishes: [
            { name: 'Duck Confit', description: 'Crispy duck leg', calorieEstimate: 650 }
          ]
        })
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.type).toBe('menu')
    expect(body.data.confidenceSource).toBe('gemini-only')
    expect(body.data.scanId).toBeTypeOf('string')
    expect(body.data.dishes[0].name).toBe('Duck Confit')
    expect(body.data.dishes[0].imageUrl).toBeNull()
    expect(body.data.dishes[0].ingredients).toEqual([])
  })

  it('returns 503 when Gemini throws', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Service down'))
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('SCAN_SERVICE_UNAVAILABLE')
  })

  it('handles Gemini response wrapped in markdown fences', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '```json\n{"dishes":[{"name":"Steak Frites","description":"","calorieEstimate":null}]}\n```'
      }
    })
    const res = await POST(makeRequest({ imageBase64: 'abc', mimeType: 'image/jpeg' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dishes[0].name).toBe('Steak Frites')
  })
})
```

Dish route tests follow the same pattern; additionally verify that `ingredients` is populated from Gemini response and `confidenceLevel` defaults to `'low'` when invalid.

### Existing Code to Reuse

| Already exists | Location | Notes |
|---|---|---|
| `getApiKeys()` | `src/lib/api-keys.ts` | Returns `{ gemini, places, usda }` from env vars |
| `ApiError`, `ApiSuccess`, `ApiResponse` | `src/types/api.ts` | Use these envelopes |
| `IngredientResult` | `src/types/api.ts` | Already correct shape — no changes needed |
| `server-only` | Already in package.json | Use at top of route files |

### Anti-Patterns to Prevent

```typescript
// ❌ Do NOT call Gemini from the client — key exposure
// All Gemini calls MUST be in /api/* routes

// ❌ Do NOT log sensitive data
console.log('API key:', apiKey)         // NEVER
console.log('Image data:', imageBase64) // NEVER

// ❌ Do NOT return Gemini raw errors to client
return NextResponse.json({ error: error.message })  // may contain internal details

// ✅ Always use generic error messages
return NextResponse.json(
  { error: 'Gemini service unavailable', code: 'SCAN_SERVICE_UNAVAILABLE' },
  { status: 503 }
)

// ❌ Do NOT store image data
await supabase.storage.from('scans').upload(...)  // NOT in this story

// ❌ Do NOT use Response directly — use NextResponse
return new Response(JSON.stringify(data))  // ← skips Next.js conventions

// ✅ Use NextResponse.json()
return NextResponse.json({ data: scanResult })

// ❌ Do NOT make DishResult.ingredients optional
// ingredients?: IngredientResult[]  ← requires null-checks everywhere in UI

// ✅ Always return empty array for menu scan
ingredients: [],  // menu scan — populated only by dish scan or enrich route
```

### Previous Story Intelligence (Story 1.4)

From Story 1.4 completion:
- `CameraModal` at `src/components/scan/camera-modal.tsx` is currently a placeholder — Story 2.2 replaces it with the real camera UI; this story (2.1) only needs the API routes working
- `src/lib/api-keys.ts` is established and working — `getApiKeys()` returns correct keys from env vars
- All 62 tests were passing after Story 1.4 — do NOT regress them; the new tests in this story run in the same Vitest suite
- The test setup at `src/test/setup.ts` mocks `IntersectionObserver` and `matchMedia` — no changes needed for API route tests

### Architecture Enforcement

| Rule | Detail |
|---|---|
| Route location | `src/app/api/scan/*/route.ts` — exact paths from architecture spec |
| No Supabase in this story | Database writes are Story 2.x scope; no DB calls here |
| No `fetch` to Gemini directly | Use `@google/generative-ai` SDK — not raw `fetch` |
| `server-only` in routes | Prevents accidental client bundling |
| `crypto.randomUUID()` for scanId | Built into Node.js — no extra import needed |
| Next.js App Router export | Export named `POST` function — not default export |

## Resolved Design Decisions

### Menu scan ingredients shape

> **Spike finding:** Menu scans return only `name`, `description`, and `calorieEstimate` from Gemini — not a structured ingredient list. Dish scans return the full ingredient list.

**Decision:** `DishResult.ingredients` is always `IngredientResult[]` (never optional). Menu scan routes return `ingredients: []` (empty array). UI consumption is uniform — no null-checks needed, shape is consistent.

### Ingredient population strategy for menu scan dishes

**Decision:** Lazy load via a Gemini text-only call when the user opens the dish detail sheet — not upfront for all dishes on the results list.

**Mechanism (Story 2.3/2.4 scope):**
1. User taps a dish card from a menu scan result
2. Dish detail sheet opens — `ingredients` is `[]` at this point
3. The sheet fires a call to `POST /api/scan/enrich` with `{ scanId, dishName, description }`
4. Enrich route makes a Gemini **text-only** call (no image): *"List the typical ingredients for [dish name] — [description]. Return structured JSON with name, quantity, unit, and confidenceLevel per ingredient."*
5. If Gemini returns results, USDA FoodData Central cross-references the ingredient names for verification/quantity data (fallback: use Gemini result as-is)
6. Evidence block updates in place via TanStack Query cache update on `['scan-result', scanId]`

**Why lazy (not eager):** Most menu dishes are never tapped. Fetching ingredients for all 8+ dishes up-front on every scan would waste Gemini quota on dishes the user ignores.

**Why Gemini text first, USDA second:** Gemini handles composed dishes and restaurant-specific variations naturally. USDA is reliable for standardised ingredient data but weak on fusion/custom dishes. Using USDA as a cross-reference fallback gets the best of both.

**For Story 2.1 (this story):** No action required — `ingredients: []` in menu scan response is intentional and correct. The lazy population logic belongs in the enrich route (Story 2.4) and the dish detail sheet (Story 2.3).

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Fixed Vitest mock for `GoogleGenerativeAI` constructor: `vi.fn().mockImplementation(function(this))` required instead of arrow function due to constructor invocation pattern.

### Completion Notes List

- Updated `src/types/api.ts`: removed `overallConfidence`, added `calorieEstimate`, `imageUrl`, `ScanResult`; replaced `ScanResponse` with `ScanResult`; removed `mode` from `ScanRequest`.
- Created `src/app/api/scan/menu/route.ts`: POST handler with Gemini `gemini-2.0-flash`, menu scan prompt, defensive JSON parsing (strips markdown fences), 400/503 error handling, `server-only` import.
- Created `src/app/api/scan/dish/route.ts`: POST handler with dish scan prompt, full ingredient parsing with `confidenceLevel` defaulting to `'low'` on invalid values.
- Created `src/app/api/scan/menu/route.test.ts`: 10 tests covering 400/503 errors, valid response, markdown fences, API key exposure check.
- Created `src/app/api/scan/dish/route.test.ts`: 11 tests covering same cases plus ingredient parsing and confidenceLevel defaulting.
- All 83 tests pass (62 pre-existing + 21 new).

### File List

- `src/types/api.ts` — modified
- `src/app/api/scan/menu/route.ts` — new
- `src/app/api/scan/menu/route.test.ts` — new
- `src/app/api/scan/dish/route.ts` — new
- `src/app/api/scan/dish/route.test.ts` — new
- `package.json` — modified (added `@google/generative-ai`)
- `package-lock.json` — modified

### Change Log

- 2026-03-20: Story 2.1 implemented — Gemini scan API routes for menu and dish, type system updated, 21 tests added. All 83 tests pass.

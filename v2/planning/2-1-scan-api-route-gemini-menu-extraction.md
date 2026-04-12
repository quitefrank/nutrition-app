# Story 2.1: Scan API Route — Gemini Menu Extraction

Status: ready-for-dev
Epic: 2 — Menu Scan & Dish Auto-Capture
Story ID: 2.1
Story Key: 2-1-scan-api-route-gemini-menu-extraction
Created: 2026-04-12

---

## Story

As a user,
I want the app to extract all dish names, descriptions, and the restaurant name from a photo of a menu,
So that I never have to type anything after scanning.

---

## Acceptance Criteria

**AC1 — Validation error envelope (HTTP 422)**
**Given** a POST request to `/api/scan` with missing or malformed fields (no `imageBase64+mimeType` and no `photoUrl`)
**When** Zod validation runs
**Then** the route returns HTTP 422 with `{ error: { message: string; code: "VALIDATION_ERROR" } }` before any Gemini call is made

**AC2 — Success response**
**Given** a valid base64-encoded menu image is received
**When** Gemini 2.5 Flash processes it
**Then** the response is validated through a lenient Zod schema using `.catch()` fallbacks; the route returns HTTP 200 with `{ data: { restaurantName, dishes: [{ name, description }] } }`

**AC3 — Gemini fallback**
**Given** Gemini 2.5 Flash returns a 503 or 429
**When** the fallback triggers
**Then** the route retries with Gemini 2.0 Flash using the same request and Zod schema; the client receives HTTP 200 if the fallback succeeds

**AC4 — Both models fail**
**Given** both Gemini 2.5 Flash and Gemini 2.0 Flash fail
**When** the error is returned
**Then** the route returns HTTP 503 with `{ error: { message: string; code: "AI_UNAVAILABLE" } }`

**AC5 — BYOAK (Bring Your Own API Key)**
**Given** the `X-User-Gemini-Key` request header is present
**When** it is validated server-side
**Then** if it starts with "AI" and is ≥39 characters it is used in place of the system Gemini key; otherwise the system key is used

**AC6 — No image persistence**
**Given** the scan route handles the image
**When** the API call lifecycle ends
**Then** no image data is persisted server-side beyond the request

---

## This Is Brownfield — Audit First, Fix Second

**The scan route already exists at `src/app/api/scan/route.ts`.** Do NOT reinvent it. The existing implementation has rich functionality. Your task is to audit it against the ACs above and fix the specific discrepancies, then add tests.

### What is already correctly implemented

| Feature | Notes |
|---------|-------|
| `import 'server-only'` at top | Correct — enforces server boundary |
| `getApiKeys()` from `@/lib/api-keys` | Correct — server-only pattern |
| `supabase` imported from `@/lib/supabase` | Correct — singleton enforced |
| BYOAK (`X-User-Gemini-Key`) logic | Correct — starts with "AI", length ≥39 check |
| Gemini 2.5 Flash with 2.0 Flash fallback on 503/429/500 | Correct — matches AC3 |
| Lenient Zod schemas with `.catch()` for Gemini response | Correct — `DishSchema`, `GeminiResponseSchema` |
| Image type validation (JPEG, PNG, WEBP, HEIC, HEIF) | Correct — additional types beyond story scope are fine |
| Image size cap (10MB base64) | Correct |
| `photoUrl` path (server-side fetch) | Correct — additional feature used by restaurant search; do not remove |
| Menu cache lookup (`getCachedMenu`) | Correct — chain restaurant fast-path |
| Fire-and-forget menu caching (`cacheMenu`) | Correct |
| `crypto.randomUUID()` stable IDs on dishes | Correct |
| Top-level try/catch → 500 | Correct |

### What must be fixed (ACs violated)

**Issue 1 — Error envelope does not nest message**

The architecture contract (`architecture.md`, API & Communication Patterns) mandates:
```typescript
type ApiError = { error: { message: string; code?: string } }
```

The existing code returns flat objects `{ error: "...", code: "..." }` in ALL error paths. This violates the contract. Every error response must be updated to:
```typescript
{ error: { message: "...", code: "..." } }
```

**Issue 2 — Validation HTTP status must be 422, not 400**

Per AC1, missing/malformed request fields → HTTP 422 `VALIDATION_ERROR`.
Current code uses 400 for all validation failures. Change to 422.

**Issue 3 — Validation error code must be `VALIDATION_ERROR`**

Current code returns `INVALID_REQUEST` for Zod parse failures. The story AC specifies `VALIDATION_ERROR`. Update the code for the validation path only. Other error codes (`INVALID_REQUEST` for size/MIME rejections, `SCAN_UNAVAILABLE`/internal errors) are separate concerns — see below.

**Issue 4 — AI unavailable code must be `AI_UNAVAILABLE`**

Current code returns `SCAN_UNAVAILABLE` when both Gemini models fail. Per AC4, this must be `AI_UNAVAILABLE`. Update only the both-models-fail error response.

### Error code map after fix

| Scenario | HTTP | code |
|----------|------|------|
| No imageBase64+mimeType AND no photoUrl | 422 | `VALIDATION_ERROR` |
| Invalid MIME type | 400 | `INVALID_REQUEST` |
| Image too large | 400 | `INVALID_REQUEST` |
| photoUrl not HTTPS | 400 | `INVALID_REQUEST` |
| photoUrl fetch failed | 400 | `PHOTO_FETCH_FAILED` |
| No API key configured | 503 | `SCAN_SERVICE_UNAVAILABLE` |
| Both Gemini models fail | 503 | `AI_UNAVAILABLE` |
| Gemini non-JSON response | 422 | `GEMINI_RESPONSE_UNPARSEABLE` |
| Gemini invalid schema | 422 | `GEMINI_RESPONSE_INVALID` |
| No dishes found | 422 | `NO_DISHES` |
| Unexpected error | 500 | `INTERNAL_ERROR` |
| Invalid request body (JSON parse) | 400 | `INVALID_REQUEST` |

---

## Implementation Notes

### Error response helper (recommended)

To avoid repetition across the large number of error paths, consider a tiny inline helper at the top of the route file:

```typescript
function apiError(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status })
}
```

This keeps all error responses consistent without creating a shared utility (this is a one-file concern).

### Which error responses to update

Every `NextResponse.json({ error: "...", code: "..." }, ...)` in the file must become `NextResponse.json({ error: { message: "...", code: "..." } }, ...)`. The scan route has roughly 12 error return paths — update ALL of them. Do not miss the one inside the `photoUrl` fetch branch or the top-level catch.

### Do NOT change the Zod schemas

`DishSchema`, `IngredientSchema`, `GeminiResponseSchema`, and `RequestSchema` are all correctly implemented. Do not modify them.

### Do NOT change the Gemini prompt or model names

`SCAN_PROMPT`, `GEMINI_MODEL = "gemini-2.5-flash"`, `GEMINI_FALLBACK_MODEL = "gemini-2.0-flash"` are correct. Leave them as-is.

### Do NOT change the request schema

`RequestSchema` correctly accepts both `imageBase64+mimeType` and `photoUrl` paths. The `.refine()` constraint is correct.

---

## Tests Required

**Test file location:** `src/app/api/scan/route.test.ts`
(Co-located with the route — not in `__tests__/`. See architecture.md: "Tests co-located with source files.")

No scan route tests currently exist. Write them now.

### Testing approach

Use Vitest + `vi.mock()`. Mock `@google/generative-ai`, `@/lib/api-keys`, `@/lib/menuCache`, and `@/lib/supabase`. Do NOT make real network calls.

**Mock boilerplate:**
```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: vi.fn(),
    })),
  })),
}))

vi.mock('@/lib/api-keys', () => ({
  getApiKeys: vi.fn(() => ({ gemini: 'AItest123456789012345678901234567890' })),
}))

vi.mock('@/lib/menuCache', () => ({
  getCachedMenu: vi.fn().mockResolvedValue(null),
  cacheMenu: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))
```

### Required test cases

```
describe('POST /api/scan')
  ├── validation
  │   ├── missing imageBase64 and photoUrl → 422, code: VALIDATION_ERROR
  │   ├── imageBase64 present but no mimeType → 422, code: VALIDATION_ERROR
  │   └── invalid JSON body → 400, code: INVALID_REQUEST
  ├── BYOAK
  │   ├── valid X-User-Gemini-Key (starts "AI", ≥39 chars) → used for Gemini call
  │   └── invalid key (too short) → falls back to system key
  ├── Gemini success
  │   ├── valid menu image → 200, data.dishes array with name+description
  │   └── restaurantName extracted → present in response data
  ├── Gemini fallback
  │   ├── 2.5 Flash throws 503 → 2.0 Flash called → 200
  │   └── both models fail → 503, code: AI_UNAVAILABLE
  ├── response filtering
  │   ├── dishes with empty name → filtered out; valid dishes returned
  │   └── all dishes empty name → 422, code: NO_DISHES
  └── menu cache
      └── cache hit → Gemini NOT called; cached dishes returned with HTTP 200
```

### Helper to build test requests

```typescript
function makeReq(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/scan', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
```

---

## Architecture Guardrails

- **Never create a Supabase client inline.** Always `import { supabase } from "@/lib/supabase"`. The existing route already does this correctly — maintain it.
- **Never access API keys directly from `process.env`.** Use `getApiKeys()` from `@/lib/api-keys`. Already correct in the route.
- **All Gemini response parsing uses `safeParse` with fallbacks**, not `parse()`. The existing `GeminiResponseSchema.safeParse(jsonParsed)` is correct.
- **API route must return `{ data: T }` or `{ error: { message, code } }` exclusively.** No naked fields in the top-level response object.
- **`import 'server-only'` must remain at the top of the file.** Do not remove it.
- **No console.log with user-provided data (SEC-DAT-1.00).** The existing `console.log("[scan] using user-provided API key")` is safe — it logs nothing about the key value. Do not add any log statement that includes `imageBase64`, dish names from user input, or any user-provided text verbatim.

---

## File Scope

### Files to modify

| File | Change |
|------|--------|
| `src/app/api/scan/route.ts` | Fix error envelope format (nested `{ error: { message, code } }`), update validation to HTTP 422 + code `VALIDATION_ERROR`, update AI failure to code `AI_UNAVAILABLE` |

### Files to create

| File | Notes |
|------|-------|
| `src/app/api/scan/route.test.ts` | New test file, co-located with route |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/lib/menuCache.ts` | Correctly implemented; no changes needed |
| `src/lib/api-keys.ts` | Correctly implemented; no changes needed |
| `src/lib/supabase.ts` | Already throws on missing env vars (fixed in Story 1.1) |
| `src/types/database.ts` | Schema types are correct; no changes needed |
| Any UI component | This story is API-only |

---

## Key Context from Epic 2

Epic 2 delivers the full menu scan and auto-capture flow. Story 2.1 is the API foundation that all other Epic 2 stories depend on:
- Story 2.2 (Camera UI) calls `POST /api/scan` with `imageBase64 + mimeType`
- Story 2.3 (Restaurant Confirmation) uses the `restaurantName` from the scan response
- Story 2.6 (AI Ingredient & Macro Pipeline) uses a parallel Gemini call pattern similar to this route
- Story 2.8 (API Route Validation & Error Envelope) standardises ALL routes — getting this route's envelope right now prevents rework

The `photoUrl` path (already in the route) is used by the restaurant auto-scan feature (batched menu detection for restaurants discovered via Places API). Do not remove it.

---

## Relevant Previous Story Context

### From Story 1.1 — Infrastructure Hardening (done)
- `src/lib/supabase.ts` now throws at build time on missing env vars — the existing code is confirmed correct
- All Supabase access goes through the singleton at `@/lib/supabase`
- `src/lib/api-keys.ts` uses `import 'server-only'` to prevent key exposure to client bundle
- These fixes are DONE. Do not re-implement them.

### From Story 1.9 — PWA Manifest & Installability (done)
- No relevant learnings for this story

### From recent git commits
- `feat(v2): restaurant screen polish, menu detection batching, enrichment fix` — the scan route was enhanced to support `photoUrl` and batched detection; these enhancements are working and should not be reverted
- `fix(v2): guard Supabase client init against missing env vars at build time` — confirmed supabase.ts is already fixed

---

## Definition of Done

- [ ] All error responses in `src/app/api/scan/route.ts` use `{ error: { message: string; code: string } }` envelope (no flat `{ error: string, code: string }`)
- [ ] Validation failures return HTTP 422 with code `VALIDATION_ERROR`
- [ ] Both-models-fail scenario returns HTTP 503 with code `AI_UNAVAILABLE`
- [ ] All other error codes remain as documented in the error code map above
- [ ] `src/app/api/scan/route.test.ts` exists and covers all required test cases
- [ ] All tests pass (`vitest run`)
- [ ] TypeScript strict mode passes (`tsc --noEmit`)
- [ ] No regressions to existing functionality (cache path, photoUrl path, BYOAK, fallback)

---

## Dev Agent Record

_To be filled by the implementing agent._

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

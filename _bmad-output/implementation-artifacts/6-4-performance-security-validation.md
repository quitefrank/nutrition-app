# Story 6.4: Performance & Security Validation

**Status:** ready-for-dev
**Story ID:** 6.4
**Epic:** 6 — Accessibility, PWA & Production Readiness

---

## Story

As a product owner preparing for launch,
I want the app to meet all defined performance and security requirements,
So that Plately is fast, secure, and reliable for real dining use on iPhone Safari.

---

## Acceptance Criteria

**AC1 — Scan-to-result ≤10s (NFR01)**
Given a standard menu scan under normal network conditions on iPhone Safari
When measured end-to-end
Then scan submission to first result displayed is ≤10 seconds; the target of ≤5 seconds is achieved under good network conditions

**AC2 — Initial result within 500ms of scan completion (NFR02)**
Given confidence enrichment running after the initial scan result is displayed
When measured
Then the user sees the initial result within 500ms of scan completion; the enrichment update arrives and the evidence block updates without disrupting the displayed result

**AC3 — Cached view renders within 1s (NFR03)**
Given the recipe collection or grocery list with previously cached data
When rendered after at least one prior load
Then the view renders within 1 second from TanStack Query cache with no visible loading spinner

**AC4 — UI responds within 100ms (NFR04)**
Given all interactive elements on a test device
When tapped
Then UI responds with visual feedback within 100ms

**AC5 — No API keys in client bundle (NFR05)**
Given the complete production build
When the client-side bundle is inspected
Then no API key (`GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `USDA_API_KEY`) appears in any JS bundle, `NEXT_PUBLIC_` environment variable, or network response body or header

**AC6 — All requests use HTTPS (NFR06)**
Given all client-server communication
When inspected via network monitoring
Then all requests use HTTPS; no plaintext HTTP requests are made to any external endpoint

**AC7 — No image data persisted (NFR07)**
Given all API routes that handle scan images
When a scan request lifecycle completes
Then no binary image data has been written to Supabase storage, any filesystem path, or any persistent location; the image exists only within the in-memory request lifecycle

**AC8 — No PII collected or stored (NFR08)**
Given all server-side and client-side code in the production build
When audited
Then no user device identifiers, IP addresses, location coordinates, or behavioural event logs are collected, stored, or transmitted; no PII of any kind appears in Supabase tables, logs, or external API calls

---

## Tasks / Subtasks

### Task 1: Performance Audit — Scan Latency (AC1, AC2)

- [ ] Measure end-to-end scan latency on iPhone Safari (or iOS Simulator): submit a standard JPEG menu image to `POST /api/scan/menu`, time from submission to `ScanResults` rendering first dish card
- [ ] If Gemini response consistently exceeds 5s at P50, investigate: large image payload (`MAX_IMAGE_BASE64_LENGTH` is currently 10MB encoded — consider reducing to 4–5MB for mobile captures), prompt token count, Gemini model tier
- [ ] Verify enrichment async pattern: confirm `POST /api/scan/enrich` fires immediately after scan result is received by the client; measure time from scan result render to enrichment response arrival; confirm evidence block update does not cause layout shift or result disruption
- [ ] If enrichment arrival causes a visible flash or disruption, add a CSS `transition: opacity 200ms ease` to the evidence block element; do not add animations elsewhere
- [ ] Document measured P50 and P95 latencies in this story's Dev Agent Record (not in production code)

### Task 2: Performance Audit — Cache Render Time (AC3)

- [ ] In `src/app/page.tsx` (recipe collection home) and `src/app/grocery/page.tsx`, verify TanStack Query keys are stable across re-renders and hot-module reloads
- [ ] Manually test: navigate away from Home, return — confirm recipe cards render without a loading spinner if data is already in cache (`staleTime` setting)
- [ ] If a loading spinner appears on cached data returns, set `staleTime: 5 * 60 * 1000` (5 minutes) in the relevant `useQuery` calls — cached data is fresh enough for personal use; network revalidation happens in background
- [ ] Same check for grocery list: navigate away and back; no spinner should flash when data is cache-warm
- [ ] Confirm PWA service worker caches `/api/recipes` and `/api/grocery` GET responses (already configured in `next.config.ts` with `NetworkFirst` — verify this is working by testing offline read)

### Task 3: Performance Audit — UI Response Time (AC4)

- [ ] Test all interactive elements on a physical or simulated device: tab bar items, CTA buttons, dish cards, grocery checkboxes, bottom sheet drag handle, camera FAB
- [ ] If any element has `onClick` handlers with synchronous heavy computation before visual feedback, add optimistic UI state update (e.g., `setLoading(true)`) as the first line of the handler
- [ ] Verify glass card press states exist — `active:opacity-70` or equivalent Tailwind active variant; check `src/components/ui/glass-card.tsx` and all `<button>` elements
- [ ] Grocery checkbox tap: confirm `useMutation` uses optimistic update (`onMutate`) to toggle checked state immediately without waiting for Supabase response
- [ ] Recipe save CTA: confirm `useSaveRecipe` mutation sets a local `isSaving` state visible to the user within one event loop tick

### Task 4: Security Audit — API Key Isolation (AC5)

- [ ] Run `npm run build` and then `grep -r "GEMINI_API_KEY\|GOOGLE_PLACES_API_KEY\|USDA_API_KEY" .next/static/` — must return no matches
- [ ] Run `grep -r "NEXT_PUBLIC_SUPABASE_ANON_KEY\|NEXT_PUBLIC_SUPABASE_URL" .next/static/` — these should appear (they are intentionally public); confirm no private keys appear alongside them
- [ ] Audit `src/lib/api-keys.ts` — `getApiKeys()` must be `import 'server-only'`-guarded (it already is); confirm no API route imports keys via any other path
- [ ] Search all source files for direct `process.env.GEMINI_API_KEY` or `process.env.GOOGLE_PLACES_API_KEY` access outside of `src/lib/api-keys.ts` — must find none
  ```bash
  grep -r "process\.env\.GEMINI\|process\.env\.GOOGLE_PLACES\|process\.env\.USDA" src/ --include="*.ts" --include="*.tsx"
  ```
- [ ] Verify all external API responses are parsed server-side and only the structured result is forwarded to the client; no raw Google Places or Gemini API response bodies are proxied verbatim
- [ ] Document findings (pass/fail per check) in Dev Agent Record below

### Task 5: Security Audit — HTTPS Enforcement (AC6)

- [ ] Review `src/app/api/scan/enrich/route.ts` — all `fetch()` calls to `https://places.googleapis.com` and USDA endpoints must use `https://`; confirm no `http://` URLs in any API route
  ```bash
  grep -rn "http://" src/app/api/ --include="*.ts"
  ```
- [ ] Review `src/app/api/search/` routes — confirm Google Places search calls use `https://places.googleapis.com/v1/`
- [ ] Review USDA FoodData Central calls — the base URL must be `https://api.nal.usda.gov/`
- [ ] Confirm Supabase client URL (`NEXT_PUBLIC_SUPABASE_URL`) will be an `https://` URL in production (Supabase always provides HTTPS; document this as confirmed)
- [ ] On a staging/Vercel preview deployment, use browser DevTools Network tab to verify: all requests from the client are `https://`; no mixed-content warnings appear in the browser console

### Task 6: Security Audit — Image Data Lifecycle (AC7)

- [ ] Audit `src/app/api/scan/menu/route.ts` and `src/app/api/scan/dish/route.ts` — confirm the `imageBase64` variable is only passed to `model.generateContent(...)` and never to any `supabase.storage.upload()`, `fs.writeFile()`, or similar persistent call
- [ ] Confirm no Supabase storage bucket for images exists in the project (schema has no storage calls; verify `supabase/schema.sql` has no storage bucket creation)
- [ ] Confirm `dish_image_url` column in `recipes` table stores only URL strings (externally hosted Google Places CDN URLs) — never base64 data or binary
- [ ] Add a code comment to both scan routes directly above the Gemini call confirming the lifecycle:
  ```typescript
  // SEC-DAT-1.00: imageBase64 is passed to Gemini in-memory and discarded after this call.
  // No image data is written to storage, filesystem, or database. (NFR07)
  ```
- [ ] Verify the scan request handler has no `await supabase.storage...` or filesystem write calls anywhere in the execution path

### Task 7: Security Audit — PII Non-Collection (AC8)

- [ ] Search all `console.log`/`console.error` calls in API routes for any that might inadvertently log request headers (which could include IP or user-agent):
  ```bash
  grep -rn "console\.\(log\|error\|warn\)" src/app/api/ --include="*.ts"
  ```
  Confirm no log statement outputs `req.headers`, `request.ip`, user-agent strings, or geolocation data
- [ ] Review the Supabase schema (`supabase/schema.sql`) — confirm no `ip_address`, `user_agent`, `device_id`, `location`, `latitude`, `longitude`, or event-log columns exist in any table
- [ ] Review `src/app/api/search/restaurants/route.ts` — Google Places search accepts a text query only; confirm no geolocation coordinates from the device are included in the Places API request body
- [ ] Confirm `src/hooks/use-search.ts` and the search screen (`src/app/search/page.tsx`) do not call `navigator.geolocation.getCurrentPosition()` or include coordinates in search requests
- [ ] Review `public/sw.js` and `src/sw/` (service worker) — confirm no analytics, beacon, or event-logging calls exist in the service worker
- [ ] Document findings in Dev Agent Record below

### Task 8: Final Build Verification

- [ ] Run `npm run build` — must complete with zero errors
- [ ] Run `npm test` — all existing tests must pass (pre-existing failures documented in 5.3 Dev Agent Record are acceptable if unchanged)
- [ ] Run `npm run lint` — zero lint errors
- [ ] Confirm build output size is reasonable: check `.next/static/chunks/` for any unexpectedly large bundles that might indicate accidental server-only code inclusion in the client bundle

---

## Dev Notes

### Architecture Compliance

This is a **validation and audit story** — no new features are built. The primary output is:
1. Confirmed compliance with NFR01–NFR08
2. Minor remediation where gaps are found (performance tuning, UI feedback improvements, code comments)
3. Documented findings in the Dev Agent Record below

| Concern | Requirement |
|---|---|
| `import 'server-only'` | Already present in `src/lib/api-keys.ts` — all API key access is server-gated |
| No new API routes | This story does not add routes; it audits existing ones |
| No schema changes | The Supabase schema is not modified; the audit confirms no PII columns exist |
| Test suite | All existing tests must remain passing; this story may add new audit-driven tests if regressions are found |

### API Key Architecture (Reference)

`src/lib/api-keys.ts` — the single source of truth for external API keys:

```typescript
import 'server-only'

export function getApiKeys() {
  return {
    gemini: process.env.GEMINI_API_KEY,
    places: process.env.GOOGLE_PLACES_API_KEY,
    usda: process.env.USDA_API_KEY,
  }
}
```

Every API route that calls an external service must call `getApiKeys()`. Direct `process.env.GEMINI_API_KEY` access anywhere else is a security violation. The `import 'server-only'` directive causes a build-time error if this module is imported from a Client Component.

### Image Lifecycle Architecture (Reference)

The `POST /api/scan/menu` and `POST /api/scan/dish` routes:
1. Receive `imageBase64` + `mimeType` in the request body
2. Validate MIME type and size
3. Pass `imageBase64` directly to `model.generateContent([{ inlineData: ... }, ...])` as an in-memory inline-data part
4. The Gemini SDK sends it over the network to the Gemini API — the local `imageBase64` string is then eligible for garbage collection
5. No `supabase.storage.upload()`, no `fs.writeFile()`, no database INSERT of binary data occurs anywhere

The `dish_image_url` column in `recipes` stores only the `photoUri` string returned by Google Places (an `https://` CDN URL). This is validated in the enrich route:
```typescript
return typeof photoUri === 'string' && photoUri.startsWith('https://') ? photoUri : null
```

### Performance Optimization Reference

**Scan latency (NFR01):** The main lever is image payload size. The current `MAX_IMAGE_BASE64_LENGTH` limit is 10MB encoded (≈7.5MB binary). iPhone Safari camera captures are typically 2–5MB JPEG. If Gemini latency is consistently above 5s, the first investigation should be reducing this limit to 4–5MB encoded (≈3MB binary) — iPhone camera images at 75% quality are typically well within this range and quality is sufficient for text/dish recognition.

**Enrichment async pattern (NFR02):** The client fires `POST /api/scan/enrich` immediately after receiving the scan result (before the user interacts). The processing strip dismisses on scan completion. The evidence block updates silently when enrichment returns. This is implemented in `src/hooks/use-scan.ts` — review this hook to confirm the parallel fire pattern is correct.

**TanStack Query cache (NFR03):** Default `staleTime` in TanStack Query v5 is `0` (always refetch on mount). For recipe and grocery views, the data changes only when the user mutates it — setting `staleTime: Infinity` or `staleTime: 5 * 60 * 1000` eliminates the loading flash on cached returns. The service worker `NetworkFirst` handler in `next.config.ts` also provides offline reads for these routes.

**UI response (NFR04):** All `<button>` and tappable elements must have an `active:` Tailwind variant or CSS `:active` state. The most common gap is custom `<div onClick=...>` elements that have no visual active state. Audit `src/components/` for these patterns.

### HTTPS Enforcement Reference

All external `fetch()` calls in the codebase use `https://`:
- Google Places: `https://places.googleapis.com/v1/places:searchText`
- Google Places media: `https://places.googleapis.com/v1/${photoName}/media`
- USDA FoodData Central: `https://api.nal.usda.gov/fdc/v1/foods/search`

The Supabase client connects to `https://${NEXT_PUBLIC_SUPABASE_URL}` — always HTTPS on Supabase's infrastructure.

Vercel automatically provisions TLS for the app domain — no client-to-server HTTP is possible in production.

### PII Non-Collection Reference

The app has no authentication layer (FR38) — there are no user accounts, sessions, or user identifiers to collect. The data model stores only:
- Restaurant names and Google Places IDs (public data)
- Recipe names and ingredient lists (user-created, not personally identifying)
- Grocery item check state (local functional data)

The search feature accepts a restaurant name text query. The Google Places API call does not include device geolocation — the `textQuery` field is the only input. This is by design (the architecture explicitly states "Google Places calls are gated behind user-confirmed restaurant selection, not fired on keystroke").

### File Locations to Audit

| File | AC | What to check |
|---|---|---|
| `src/lib/api-keys.ts` | AC5 | `import 'server-only'` present; no other file imports keys |
| `src/app/api/scan/menu/route.ts` | AC5, AC7 | No key in response; `imageBase64` not persisted |
| `src/app/api/scan/dish/route.ts` | AC5, AC7 | No key in response; `imageBase64` not persisted |
| `src/app/api/scan/enrich/route.ts` | AC5, AC6 | HTTPS only; no key in response |
| `src/app/api/search/restaurants/route.ts` | AC6, AC8 | HTTPS; no geolocation in request |
| `src/app/api/search/restaurants/[googlePlacesId]/dishes/route.ts` | AC5, AC6 | HTTPS; `getApiKeys()` usage |
| `src/app/api/search/dishes/route.ts` | AC5, AC6 | HTTPS; `getApiKeys()` usage |
| `src/app/api/recipes/route.ts` | AC8 | No PII columns in INSERT |
| `supabase/schema.sql` | AC8 | No PII columns in schema |
| `public/sw.js` / `src/sw/` | AC8 | No analytics or event logging |
| `src/hooks/use-scan.ts` | AC2 | Enrichment fires immediately after scan result |
| `src/app/page.tsx` | AC3 | `staleTime` on recipe query |
| `src/app/grocery/page.tsx` | AC3 | `staleTime` on grocery query |
| `next.config.ts` | AC3 | `NetworkFirst` workbox rule covers `/api/recipes` and `/api/grocery` |

### Remediation Scope

This story is intentionally narrow. Do NOT:
- Add new features or screens
- Refactor existing working code for style reasons
- Change the data model or schema
- Modify any tests that are currently passing

DO:
- Add `staleTime` to query calls where it prevents unnecessary loading spinners
- Add `active:` Tailwind variants to tappable elements that lack visual feedback
- Add `transition: opacity 200ms ease` to the evidence block if enrichment causes disruption
- Add the `// SEC-DAT-1.00:` comment to scan routes (Task 6)
- Fix any genuinely failing security checks (unexpected `http://` URL, key appearing in bundle)

### Testing Strategy

No new test files are expected. The audit is primarily manual and code-review based. If a security or performance issue is found and fixed, add a regression test to the appropriate existing test file.

Run before marking complete:
```bash
npm run build
npm test
npm run lint
```

For bundle inspection after build:
```bash
# Check no private API keys leaked into client bundles
grep -r "GEMINI\|GOOGLE_PLACES\|USDA_API" .next/static/ 2>/dev/null && echo "FAIL: key found in bundle" || echo "PASS: no keys in bundle"

# Check no http:// URLs in API routes
grep -rn "http://" src/app/api/ --include="*.ts" && echo "WARN: http:// found" || echo "PASS: all HTTPS"

# Check no direct process.env key access outside api-keys.ts
grep -rn "process\.env\.GEMINI\|process\.env\.GOOGLE_PLACES\|process\.env\.USDA" src/ --include="*.ts" --include="*.tsx" | grep -v "api-keys.ts" && echo "FAIL: direct key access found" || echo "PASS: all keys via getApiKeys()"
```

---

## Dev Agent Record

### Agent Model Used

_TBD_

### Debug Log References

_None at story creation._

### Completion Notes List

_To be filled by the implementing agent._

#### Security Audit Findings

| Check | Result | Notes |
|---|---|---|
| No API keys in `.next/static/` | — | — |
| `import 'server-only'` in api-keys.ts | PASS (verified pre-story) | Already present |
| No direct `process.env.*` key access outside api-keys.ts | — | — |
| All external fetch() use `https://` | — | — |
| No `imageBase64` persisted in scan routes | — | — |
| No PII columns in Supabase schema | — | — |
| No geolocation in Places search request | — | — |
| No analytics in service worker | — | — |

#### Performance Audit Findings

| Check | Result | Notes |
|---|---|---|
| Scan P50 latency (ms) | — | — |
| Scan P95 latency (ms) | — | — |
| Enrichment arrival time (ms) | — | — |
| Cached recipe view render time | — | — |
| Cached grocery view render time | — | — |
| UI tap feedback latency | — | — |

### File List

**Potentially modified (if remediations needed):**
- `src/app/api/scan/menu/route.ts` — SEC-DAT-1.00 comment + any image lifecycle confirmation
- `src/app/api/scan/dish/route.ts` — SEC-DAT-1.00 comment
- `src/app/page.tsx` — `staleTime` addition if needed
- `src/app/grocery/page.tsx` — `staleTime` addition if needed
- Any component with missing `active:` Tailwind variant

**Not modified:**
- `src/lib/api-keys.ts` — already correct; do not change
- `supabase/schema.sql` — no PII columns to remove (confirmed correct)
- `next.config.ts` — HTTPS/PWA config already correct

---

## Change Log

- 2026-03-28: Story 6.4 created — Performance & Security Validation (epic 6, story 4)

---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories']
inputDocuments:
  - 'planning/prd.md'
  - 'planning/architecture.md'
  - 'planning/ux-design-specification.md'
  - 'planning/implementation-readiness-report-2026-04-11.md'
  - '_context/epics.md'
  - '_context/project-context.md'
project_name: 'Plately v2'
user_name: 'Frank'
date: '2026-04-12'
---

# Plately v2 - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Plately v2, decomposing the requirements from the PRD, UX Design Specification, and Architecture into implementable stories.

---

## Requirements Inventory

### Functional Requirements

**Menu Capture**
- FR1: User can capture a restaurant menu using the device camera
- FR2: System can extract dish names and descriptions from a captured menu image
- FR3: System can extract a restaurant name from a captured menu image
- FR4: User can confirm, correct, or skip the automatically detected restaurant name
- FR5: User can search for a restaurant by name to associate with an unidentified scan
- FR6: System displays a scan confidence indicator showing how many dishes were successfully recognised

**Restaurant Discovery**
- FR7: User can search for a restaurant by name
- FR8: System can populate a restaurant's full dish collection from a search result
- FR9: System can retrieve previously cached dish data for a restaurant without requiring a new scan

**Dish Display & Progressive Disclosure**
- FR10: User can view a dish card showing macro summary (calories, protein, carbs, fat) and a photo
- FR11: User can expand a dish card to reveal the dish's typical ingredient list
- FR12: User can access cooking instructions for a dish only after choosing to make it at home — not on card expansion
- FR13: System does not display cooking instructions at the dish card or ingredient-view level
- FR14: System displays a data provenance indicator when macro data is sourced from USDA FoodData Central
- FR15: System visually distinguishes AI-estimated macros from USDA-verified macros

**Dish Photo System**
- FR16: System displays a real photograph for a dish when a Google Places photo is available
- FR17: System displays a styled placeholder tile for a dish that was recognised but has no available photo
- FR18: System suppresses dish cards for dishes that could not be recognised from the menu scan
- FR19 _(Growth — pending test)_: System evaluates whether providing a Google Places dish photo to the AI alongside the dish name improves ingredient accuracy; promotes to feature only if testing confirms meaningful improvement

**Nutritional Data & Ingredient Sourcing**
- FR20: System infers typical ingredients for a dish from its name and cuisine context using AI knowledge — not from visual photo analysis
- FR21: System calculates macro totals (calories, protein, carbs, fat) for each recognised dish
- FR22: System sources macro data from USDA FoodData Central as the primary authoritative source
- FR23: System labels macro values that could not be verified against USDA as estimated
- FR24: User can adjust the serving portion of a dish and receive recalculated macros

**Collection Management**
- FR25: System automatically adds all recognised dishes from a menu scan or restaurant search to the user's restaurant collection — no explicit save action required
- FR26: User can view all restaurants in their collection
- FR27: User can view all dishes associated with a specific restaurant
- FR28: User can remove an entire restaurant and all its associated dishes from their collection
- FR29: User can add a restaurant dish to their personal Recipes collection by choosing to make it at home
- FR30: User can view all dishes in their personal Recipes collection
- FR31: User can remove a dish from their personal Recipes collection

**Graceful Failure & Progressive Recovery**
- FR32: System displays a scan confidence banner when not all dishes from a menu were recognised
- FR33: User can retake a photo to attempt recognition of previously unread dishes (scan path)
- FR34: System can fetch additional menu images from Google Places to attempt recognition of unread dishes (search path)
- FR35: User can manually add a dish name when automatic recognition fails
- FR36: User can accept a partial dish set and proceed without resolving unrecognised dishes
- FR37: System renders a non-broken placeholder when a Google Places photo fetch fails or returns no result

**System & Data Reliability**
- FR38: System validates all inputs to API routes against a defined schema before processing
- FR39: System validates all external API responses (Gemini, Google Places, USDA) against expected schemas before using the data
- FR40: User can access their saved restaurant collection and Recipes without an internet connection (read-only)
- FR41: System handles failures from any external API without crashing or rendering a broken UI
- FR42: All database schema changes are applied through versioned, numbered migration files

**Platform, Navigation & Settings**
- FR43: User can install Plately as a PWA on their iPhone home screen
- FR44: System caches Google Places restaurant data after first fetch to avoid redundant API calls on subsequent views
- FR45: Recipes is accessible as a primary bottom navigation destination
- FR46: Settings is accessible via a persistent header control — not a primary navigation tab
- FR47: Settings provides a complete data reset function to clear all restaurants, dishes, and recipes

**Growth Features _(Phase 2)_**
- FR48 _(Growth)_: User can view cooking instructions for a dish in their Recipes collection (persistent access after initial "Make it at home" action)
- FR49 _(Growth)_: User can generate a grocery ingredient list from a dish in their Recipes collection
- FR50 _(Growth)_: User can import a dish from a URL and have it added to their Recipes collection
- FR51 _(Growth)_: System caches a scanned restaurant menu so repeat visits do not require re-scanning
- FR52 _(Growth)_: System generates an AI-created placeholder image for a recognised dish with no Google Places photo

---

### NonFunctional Requirements

**Performance**
- NFR1: Menu scan → all dish cards rendered with macros completes in ≤10 seconds on LTE
- NFR2: Restaurant search → all dish cards rendered completes in ≤5 seconds on LTE
- NFR3: First Contentful Paint on cold app load ≤3 seconds on LTE
- NFR4: Individual dish photo loads within ≤2 seconds on LTE (Google Places CDN delivery)
- NFR5: Macro recalculation on portion adjustment completes in ≤100ms — client-side computation, no API round-trip
- NFR6: Offline collection read is immediate — no network dependency for cached data

**Security**
- NFR7: All third-party API keys (Gemini, Google Places, USDA) are accessible only from server-side Next.js API routes — never present in the client bundle
- NFR8: User-captured images are transmitted to Gemini for inference only and are not persisted server-side beyond the API call lifecycle
- NFR9: No personally identifiable information is written to application logs
- NFR10: Supabase client initialisation validates required environment variables at build time and throws a descriptive error immediately — not silently at runtime

**Accessibility**
- NFR11: All screens meet WCAG 2.1 Level AA compliance
- NFR12: All interactive elements have a minimum touch target of 44×44px
- NFR13: Async state changes (enrichment progress, scan confidence banner) are announced via `aria-live="polite"` regions using text content mutation — not `aria-label` attribute mutation (v1 regression fix)
- NFR14: Core navigation and dish browsing are functional with VoiceOver enabled on iOS

**Integration Reliability**
- NFR15: Failure of any single external API (Gemini, Google Places, USDA) does not crash the application or render a broken UI — each has a defined degraded state
- NFR16: Google Places photo fetch failures degrade to the warm placeholder tile — no broken `<img>` elements rendered
- NFR17: USDA lookup failures degrade to AI-estimated macro display with visual labelling — macros are never silently absent
- NFR18: Gemini parsing failures surface a specific, actionable error state with retry options — not a generic error message
- NFR19: Google Places API calls are batched per restaurant and cached after first fetch — no per-dish individual requests

---

### Additional Requirements

Architecture-derived technical requirements that directly impact epic and story sequencing:

**Infrastructure Fixes (must complete before feature work):**
- ARCH1: Fix `src/lib/supabase.ts` to throw (not warn) on missing env vars — NFR10 compliance; currently `console.warn`s and substitutes placeholder strings enabling silent runtime failures
- ARCH2: Enforce Supabase singleton — all files must import from `@/lib/supabase`; fix existing violations in `scan/route.ts` (creates inline client in fire-and-forget block) and `supabaseAutoSave.ts` (creates own client via local `getClient()`)
- ARCH3: Consolidate migration patches 002–008 into a clean canonical migration (`009_canonical_baseline.sql` exists but confirm); establish migration-first as the non-negotiable rule — no `ALTER TABLE` outside numbered migration files

**Data Architecture:**
- ARCH4: Implement two-collection model via `recipes.status` enum (`auto_captured` | `kept` | `removed`); "Restaurant collection" = all non-removed recipes for a restaurant; "My Recipes" = `status = 'kept'`; removal is always soft — no row deletion; all collection queries must filter by status
- ARCH5: Implement photo state machine — `photo_status` column (`confirmed` | `placeholder` | `suppressed`) stored per recipe row; drives both card rendering decisions and layout (suppressed = no card rendered)
- ARCH6: 5-table schema: `restaurants`, `restaurant_visits`, `recipes`, `recipe_ingredients`, `grocery_items`; `restaurant_visits` stores `visit_type: 'scan' | 'search'` and `raw_menu_json`

**API Patterns:**
- ARCH7: All API routes return `{ data: T }` on success or `{ error: { message: string; code?: string } }` on error — no other response shapes; HTTP status codes follow REST conventions (200, 400, 422, 500, 503)
- ARCH8: Zod validation at every API boundary — lenient schemas (`.catch()` fallbacks, use `safeParse`) for Gemini responses; strict schemas (throws, use `parse`) for API route inputs and USDA responses
- ARCH9: Gemini fallback: primary Gemini 2.5 Flash → fallback Gemini 2.0 Flash on 503/429 transient errors; both share the same Zod response schema
- ARCH10: BYOAK support via `X-User-Gemini-Key` request header (validated server-side: must start with "AI", length ≥ 39); falls back to system Gemini key when absent

**Frontend Architecture:**
- ARCH11: Implement glass token system in `src/app/globals.css`: `--glass-base`, `--glass-elevated`, `--glass-overlay`, `--glass-sunken`, `--blur-base`, `--blur-elevated`, `--blur-heavy`, `--border-glass`, `--border-glass-strong`, `--shadow-float`, `--shadow-card`
- ARCH12: Progressive enrichment pattern: Gemini result renders immediately (Phase 1); Places + USDA resolve async and update dish cards in-place (Phase 2); pattern is identical for both scan and search paths; UI never blocks waiting for enrichment
- ARCH13: Scan state transport: Gemini result written to `sessionStorage["plately:scan:{uuid}"]` after Phase 1; recipe detail page reads `sessionStorage` on mount, then picks up real Supabase UUID via `plately:supabase-saved` custom event once `supabaseAutoSave` completes
- ARCH14: Create `src/lib/springs.ts` with named Framer Motion spring presets (`SPRING_CARD_EXPAND`, `SPRING_TAB_TRANSITION`, etc.) before any animation implementation
- ARCH15: Atmospheric background layer is persistent at root layout level (`app/layout.tsx`); falls back to warm cream gradient when no food photo is available

**Process Patterns:**
- ARCH16: TanStack Query key conventions: `["recipes"]`, `["recipes", restaurantId]`, `["recipe", recipeId]`, `["restaurants"]`, `["grocery"]`, `["restaurant", restaurantId]`; always use `invalidateQueries` after mutations — never manual cache writes
- ARCH17: Optimistic updates only for low-stakes UX (grocery item check/uncheck); never mutate query data in-place — use `setQueryData` with a new object reference
- ARCH18: API key isolation: all external keys server-side only via `src/lib/api-keys.ts` (`import 'server-only'`); `NEXT_PUBLIC_` vars limited to Supabase URL and anon key

---

### UX Design Requirements

**Design System Foundation:**
- UX-DR1: Implement glass token system — all 4 surface tokens (`--glass-base`, `--glass-elevated`, `--glass-overlay`, `--glass-sunken`), all 3 blur tokens (`--blur-base`, `--blur-elevated`, `--blur-heavy`), border and shadow tokens; every interactive surface must use these tokens — no solid backgrounds on interactive surfaces; nav bar must become a floating frosted glass pill (not flat full-width bar); cards must use `--glass-base` + `--blur-base` (not solid dark backgrounds)
- UX-DR2: Implement atmospheric background rule — every screen must have a blurred food photo as its base layer (`filter: blur(40px) saturate(1.3)`, `transform: scale(1.05)`) + warm cream gradient overlay; this is the condition that makes glass surfaces work; without a rich background, frosted glass looks like a plain white panel
- UX-DR3: Implement full color token system — background/surface scale (`--color-bg-base: #FAFAF7`, `--color-bg-elevated`, `--color-bg-sunken`), text scale (primary `#1A1612` through disabled `#C4BDB5`), accent tokens (terracotta `--color-accent: #C4622D`, tint, dark), status tints (error/success/warning)
- UX-DR4: Implement typography system — Playfair Display (display/hero text only) + DM Sans (all UI); 8-level scale: Caption (11px/400–500) → Label (13px/500) → Body (15px/400, line-height:1.6) → H4 (17px/600) → H3 (20px/600) → H2 (24px/600) → Display (32px/700); rem units throughout for Dynamic Type support
- UX-DR5: Implement spacing & layout foundation — 4px base unit, 8-token spacing scale (--space-1: 4px through --space-8: 32px); app-shell: `max-width:430px margin:0 auto min-height:100dvh`; screen-content: `padding-bottom: calc(62px + max(env(safe-area-inset-bottom, 0px), 8px) + 32px)`; nav-bar-container: `padding-bottom: calc(max(env(safe-area-inset-bottom, 0px), 8px) + 12px)`

**Navigation & Shell:**
- UX-DR6: Implement FloatingNavBar — two sibling children: frosted glass capsule pill (`flex:1`, 62px height, `border-radius:9999px`, `--glass-elevated` + `--blur-elevated`) + terracotta camera circle (62×62px, `#C4622D`); fixed bottom, 16px side padding, 20px bottom padding; `role="navigation"` on pill; camera `aria-label="Scan a menu"`; NOT edge-to-edge, NOT embedded inside pill, NOT a tab
- UX-DR7: FloatingNavBar states — Tab inactive: stroke icon + tertiary label (`#9E9589`); Tab active: filled icon + terracotta label (`#C4622D`); Camera pressed: `scale(0.88)` spring; tab switch: 250ms ease-out cross-fade (no slide animation); tab switch also by full-page horizontal swipe (velocity threshold >300px/s)

**Core Components — Restaurant Screen:**
- UX-DR8: Implement DishRowCompact — `72×72px` photo thumbnail (`11px` radius) + right column: dish name (14px semibold) + tags (11px tertiary) + macro row (calorie 14px semibold terracotta `#C4622D` + macro chips P/C/F); ~90px auto height; `--glass-base` + `--blur-base` + `18px` radius + `--shadow-card`; `role="button"` + `aria-expanded` + `aria-label="[Dish name], [cal] calories"`; tap → expands in-place to DishRowExpanded, chevron rotates 90deg
- UX-DR9: Implement DishRowExpanded — in-place accordion expansion (`spring stiffness:400 damping:22`, `height: 0 → auto`); hero photo 156px; dish name (Playfair 19px) + calorie (19px semibold terracotta); MacroBar; ingredient highlights; "Add to My Recipes" CTA pill (42px height, terracotta fill); `--glass-elevated` + `--blur-elevated` + `20px` radius; only one dish expanded at a time — tapping a second auto-collapses the first; NOT a new page push, NOT a modal overlay
- UX-DR10: Implement MacroBar — 4 equal-width flex cells: Protein / Carbs / Fat / Fibre; each cell: uppercase label 9px semibold tertiary + value 14px semibold primary; inter-cell dividers `rgba(180,170,158,0.14)`; `rgba(244,242,238,0.5)` fill + `11px` radius + `--border-glass`; display only (no interactivity); used inside DishRowExpanded
- UX-DR11: Implement FilterPillRow — `overflow-x:auto` scroll container, `gap:7px`; active pill: terracotta fill + white text + `9999px` radius + `30px` height; inactive pill: `--glass-base` + secondary text + `--border-glass`; `role="group"` `aria-label="Filter by category"`, each pill `role="radio"` with `aria-checked`
- UX-DR12: Implement ScanConfidenceBanner — amber tint surface (`rgba(251,243,226,0.95)`); count text ("8 of 10 dishes read") + secondary text + 3 recovery actions (Retake / Add manually / Continue with N); slides up from bottom of restaurant screen content, above nav bar; `spring stiffness:380 damping:24`; `role="alert"` `aria-live="assertive"`

**Core Components — Home Screen:**
- UX-DR13: Implement EmptyState (Home State 0) — centered column: 52px icon + Playfair 22px title ("Take home the food you love") + 13px body max 210px wide + terracotta pill CTA (50px height, 9999px radius, "📷 Scan a menu"); no empty placeholder cards; no section headers until content exists; `role="main"`, CTA `aria-label="Open camera to scan a menu"`
- UX-DR14: Implement HeroCard — full-width; photo strip with dark gradient overlay, restaurant name + meta overlaid bottom-left; card body with dish thumbnail row (52×52px mini cards) + footer (dish count + "View all ›"); State 1: 148px photo; State 2+: 112px photo; height transition `400ms ease-out`; `--glass-base` + `--blur-base` + `22px` radius + `--shadow-float`; `role="article"` `aria-label="[Restaurant name], last visited [time]"`
- UX-DR15: Implement HomeSection — header row (title 16px semibold + optional "See all (N)" 12px terracotta text link); "See all" appears only when items > 4; content slot for grid or full-width card; `role="region"` `aria-label="[Section title]"`
- UX-DR16: Implement RestaurantGridCard / RecipeGridCard — two-column grid; photo area 68px; name 12px semibold + meta 11px (dish count for restaurant; calorie in terracotta for recipe); `--glass-base` + lighter blur + `16px` radius + `--shadow-card`; `scale(0.97)` spring on press
- UX-DR17: Implement SectionEmptyPlaceholder (My Recipes before any saves) — dashed border `1.5px dashed rgba(180,170,158,0.35)`, `18px` radius; centered muted text 12px disabled colour; no fill, no shadow, no CTA

**Progressive States & Interactions:**
- UX-DR18: Implement home screen progressive states architecture — State 0 (empty, single CTA); State 1 (1 restaurant: hero full-height, Restaurants full-width, Recipes: quiet placeholder); State 2 (2+ restaurants: hero shrinks 148→112px, both sections in 2-col grid); State 3+ (full collection, "See all" links at 5+ items); scale rule: 1 item→full-width, 2→side by side, 3–4→2-col grid, 5+→2-col grid + "See all (N)"; hero height transition 400ms ease-out; atmospheric gradient crossfades 400ms to match most recent restaurant
- UX-DR19: Implement button hierarchy — 4 tiers, never mix on same surface: Primary CTA (full-width terracotta pill, 52–56px height, 9999px radius, one per screen); Secondary action (ghost pill, transparent fill + 1px terracotta border, terracotta text); Destructive (rose tint `rgba(251,234,234,0.95)`, warm rose text `#B94040`, edit-gated only); Inline text action (terracotta, no background, font-weight:500); no FABs other than camera circle; no icon-only buttons except camera circle and top-row overlays
- UX-DR20: Implement feedback patterns — Auto-capture toast: 2.5s, top of screen, slides down from top, frosted glass, "Sala Thai · 6 dishes saved"; Scan recognition failure: inline in camera modal frame, dusty rose tint, stays visible (user must act); USDA macro resolution: values show "—" in muted colour while loading, animate in with 200ms opacity + translateY(4px→0) staggered 50ms; Grocery merge summary: amber tint card top of Grocery screen, collapsible, shows merged/added/skipped counts; Recipe deletion: edit-gated, 4 deliberate steps minimum, confirmation bottom sheet

**Animation:**
- UX-DR21: Implement Framer Motion spring animation system — primary spring: `{ type: "spring", stiffness: 400, damping: 22 }` for card expand/collapse, tab transitions, modal entrances; `250ms ease-out` for page/tab cross-fades; `200ms ease-out` for opacity fades; `prefers-reduced-motion: reduce`: replace ALL spring animations with 150ms opacity-only fades, no scale transforms, atmospheric crossfades shorten to 150ms; Framer Motion `useReducedMotion()` hook applied throughout
- UX-DR22: Implement gesture discrimination — dish row tap vs. tab-switch swipe discriminated by velocity threshold (>300px/s = tab switch, slower = dish interaction); swipe on expanded dish card navigates between dishes (pill scroll updates); swipe down on camera modal dismisses; no swipe-to-delete on recipe cards (too easy, creates accidental deletion); no long-press quick-action sheets

**Photo System:**
- UX-DR23: Implement three-tier dish photo state system — Confirmed: full-bleed photo, no indicator; Recognised/no-photo: warm placeholder tile (cream palette `--color-bg-elevated`, subtle dish silhouette, "No photo available" label 11px); Unrecognised: card suppressed entirely (no empty slots, no skeleton cards) + ScanConfidenceBanner appears; all three states visually legible at a glance

**Accessibility:**
- UX-DR24: Implement WCAG 2.1 AA color compliance — terracotta `#C4622D` used only at `font-weight:600` and `font-size≥14px`; tertiary `#9E9589` for supplementary/non-critical labels only; all interactive element touch targets ≥44×44px (filter pills: extend to 44px via `py-[7px]` invisible hitbox wrapper); ARIA roles per component: FloatingNavBar pill `role="navigation"`, camera `role="button"`, DishRowCompact `role="button"`, ScanConfidenceBanner `role="alert"` `aria-live="assertive"`, auto-capture toast `role="status"` `aria-live="polite"`
- UX-DR25: Implement reduced motion support — `@media (prefers-reduced-motion: reduce)`: dish row expand/collapse: no spring, immediate height change; atmospheric crossfade: instant swap; stagger entrance: all cards appear simultaneously; toast slide: opacity fade only, no translateY; wrap all motion components with `useReducedMotion()` hook
- UX-DR26: Implement Dynamic Type support — rem units throughout; no locked px values in body or component wrappers; root font size baseline 16px; images use `<img>` with descriptive alt text (e.g. "A plate of Pad See Ew noodles"); atmospheric background images are CSS backgrounds with `role="presentation"`
- UX-DR27: Implement focus indicators — `focus-visible:` Tailwind utilities; visible on keyboard navigation only, not after tap

**Responsive Design:**
- UX-DR28: Implement single-column responsive strategy — `.app-shell { max-width:430px; margin:0 auto; min-height:100dvh; overflow-x:hidden }`; `@media (max-width:359px)`: `.collection-grid { grid-template-columns:1fr }` (stack to 1-col); no other breakpoints; iPad/desktop: same centred column, atmospheric background fills full screen behind column

---

### FR Coverage Map

| FR | Epic | Reason |
|----|------|--------|
| FR1 | Epic 2 | Camera capture entry point |
| FR2 | Epic 2 | Gemini dish extraction |
| FR3 | Epic 2 | Gemini restaurant extraction |
| FR4 | Epic 2 | Restaurant confirm/correct/skip flow |
| FR5 | Epic 2 | Manual search when restaurant unidentified from scan |
| FR6 | Epic 2 | Confidence indicator visible after scan |
| FR7 | Epic 4 | Restaurant search by name |
| FR8 | Epic 4 | Dish collection population from search |
| FR9 | Epic 4 | Cached dish data for repeat visits |
| FR10 | Epic 2 | Phase 1 dish card (AI macros, no photo yet) |
| FR11 | Epic 2 | Ingredient list in expanded dish view |
| FR12 | Epic 5 | Cooking instructions gated to My Recipes |
| FR13 | Epic 5 | No cooking instructions at card/ingredient level |
| FR14 | Epic 3 | USDA provenance indicator |
| FR15 | Epic 3 | Visual distinction AI vs USDA macros |
| FR16 | Epic 3 | Google Places photo |
| FR17 | Epic 3 | Warm placeholder tile |
| FR18 | Epic 3 | Card suppression for unrecognised dishes |
| FR19 | Growth | AI placeholder photo (pending test) |
| FR20 | Epic 2 | AI ingredient inference |
| FR21 | Epic 2 | Macro calculation |
| FR22 | Epic 3 | USDA as primary authoritative source |
| FR23 | Epic 2 | Estimated label for unverified macros |
| FR24 | Epic 3 | Portion adjustment → recalculated macros |
| FR25 | Epic 2 | Auto-capture on scan (no save gesture) |
| FR26 | Epic 4 | View all restaurants in collection |
| FR27 | Epic 4 | View dishes for a restaurant |
| FR28 | Epic 4 | Remove restaurant + dishes (soft delete) |
| FR29 | Epic 5 | Add to My Recipes (intentional act) |
| FR30 | Epic 5 | View Recipes collection |
| FR31 | Epic 5 | Remove from Recipes |
| FR32 | Epic 6 | Scan confidence banner |
| FR33 | Epic 6 | Retake photo for unread dishes |
| FR34 | Epic 6 | Fetch additional Places images for unread dishes |
| FR35 | Epic 6 | Manual dish name entry on recognition failure |
| FR36 | Epic 6 | Accept partial dish set and continue |
| FR37 | Epic 3 | Non-broken placeholder on photo fetch failure |
| FR38 | Epic 2 | Zod validation at API route inputs |
| FR39 | Epic 2 | Validate external API responses |
| FR40 | Epic 7 | Offline read-only access |
| FR41 | Epic 6 | External API failure handling (end-to-end validation) |
| FR42 | Epic 1 | Migration-first discipline established |
| FR43 | Epic 1 | PWA manifest + install (service worker → Epic 7) |
| FR44 | Epic 4 | Places data caching after first fetch |
| FR45 | Epic 1 | Recipes primary nav destination |
| FR46 | Epic 1 | Settings header control |
| FR47 | Epic 1 | Data reset |
| FR48 | Growth | Cooking instructions in Recipes |
| FR49 | Growth | Grocery list from Recipes |
| FR50 | Growth | URL recipe import |
| FR51 | Growth | Menu caching for repeat scans |
| FR52 | Growth | AI-generated placeholder photo |

---

## Epic List

### Epic 1: App Shell, Navigation & Visual Foundation

Users can open Plately, experience the complete glass design system with atmospheric backgrounds, and navigate between Restaurants, Recipes, and Settings on an empty home screen. The app is installable as a PWA.

**FRs covered:** FR42, FR43, FR45, FR46, FR47
**NFRs addressed:** NFR3 (FCP ≤3s), NFR9 (no PII in logs), NFR10 (build-time env validation)
**ARCH addressed:** ARCH1–3 (infrastructure fixes), ARCH6 (5-table schema), ARCH11 (glass tokens), ARCH14 (spring presets), ARCH15 (atmospheric layer), ARCH18 (API key isolation)
**UX-DRs addressed:** UX-DR1–7 (full design system + FloatingNavBar), UX-DR13 (empty home state), UX-DR19 (button hierarchy), UX-DR21 (spring system), UX-DR25–28 (reduced motion, Dynamic Type, focus indicators, responsive shell)

---

### Epic 2: Menu Scan & Dish Auto-Capture

Users can point their camera at a restaurant menu and immediately see all recognised dishes auto-captured into their collection with AI-estimated macros — with ingredient detail available on expansion. No save gesture required.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR10, FR11, FR20, FR21, FR23, FR25, FR38, FR39, FR41
**NFRs addressed:** NFR1 (scan ≤10s), NFR7 (server-only keys), NFR8 (no image persistence), NFR15 (no single-API crash), NFR18 (Gemini failure → retry)
**ARCH addressed:** ARCH4 (status enum), ARCH5 (photo_status), ARCH7 (response envelope), ARCH8 (Zod strategy), ARCH9 (Gemini fallback), ARCH10 (BYOAK), ARCH12 Phase 1 (progressive enrichment), ARCH13 (scan state transport), ARCH16–17 (query key conventions, optimistic updates)

> FR10 and FR11 appear here because Phase 1 Gemini results must render immediately. Epic 3 enriches these same cards with photos and USDA-verified data.

---

### Epic 3: Dish Photos, USDA Nutrition & Portion Control

Dish cards are enriched asynchronously with real food photos from Google Places and nutritional data verified against USDA — with portion-adjusted macro recalculation. Photo and USDA failures degrade gracefully to warm placeholders and estimated labels.

**FRs covered:** FR14, FR15, FR16, FR17, FR18, FR22, FR24, FR37
**NFRs addressed:** NFR4 (photo ≤2s), NFR5 (recalc ≤100ms), NFR16 (photo → placeholder), NFR17 (USDA → estimated label), NFR19 (Places batched + cached)
**ARCH addressed:** ARCH12 Phase 2 (Places + USDA async enrichment)
**UX-DRs addressed:** UX-DR8–10 (DishRowCompact/Expanded, MacroBar), UX-DR23 (three-tier photo state: confirmed/placeholder/suppressed)

---

### Epic 4: Restaurant Search & Collection Management

Users can discover any restaurant by name and auto-capture its full dish set. Users can browse and manage a growing restaurant collection, with the home screen scaling dynamically from a single hero card to a full multi-section grid.

**FRs covered:** FR7, FR8, FR9, FR26, FR27, FR28, FR44
**NFRs addressed:** NFR2 (search ≤5s), NFR6 (offline read immediate), NFR19 (Places cached)
**UX-DRs addressed:** UX-DR14–18 (HeroCard, HomeSection, grid cards, progressive home screen states — State 0 → State 3+)

---

### Epic 5: My Recipes & Cook-at-Home

Users can claim any dish to their personal Recipes collection by tapping "Add to My Recipes" inside the expanded dish view — an intentional act that gates access to cooking instructions. Users can browse and manage their saved recipes.

**FRs covered:** FR12, FR13, FR29, FR30, FR31
**UX-DRs addressed:** UX-DR9 (Add to My Recipes CTA in DishRowExpanded), UX-DR17 (Recipes empty placeholder), UX-DR20 (recipe deletion: edit-gated, 4-step confirmation)

---

### Epic 6: Graceful Failure & Progressive Recovery

When menu scans are incomplete or external services degrade, users receive clear feedback and actionable recovery paths — retake photo, add dishes manually, fetch additional Places images, or continue with the partial set. No broken UI, no dead ends.

**FRs covered:** FR32, FR33, FR34, FR35, FR36, FR41
**NFRs addressed:** NFR15–18 (degraded states for Gemini, Places, and USDA)
**UX-DRs addressed:** UX-DR12 (ScanConfidenceBanner: amber tint, 3 recovery actions, `role="alert"`), UX-DR20 (failure feedback patterns)

---

### Epic 7: Accessibility, Offline & Production Hardening

The app meets WCAG 2.1 AA in full, works offline for read-only collection access, all performance benchmarks are validated, and VoiceOver on iOS is fully functional — production-ready.

**FRs covered:** FR40
**NFRs addressed:** NFR6, NFR11 (WCAG 2.1 AA), NFR12 (44px touch targets), NFR13 (aria-live text mutation), NFR14 (VoiceOver functional)
**UX-DRs addressed:** UX-DR24–27 (WCAG AA colour compliance, reduced motion, Dynamic Type, focus indicators)

---

### Growth Epic: Phase 2 Features

Features deferred from MVP, unlocked by the foundation built in Epics 1–7.

**FRs covered:** FR19, FR48, FR49, FR50, FR51, FR52
- FR19: AI-assisted photo quality evaluation for ingredient accuracy
- FR48: Persistent cooking instructions in Recipes collection
- FR49: Grocery list generation from a Recipes dish
- FR50: URL recipe import → auto-added to Recipes
- FR51: Chain restaurant menu cache for repeat-scan fast-path
- FR52: AI-generated placeholder photo for dishes with no Google Places photo

---

## Epic 1: App Shell, Navigation & Visual Foundation

Users can open Plately, experience the complete glass design system with atmospheric backgrounds, and navigate between Restaurants, Recipes, and Settings on an empty home screen. The app is installable as a PWA.

### Story 1.1: Infrastructure Hardening

As a developer,
I want the Supabase client to throw at build time on missing env vars, the singleton pattern enforced across all files, and all external API keys isolated behind a server-only module,
So that configuration errors are caught before deployment and API keys can never leak into the client bundle.

**Acceptance Criteria:**

**Given** `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is absent from the environment
**When** the application builds
**Then** the build fails with a descriptive error naming the missing variable — not a silent substitution of placeholder strings

**Given** `scan/route.ts` and `supabaseAutoSave.ts` previously created their own Supabase clients
**When** the fix is applied
**Then** both files import exclusively from `@/lib/supabase`; no other file in the codebase instantiates a Supabase client directly

**Given** `src/lib/api-keys.ts` exists with `import 'server-only'`
**When** any client-side file attempts to import from it
**Then** the Next.js build fails with a `server-only` violation error

**Given** `api-keys.ts` is in place
**When** any API route needs a Gemini, Google Places, or USDA key
**Then** it imports exclusively from `src/lib/api-keys.ts`

---

### Story 1.2: Database Schema Baseline

As a developer,
I want the complete v2 5-table schema applied via a single canonical migration, with all prior patch migrations superseded,
So that the schema is auditable and applied deterministically in any environment.

**Acceptance Criteria:**

**Given** patch migrations 002–008 exist as ad-hoc fixes
**When** the canonical migration is written
**Then** a single numbered migration file defines all 5 tables: `restaurants`, `restaurant_visits`, `recipes`, `recipe_ingredients`, `grocery_items` — with all columns, constraints, and indexes

**Given** the canonical migration is applied to a clean database
**When** queried
**Then** `restaurant_visits.visit_type` is an enum of `scan | search`; `recipes.status` is an enum of `auto_captured | kept | removed`; `recipes.photo_status` is an enum of `confirmed | placeholder | suppressed`

**Given** all schema changes going forward
**When** a developer adds a column or table
**Then** it is applied only through a new numbered migration file — no `ALTER TABLE` outside of migrations

---

### Story 1.3: Visual Design System

As a user,
I want the app to present a consistent visual language of warm glass surfaces, rich atmospheric backdrops, and refined typography on every screen,
So that Plately feels premium and immediately recognisable.

**Acceptance Criteria:**

**Given** the app loads
**When** any screen renders
**Then** all 4 glass surface tokens (`--glass-base`, `--glass-elevated`, `--glass-overlay`, `--glass-sunken`), 3 blur tokens (`--blur-base`, `--blur-elevated`, `--blur-heavy`), border tokens, and shadow tokens are defined as CSS custom properties in `globals.css` and applied — no interactive surface uses a solid background

**Given** the color token system is defined
**When** text and accents are rendered
**Then** primary text is `#1A1612`, terracotta accent is `#C4622D`, tertiary labels are `#9E9589`, and status tints (error/success/warning) are present in the token set

**Given** the typography system is configured
**When** Playfair Display and DM Sans are loaded
**Then** Playfair Display appears only on display/hero text; DM Sans is used for all UI text; all sizes use rem units with a 16px root baseline

**Given** the spacing scale is defined
**When** components are spaced
**Then** `--space-1` through `--space-8` (4px → 32px) are defined and used consistently; no arbitrary pixel values in layout code

---

### Story 1.4: App Shell & Responsive Layout

As a user,
I want the app to be contained in a centred single-column layout with correct iPhone safe-area handling,
So that it feels native on iPhone Safari and intentional on wider screens.

**Acceptance Criteria:**

**Given** the app shell renders
**When** viewed at any viewport width
**Then** content is constrained to `max-width: 430px`, centred, with `min-height: 100dvh` and `overflow-x: hidden`

**Given** the device has a home indicator (iPhone X and later)
**When** the nav bar or bottom content renders
**Then** safe-area insets are respected via `env(safe-area-inset-bottom)`; no content is obscured

**Given** a viewport narrower than 360px
**When** a grid layout renders
**Then** the grid collapses to a single column

**Given** the app is viewed on tablet or desktop
**When** it renders
**Then** the atmospheric background fills the full viewport; the app column stays centred at 430px; no layout breaks

---

### Story 1.5: Animation System & Reduced Motion

As a user,
I want all transitions to feel physically natural, with the app automatically respecting my device motion preferences,
So that interactions feel alive without being distracting or inaccessible.

**Acceptance Criteria:**

**Given** `src/lib/springs.ts` exists
**When** any animated component references it
**Then** named presets `SPRING_CARD_EXPAND`, `SPRING_TAB_TRANSITION`, and `SPRING_MODAL_ENTER` are exported as Framer Motion spring config objects

**Given** `prefers-reduced-motion: reduce` is set on the device
**When** any animated component renders
**Then** the `useReducedMotion()` hook replaces all spring animations with 150ms opacity-only transitions; no scale transforms are applied; `@media (prefers-reduced-motion: reduce)` also suppresses CSS-driven motion

**Given** an element receives keyboard or switch-control focus
**When** it is focused
**Then** a visible `focus-visible` ring is shown; the ring is NOT shown after pointer/tap interaction

---

### Story 1.6: FloatingNavBar Component

As a user,
I want a floating frosted-glass nav bar at the bottom of every screen with tabs for Restaurants and Recipes, and a prominent camera button,
So that I can always reach my collection and scan a new menu in one tap.

**Acceptance Criteria:**

**Given** the app is on any screen
**When** the FloatingNavBar renders
**Then** a frosted glass capsule pill (62px height, `border-radius: 9999px`, `--glass-elevated` + `--blur-elevated`) contains two tabs (Restaurants, Recipes), floating 16px from screen edges and 20px from the bottom

**Given** the camera button is displayed
**When** it renders
**Then** it is a 62×62px terracotta (`#C4622D`) circle positioned outside the pill — not embedded in it — with `aria-label="Scan a menu"`

**Given** a tab is the active route
**When** it renders
**Then** it shows a filled icon + terracotta label (`#C4622D`); the inactive tab shows a stroke icon + tertiary label (`#9E9589`)

**Given** the camera button is pressed
**When** the animation plays
**Then** it scales to `0.88` using `SPRING_CARD_EXPAND`, then returns on release

**Given** the nav is traversed by VoiceOver
**When** navigated
**Then** the pill has `role="navigation"`; the camera has `role="button"`; all interactive elements have ≥44×44px touch targets (invisible hit-area extension where needed)

**Given** Settings is not a primary nav destination
**When** the FloatingNavBar renders
**Then** there is no Settings tab; Settings is accessible only from a persistent icon in the screen header

---

### Story 1.7: Home Screen Empty State & Atmospheric Background

As a new user with no restaurants saved,
I want to see a welcoming empty state with one clear call-to-action, set against an atmospheric food-photography backdrop,
So that I immediately understand the app's purpose and know how to get started.

**Acceptance Criteria:**

**Given** the user has no restaurants in their collection
**When** the Home screen renders
**Then** the empty state shows: a 52px icon, a Playfair 22px title ("Take home the food you love"), a 13px body (max 210px wide), and a single terracotta pill CTA ("📷 Scan a menu", 50px height, `border-radius: 9999px`); no section headers or placeholder cards appear

**Given** no food photography is available yet
**When** the atmospheric background renders
**Then** it falls back to a warm cream gradient; no blank white background is visible

**Given** the atmospheric background layer is implemented at `app/layout.tsx`
**When** any screen renders
**Then** the blurred, saturated food photo (or gradient fallback) is persistent as the root background layer behind all content

**Given** the empty state renders
**When** inspected for accessibility
**Then** `role="main"` wraps the content area; the CTA has `aria-label="Open camera to scan a menu"`; no sections or placeholder cards appear until content exists

**Given** the app loads cold with no cached data
**When** FCP is measured on LTE
**Then** First Contentful Paint is ≤3 seconds

---

### Story 1.8: Settings Screen & Data Reset

As a user,
I want to access a Settings screen from the header and permanently clear all my data,
So that I have full control over what's stored on my device.

**Acceptance Criteria:**

**Given** the user taps the Settings icon in the screen header
**When** the Settings screen opens
**Then** it is reachable from any screen and does not occupy a primary nav tab

**Given** the user triggers the data reset function
**When** confirmed
**Then** all records in `restaurants`, `restaurant_visits`, `recipes`, `recipe_ingredients`, and `grocery_items` for the current session are deleted; the user is navigated to the empty home state (State 0)

**Given** the reset action is destructive and irreversible
**When** it is initiated
**Then** a confirmation step (bottom sheet or modal) is shown before any deletion occurs

---

### Story 1.9: PWA Manifest & Installability

As a user,
I want to install Plately on my iPhone home screen from Safari,
So that I can launch it like a native app with full-screen experience.

**Acceptance Criteria:**

**Given** the user visits Plately in iPhone Safari
**When** they tap "Add to Home Screen"
**Then** the app installs with the name "Plately", a correct app icon, and launches with `display: standalone` (no Safari browser chrome)

**Given** the app is launched from the home screen icon
**When** it opens
**Then** the status bar is correctly themed; safe area insets are respected; there is no browser address bar

**Given** the PWA manifest is in place
**When** validated
**Then** `manifest.json` includes: `name`, `short_name`, `display: "standalone"`, `theme_color: "#C4622D"`, `background_color`, and at least one icon at 192×192px

---

## Epic 2: Menu Scan & Dish Auto-Capture

Users can point their camera at a restaurant menu and immediately see all recognised dishes auto-captured into their collection with AI-estimated macros — with ingredient detail available on expansion. No save gesture required.

### Story 2.1: Scan API Route — Gemini Menu Extraction

As a user,
I want the app to extract all dish names, descriptions, and the restaurant name from a photo of a menu,
So that I never have to type anything after scanning.

**Acceptance Criteria:**

**Given** a POST request is sent to `/api/scan` with a base64-encoded menu image
**When** the request is validated with Zod
**Then** missing or malformed fields return `{ error: { message: string; code: "VALIDATION_ERROR" } }` with HTTP 422 before any AI call is made

**Given** a valid image is received
**When** Gemini 2.5 Flash processes it
**Then** the response is validated against a lenient Zod schema using `.catch()` fallbacks; the route returns `{ data: { restaurantName, dishes: [{ name, description }] } }` with HTTP 200

**Given** Gemini 2.5 Flash returns a 503 or 429
**When** the fallback is triggered
**Then** the route retries with Gemini 2.0 Flash using the same request and Zod schema; the client receives a successful response if the fallback succeeds

**Given** both Gemini models fail
**When** the error is returned
**Then** the route returns `{ error: { message: string; code: "AI_UNAVAILABLE" } }` with HTTP 503

**Given** the `X-User-Gemini-Key` request header is present
**When** it is validated server-side
**Then** if it starts with "AI" and is ≥39 characters, it is used in place of the system Gemini key; otherwise the system key is used

**Given** the scan route handles the image
**When** the API call lifecycle ends
**Then** no image data is persisted server-side beyond the API call

---

### Story 2.2: Camera UI & Menu Capture Flow

As a user,
I want to open the camera from the nav bar, frame my menu, and capture it with one tap,
So that scanning feels instant and effortless.

**Acceptance Criteria:**

**Given** the user taps the camera button in the FloatingNavBar
**When** the camera modal opens
**Then** it presents a live camera viewfinder in fullscreen with a capture button; the user does not need to leave the app or use the native camera roll

**Given** the camera modal is open
**When** the user swipes down
**Then** the modal dismisses and returns to the previous screen

**Given** the user taps the capture button
**When** the photo is taken
**Then** the image is converted to base64 and a POST request is made to `/api/scan`; a loading state is shown while waiting

**Given** the scan returns successfully
**When** dishes are extracted
**Then** the user is transitioned to the Restaurant Confirmation screen showing the extracted restaurant name and dish count

---

### Story 2.3: Restaurant Confirmation & Auto-Capture

As a user,
I want to confirm or correct the restaurant name after a scan, then have all dishes automatically saved — no further action required,
So that my collection grows with zero friction.

**Acceptance Criteria:**

**Given** the scan result includes an extracted restaurant name
**When** the Restaurant Confirmation screen renders
**Then** the name is pre-filled; the user can confirm it, edit it, or skip identification entirely

**Given** the user confirms or edits the restaurant name
**When** they proceed
**Then** a `restaurants` row is created (or matched to existing), a `restaurant_visits` row is created with `visit_type: 'scan'` and `raw_menu_json`, and all extracted dishes are created as `recipes` rows with `status: 'auto_captured'` and `photo_status: 'placeholder'`

**Given** the scan result cannot identify a restaurant name
**When** the confirmation screen renders
**Then** the user is prompted to search for the restaurant manually; the flow does not dead-end

**Given** all records are written to Supabase
**When** the save completes
**Then** the auto-capture toast fires ("Sala Thai · 6 dishes saved", 2.5s, slides down from top, frosted glass surface, `role="status"` `aria-live="polite"`)

**Given** the scan result and saved UUID
**When** the recipe detail page mounts
**Then** it reads `sessionStorage["plately:scan:{uuid}"]` for Phase 1 data, then picks up the real Supabase UUID via the `plately:supabase-saved` custom event

---

### Story 2.4: Dish Card (Phase 1 — AI Macros, No Photo)

As a user,
I want to see a card for every recognised dish immediately after scanning, showing estimated calories and macros,
So that I can start evaluating dishes while enrichment is still in progress.

**Acceptance Criteria:**

**Given** dishes have been auto-captured with `status: 'auto_captured'`
**When** the restaurant dish list renders
**Then** each dish shows a DishRowCompact card: 72×72px photo area (warm placeholder tile, since `photo_status: 'placeholder'`), dish name, macro chips (calories, protein, carbs, fat), `--glass-base` + `--blur-base` surface, `role="button"` + `aria-expanded="false"` + `aria-label="[Dish name], [cal] calories"`

**Given** macros are AI-estimated (not yet USDA-verified)
**When** the macro chips render
**Then** values are displayed with an "Est." visual indicator; no USDA provenance badge is shown at this stage

**Given** the dish list renders
**When** measured from scan initiation on LTE
**Then** all dish cards with AI-estimated macros are visible within ≤10 seconds; Phase 2 enrichment continues in the background without blocking this render

---

### Story 2.5: Dish Row Expansion & Ingredient List

As a user,
I want to tap a dish card to expand it in-place and see the typical ingredients,
So that I can understand what's in a dish without leaving the list view.

**Acceptance Criteria:**

**Given** a DishRowCompact card is visible
**When** the user taps it
**Then** it expands in-place using `SPRING_CARD_EXPAND` (`height: 0 → auto`); the chevron rotates 90°; `aria-expanded` updates to `"true"`

**Given** a dish is expanded
**When** a second dish card is tapped
**Then** the first dish auto-collapses; only one dish can be expanded at a time

**Given** DishRowExpanded is open
**When** it renders
**Then** it shows: 156px hero photo area (placeholder at this stage), dish name in Playfair 19px, calorie count in 19px semibold terracotta, MacroBar (Protein / Carbs / Fat / Fibre), typical ingredient highlights, and the "Add to My Recipes" CTA pill (42px height, terracotta fill); surface uses `--glass-elevated` + `--blur-elevated` + 20px radius

**Given** the expansion is triggered on a device with `prefers-reduced-motion: reduce`
**When** the animation runs
**Then** the expansion is immediate with no spring animation; no scale transform is applied

---

### Story 2.6: AI Ingredient & Macro Pipeline

As a user,
I want the app to infer typical ingredients and calculate macros for each dish from its name and cuisine context,
So that I get nutritional estimates for every dish without entering anything manually.

**Acceptance Criteria:**

**Given** a dish name and description are available
**When** Gemini is called for ingredient inference
**Then** it uses the dish name and description only — not the menu photo — to infer typical ingredients and quantities

**Given** ingredient inference completes
**When** macro totals are calculated
**Then** calories, protein (g), carbs (g), fat (g), and fibre (g) are computed from the inferred ingredient set

**Given** macros are derived from AI inference only
**When** the dish card renders
**Then** all macro values carry an "Est." indicator; they are never presented as precise or verified at this stage

**Given** Zod validation is applied to the Gemini ingredient/macro response
**When** the response is parsed
**Then** the lenient schema uses `.catch()` fallbacks; a single malformed field does not discard the entire dish result

---

### Story 2.7: Scan Confidence Indicator

As a user,
I want to see how many dishes from my menu were successfully recognised immediately after scanning,
So that I know if the capture was complete or if some dishes were missed.

**Acceptance Criteria:**

**Given** the scan completes and dishes are auto-captured
**When** the restaurant dish list renders
**Then** a confidence summary is visible (e.g. "8 of 10 dishes read") reflecting the ratio of recognised to detected menu items

**Given** all dishes were recognised
**When** the confidence indicator renders
**Then** it shows a positive/complete state; no recovery prompt or banner is shown

**Given** one or more dishes were not recognised
**When** the dish list renders
**Then** the ScanConfidenceBanner is visible (amber tint surface, count text, recovery action buttons); unrecognised dish slots do not appear as empty cards or skeletons

**Given** the ScanConfidenceBanner is visible
**When** inspected for accessibility
**Then** it has `role="alert"` and `aria-live="assertive"` so VoiceOver announces it immediately upon appearance

---

### Story 2.8: API Route Validation & Error Envelope

As a developer,
I want every API route to validate inputs strictly and return errors in a consistent envelope format,
So that the client always knows what shape to expect and validation failures never reach the AI layer.

**Acceptance Criteria:**

**Given** any API route receives a request
**When** the input is validated with Zod (`parse`, strict)
**Then** a missing or invalid field returns `{ error: { message: string; code?: string } }` with HTTP 422 before any downstream logic executes

**Given** any external API (Gemini, Places, USDA) returns a response
**When** it is parsed
**Then** the lenient schema (`.catch()` fallbacks, `safeParse`) is used; a partial result with defaults is preferred over a hard failure when a field is missing or unexpected

**Given** a route succeeds
**When** it responds
**Then** the response body is always `{ data: T }` — no other success shape is used; HTTP status codes follow REST conventions (200, 400, 422, 500, 503)

**Given** an external API call fails
**When** the error is returned to the client
**Then** the app does not crash and does not render a broken UI; the defined degraded state for that API is shown

---

## Epic 3: Dish Photos, USDA Nutrition & Portion Control

Dish cards are enriched asynchronously with real food photos from Google Places and nutritional data verified against USDA — with portion-adjusted macro recalculation. Photo and USDA failures degrade gracefully to warm placeholders and estimated labels.

### Story 3.1: Google Places Enrichment API Route

As a user,
I want dish photos and restaurant details to load automatically after scanning, without me having to do anything,
So that my collection looks rich and inviting without any extra effort.

**Acceptance Criteria:**

**Given** a restaurant has been auto-captured
**When** the enrichment route is called
**Then** a single batched Places API request fetches all available data for the restaurant (name, photos, details) — one request per restaurant, not per dish

**Given** the Places API returns results
**When** the data is stored
**Then** the restaurant record is updated with Places ID and metadata; photo URLs are stored per-recipe; all results are cached so subsequent visits to the same restaurant do not trigger a new Places API call

**Given** the Places API call succeeds and photos are returned
**When** a dish photo URL is stored
**Then** the corresponding `recipe.photo_status` is updated from `placeholder` to `confirmed`

**Given** the Places API call succeeds but returns no photo for a dish
**When** the photo status is evaluated
**Then** `recipe.photo_status` remains `placeholder`; the warm placeholder tile continues to render

**Given** the Places API call fails entirely
**When** the error is handled
**Then** all affected dish cards remain in `photo_status: 'placeholder'` state; no broken `<img>` elements are rendered; no crash occurs

---

### Story 3.2: USDA Macro Verification API Route

As a user,
I want dish macros to be verified against USDA FoodData Central as soon as the data is available,
So that I can trust the nutritional information I'm seeing.

**Acceptance Criteria:**

**Given** a dish has AI-estimated ingredients
**When** the USDA enrichment route is called
**Then** ingredient lookups are batched in a single request per dish (not one request per ingredient) and results are matched against the inferred ingredient list

**Given** USDA data is available for an ingredient
**When** macros are recalculated
**Then** USDA-sourced values replace AI-estimated values; the dish's macro totals are recalculated from the USDA ingredient set

**Given** USDA data is unavailable for one or more ingredients
**When** macros are displayed
**Then** AI-estimated values are retained for those ingredients with an "Est." label; the partial USDA result is used where available — macros are never silently absent

**Given** the USDA API fails entirely for a dish
**When** the error is handled
**Then** AI-estimated macros remain displayed with the "Est." label; no crash occurs and no macro values go blank

**Given** Zod validation is applied to USDA API responses
**When** a response is parsed
**Then** the strict schema (`parse`, throws) is used; unexpected response shapes are caught and logged, falling back to AI estimates

---

### Story 3.3: Dish Photo Rendering — Three-Tier State System

As a user,
I want to see a real photo of every recognised dish, a warm styled placeholder when no photo is available, and no card at all for unrecognised dishes,
So that my dish list is always visually coherent — no broken images or empty slots.

**Acceptance Criteria:**

**Given** a dish has `photo_status: 'confirmed'`
**When** the dish card renders
**Then** a full-bleed photo is displayed in the 72×72px thumbnail (compact) or 156px hero (expanded); no indicator or label overlays the photo

**Given** a dish has `photo_status: 'placeholder'`
**When** the dish card renders
**Then** a warm placeholder tile is shown (cream palette `--color-bg-elevated`, subtle dish silhouette, "No photo available" label at 11px); the card layout is identical to a photo card — no layout shift

**Given** a dish has `photo_status: 'suppressed'` (unrecognised from scan)
**When** the dish list renders
**Then** no card is rendered for that dish; no empty slot, skeleton, or placeholder card appears in its place

**Given** a Google Places photo URL fetch fails at render time
**When** the `<img>` would error
**Then** the card degrades to the warm placeholder tile; no broken `<img>` element is visible

**Given** all three photo states
**When** rendered side by side
**Then** each state is visually legible at a glance without requiring the user to read labels

---

### Story 3.4: USDA Macro Provenance Indicators

As a user,
I want to know whether the macros I'm seeing are AI estimates or verified against USDA data,
So that I can calibrate how much to trust the nutritional numbers.

**Acceptance Criteria:**

**Given** macro values are sourced entirely from USDA FoodData Central
**When** the dish card renders
**Then** a USDA provenance badge or indicator is visible on the macro display; no "Est." label is shown

**Given** macro values are AI-estimated (no USDA data available)
**When** the dish card renders
**Then** an "Est." label is visible; no USDA badge is shown

**Given** macro values are partially sourced from USDA (some ingredients matched, some not)
**When** the dish card renders
**Then** the partial-USDA state is communicated clearly; the display is never ambiguous about the data source

**Given** USDA macro data resolves asynchronously after initial render
**When** values transition from estimated to verified
**Then** macro values animate in with 200ms opacity + translateY(4px→0), staggered 50ms per value; if `prefers-reduced-motion: reduce`, values appear immediately with no animation

---

### Story 3.5: Portion Adjustment & Macro Recalculation

As a user,
I want to adjust the serving portion of a dish and see macros recalculate instantly,
So that I can get accurate nutrition info for the amount I actually eat.

**Acceptance Criteria:**

**Given** a dish is expanded (DishRowExpanded)
**When** a portion size control is visible
**Then** the user can increase or decrease the serving multiplier (e.g. 0.5×, 1×, 1.5×, 2×)

**Given** the user changes the portion multiplier
**When** macros are recalculated
**Then** calories, protein, carbs, fat, and fibre update within ≤100ms — no API call is made; recalculation is client-side only

**Given** a portion is adjusted
**When** the MacroBar re-renders
**Then** all 4 cells (Protein / Carbs / Fat / Fibre) reflect the scaled values; the calorie total in the header also updates

**Given** the user closes and reopens the expanded dish
**When** it renders
**Then** the portion multiplier resets to 1× (portion adjustment is not persisted)

---

### Story 3.6: Progressive Enrichment UX (Phase 2 Update)

As a user,
I want dish cards to silently upgrade with photos and verified macros as data becomes available — without any interruption to browsing,
So that the app feels fast even when enrichment is still running.

**Acceptance Criteria:**

**Given** Phase 1 dish cards are rendered with AI macros and placeholder photos
**When** Phase 2 enrichment completes for a dish
**Then** the dish card updates in-place: the photo transitions from placeholder to confirmed image; macro values animate to USDA-verified numbers; no full re-render or layout shift occurs

**Given** Phase 2 enrichment is running
**When** macro values are in the process of resolving
**Then** pending values show "—" in muted colour while loading; they animate in with 200ms opacity + translateY(4px→0) staggered 50ms once resolved

**Given** enrichment completes on the scan path
**When** results are compared to the search path
**Then** the progressive enrichment pattern is identical for both paths; no separate code path exists for scan vs. search enrichment

**Given** Phase 2 enrichment for one dish fails
**When** the other dishes are rendering
**Then** the failure affects only that dish; all other cards continue enriching normally

---

## Epic 4: Restaurant Search & Collection Management

Users can discover any restaurant by name and auto-capture its full dish set. Users can browse and manage a growing restaurant collection, with the home screen scaling dynamically from a single hero card to a full multi-section grid.

### Story 4.1: Restaurant Search API Route

As a user,
I want to search for a restaurant by name and have the app find it via Google Places,
So that I can build my collection without needing to scan a physical menu.

**Acceptance Criteria:**

**Given** a GET request is sent to `/api/places/search` with a restaurant name query
**When** the request is validated with Zod
**Then** a missing or empty query returns `{ error: { message: string; code: "VALIDATION_ERROR" } }` with HTTP 422

**Given** a valid search query is received
**When** the Places API is called
**Then** the response is validated against a Zod schema; up to 5 matching restaurant results are returned as `{ data: { results: [{ placeId, name, address, photoUrl }] } }`

**Given** a restaurant has been fetched before
**When** the same restaurant is searched again
**Then** the cached Places result is returned without making a new API call

**Given** the Places API fails
**When** the error is returned
**Then** the route returns `{ error: { message: string; code: "PLACES_UNAVAILABLE" } }` with HTTP 503; the client shows a degraded state rather than crashing

---

### Story 4.2: Restaurant Search UI & Dish Auto-Capture (Search Path)

As a user,
I want to search for a restaurant by name, pick it from results, and have all its dishes instantly added to my collection,
So that I can capture a restaurant I love without having its physical menu in front of me.

**Acceptance Criteria:**

**Given** the user navigates to the Search screen
**When** they type a restaurant name
**Then** results appear from the Places API showing restaurant name, address, and a photo thumbnail

**Given** the user selects a restaurant from results
**When** they confirm
**Then** a `restaurants` row is created (or matched to existing), a `restaurant_visits` row is created with `visit_type: 'search'`, and dishes are created as `recipes` rows with `status: 'auto_captured'` and `photo_status: 'placeholder'`

**Given** the restaurant has been searched before and its dish data is cached
**When** the user selects it again
**Then** cached dish data is used immediately without a new scan or search; the collection is populated within ≤5 seconds on LTE

**Given** dish auto-capture completes via the search path
**When** the save finishes
**Then** the auto-capture toast fires using the same pattern as the scan path; the user is navigated to the restaurant's dish list

**Given** Phase 2 enrichment applies to both paths
**When** dishes are auto-captured via search
**Then** Places + USDA enrichment runs using the same progressive enrichment pattern as the scan path — no separate code path

---

### Story 4.3: Restaurant Collection Screen

As a user,
I want to browse all the restaurants in my collection and see their dishes at a glance,
So that I can quickly find and revisit any restaurant I've captured.

**Acceptance Criteria:**

**Given** the user navigates to the Restaurants tab
**When** one or more restaurants are in the collection
**Then** restaurants are displayed as a grid of RestaurantGridCards (2-column grid): photo area 68px, restaurant name 12px semibold, dish count 11px, `--glass-base` surface + `16px` radius + `--shadow-card`

**Given** a RestaurantGridCard is pressed
**When** the press animation plays
**Then** the card scales to `0.97` using the primary spring; on release it returns to full size

**Given** the user taps a restaurant card
**When** they navigate to the restaurant's dish list
**Then** all dishes for that restaurant with `status != 'removed'` are displayed as DishRowCompact cards

**Given** a restaurant has been removed
**When** the collection is queried
**Then** the removed restaurant does not appear in the list; all queries filter by `status != 'removed'`

---

### Story 4.4: Restaurant Removal

As a user,
I want to remove a restaurant and all its dishes from my collection,
So that I can keep my collection relevant without accumulating restaurants I no longer want.

**Acceptance Criteria:**

**Given** the user is viewing a restaurant's dish list
**When** they initiate removal
**Then** a confirmation step is shown (bottom sheet) before any data is changed

**Given** the user confirms removal
**When** the operation completes
**Then** the restaurant's `status` is set to `removed` and all associated `recipes` rows have their `status` set to `removed`; no rows are deleted from the database

**Given** the removal is soft (status change only)
**When** collection queries run
**Then** all collection screens filter by `status != 'removed'`; the removed restaurant and its dishes never appear in any list view

**Given** the removal completes
**When** the user is returned to the collection
**Then** the removed restaurant card is no longer visible; the home screen updates accordingly

---

### Story 4.6: Home Screen Progressive States

As a user,
I want the home screen to feel dynamically alive as my collection grows — from a welcoming empty state to a rich multi-section view,
So that the app always shows the most useful layout for how much content I have.

**Acceptance Criteria:**

**Given** the user has 0 restaurants (State 0)
**When** the home screen renders
**Then** the empty state from Story 1.7 is shown; no section headers or grid cards appear

**Given** the user has exactly 1 restaurant (State 1)
**When** the home screen renders
**Then** a full-height HeroCard (148px photo strip) is shown for that restaurant; the Restaurants section shows the single card full-width; the My Recipes section shows the quiet placeholder (dashed border, no fill, no CTA)

**Given** the user has 2 or more restaurants (State 2+)
**When** the home screen renders
**Then** the HeroCard shrinks to 112px (transition 400ms ease-out); Restaurants and My Recipes sections both display items in a 2-column grid

**Given** either section has more than 4 items (State 3+)
**When** the home screen renders
**Then** "See all (N)" appears as a 12px terracotta text link in the section header; tapping it navigates to the full collection screen for that section

**Given** a new restaurant is added
**When** the atmospheric background updates
**Then** it crossfades (400ms) to reflect the most recently added restaurant's food photography

---

### Story 4.5: HeroCard & HomeSection Components

As a user,
I want to see my most recently visited restaurant as a prominent hero card at the top of the home screen,
So that I can quickly jump back into what I was last exploring.

**Acceptance Criteria:**

**Given** the HeroCard is rendered for State 1
**When** it displays
**Then** it shows a full-width photo strip at 148px with a dark gradient overlay; restaurant name and meta are overlaid bottom-left; a dish thumbnail row (52×52px mini cards) and footer (dish count + "View all ›") appear in the card body; surface uses `--glass-base` + `--blur-base` + `22px` radius + `--shadow-float`

**Given** the HeroCard transitions from State 1 to State 2
**When** a second restaurant is added
**Then** the photo strip height animates from 148px to 112px over 400ms ease-out

**Given** the HeroCard is rendered
**When** inspected for accessibility
**Then** it has `role="article"` and `aria-label="[Restaurant name], last visited [time]"`

**Given** a HomeSection renders
**When** its content slot is populated
**Then** the section header shows the title at 16px semibold; "See all (N)" appears only when items > 4 as a 12px terracotta text link; the section has `role="region"` with `aria-label="[Section title]"`

---

## Epic 5: My Recipes & Cook-at-Home

Users can claim any dish to their personal Recipes collection by tapping "Add to My Recipes" inside the expanded dish view — an intentional act that gates access to cooking instructions. Users can browse and manage their saved recipes.

### Story 5.1: Add to My Recipes

As a user,
I want to save any dish to my personal Recipes collection by tapping "Add to My Recipes" inside its expanded view,
So that I can mark the dishes I want to recreate at home, separately from my browsing collection.

**Acceptance Criteria:**

**Given** a dish is expanded (DishRowExpanded) in any restaurant view
**When** the user taps the "Add to My Recipes" CTA pill (42px height, terracotta fill)
**Then** the dish's `status` is updated from `auto_captured` to `kept`; the action is immediate — no loading spinner or confirmation required

**Given** the "Add to My Recipes" action completes
**When** the feedback animation plays
**Then** a 1.5s checkmark animation plays on the CTA button before it transitions to a "Saved" state; the dish card remains expanded

**Given** a dish already has `status: 'kept'`
**When** DishRowExpanded renders
**Then** the CTA shows a "Saved to My Recipes" state (not the primary "Add" CTA); the action is not repeatable

**Given** cooking instructions exist for a dish (Growth — FR48)
**When** the dish is in the restaurant browse view (not in My Recipes)
**Then** cooking instructions are never shown at the card or ingredient-expansion level — only after the dish is added to My Recipes

---

### Story 5.2: My Recipes Collection Screen

As a user,
I want to browse all the dishes I've saved to My Recipes in one dedicated place,
So that I can easily find and revisit the meals I've chosen to recreate at home.

**Acceptance Criteria:**

**Given** the user navigates to the Recipes tab
**When** one or more dishes have `status: 'kept'`
**Then** saved recipes are displayed as RecipeGridCards (2-column grid): photo area 68px, dish name 12px semibold, calorie count in terracotta 11px, `--glass-base` surface + `16px` radius + `--shadow-card`

**Given** the user has no dishes with `status: 'kept'`
**When** the Recipes screen renders
**Then** the SectionEmptyPlaceholder is shown: dashed border `1.5px dashed rgba(180,170,158,0.35)`, `18px` radius, centred muted text 12px; no fill, no shadow, no CTA button

**Given** the user taps a recipe card
**When** they navigate to the recipe detail view
**Then** the full DishRowExpanded view is shown with all ingredient and macro detail; the cooking instructions slot is present (placeholder for Growth FR48)

**Given** the Recipes collection is queried
**When** the query runs
**Then** only recipes with `status: 'kept'` are returned; `auto_captured` and `removed` recipes never appear in My Recipes

---

### Story 5.3: Recipe Removal

As a user,
I want to remove a dish from My Recipes when I no longer want it,
So that I can keep my personal collection clean and intentional.

**Acceptance Criteria:**

**Given** the user is viewing a recipe in My Recipes
**When** they initiate removal
**Then** the action is edit-gated — a deliberate mode must be entered before any remove control is visible; accidental swipe-to-delete is not possible

**Given** the user is in edit mode and taps remove on a recipe
**When** the confirmation flow runs
**Then** at least 4 deliberate steps are required before the recipe is removed (enter edit mode → tap remove icon → confirm in bottom sheet → confirm destructive action)

**Given** the user confirms removal
**When** the operation completes
**Then** the recipe's `status` is set to `removed`; no row is deleted from the database; the recipe no longer appears in My Recipes queries

**Given** a recipe is removed from My Recipes
**When** the user browses the originating restaurant
**Then** the dish still appears in the restaurant's dish list with `status: 'auto_captured'`; the "Add to My Recipes" CTA is available again

---

### Story 5.4: Cooking Instructions Gate

As a user,
I want cooking instructions to be available only for dishes I've saved to My Recipes — never visible while I'm browsing a restaurant,
So that the browse experience stays focused on deciding what to order, not how to cook it.

**Acceptance Criteria:**

**Given** a dish is displayed anywhere in the restaurant browse view (compact or expanded)
**When** the dish card renders at any level
**Then** no cooking instructions are shown or hinted at — not on the compact card, not in the ingredient expansion, not as a locked or greyed element

**Given** a dish has `status: 'kept'` and is viewed in My Recipes
**When** the recipe detail view renders
**Then** a "How to make it" section is present as a placeholder slot for Growth FR48; it is clearly only available at this level

**Given** the cooking instructions gate is implemented
**When** a developer adds cooking instruction content in a future Growth story
**Then** the gating logic does not need to change — the content slot already exists in the My Recipes detail view and is structurally absent from all restaurant browse views

---

## Epic 6: Graceful Failure & Progressive Recovery

When menu scans are incomplete or external services degrade, users receive clear feedback and actionable recovery paths — retake photo, add dishes manually, fetch additional Places images, or continue with the partial set. No broken UI, no dead ends.

### Story 6.1: ScanConfidenceBanner & Recovery Entry Points

As a user,
I want to see a clear banner when my scan didn't capture all the menu's dishes, with specific actions I can take,
So that I'm never left wondering if something went wrong or what to do about it.

**Acceptance Criteria:**

**Given** one or more dishes from a menu scan were not recognised
**When** the restaurant dish list renders
**Then** the ScanConfidenceBanner slides up from the bottom of the content area (above the nav bar) using spring animation (`stiffness: 380, damping: 24`); it shows the count of read vs. total dishes (e.g. "8 of 10 dishes read") plus secondary context text

**Given** the ScanConfidenceBanner is visible
**When** it renders
**Then** it shows 3 recovery action buttons: "Retake photo", "Add manually", and "Continue with N dishes"; surface is amber tint (`rgba(251,243,226,0.95)`); it has `role="alert"` and `aria-live="assertive"`

**Given** the user taps "Continue with N dishes"
**When** the action is taken
**Then** the banner dismisses; the user proceeds with the partial dish set; unrecognised dish slots remain suppressed (no empty cards)

**Given** the banner appears on a device with `prefers-reduced-motion: reduce`
**When** it renders
**Then** it appears immediately with opacity fade only; no spring slide animation

---

### Story 6.2: Retake Photo Flow

As a user,
I want to retake a photo of the menu to attempt recognition of the dishes that were missed,
So that I can get a more complete capture without starting over from scratch.

**Acceptance Criteria:**

**Given** the user taps "Retake photo" in the ScanConfidenceBanner
**When** the action is taken
**Then** the camera modal reopens with context indicating which dishes are still unread

**Given** the user captures a new photo
**When** the second scan result is processed
**Then** newly recognised dishes are merged into the existing restaurant's dish set; previously recognised dishes are not duplicated

**Given** the retake scan recognises all remaining dishes
**When** the result is merged
**Then** the ScanConfidenceBanner is dismissed; the full dish list is shown

**Given** the retake scan still misses some dishes
**When** the result is merged
**Then** the ScanConfidenceBanner updates with the new count; the remaining recovery options are still available

---

### Story 6.3: Manual Dish Entry

As a user,
I want to manually add a dish name when the scan couldn't recognise it,
So that I can always complete my collection even when photo recognition falls short.

**Acceptance Criteria:**

**Given** the user taps "Add manually" in the ScanConfidenceBanner
**When** the manual entry flow opens
**Then** a text input is presented where the user can type a dish name

**Given** the user submits a dish name
**When** the entry is saved
**Then** a new `recipes` row is created with `status: 'auto_captured'`, `photo_status: 'placeholder'`, and the entered name; AI ingredient/macro inference runs for the new dish using the same pipeline as Story 2.6

**Given** a manually entered dish is saved
**When** the restaurant dish list renders
**Then** the new dish card appears in the list; the ScanConfidenceBanner count updates to reflect the addition

**Given** the user adds a dish manually then taps "Continue"
**When** the banner is dismissed
**Then** no further recovery prompts are shown for dishes the user has chosen not to add

---

### Story 6.4: Places Image Fetch for Unread Dishes (Search Path Recovery)

As a user,
I want the app to automatically try fetching additional menu images from Google Places when some dishes couldn't be read from my scan,
So that the search path can recover dishes I missed without me needing to retake a photo.

**Acceptance Criteria:**

**Given** a restaurant search results in unrecognised dishes
**When** the recovery attempt runs
**Then** the system fetches additional menu/photo images for that restaurant from Google Places and passes them to Gemini for a second recognition attempt

**Given** the Places image fetch yields additional recognisable dishes
**When** the result is merged
**Then** newly recognised dishes are added to the restaurant's dish set; the ScanConfidenceBanner count updates; previously recognised dishes are not duplicated

**Given** the Places image fetch returns no additional useful images
**When** the recovery attempt completes
**Then** the ScanConfidenceBanner remains with the original count; the "Add manually" and "Continue" options are still available

**Given** the Places API is unavailable during recovery
**When** the fetch fails
**Then** the failure is silent to the user (no new error banner); the original ScanConfidenceBanner with its recovery options remains displayed

---

### Story 6.5: External API Degraded States — End-to-End Validation

As a user,
I want the app to handle any external service going down gracefully — showing me what it can and telling me what it can't,
So that a temporary outage never leaves me with a broken or confusing experience.

**Acceptance Criteria:**

**Given** the Gemini API is unavailable during a scan
**When** the error is returned
**Then** the scan error state is shown inline in the camera modal frame (dusty rose tint, stays visible until user acts); a retry option is presented; no generic error page is shown

**Given** the Google Places API is unavailable during enrichment
**When** the error is handled
**Then** all dish cards render with warm placeholder tiles; no broken `<img>` elements appear; no error notification is shown to the user (silent degradation)

**Given** the USDA API is unavailable during enrichment
**When** the error is handled
**Then** AI-estimated macros are displayed with "Est." labels; no macro values go blank or show an error state

**Given** any single external API fails
**When** the app continues running
**Then** all other features remain fully functional; the failure is isolated to the specific data it affects

**Given** all degraded states are validated end-to-end
**When** each API failure mode is tested
**Then** no unhandled promise rejections occur; no `console.error` calls reference uncaught exceptions; the app does not unmount or navigate to an error page

---

## Epic 7: Accessibility, Offline & Production Hardening

The app meets WCAG 2.1 AA in full, works offline for read-only collection access, all performance benchmarks are validated, and VoiceOver on iOS is fully functional — production-ready.

### Story 7.5: Offline Read-Only Access

As a user,
I want to browse my saved restaurants and recipes without an internet connection,
So that I can reference dishes I've captured even when I'm offline at a restaurant.

**Acceptance Criteria:**

**Given** the user has previously loaded their collection while online
**When** they open the app with no network connection
**Then** the home screen, restaurant collection, dish lists, and My Recipes all render from cached data — no spinner, no empty states, no error pages

**Given** the user is offline and navigates between collection screens
**When** they interact with cached content
**Then** all read interactions (browse, expand dish, view macros) work normally; no network calls are attempted for data that is already cached

**Given** the user is offline and attempts a scan or restaurant search
**When** those actions require network access
**Then** a clear, specific offline indicator is shown for those actions only; the rest of the app remains fully functional

**Given** the app returns online
**When** network access is restored
**Then** the app resumes normal operation without requiring a restart or manual refresh

---

### Story 7.2: WCAG 2.1 AA Colour Compliance Audit

As a user with low vision or colour sensitivity,
I want all text and interactive elements to meet minimum contrast ratios,
So that I can read and use the app comfortably.

**Acceptance Criteria:**

**Given** the terracotta accent colour `#C4622D` is used
**When** it appears in the UI
**Then** it is only used at `font-weight: 600` and `font-size ≥ 14px`; it never appears as small regular-weight text where contrast ratio would fall below 3:1

**Given** the tertiary label colour `#9E9589` is used
**When** it appears in the UI
**Then** it is applied only to supplementary, non-critical labels (tags, meta text); it is never used for actionable or primary information

**Given** all interactive elements across the app
**When** a contrast audit is run
**Then** all text meets WCAG 2.1 AA contrast ratios (4.5:1 for normal text, 3:1 for large text); all interactive elements meet 3:1 against their background

**Given** all interactive elements across the app
**When** touch target sizes are measured
**Then** every tappable element has a minimum 44×44px touch target; filter pills extend their hit area via invisible padding wrappers where needed

---

### Story 7.3: VoiceOver & Keyboard Navigation Audit

As a user relying on VoiceOver or keyboard navigation,
I want all core app flows to be fully operable without a display,
So that the app is usable regardless of how I interact with my device.

**Acceptance Criteria:**

**Given** VoiceOver is enabled on iOS
**When** the user navigates the home screen, restaurant dish list, and My Recipes
**Then** all content is announced in a logical reading order; dish cards announce name and calorie count; expanded state is announced via `aria-expanded`

**Given** async state changes occur (enrichment resolving, scan confidence banner appearing)
**When** content updates
**Then** changes are announced via `aria-live="polite"` text content mutation — not `aria-label` attribute mutation (v1 regression fix from NFR13)

**Given** the ScanConfidenceBanner appears
**When** VoiceOver is active
**Then** it is announced immediately via `aria-live="assertive"`; focus is not disrupted for other content

**Given** the FloatingNavBar and all primary controls
**When** traversed with VoiceOver
**Then** every interactive element has a meaningful accessible name; no element is announced as "button" without context

---

### Story 7.4: Performance Benchmark Validation

As a user on a typical mobile connection,
I want the app to load and respond within defined time limits,
So that it feels as fast as a native app.

**Acceptance Criteria:**

**Given** the app loads cold (no service worker cache) on LTE
**When** FCP is measured
**Then** First Contentful Paint is ≤3 seconds

**Given** a menu scan is initiated on LTE
**When** the scan completes and Phase 1 dish cards render
**Then** the total time from capture tap to all cards visible is ≤10 seconds

**Given** a restaurant search is initiated on LTE
**When** the search completes and dish cards render
**Then** the total time from search submission to all cards visible is ≤5 seconds

**Given** a dish photo is requested
**When** it loads via the Google Places CDN
**Then** the photo is visible within ≤2 seconds on LTE

**Given** the user adjusts a portion multiplier
**When** macros recalculate
**Then** updated values are displayed within ≤100ms — verified by measuring the time between input change and DOM update

---

### Story 7.1: Service Worker & Offline Cache Strategy

As a user,
I want the app to cache my collection data so it's available instantly offline,
So that visiting a restaurant without signal doesn't leave me unable to access my saved dishes.

**Acceptance Criteria:**

**Given** the service worker is registered
**When** the app is loaded for the first time
**Then** the service worker caches the app shell (HTML, CSS, JS bundles) for offline access

**Given** the user views their collection while online
**When** data is fetched from Supabase
**Then** collection data (restaurants, dishes, recipes) is stored in a client-side cache (IndexedDB or Cache API) for offline read access

**Given** the service worker cache is in place
**When** the app is launched from the home screen icon with no network
**Then** the cached app shell loads; the cached collection data is displayed; no network requests are attempted for cached resources

**Given** the cache strategy is implemented
**When** a cached resource is stale
**Then** a stale-while-revalidate strategy is applied — the cached version renders immediately while a background refresh runs when network is available

---

## Growth Epic: Phase 2 Features

Features deferred from MVP, unlocked by the foundation built in Epics 1–7.

### Story G.1: Cooking Instructions in My Recipes

As a user,
I want to see step-by-step cooking instructions for any dish I've saved to My Recipes,
So that I can actually recreate it at home without guessing how it's made.

**Acceptance Criteria:**

**Given** a dish has `status: 'kept'` and is viewed in the My Recipes detail view
**When** the "How to make it" section renders
**Then** AI-generated cooking instructions are displayed; the section was already gated and structurally present from Story 5.4 — this story populates it

**Given** cooking instructions are requested for a dish
**When** the AI generates them
**Then** instructions reference the dish's saved ingredient list from the recipe; they are stored in the `recipes` table so they are available offline

**Given** a user is browsing a restaurant (not in My Recipes)
**When** they view any dish
**Then** cooking instructions are not visible or hinted at — the gate from Story 5.4 is unchanged

---

### Story G.2: Grocery List Generation

As a user,
I want to generate a shopping list from any dish in My Recipes,
So that I can go straight from "I want to make this" to having everything I need at the grocery store.

**Acceptance Criteria:**

**Given** the user is viewing a dish in My Recipes
**When** they tap "Add to grocery list"
**Then** all ingredients from the dish's saved ingredient list are added to the `grocery_items` table

**Given** an ingredient already exists in the grocery list
**When** a new recipe adds it again
**Then** a merge summary is shown (amber tint card, top of Grocery screen, collapsible): counts of merged, added, and skipped items — the user always sees what changed

**Given** the grocery list is populated
**When** the user navigates to the Grocery screen
**Then** all items are displayed with a checkbox; checking an item marks it as purchased; the state is persisted

---

### Story G.3: URL Recipe Import

As a user,
I want to paste a URL from a recipe website and have the dish automatically added to My Recipes,
So that I can build my collection from recipes I find online, not just restaurant menus.

**Acceptance Criteria:**

**Given** the user pastes a URL into the import field
**When** the import is initiated
**Then** the app fetches the page content and passes it to Gemini to extract dish name, ingredients, and macros

**Given** the import succeeds
**When** the dish is created
**Then** a `recipes` row is created with `status: 'kept'` (directly to My Recipes — no restaurant association required); macros are calculated from extracted ingredients; USDA enrichment runs as normal

**Given** the URL points to an unsupported or unscrapeable page
**When** the import fails
**Then** a specific error message is shown explaining why the import failed; the user is not left with a broken or empty dish entry

---

### Story G.4: Chain Restaurant Menu Cache

As a user,
I want repeat visits to a chain restaurant to be instant — no re-scanning required,
So that I can pull up a familiar restaurant's dishes in seconds, not wait for a fresh scan.

**Acceptance Criteria:**

**Given** a restaurant menu has been scanned once and the `raw_menu_json` is stored in `restaurant_visits`
**When** the user scans the same restaurant again or visits it from their collection
**Then** the cached menu data is used immediately; no new Gemini scan is initiated

**Given** the cached menu is used
**When** the dish list renders
**Then** the complete dish set is shown within ≤2 seconds; the user sees no difference from a fresh scan other than the speed

**Given** the user wants to update a cached menu
**When** they initiate a manual refresh
**Then** a new scan is triggered; the cache is updated with the new result; old dishes not in the new scan are marked with `status: 'removed'`

---

### Story G.5: AI-Generated Placeholder Photo

As a user,
I want dishes with no Google Places photo to have a generated food image,
So that my collection looks visually rich even for restaurants with limited photo data.

**Acceptance Criteria:**

**Given** a dish has `photo_status: 'placeholder'` after Places enrichment has run
**When** the AI photo generation is triggered
**Then** an image is generated based on the dish name and cuisine context using an AI image generation API

**Given** the generated image is returned
**When** it is stored
**Then** the image URL is saved to the recipe; `photo_status` is updated to `confirmed`; the dish card renders the generated image in place of the placeholder tile

**Given** AI photo generation fails or is rate-limited
**When** the error is handled
**Then** the warm placeholder tile continues to render; no broken image or error state is shown

---

### Story G.6: AI Photo Quality Test for Ingredient Accuracy

As a developer,
I want to evaluate whether providing a Google Places dish photo to Gemini alongside the dish name improves ingredient accuracy,
So that we only promote this feature if testing confirms it meaningfully improves nutrition data quality.

**Acceptance Criteria:**

**Given** a controlled test set of dishes with known ingredients
**When** Gemini is called with dish name only vs. dish name + Places photo
**Then** accuracy of inferred ingredients is measured and compared across both approaches

**Given** the test results show a meaningful improvement (threshold defined before test runs)
**When** the feature is promoted
**Then** the Places photo is included in the Gemini prompt for ingredient inference in the main enrichment pipeline

**Given** the test results show no meaningful improvement
**When** the evaluation concludes
**Then** the feature is not promoted; the pipeline remains name-only inference; the test infrastructure is removed

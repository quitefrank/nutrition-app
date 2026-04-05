---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories']
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
workflowType: 'epics-and-stories'
project_name: 'Plately'
user_name: 'Frank'
date: '2026-03-19'
---

# Plately - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Plately, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Capture**
- FR01: User can capture a menu by pointing their device camera at a physical menu and initiating a scan
- FR02: User can capture a dish by pointing their device camera at a plated dish and initiating a scan
- FR03: User can upload a photo from their device photo library as an alternative to live camera capture
- FR04: User can retake a scan when the initial capture produces a partial or low-confidence result
- FR05: User can cancel a scan at any point before saving

**AI Identification & Confidence**
- FR06: The system identifies dishes from a menu scan and presents them as a selectable list with images and plain-language descriptions
- FR07: The system identifies a dish from a dish scan or uploaded photo and presents the result with an ingredient list
- FR08: The system assigns a confidence level to each scan result and communicates it using both a visual indicator and a text label
- FR09: The system presents a partial result state when only some dishes or ingredients are identified, clearly labelling what was and was not captured
- FR10: The system validates AI identification against known dish names and recipe corpora to produce a combined confidence signal
- FR11: The system validates AI identification against reference images asynchronously and updates the confidence signal when validation completes
- FR12: The system prompts the user to name or describe the dish when the combined confidence score falls below the threshold required to present a result automatically
- FR13: User can confirm or reject an AI-identified result before it is saved
- FR39: The system displays a calorie estimate for each dish identified from a menu scan alongside the dish image and description
- FR40: The system assigns and displays a confidence indicator for each ingredient in a recipe result, distinguishing high-certainty ingredients from those that vary by restaurant or cannot be confirmed

**Recipe Management**
- FR14: User can view the full ingredient list for an identified dish, including ingredient names and quantities
- FR15: User can edit any ingredient in a recipe result before saving
- FR16: User can adjust the serving size / portion multiplier for a recipe result before saving
- FR17: User can save a recipe result to their personal recipe collection
- FR18: User can view all saved recipes in a recipe collection list
- FR19: User can open and view the full details of a saved recipe
- FR20: User can edit a saved recipe after it has been saved
- FR21: User can delete a saved recipe from their collection
- FR22: The system associates each saved recipe with a source restaurant entity where available, enabling future grouping and retrieval

**Grocery List**
- FR23: User can add all ingredients from a recipe to the grocery list in one action
- FR24: The system aggregates ingredients from multiple saved recipes into a single grocery list, merging duplicate ingredients
- FR25: User can view their full grocery list
- FR26: User can check off individual grocery list items while shopping
- FR27: User can remove individual items from the grocery list
- FR28: User can clear all checked items from the grocery list

**Discovery & Search**
- FR29: User can search for a restaurant by name without using the camera
- FR30: User can browse dishes associated with a found restaurant and select one for recipe generation
- FR31: The system generates a recipe for a searched dish using the same AI identification and confidence pipeline as camera captures
- FR32: User can view previously saved recipes associated with a restaurant they have visited before
- FR41: The system proactively surfaces previously saved recipes when the user opens or scans a restaurant they have visited before

**App Experience & Recovery**
- FR33: User can install Plately to their iPhone home screen via the app install prompt
- FR34: User can access their saved recipes and grocery list without an internet connection (read-only)
- FR35: The system presents an error state identifying the failure cause, with a retry option, within 15 seconds of external API unavailability
- FR36: The system continues with scan-only results when restaurant data enrichment is unavailable, without surfacing an error to the user
- FR37: The system presents a "nutrition unavailable" label when USDA macro data cannot be retrieved, without blocking the recipe save flow
- FR38: User can access Plately without creating an account or providing any personal information

### NonFunctional Requirements

**Performance**
- NFR01: Scan submission to first result completes within 10 seconds under normal network conditions on iPhone Safari; target under 5 seconds
- NFR02: Confidence enrichment runs asynchronously — the user sees their initial result within 500ms of scan completion; the confidence score updates when validation completes
- NFR03: Saved recipe and grocery list views load from local cache within 1 second, with no network dependency
- NFR04: All interactive UI elements respond to user input within 100ms

**Security**
- NFR05: All external API keys are stored server-side only; no key appears in client-side code, browser-exposed environment variables, or network responses visible to the client
- NFR06: All client-server communication uses HTTPS; no plaintext HTTP connections permitted
- NFR07: Scan images are discarded within the same request lifecycle as identification; no image data is written to persistent storage
- NFR08: No personally identifiable information is collected, stored, or transmitted; the system does not log user behaviour, device identifiers, or location data

**Integration Reliability**
- NFR09: Each external API dependency has an independently defined failure mode — a failure in one does not cascade to block the others
- NFR10: A user-visible error state with retry affordance surfaces within 15 seconds of an external API timeout or failure; silent failures are not acceptable
- NFR11: Restaurant data enrichment is additive — its absence does not degrade core recipe capture or save functionality
- NFR12: USDA nutrition data is optional — its absence does not prevent recipe saving or grocery list generation

**Scalability**
- NFR13: The system operates within MVP infrastructure tier constraints (500MB database storage, 2GB monthly bandwidth); query patterns and storage schema are designed with these limits in mind
- NFR14: The API key configuration layer is extensible to support user-provided keys without changes to external API call behaviour

**Accessibility**
- NFR15: All interactive elements meet a minimum touch target size of 44×44 points per Apple Human Interface Guidelines
- NFR16: AI confidence indicators communicate certainty using both a visual indicator (colour/icon) and a text label — colour alone is not sufficient

### Additional Requirements

Architecture-derived technical requirements that directly impact epic and story sequencing:

**Starter Template (Epic 1, Story 1):**
- Initialize project with: `npx create-next-app@latest plately --typescript --tailwind --app --eslint --src-dir` (Next.js 16 LTS)
- Post-scaffold additions in Story 1: `@supabase/supabase-js`, `sonner`, `TanStack Query v5`, `Vitest + Testing Library`
- PWA manifest + service worker via Next.js 16 native support (no third-party package)
- `.env.local` template with 5 slots: `GEMINI_API_KEY`, `USDA_API_KEY`, `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Critical Implementation Order (cross-story dependencies):**
- `getApiKeys()` helper (`src/lib/api-keys.ts`) must exist before any external API route is built
- Supabase schema (`restaurants`, `recipes`, `recipe_ingredients`, `grocery_items`) must be finalized before any CRUD route
- TanStack Query provider must wrap the app before any data hook is used
- Processing strip depends on scan routes returning a consistent `DishResult` / `IngredientResult` shape

**Data Architecture:**
- 4-table schema; no image storage anywhere; `dish_image_url` references external URLs only
- `recipe_ingredients.confidence_level` stores per-item confidence (FR40)
- `restaurants.atmospheric_palette_json` caches extracted palette (no re-extraction on return visit)
- `grocery_items.recipe_id` enables recipe-view grouping and bulk-remove

**API Architecture:**
- All external API calls mediated through `src/app/api/` routes (key isolation boundary)
- Two-phase confidence pipeline: client fires scan call → receives result immediately → fires enrichment call in parallel → updates evidence block when enrichment returns
- REST API; `{ data: T }` success shape; `{ error: string, code: string }` error shape; no other shapes
- Scan result contract: `DishResult[]` / `IngredientResult[]` — must not be redefined across stories

**TanStack Query Key Conventions (enforced across all stories):**
- `['recipes']`, `['recipes', recipeId]`, `['grocery-items']`, `['restaurants', restaurantId]`
- `['scan-result', scanId]`, `['search', 'restaurants', query]`, `['search', 'dishes', query]`

**Deployment:**
- Vercel (zero-config from Next.js 16 App Router); environment variables via Vercel dashboard
- No additional CI/CD pipeline required for MVP

### UX Design Requirements

- UX-DR1: Implement atmospheric background system — full-bleed, cuisine/restaurant-driven, three-tier fallback (restaurant-specific → cuisine-type palette → neutral dark base), programmatic WCAG AA contrast enforcement, Gaussian blur (radius 48px), dark/light gradient overlay, crossfade transitions (400ms ease); must never be skipped or apply a palette that fails contrast
- UX-DR2: Implement glass component system — GlassCard (radius-md, white 8–12%/blur 20px dark; white 65%/blur 20px light), BottomSheet (radius-lg top, white 10%/blur 30px), GlassTabBar (white 8%/blur 24px), ProcessingStrip (white 12%/blur 24px), FilterPill, FAB; all values differ by mode as specified in design tokens
- UX-DR3: Implement design token system — typography (SF Pro, 8 scale tokens from text-2xs 11pt to text-hero 36–40pt), corner radius (6 tokens: radius-xs 8pt through radius-full 999pt), spacing (8 tokens: space-1 4pt through space-12 48pt), component heights, icon sizes, text colour tokens (text-primary, text-secondary, text-tertiary, text-on-button), motion tokens
- UX-DR4: Implement light and dark mode — follows iOS system setting by default with in-app override; glass values, gradient overlays, and text colours differ per mode; contrast enforcement runs in both modes; atmospheric background always present in both modes
- UX-DR5: Implement confidence indicator / evidence block — three states: high (single-line text, white 60%), medium (two lines + 3–4 ingredient pills), inference (user photo + reference photo side-by-side + confirmation question); never uses warning colours or degraded visuals; tone always assured and informative; per-ingredient confidence indicators (FR40) shown as part of recipe view
- UX-DR6: Implement camera modal UI — full-bleed preview, corner bracket guides (white 40%, 32pt, fade after 2s), 72pt capture button (glass, radius-full, camera icon), 48pt upload button (glass), glass × dismiss (top right); no flash/zoom controls visible; shutter animation on capture → smooth dismiss; processing strip appears 300ms after dismiss
- UX-DR7: Implement processing strip (persistent mini-player) — 56–64pt height, radius-full, 32×32pt thumbnail + animated text + spinner/chevron; springs up (300ms) after capture dismisses; persists across all tabs until tapped or dismissed; text changes to "Your results are ready →" with pulse animation when result is ready; tap navigates to results; swipe-down to cancel (with inline warning); springs down after result is viewed
- UX-DR8: Implement empty state UX — home first-launch ("Eaten somewhere great recently?" + Search CTA + camera hint), search (placeholder + suggestions), grocery ("Add a saved recipe to start your list →"), scan failed (inference state OR "Try uploading a photo instead"); warm tone, never a dead end; all have one specific CTA
- UX-DR9: Implement permission moment UX — camera at first FAB tap, photo library at first upload, location at first return-visit recognition, notifications at first background scan; each with value-framing copy; never pre-emptive; never repeated after OS-level denial
- UX-DR10: Implement motion / spring animation system — spring physics (mass:1, stiffness:300, damping:30) for sheets and card appearances; scale 0.96→1.0 on appear; opacity 0→1 (200ms); atmospheric crossfade 400ms ease; tab switch 200ms crossfade; pressed state 1.0→0.97; Reduce Motion: replace all spring animations with 150ms opacity-only fades
- UX-DR11: Implement menu scan results screen — dish cards (64×64pt thumbnail radius-xs + dish name text-base + one-line description text-xs text-secondary + calorie estimate), restaurant header with retake button, scrollable list; atmosphere driven by restaurant context
- UX-DR12: Implement dish detail bottom sheet — drag handle (4×36pt pill), full-width dish image (200pt, radius-sm top corners), dish name (text-hero), evidence block, one-line description, divider (white 10%), Save Recipe CTA (56pt, radius-xl), See Full Details link; background dims 40% and scales 0.95 during open; swipe down to dismiss
- UX-DR13: Implement grocery list dual-view — Ingredients view (flat list, 56pt rows, check-off: single tap → strikethrough + 40% opacity + filled circle, tap again to uncheck) and By Recipe view (recipe group cards with image+name+count header, nested rows, collapsible overflow "+N more", "Remove all X items" bulk CTA); toggle pill at screen top
- UX-DR14: Implement home screen layout — populated (featured recipe card full-width ~180pt image + 2-col grid "Your Collection" + horizontal scroll "Recent Restaurants") and empty/first-launch (centred prompt + Search CTA + camera hint); atmosphere layer always active
- UX-DR15: Implement search screen — text-2xl "Search" title, glass radius-full search input (52pt, icon + placeholder), recent searches list (50pt rows, radius-md), suggestion copy at bottom; same visual language as scan results
- UX-DR16: Implement passive restaurant recognition — return-visit banner on home screen surfaces previous saved recipes when at a known restaurant; triggered by scan match or manual selection (not GPS dependency); location permission is opt-in with value framing; restaurant profile shows visit history and saved recipes (FR32, FR41)
- UX-DR17: Implement accessibility requirements — programmatic WCAG AA contrast enforcement on all atmospheric themes; dark gradient overlay always present on atmospheric backgrounds; Reduce Motion preference respected throughout; screen reader support: AI-generated alt text for dish images, evidence block readable as plain text (side-by-side photos labelled "Your photo" / "Reference: [dish name]"), bottom sheet announces as modal region with focus management, processing strip announces state change; one primary action per screen; plain language throughout
- UX-DR18: Implement PWA install experience — install prompt offered after first successful scan; app works fully in Safari without install; standalone mode from homescreen (no browser chrome); PWA manifest with app name, icon set (192pt, 512pt, maskable); does not prompt on every session

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR01 | Epic 2 | Camera menu scan |
| FR02 | Epic 2 | Camera dish scan |
| FR03 | Epic 2 | Photo library upload |
| FR04 | Epic 2 | Retake scan |
| FR05 | Epic 2 | Cancel scan |
| FR06 | Epic 2 | Menu scan dish list with images |
| FR07 | Epic 2 | Dish scan ingredient result |
| FR08 | Epic 2 | Confidence indicator (visual + text) |
| FR09 | Epic 2 | Partial result state |
| FR10 | Epic 2 | Name/corpus confidence validation |
| FR11 | Epic 2 | Async image cross-reference enrichment |
| FR12 | Epic 2 | Inference state / low-confidence prompt |
| FR13 | Epic 2 | Confirm/reject result before save |
| FR14 | Epic 2+3 | Ingredient list (in dish detail + recipe detail) |
| FR15 | Epic 3 | Edit ingredients |
| FR16 | Epic 3 | Adjust serving size |
| FR17 | Epic 3 | Save recipe |
| FR18 | Epic 3 | View recipe collection |
| FR19 | Epic 3 | View recipe detail |
| FR20 | Epic 3 | Edit saved recipe |
| FR21 | Epic 3 | Delete recipe |
| FR22 | Epic 3 | Restaurant entity association |
| FR23 | Epic 4 | Add recipe to grocery list |
| FR24 | Epic 4 | Aggregate + deduplicate ingredients |
| FR25 | Epic 4 | View grocery list |
| FR26 | Epic 4 | Check off grocery items |
| FR27 | Epic 4 | Remove grocery items |
| FR28 | Epic 4 | Clear checked items |
| FR29 | Epic 5 | Restaurant search |
| FR30 | Epic 5 | Browse restaurant dishes |
| FR31 | Epic 5 | Recipe generation from search |
| FR32 | Epic 5 | View saved recipes by restaurant |
| FR33 | Epic 6 | PWA install prompt |
| FR34 | Epic 4 | Offline read-only (recipes + grocery) |
| FR35 | Epic 2 | Error state with retry within 15s |
| FR36 | Epic 2 | Degradation without Places enrichment |
| FR37 | Epic 5 | "Nutrition unavailable" label |
| FR38 | Epic 1 | No auth required |
| FR39 | Epic 2 | Calorie estimate in menu scan |
| FR40 | Epic 2 | Per-ingredient confidence indicator |
| FR41 | Epic 3+5 | Return-visit recognition (scan-triggered E3; search-triggered E5) |

## Epic List

### Epic 1: App Foundation & Visual Identity
Users can open Plately and experience the core visual identity — atmospheric backgrounds, glass components, and navigation shell. The data schema and API infrastructure are in place, ready for all feature epics.
**FRs covered:** FR38
**UX-DRs covered:** UX-DR1, UX-DR2, UX-DR3, UX-DR4, UX-DR10, UX-DR14 (empty state)
**NFRs covered:** NFR13, NFR14, NFR05

### Epic 2: Scan & AI Identification
Users can scan a menu or dish with their camera (or upload a photo) and receive an AI-identified result with confidence information — the product's defining capability.
**FRs covered:** FR01, FR02, FR03, FR04, FR05, FR06, FR07, FR08, FR09, FR10, FR11, FR12, FR13, FR14 (partial), FR35, FR36, FR39, FR40
**UX-DRs covered:** UX-DR5, UX-DR6, UX-DR7, UX-DR8 (scan failed), UX-DR9 (camera + photo library), UX-DR11, UX-DR12
**NFRs covered:** NFR01, NFR02, NFR05, NFR06, NFR07, NFR09, NFR10, NFR11

### Epic 3: Recipe Save & Collection
Users can save dishes as recipes, manage their personal collection, and revisit saved meals — making the dining moment permanent.
**FRs covered:** FR14 (complete), FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR41 (partial — scan-triggered)
**UX-DRs covered:** UX-DR14 (populated home), UX-DR16 (partial)
**NFRs covered:** NFR03

### Epic 4: Grocery List
Users can build a grocery list from saved recipes and shop from it in-store — closing the arc from restaurant to home kitchen.
**FRs covered:** FR23, FR24, FR25, FR26, FR27, FR28, FR34
**UX-DRs covered:** UX-DR8 (grocery empty state), UX-DR13
**NFRs covered:** NFR03, NFR09

### Epic 5: Manual Search & Discovery
Users can find any restaurant or dish by name without the camera, getting a recipe on their first session — no dining occasion required.
**FRs covered:** FR29, FR30, FR31, FR32, FR37, FR41 (complete)
**UX-DRs covered:** UX-DR8 (search empty state), UX-DR9 (location), UX-DR15, UX-DR16 (complete)
**NFRs covered:** NFR11, NFR12

### Epic 6: Accessibility, PWA & Production Readiness
Plately is installable to iPhone home screen, accessible to all users, handles every error gracefully, and is ready to ship.
**FRs covered:** FR33
**UX-DRs covered:** UX-DR9 (notifications), UX-DR17, UX-DR18
**NFRs covered:** NFR04, NFR08, NFR15, NFR16

---

## Epic 1: App Foundation & Visual Identity

Users can open Plately and experience the core visual identity — atmospheric backgrounds, glass components, and navigation shell. The data schema and API infrastructure are in place, ready for all feature epics.

### Story 1.1: Project Scaffold & Environment Setup

As a developer,
I want the project initialized with all required dependencies and infrastructure,
So that all subsequent feature stories have a working foundation to build on.

**Acceptance Criteria:**

**Given** the project directory is empty
**When** `npx create-next-app@latest plately --typescript --tailwind --app --eslint --src-dir` is run
**Then** the app builds and runs locally at localhost:3000 with no TypeScript or build errors

**Given** the Next.js app is scaffolded
**When** `@supabase/supabase-js`, `@tanstack/react-query`, `sonner`, `vitest`, and `@testing-library/react` are installed
**Then** all packages resolve without version conflicts

**Given** the dependencies are installed
**When** `src/lib/supabase.ts` is created
**Then** it exports a singleton Supabase client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; it is the only file in the codebase that instantiates a Supabase client

**Given** the Supabase client singleton exists
**When** `src/lib/api-keys.ts` is created with a `getApiKeys()` function
**Then** it reads `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, and `USDA_API_KEY` from server-side environment variables only; no key is exported to client-accessible scope; calling it from a browser context throws or returns undefined

**Given** `getApiKeys()` exists
**When** `.env.local` and `.env.example` are created
**Then** `.env.local` is listed in `.gitignore`; `.env.example` contains all 5 key slots (`GEMINI_API_KEY`, `USDA_API_KEY`, `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) with comments and no values

**Given** the app runs
**When** `src/app/layout.tsx` is updated to wrap children with TanStack Query `QueryClientProvider`
**Then** any page or component can use `useQuery` and `useMutation` hooks without additional provider setup

**Given** the Supabase project is accessible
**When** `supabase/schema.sql` is run in the Supabase SQL editor
**Then** four tables exist: `restaurants` (id, name, google_places_id, atmospheric_palette_json, updated_at), `recipes` (id, name, restaurant_id, dish_image_url, confidence_metadata_json, serving_size, created_at), `recipe_ingredients` (id, recipe_id, name, quantity, unit, confidence_level), `grocery_items` (id, recipe_id, ingredient_name, quantity, unit, checked, created_at); all foreign keys and types are correct

**Given** the database schema exists
**When** `src/types/database.ts`, `src/types/api.ts`, and `src/types/domain.ts` are created
**Then** `database.ts` contains snake_case row types matching the schema exactly; `api.ts` contains request/response shapes (camelCase); `domain.ts` contains business domain types (Recipe, ScanResult, Ingredient, etc.) in camelCase; no complex inline types exist in components or routes

**Given** the full setup is complete
**When** `npm run dev` and `npm test` are run
**Then** the dev server starts without errors; at least one passing smoke test exists confirming the Supabase client can be instantiated

---

### Story 1.2: Design Token System & Glass Component Library

As a user,
I want the app to have a consistent, polished visual identity,
So that every screen feels premium and the glass aesthetic is applied uniformly.

**Acceptance Criteria:**

**Given** the app runs
**When** `src/app/globals.css` is updated with CSS custom properties
**Then** tokens exist for all typography sizes (text-2xs: 11pt through text-hero: 40pt fixed), spacing (spacing-1: 4pt through spacing-12: 48pt), corner radius (radius-xs: 8pt through radius-full: 999pt), and text colours (text-primary, text-secondary, text-tertiary, text-on-button) in both `[data-theme="dark"]` and `[data-theme="light"]` variants

**Given** the design tokens exist
**When** `GlassCard` is created at `src/components/ui/glass-card.tsx`
**Then** it renders with `backdrop-filter: blur(20px)`, `background: rgba(255,255,255,0.09)` in dark mode / `rgba(255,255,255,0.65)` in light mode, border `rgba(255,255,255,0.13) 0.5px`, and `radius-md` (16pt) by default; it accepts a `compact` variant using `radius-sm` (12pt)

**Given** GlassCard exists
**When** `BottomSheet` is created at `src/components/ui/bottom-sheet.tsx`
**Then** it renders with `blur(30px)`, `background: rgba(255,255,255,0.10)`, radius-lg top corners (24pt), a drag handle pill (4×36pt, `rgba(255,255,255,0.30)`); opening it sets the background overlay to 40% opacity and scales the underlying content to 0.95

**Given** BottomSheet exists
**When** `GlassTabBar` is created at `src/components/layout/glass-tab-bar.tsx`
**Then** it renders with `blur(24px)`, `background: rgba(255,255,255,0.08)`, border `rgba(255,255,255,0.12) 0.5px`; active tab items render at `text-primary` opacity; inactive items render at `text-tertiary` opacity; it accepts a FAB slot

**Given** all glass components exist in both modes
**When** the theme is toggled between dark and light
**Then** glass values update to light-mode spec: GlassCard uses `rgba(255,255,255,0.65)` background; tab bar uses `rgba(255,255,255,0.72)`; text colours invert to near-black variants

**Given** any glass component appears on screen
**When** it enters the view
**Then** it animates using spring physics (mass: 1, stiffness: 300, damping: 30); scale transitions from 0.96 to 1.0; opacity transitions from 0 to 1 over 200ms

**Given** iOS Reduce Motion is enabled
**When** any animated component renders
**Then** all spring animations are replaced with 150ms opacity-only fades; no scale transforms apply; no user-facing behaviour difference other than reduced motion

**Given** any file in `src/components/ui/`
**When** its imports are inspected
**Then** no Supabase client, API route, or external service import appears; components are pure UI with no data dependencies

---

### Story 1.3: Atmospheric Background System

As a user,
I want the app background to feel alive and context-aware,
So that the visual environment matches the cuisine or restaurant I'm viewing.

**Acceptance Criteria:**

**Given** no restaurant context is available
**When** the app loads or is on an empty state screen
**Then** the atmospheric background renders a neutral dark base (#0a0a0a) with no image; no broken or missing visual state occurs

**Given** a `sourceImageUrl` is passed to the atmospheric background
**When** the image loads
**Then** it renders full-bleed with `filter: blur(48px) saturate(1.4)`, a dark-mode gradient overlay (`linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)`), and a vignette at edges; in light mode the overlay uses `rgba(255,255,255,0)` to `rgba(255,255,255,0.45)`

**Given** the atmospheric background receives a new `sourceImageUrl`
**When** the context changes (e.g., navigating to a different restaurant)
**Then** the transition uses a 400ms ease crossfade to the new image; no hard cut or flash occurs

**Given** restaurant-specific colour extraction fails or returns insufficient data
**When** the atmospheric background falls back
**Then** it applies a cuisine-type fallback palette (tier 2); if cuisine palette also fails, it falls back to the neutral dark base (tier 3); the tier applied is logged internally

**Given** any palette is about to be applied
**When** the programmatic contrast check runs
**Then** `text-primary` against the composite background must satisfy WCAG AA (4.5:1 for body text, 3:1 for large text and UI components); if it fails, the system falls back one tier without applying the failing palette

**Given** the `AtmosphericBackground` component wraps the root layout
**When** rendered on any screen
**Then** it extends edge-to-edge including behind the status bar and home indicator; no content shift or horizontal overflow occurs

**Given** a restaurant's atmospheric palette is stored in `restaurants.atmospheric_palette_json`
**When** the user returns to the same restaurant context
**Then** no re-extraction call is made; the cached palette and image URL are used directly from the `['restaurants', restaurantId]` TanStack Query cache

---

### Story 1.4: App Shell & Home Empty State

As a user opening Plately for the first time,
I want to see a welcoming home screen with a clear first action,
So that I can immediately understand what to do without a tutorial.

**Acceptance Criteria:**

**Given** the app is opened and no recipes have been saved
**When** the home screen renders
**Then** the empty state displays: the prompt "Eaten somewhere great recently?" (text-xl, centred), supporting copy "Find the dish and save the recipe for next time." (text-sm, text-secondary, centred), a "Search for a dish" primary CTA button (56pt height, radius-xl, full width), and a secondary camera hint below it

**Given** the home screen empty state
**When** the user taps "Search for a dish"
**Then** the app navigates to the Search tab; the Search tab item becomes active in the glass tab bar

**Given** the glass tab bar is rendered
**When** visible on any screen
**Then** Home, Search, and Grocery tab items are visible; the active tab icon and label are at text-primary opacity; inactive tabs are at text-tertiary opacity; the camera FAB (56pt diameter, radius-full) is positioned to the right of or above the tab bar

**Given** the camera FAB is tapped from any tab
**When** tapped
**Then** a placeholder camera modal opens (no camera functionality in this story); the modal has a glass × dismiss button and can be closed

**Given** the user is on any tab
**When** they tap a different tab
**Then** the tab switch uses a 200ms ease crossfade; the active tab indicator updates immediately; no slide transition occurs

**Given** the app is opened at any point
**When** any screen is rendered
**Then** no login prompt, registration screen, or personal data request appears; all screens are accessible without authentication (FR38)

**Given** the app shell on iPhone Safari portrait mode
**When** rendered at 390pt viewport width
**Then** no horizontal scroll exists; all content fits within the viewport; the bottom safe area (home indicator) is respected and the tab bar sits above it

---

## Epic 2: Scan & AI Identification

Users can scan a menu or dish with their camera (or upload a photo) and receive an AI-identified result with confidence information — the product's defining capability.

### Story 2.1: Gemini Scan API Routes

As a developer,
I want Gemini-powered menu and dish scan API routes with the defined scan result contract,
So that the camera UI has reliable, correctly-shaped scan results to display.

**Acceptance Criteria:**

**Given** a valid image is submitted to `POST /api/scan/menu`
**When** Gemini processes the image
**Then** the route returns `{ data: { scanId: string, type: 'menu', dishes: DishResult[], confidenceSource: 'gemini-only' } }` with HTTP 200

**Given** a valid image is submitted to `POST /api/scan/dish`
**When** Gemini processes the image
**Then** the route returns `{ data: { scanId: string, type: 'dish', dishes: [DishResult], confidenceSource: 'gemini-only' } }` with HTTP 200

**Given** the `DishResult` shape
**When** returned by either route
**Then** each dish contains: `name: string`, `description: string`, `calorieEstimate: number | null`, `ingredients: IngredientResult[]`, `imageUrl: null` (Google Places enrichment is not performed here); `imageUrl` is always null at this stage

**Given** the `IngredientResult` shape
**When** returned
**Then** each ingredient contains: `name: string`, `quantity: string | null`, `unit: string | null`, `confidenceLevel: 'high' | 'medium' | 'low'`

**Given** `getApiKeys()` is called inside both routes
**When** the Gemini API key is read
**Then** no key value appears in any response body, response header, or serialised output visible to the client (NFR05)

**Given** a scan image is received by either route
**When** the request lifecycle ends (success or failure)
**Then** no image binary data has been written to Supabase storage, a filesystem path, or any persistent location (NFR07)

**Given** Gemini is unavailable or the request times out
**When** the route catches the error
**Then** it returns `{ error: 'Gemini service unavailable', code: 'SCAN_SERVICE_UNAVAILABLE' }` with HTTP 503; no silent failure

**Given** any route-level error occurs
**When** the error response is sent
**Then** it always uses the `{ error: string, code: string }` shape with the correct HTTP status (400 bad request, 422 validation, 500 server error, 503 service unavailable); no other error shape is used

---

### Story 2.2: Camera Modal & Capture Flow

As a user at a restaurant,
I want to open my camera and scan a menu or dish,
So that I can start the AI identification process with a single gesture.

**Acceptance Criteria:**

**Given** the user taps the camera FAB from any tab
**When** the camera modal opens
**Then** it displays: full-bleed camera preview (no border or frame), corner bracket guides (white 40%, 32pt each corner, radius-xs), a 72pt capture button (glass, radius-full, camera icon) centred at the bottom third, a 48pt upload button (glass, image icon) to the left of capture, and a glass × dismiss button (top right, 44pt touch target)

**Given** the corner brackets are visible
**When** 2 seconds have elapsed after the camera modal opened
**Then** the corner brackets fade out; no user interaction is required for this

**Given** the user taps the capture button
**When** the shutter fires
**Then** a brief shutter animation plays; the camera modal dismisses smoothly; the processing strip appears above the tab bar 300ms after the modal closes

**Given** the user taps the upload button
**When** the system photo picker opens
**Then** the camera modal remains open until a photo is selected or the picker is cancelled; once a photo is selected, the same dismiss + processing strip flow as camera capture occurs

**Given** a scan has been submitted and the processing strip is visible
**When** the strip renders
**Then** it shows: a 32×32pt thumbnail of the captured image (left, radius-xs), "Identifying your menu..." with an animated ellipsis (centre, text-sm), and an animated spinner (right, white 60%); height is 56–64pt; it springs up from below the tab bar (300ms)

**Given** the processing strip is showing and the scan result returns
**When** the result is ready
**Then** the strip text changes to "Your results are ready →"; the spinner becomes a chevron; a subtle pulse animation plays on the strip

**Given** the result is ready and the user taps the processing strip
**When** tapped
**Then** the app navigates to the scan results screen for that scanId

**Given** the processing strip is visible (scan still in progress)
**When** the user swipes down on the strip
**Then** an inline warning appears ("Swipe again to cancel"); if the user confirms, the strip dismisses and the in-flight scan is cancelled; no partial result is shown

**Given** the user taps the × dismiss button on the camera modal
**When** dismissed before taking a photo
**Then** no scan is submitted; no processing strip appears; the app returns to the previous state (FR05)

**Given** this is the user's first time tapping the camera FAB
**When** the OS camera permission prompt fires
**Then** in-app value-framing copy ("To scan menus and dishes") has been displayed before the OS system dialog appears (UX-DR9)

**Given** the user has denied camera permission at the OS level
**When** the camera FAB is tapped
**Then** a clear explanation of impact is shown and the photo upload path is offered as the co-equal alternative; the capture button is visually disabled; the upload button remains fully active

---

### Story 2.3: Menu Scan Results & Dish Detail Bottom Sheet

As a user who has scanned a menu,
I want to see an image-rich dish list and tap into a dish for full details,
So that I can confidently decide what to order and understand what I'd be eating.

**Acceptance Criteria:**

**Given** a successful menu scan result
**When** the results screen renders
**Then** each dish is displayed as a card with: a 64×64pt thumbnail (radius-xs, from `imageUrl` or placeholder), dish name (text-base), one-line description (text-xs, text-secondary), and calorie estimate (FR39); the list is scrollable; restaurant name and retake button appear in the header

**Given** all dishes were successfully identified
**When** the results list renders
**Then** no partial result state banner is shown; all identified dishes are actionable

**Given** the user taps a dish card
**When** the bottom sheet opens
**Then** it springs up from below using spring physics; the results list behind dims to 40% opacity and scales to 0.95; the drag handle pill (4×36pt, white 30%) is visible at the top of the sheet

**Given** the dish detail bottom sheet is open
**When** rendered
**Then** it shows in order: drag handle, full-width dish image (200pt height, radius-sm top corners only), dish name (text-hero), evidence block (UX-DR5), one-line description (text-sm, white 60%), divider (white 10%), "Save Recipe" CTA (56pt, radius-xl, full width), "See Full Details" text link

**Given** the evidence block for a high-confidence result
**When** rendered
**Then** it shows a single-line confirmation text (e.g., "Confirmed by dish name, photo, and ingredients") in white 60%; tone is assured and informative; no amber, orange, or red colours are used anywhere in the result

**Given** the evidence block for a medium-confidence result
**When** rendered
**Then** it shows two lines of reasoning plus 3–4 ingredient pills identifying key evidence; still positive and assured in tone; no warning colours

**Given** the user swipes down on the bottom sheet
**When** the gesture completes
**Then** the sheet dismisses back to the dish list; the results list returns to full opacity and scale; no navigation stack change occurs

**Given** the retake button in the results header is tapped (FR04)
**When** tapped
**Then** the camera modal reopens; the previous result is cleared

**Given** the "See Full Details" link is tapped
**When** navigated
**Then** a full-page recipe detail view renders showing the complete ingredient list (FR14) with quantities, the calorie estimate, and serving size

---

### Story 2.4: Async Confidence Enrichment Pipeline

As a user viewing scan results,
I want the confidence evidence to improve automatically after the initial result,
So that I get the most accurate picture of what I'm eating without waiting for it.

**Acceptance Criteria:**

**Given** a scan result is returned from `/api/scan/menu` or `/api/scan/dish`
**When** the client hook (`use-scan.ts`) receives the initial result
**Then** it immediately renders the result AND fires a second call to `POST /api/scan/enrich` in parallel; the enrichment call does not block the result display (NFR02)

**Given** `POST /api/scan/enrich` receives the `scanId` and dish name context
**When** the route processes
**Then** it runs Google Places visual cross-reference and USDA name cross-reference in parallel server-side; both run independently; neither blocks the other (NFR09)

**Given** enrichment completes successfully
**When** the enrichment response arrives at the client
**Then** the evidence block on the results or detail screen updates with `confidenceSource: 'multi-source'` and refreshed `confidenceLevel` values per ingredient (FR10, FR11); no full re-render of the results screen occurs; only the evidence block updates

**Given** the `['scan-result', scanId]` TanStack Query cache entry exists
**When** the enrichment response arrives
**Then** the cache entry is updated in place; any component rendering that `scanId`'s evidence block reflects the updated confidence without a page reload

**Given** the user navigates away from the results screen before enrichment returns
**When** enrichment eventually completes
**Then** the confidence data is stored alongside the recipe at save time (if saved); no error is surfaced for the navigation away; no orphaned network request causes an error state

**Given** Google Places enrichment fails during `/api/scan/enrich`
**When** the route handles the error
**Then** the route returns the USDA cross-reference result with `imageUrl: null` for Google Places fields; no `{ error, code }` shape is returned; the client updates the evidence block with the partial enrichment result; no error state is shown to the user (FR36)

---

### Story 2.5: Partial Results, Retake & Inference State

As a user scanning in difficult conditions,
I want the app to handle low-confidence and partial results gracefully,
So that I always have a path forward even when lighting or image quality is poor.

**Acceptance Criteria:**

**Given** a menu scan identifies fewer dishes than are present on the menu (FR09)
**When** the results screen renders
**Then** a partial result banner displays: "We identified X of Y dishes — lighting may be affecting accuracy. Retake or continue with what we found?"; the identified dishes are fully displayed and actionable below the banner

**Given** the partial result banner is visible
**When** the user taps "Retake"
**Then** the camera modal reopens; the previous partial result remains accessible in the `['scan-result', scanId]` cache until a new scan overwrites it or the user dismisses

**Given** a dish scan where the combined confidence score falls below the auto-presentation threshold (FR12)
**When** the inference state renders
**Then** it shows: the user's captured photo (small, left) alongside a reference photo of the closest match (small, right); both images are equal dimensions (radius-xs); a natural-language question below (e.g., "Based on this photo, this looks most like a classic Carbonara. Does that match what you ordered?")

**Given** the inference state is shown
**When** the user confirms ("Yes, that's it")
**Then** the recipe is generated using the matched dish and presented in the standard dish detail bottom sheet; `confidenceSource` is recorded as `'user-confirmed'`

**Given** the inference state is shown
**When** the user taps "No" or enters a correction
**Then** the user can describe or name the dish; the system re-submits with the additional context; a new result is generated and displayed

**Given** a `DishResult` contains ingredients with `confidenceLevel: 'low'`
**When** shown in the ingredient list (FR40)
**Then** each low-confidence ingredient has a visual indicator (e.g., an icon) AND a text label (e.g., "varies by restaurant"); colour is never the sole indicator of uncertainty (NFR16)

---

### Story 2.6: Scan Error States & Graceful Degradation

As a user encountering service issues during a scan,
I want clear error messages and graceful fallback behaviour,
So that I always know what happened and can continue without losing the session.

**Acceptance Criteria:**

**Given** Gemini Vision is unavailable when a scan is submitted
**When** the API route returns HTTP 503
**Then** the client shows an error state within 15 seconds of the failure: failure cause in plain language ("Scan service is temporarily unavailable"), a retry button, and the option to try uploading a photo instead (FR35, NFR10)

**Given** an error state is displayed
**When** the user taps retry
**Then** the same scan is re-submitted with the same captured image; no duplicate processing strip appears

**Given** the error state component renders for any scan failure
**When** inspected
**Then** no raw error message, HTTP status code, stack trace, or internal service name is visible to the user; messaging is always plain-language

**Given** Google Places enrichment is unavailable during `/api/scan/enrich`
**When** the client receives the degraded response
**Then** the results screen continues displaying the Gemini-only result with `imageUrl: null`; no error state appears; the dish image slot shows a tasteful placeholder image or neutral colour; no user-facing notification of the enrichment failure (FR36, NFR11)

**Given** any error state on the results screen
**When** the error has been visible for more than 15 seconds
**Then** the retry button remains visible; the error state does not auto-dismiss; no silent failure occurs (NFR10)

---

## Epic 3: Recipe Save & Collection

Users can save dishes as recipes, manage their personal collection, and revisit saved meals — making the dining moment permanent.

### Story 3.1: Recipe Save Flow & Undo

As a user who has reviewed a dish result,
I want to save the recipe with one tap and undo immediately if needed,
So that I capture the moment without permanently committing if I made a mistake.

**Acceptance Criteria:**

**Given** the dish detail bottom sheet is open
**When** the user taps "Save Recipe"
**Then** the recipe is immediately saved to Supabase; the bottom sheet dismisses; a sonner toast appears for 4 seconds reading "Recipe saved" with an "Undo" action button

**Given** the undo toast is visible within 4 seconds
**When** the user taps "Undo"
**Then** the recipe and its `recipe_ingredients` rows are deleted from Supabase; the toast updates to "Recipe removed"; the `['recipes']` TanStack Query cache is invalidated; no partial state remains

**Given** a valid recipe payload is sent to `POST /api/recipes`
**When** the route processes it
**Then** it inserts one row into `recipes` and N rows into `recipe_ingredients`; it returns `{ data: { id, name, createdAt, servingSize, restaurantId } }` with HTTP 200

**Given** the recipe is saved from a scan result
**When** the POST payload is constructed
**Then** it includes: `name`, `dishImageUrl` (external URL or null), `confidenceMetadata` (from `confidence_metadata_json`), `servingSize` (default: 1), and `ingredients` array; no binary image data is included (NFR07)

**Given** the undo window expires (4 seconds pass) without undo action
**When** the toast disappears
**Then** the recipe record remains in Supabase; no further undo is possible; the recipe appears in the collection

---

### Story 3.2: Recipe Collection & Populated Home Screen

As a returning user with saved recipes,
I want to see my recipe collection on the home screen,
So that I can quickly find and revisit meals I've saved.

**Acceptance Criteria:**

**Given** one or more saved recipes exist
**When** the home screen renders
**Then** a featured recipe card (full-width, ~180pt image, dish name text-lg, restaurant name text-xs) appears at the top; a "Your Collection" section below shows a 2-column grid of recipe cards; atmospheric background adapts to the most recently viewed restaurant context

**Given** the home screen recipe grid
**When** a recipe card is tapped
**Then** the app navigates to the recipe detail page for that recipe

**Given** the `GET /api/recipes` route
**When** called
**Then** it returns `{ data: Recipe[] }` ordered by `created_at` descending; response uses camelCase domain types mapped from snake_case DB columns

**Given** the `['recipes']` TanStack Query cache is populated from a previous session
**When** the home screen loads
**Then** the recipe collection renders from cache within 1 second with no loading spinner; no network round-trip is required for the initial render (NFR03)

**Given** a recipe card in the collection
**When** swiped left
**Then** a delete affordance (red background, trash icon) slides in from the right; tapping it deletes the recipe immediately via `DELETE /api/recipes/[id]`; a sonner toast confirms the deletion; the `['recipes']` cache is invalidated

---

### Story 3.3: Recipe Detail Page

As a user who saved a recipe,
I want to view the full ingredient list and recipe details,
So that I understand what I need to cook the dish at home.

**Acceptance Criteria:**

**Given** the user taps a recipe card from the home screen
**When** the recipe detail page renders
**Then** it shows: dish image (from `dishImageUrl` or a placeholder), dish name (text-xl), restaurant name if associated (text-xs, text-secondary), the full ingredient list with names and quantities (FR14), serving size, the confidence evidence block, and an "Add to Grocery List" CTA

**Given** the evidence block on the recipe detail page
**When** rendered for a previously saved recipe
**Then** it shows the same confidence state as the original scan, using `confidenceMetadata` stored with the recipe; the evidence block renders correctly in a new session after the original scan is gone

**Given** the `GET /api/recipes/[id]` route
**When** called with a valid recipe id
**Then** it returns `{ data: Recipe }` with all `recipe_ingredients` joined; response uses camelCase domain types; HTTP 200

**Given** the `['recipes', recipeId]` TanStack Query cache entry
**When** the recipe detail page loads
**Then** it renders from cache within 1 second with no loading state if previously cached (NFR03)

**Given** the "Add to Grocery List" CTA on the recipe detail page
**When** tapped
**Then** it triggers the grocery list add flow (Epic 4); in this story it may show a "coming soon" state or be inactive; the CTA must be visually present

**Given** the recipe detail page renders for a recipe with stored nutritional data (from Story 3.6)
**When** the nutrition section renders
**Then** a nutrition panel shows total calories and per-serving macros (protein g, fat g, carbs g) aggregated across all ingredients; each ingredient row shows its individual macro breakdown

**Given** nutritional data is unavailable for one or more ingredients (USDA lookup returned no match at save time)
**When** the nutrition panel renders
**Then** a "Partial nutrition data" label is shown alongside available values; ingredients with no data show "—" rather than 0; the panel is still rendered (not hidden)

**Given** nutritional data fetch failed entirely at save time (USDA unavailable)
**When** the nutrition section would render
**Then** a "Nutrition unavailable" label is shown; the ingredient list and all other recipe detail functionality work normally (NFR12)

---

### Story 3.4: Recipe Edit & Portion Adjustment

As a user with a saved recipe that needs correcting,
I want to edit ingredients and adjust the serving size,
So that the recipe reflects reality and scales to my needs.

**Acceptance Criteria:**

**Given** the recipe detail page is open
**When** the user taps an edit button (pencil icon or "Edit")
**Then** the recipe edit view opens with all ingredients in editable inline fields; the serving size multiplier is editable; a "Save" action is available and a "Cancel" action discards changes

**Given** the recipe edit view
**When** the user edits an ingredient name or quantity
**Then** the change is reflected immediately in the edit view; unsaved changes are not yet persisted

**Given** the user taps "Save" in the edit view
**When** `PUT /api/recipes/[id]` is called
**Then** the updated recipe name, serving size, and all `recipe_ingredients` rows are persisted to Supabase; `['recipes', recipeId]` and `['recipes']` cache entries are invalidated; the recipe detail page reflects the updated values

**Given** the `PUT /api/recipes/[id]` route
**When** called with a valid payload
**Then** it returns `{ data: Recipe }` with HTTP 200; if validation fails (e.g., empty ingredient name), it returns `{ error: string, code: 'VALIDATION_ERROR' }` with HTTP 422

**Given** the user adjusts the serving size multiplier (e.g., from 1 to 4) (FR16)
**When** the multiplier is changed
**Then** all ingredient quantities in the edit view scale proportionally in real time; saving persists the scaled quantities

**Given** a user editing an ingredient before the initial save (from the dish detail flow — editing before confirming save)
**When** the edited recipe is saved
**Then** the edited values are persisted, not the original AI-generated values (FR15)

---

### Story 3.5: Recipe Delete, Restaurant Association & Return-Visit Banner

As a returning user,
I want recipes associated with restaurants and Plately to recognise where I've been,
So that my collection is organised and I see my history when I return somewhere I've eaten before.

**Acceptance Criteria:**

**Given** a recipe is saved from a scan result that includes restaurant context (name or Google Places ID)
**When** the recipe is stored
**Then** a `restaurants` row is created (if it doesn't already exist, matched by `google_places_id` or name) and `recipes.restaurant_id` is set to that restaurant's `id` (FR22)

**Given** a recipe is saved from a scan result at a restaurant already in the `restaurants` table
**When** the restaurant is matched
**Then** no duplicate `restaurants` row is created; the existing row's `id` is used; `updated_at` is updated

**Given** a `restaurants` row is created for the first time
**When** created
**Then** `atmospheric_palette_json` is null initially; it will be populated by the atmospheric theming pipeline when that restaurant context is first rendered

**Given** a recipe is deleted via swipe-to-delete on the home screen or the delete affordance in the edit view
**When** `DELETE /api/recipes/[id]` is called
**Then** the recipe row, all associated `recipe_ingredients` rows, and all associated `grocery_items` rows are deleted from Supabase; a sonner toast confirms; `['recipes']` cache is invalidated (FR21)

**Given** a scan result matches a restaurant that already has saved recipes in the `restaurants` table
**When** the home screen renders after the scan
**Then** a return-visit banner appears: "You've been here before — X saved recipes" with a tap target navigating to the restaurant profile (FR41 — scan-triggered)

**Given** the return-visit banner is tapped
**When** the restaurant profile page renders
**Then** it shows the restaurant name and all previously saved recipes associated with that `restaurant_id` (FR32)

---

### Story 3.6: USDA Nutritional Data at Save Time

> **Added:** Epic 2 retrospective (2026-03-22). Nutrition is a core Plately feature — positioned as "a tap away, not the hero." The USDA key and fetch pattern are already established from the Story 2.4 enrichment pipeline.

As a user who saves a recipe,
I want nutritional information stored alongside my ingredients,
So that I can see macros on the recipe detail page without an additional fetch.

**Acceptance Criteria:**

**Given** the user taps "Save Recipe" from the dish detail bottom sheet
**When** `POST /api/recipes` processes the save
**Then** for each ingredient, the route queries USDA FoodData Central for matching nutritional data; macro values (calories kcal, protein g, fat g, carbs g) are stored per ingredient on `recipe_ingredients`; the save completes even if USDA is unavailable (graceful degradation)

**Given** a USDA lookup matches an ingredient
**When** the match is found
**Then** macros are stored normalised to the ingredient's `quantity` and `unit`; if quantity/unit is null, macros are stored per 100g as a reference value

**Given** USDA returns no match for an ingredient or the USDA API is unavailable
**When** the ingredient is saved
**Then** macro columns are stored as null for that ingredient; no error is returned to the client; the recipe saves successfully

**Given** the `POST /api/recipes` route
**When** called
**Then** it performs USDA lookups in parallel across all ingredients via `Promise.allSettled`; total route latency must not degrade more than 2× versus a no-USDA baseline (USDA lookups run concurrently, not sequentially)

**Given** the `recipe_ingredients` schema
**When** a recipe is saved
**Then** each row stores: `id`, `recipe_id`, `name`, `quantity`, `unit`, `confidence_level`, `calories_kcal`, `protein_g`, `fat_g`, `carbs_g` (macro columns nullable)

> **Architecture note:** USDA is used in two distinct ways in Plately. (1) Confidence signals at scan time (existing, `/api/scan/enrich`): upgrade low-confidence ingredient confidence levels. (2) Nutritional data at save time (this story): fetch and store macros per ingredient. These are separate code paths. The USDA key and fetch pattern from Story 2.4 carry forward — no new API key required.

---

## Epic 4: Grocery List

Users can build a grocery list from saved recipes and shop from it in-store — closing the arc from restaurant to home kitchen.

### Story 4.1: Add Recipe to Grocery List

As a user with a saved recipe,
I want to add all its ingredients to my grocery list in one tap,
So that I can shop for the meal without manually entering each item.

**Acceptance Criteria:**

**Given** the recipe detail page is open
**When** the user taps "Add to Grocery List"
**Then** all ingredients from the recipe are added to `grocery_items`; each row stores `recipe_id`, `ingredient_name`, `quantity`, `unit`, and `checked: false`; a sonner toast confirms "X ingredients added to your grocery list"; the `['grocery-items']` cache is invalidated

**Given** the `POST /api/grocery` route receives a `recipeId`
**When** called
**Then** it fetches `recipe_ingredients` for that recipe and upserts into `grocery_items`; it returns `{ data: { added: number, merged: number } }` with HTTP 200

**Given** an ingredient with the same name already exists in `grocery_items`
**When** new ingredients from a second recipe are added
**Then** the existing item's quantity is merged/incremented rather than creating a duplicate row; the `recipe_id` on the merged row is retained as the original (or the most recent) for recipe-view grouping (FR24)

**Given** the add action completes
**When** the user taps the Grocery tab
**Then** the grocery list immediately reflects the newly added ingredients; no reload or pull-to-refresh is required

---

### Story 4.2: Grocery List Ingredient View

As a user shopping in-store,
I want to view and check off individual ingredients from a flat list,
So that I can track what I've picked up without needing to group items by meal.

**Acceptance Criteria:**

**Given** the Grocery tab is opened and grocery items exist
**When** the ingredient view renders (the default view)
**Then** items are displayed as 56pt rows; each row shows: check circle (24pt, left), item name (text-base), and quantity + unit (text-sm, right-aligned) (UX-DR13)

**Given** the user taps the check circle on a grocery item
**When** tapped
**Then** the item immediately shows strikethrough text and 40% opacity via optimistic update; `PUT /api/grocery/[id]` is called to persist `checked: true`; if the call fails, the optimistic update is rolled back (FR26)

**Given** a checked grocery item
**When** the user taps the check circle again
**Then** the strikethrough and opacity are removed via optimistic update; `PUT /api/grocery/[id]` is called to persist `checked: false` (FR26)

**Given** a grocery item row
**When** swiped left
**Then** a delete affordance appears (red, trash icon); tapping it calls `DELETE /api/grocery/[id]`; the item is removed; `['grocery-items']` cache is invalidated (FR27)

**Given** checked items exist in the list
**When** a "Clear checked" action is triggered (e.g., a button in the screen header)
**Then** all items with `checked: true` are removed via `DELETE /api/grocery/bulk?checked=true`; the list updates immediately (FR28)

**Given** the grocery list is empty
**When** the empty state renders
**Then** it shows "Add a saved recipe to start your list →" with a CTA navigating to the recipe collection; warm tone, not apologetic (UX-DR8)

**Given** the `GET /api/grocery` route
**When** called
**Then** it returns `{ data: GroceryItem[] }` ordered by `created_at`; unchecked items appear before checked items

---

### Story 4.3: Grocery List Recipe View & Bulk Remove

As a user planning meals,
I want to view my grocery list grouped by recipe and remove an entire meal's ingredients at once,
So that I can manage what I'm cooking this week without hunting through a flat list.

**Acceptance Criteria:**

**Given** the Grocery tab is open
**When** the user taps the "By Recipe" toggle pill at the top of the screen
**Then** the list switches to recipe-grouped view with a 200ms crossfade; each recipe group shows a card with: recipe image thumbnail, recipe name, restaurant name (if available), and item count (UX-DR13)

**Given** a recipe group card
**When** expanded
**Then** nested ingredient rows appear (same 56pt rows with check-off affordance); a "Remove all X items" button is visible at the bottom of the group (FR28)

**Given** the "Remove all X items" button
**When** tapped
**Then** `DELETE /api/grocery/bulk` is called with the `recipeId`; all `grocery_items` rows for that `recipe_id` are deleted; a toast confirms "X items removed"; the group disappears from the view; `['grocery-items']` cache is invalidated

**Given** the `DELETE /api/grocery/bulk/route.ts`
**When** called with a `recipeId`
**Then** it deletes all `grocery_items` rows where `recipe_id` matches; it returns `{ data: { deleted: number } }` with HTTP 200

**Given** a recipe group has more than 3 items
**When** the group card first renders
**Then** only the first 3 items are shown with a "+ N more" disclosure row; tapping it expands all items for that group

**Given** both the ingredient view and the recipe view
**When** the toggle pill switches between them
**Then** the same underlying `['grocery-items']` TanStack Query cache is used; no additional network request fires on toggle; only the rendering changes

---

### Story 4.4: Offline Read Access

As a user without internet access (e.g., in-store while shopping),
I want to read my saved recipes and grocery list,
So that I can shop and cook without needing a connection.

**Acceptance Criteria:**

**Given** the PWA service worker is registered and the app has been opened at least once with internet access
**When** the user opens Plately without an internet connection
**Then** the home screen recipe collection renders from the service worker cache; no error state is shown for cached content (FR34, NFR03)

**Given** the grocery list was previously loaded while online
**When** the user accesses the Grocery tab offline
**Then** all grocery items are visible and the check-off interaction works locally via TanStack Query optimistic updates

**Given** grocery items are checked off while offline
**When** the network connection is restored
**Then** the locally-queued check state is synced to Supabase via background sync; no data is lost; no manual retry is required

**Given** the user attempts to initiate a scan (camera FAB) or search while offline
**When** the action is triggered
**Then** a clear, friendly message is shown: "Scan requires an internet connection"; scan and search are unavailable; no silent failure occurs; saved content remains accessible

**Given** the service worker caching strategy for static assets
**When** the app shell (JS, CSS, icons) is requested
**Then** it is served from cache-first; the app shell renders immediately without a network round-trip; the tab bar and navigation are visible even before any data loads

---

## Epic 5: Manual Search & Discovery

Users can find any restaurant or dish by name without the camera, getting a recipe on their first session — no dining occasion required.

### Story 5.1: Restaurant & Dish Search API Routes

As a developer,
I want restaurant search and dish lookup API routes,
So that the search UI can find restaurants and generate recipes without a camera.

**Acceptance Criteria:**

**Given** a call to `GET /api/search/restaurants?q=[query]`
**When** processed
**Then** it calls Google Places API using `getApiKeys()` and returns `{ data: Restaurant[] }` where each restaurant contains: `name`, `googlePlacesId`, `address`, `imageUrl` (string or null); response uses camelCase domain types; HTTP 200

**Given** a call to `GET /api/search/dishes?restaurantId=[id]&name=[dishName]`
**When** processed
**Then** it calls Gemini with the dish name and restaurant context as input; it returns `{ data: DishResult }` using the same `DishResult` contract as the scan routes (consistent shape)

**Given** Google Places is unavailable when `/api/search/restaurants` is called
**When** the error is caught
**Then** the route returns `{ error: 'Restaurant search unavailable', code: 'PLACES_UNAVAILABLE' }` with HTTP 503; no silent failure (NFR10)

**Given** USDA cross-reference is unavailable during dish lookup
**When** `/api/search/dishes` returns
**Then** it returns the dish result with `calorieEstimate: null` and a `nutritionAvailable: false` flag; the dish result is otherwise complete and functional (FR37, NFR12)

**Given** all search routes use `getApiKeys()`
**When** any key is read
**Then** no key value appears in any response body or response header visible to the client (NFR05)

---

### Story 5.2: Search Screen UI & Restaurant Results

As a first-time or returning user,
I want to search for a restaurant or dish by name,
So that I can get a recipe without needing to scan anything.

**Acceptance Criteria:**

**Given** the Search tab is opened
**When** no search query is entered
**Then** the screen shows: "Search" heading (text-2xl), a glass search input (radius-full, 52pt height, search icon + placeholder "Dish, restaurant..."), recent searches list below the input (50pt rows, glass, radius-md), and suggestion copy at the bottom ("Try: 'carbonara', 'sushi', 'bistro near me'") (UX-DR15)

**Given** the user types at least 3 characters in the search input
**When** the debounce period expires (300ms)
**Then** `GET /api/search/restaurants` is called; restaurant results display as glass cards with restaurant name, address, and image (or placeholder); no call fires on every keystroke

**Given** search results are displayed
**When** the user taps a restaurant card
**Then** the app navigates to the restaurant profile / dish list for that restaurant

**Given** a previous search was made
**When** the Search screen is opened
**Then** recent searches appear as rows below the input; tapping one re-runs that search immediately

**Given** Google Places is unavailable and the search fails
**When** an error state renders
**Then** it shows a retry option and the suggestion copy remains visible; the screen is not a dead end (UX-DR8)

---

### Story 5.3: Recipe Generation from Search

As a user browsing a restaurant's dish list,
I want to select a dish and get a full recipe,
So that I can save and cook a meal I've eaten or want to try — no camera required.

**Acceptance Criteria:**

**Given** the user has selected a restaurant from search results
**When** the restaurant's dish list renders
**Then** dishes are shown in the same visual format as menu scan results — image-led cards with dish name (text-base) and one-line description (text-xs) (FR30)

**Given** the user taps a dish from the restaurant's list
**When** the dish detail bottom sheet opens
**Then** it uses the identical bottom sheet component as scan results: drag handle, dish image, dish name (text-hero), evidence block, ingredient list, Save Recipe CTA, See Full Details link (FR31)

**Given** the user taps "Save Recipe" from the search-originated dish detail
**When** the recipe is saved
**Then** the same save flow as Story 3.1 is used; `restaurant_id` is set to the searched restaurant; `confidence_metadata_json` notes `confidenceSource: 'search-generated'`

**Given** the dish result was returned with `nutritionAvailable: false`
**When** the dish detail renders
**Then** a "Nutrition unavailable" label appears below the calorie estimate slot; all other dish detail content and the save flow work normally (FR37, NFR12)

---

### Story 5.4: Restaurant Profile & Complete Return-Visit Recognition

As a returning user at a favourite restaurant,
I want Plately to surface my saved recipes from that location and recognise I've been there before,
So that I can quickly build on my existing collection without starting from scratch.

**Acceptance Criteria:**

**Given** the user searches for and selects a restaurant that has saved recipes in their collection
**When** the restaurant profile page renders
**Then** it shows: restaurant name, restaurant image, all previously saved recipes from that location (FR32), and the list of browsable dishes

**Given** a previously saved recipe card on the restaurant profile
**When** tapped
**Then** the recipe detail page opens using the same flow as from the home screen

**Given** a scan result or manual search matches a `restaurants` row with existing saved recipes
**When** the home screen renders after the interaction
**Then** the return-visit banner ("You've been here before — X saved recipes") is displayed; this completes FR41 for both scan-triggered (Story 3.5) and search-triggered contexts

**Given** the return-visit banner is tapped
**When** navigated
**Then** the restaurant profile page opens showing all saved recipes from that location

**Given** the user has previously granted location permission
**When** the app detects a known restaurant nearby via location
**Then** the return-visit banner proactively appears on the home screen without requiring a scan or search; if location permission is denied, the banner only appears after scan match or manual search selection

**Given** `GET /api/recipes?restaurantId=[id]` is called
**When** recipes with matching `restaurant_id` exist
**Then** it returns `{ data: Recipe[] }` for that restaurant; HTTP 200; empty array if none exist

---

## Epic 6: Accessibility, PWA & Production Readiness

Plately is installable to iPhone home screen, accessible to all users, handles every error gracefully, and is ready to ship.

### Story 6.1: Accessibility Audit & Screen Reader Support

As a user with accessibility needs,
I want the app to work with VoiceOver and honour my motion preferences,
So that I can use Plately fully regardless of how I interact with my device.

**Acceptance Criteria:**

**Given** any dish image in the app
**When** VoiceOver reads it
**Then** it announces AI-generated descriptive alt text (e.g., "Duck Confit — crispy duck leg with cherry jus"); never announces "image" or nothing (UX-DR17)

**Given** the evidence block in any confidence state
**When** VoiceOver reads it
**Then** the full evidence text is announced; side-by-side reference photos are labelled "Your photo" and "Reference: [dish name]"

**Given** a bottom sheet opens
**When** VoiceOver is active
**Then** the sheet is announced as a modal region; focus moves into the sheet on open; when dismissed, focus returns to the triggering element

**Given** the processing strip changes state from "processing" to "result ready"
**When** VoiceOver is active
**Then** the state change is announced: "Your results are ready"; the user does not need to monitor the strip visually

**Given** any atmospheric palette change is about to be applied
**When** the programmatic contrast check runs
**Then** `text-primary` over the composite background passes WCAG AA (4.5:1 for body text, 3:1 for large text); failing palettes fall back one tier without rendering (UX-DR1, UX-DR17)

**Given** the iOS Reduce Motion setting is enabled on the test device
**When** the app is opened
**Then** all spring animations throughout the app are replaced with 150ms opacity-only fades; no scale transforms apply anywhere; atmospheric crossfades shorten to 150ms (UX-DR10)

**Given** all interactive elements throughout the app
**When** measured
**Then** every tappable element meets 44×44pt minimum touch target; grocery list item rows are 56pt minimum (NFR15)

**Given** any confidence indicator at any confidence level
**When** rendered
**Then** it communicates certainty using both a visual element (icon or colour) AND a text label; colour is never the sole indicator (NFR16)

---

### Story 6.2: PWA Install Experience

As a user who has completed their first successful scan,
I want to install Plately to my iPhone home screen,
So that I can launch it instantly without opening Safari each time.

**Acceptance Criteria:**

**Given** the user has completed their first successful scan and saved a recipe
**When** the PWA install prompt is offered
**Then** an in-app prompt appears with: "Add Plately to your home screen for one-tap access", an Install action button, and a Dismiss button (FR33, UX-DR18)

**Given** the install prompt is dismissed
**When** the user opens the app again in the same session
**Then** the install prompt does not reappear; it may reappear in a future session after a meaningful interval (not on every open)

**Given** `public/manifest.json`
**When** inspected
**Then** it contains: `name: "Plately"`, `display: "standalone"`, `theme_color`, `start_url`, and icon entries at 192×192pt and 512×512pt including at least one maskable icon

**Given** the app is launched from the iPhone home screen after install
**When** it renders
**Then** no Safari browser chrome is visible; the app fills the full screen including behind the status bar; the standalone PWA experience is indistinguishable from a native app shell

**Given** the app is accessed in Safari (not installed)
**When** all core flows are used (scan, recipe, grocery, search)
**Then** they work identically to the installed version; install is an enhancement only, never a requirement (UX-DR18)

---

### Story 6.3: Complete Error States & Notification Permission

As a user who encounters connectivity or service issues,
I want clear, actionable error messages for every failure scenario,
So that I always know what happened and what to do next.

**Acceptance Criteria:**

**Given** any external API (Gemini, Google Places, USDA) is unavailable
**When** an error occurs
**Then** the user sees a plain-language error state within 15 seconds identifying which service failed, a retry button, and whether partial functionality is available; no raw error messages or status codes are shown (FR35, NFR10)

**Given** the processing strip is visible for the first time in a session (first background scan)
**When** the strip appears
**Then** the app requests iOS notification permission with value-framing copy: "So we can tell you when your results are ready"; permission is requested at this moment, never pre-emptively on app launch (UX-DR9)

**Given** notification permission is denied
**When** a scan result is ready while the app is backgrounded
**Then** the processing strip is the primary delivery mechanism when the user returns to the app; no error or warning is shown for the denied permission; no functionality is degraded

**Given** the user loses network connectivity while the app is open
**When** any scan or search is attempted
**Then** an immediate offline indicator appears; scan and search inputs are disabled or display the indicator; saved recipes and grocery list remain accessible; no silent failure

**Given** the complete set of error states across the app (scan, search, recipe, grocery)
**When** each is triggered in testing
**Then** every error state has: a plain-language description, a retry or alternative action, and a path forward; no dead ends exist anywhere in the app (UX-DR8 complete audit)

---

### Story 6.4: Performance & Security Validation

As a product owner preparing for launch,
I want the app to meet all defined performance and security requirements,
So that Plately is fast, secure, and reliable for real dining use on iPhone Safari.

**Acceptance Criteria:**

**Given** a standard menu scan under normal network conditions on iPhone Safari
**When** measured end-to-end
**Then** scan submission to first result displayed is ≤10 seconds; the target of ≤5 seconds is achieved under good network conditions (NFR01)

**Given** confidence enrichment running after the initial scan result is displayed
**When** measured
**Then** the user sees the initial result within 500ms of scan completion; the enrichment update arrives and the evidence block updates without disrupting the displayed result (NFR02)

**Given** the recipe collection or grocery list with previously cached data
**When** rendered after at least one prior load
**Then** the view renders within 1 second from TanStack Query cache with no visible loading spinner (NFR03)

**Given** all interactive elements on a test device
**When** tapped
**Then** UI responds with visual feedback within 100ms (NFR04)

**Given** the complete production build
**When** the client-side bundle is inspected
**Then** no API key (`GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `USDA_API_KEY`) appears in any JS bundle, `NEXT_PUBLIC_` environment variable, or network response body or header (NFR05)

**Given** all client-server communication
**When** inspected via network monitoring
**Then** all requests use HTTPS; no plaintext HTTP requests are made to any external endpoint (NFR06)

**Given** all API routes that handle scan images
**When** a scan request lifecycle completes
**Then** no binary image data has been written to Supabase storage, any filesystem path, or any persistent location; the image exists only within the in-memory request lifecycle (NFR07)

**Given** all server-side and client-side code in the production build
**When** audited
**Then** no user device identifiers, IP addresses, location coordinates, or behavioural event logs are collected, stored, or transmitted; no PII of any kind appears in Supabase tables, logs, or external API calls (NFR08)

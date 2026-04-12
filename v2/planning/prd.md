---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish']
classification:
  projectType: web_app_pwa
  domain: consumer_food_dining
  complexity: medium
  projectContext: brownfield
  scopeCharacter: stabilization_and_ux_precision
inputDocuments:
  - '_context/prd.md'
  - '_context/project-context.md'
  - '_context/epics.md'
  - '_context/architecture.md'
  - '_context/ux-design-specification.md'
workflowType: 'prd'
date: '2026-04-11'
---

# Product Requirements Document - Plately

**Author:** Frank
**Date:** 2026-04-11

---

## Executive Summary

Plately is a mobile-first Progressive Web App (iPhone Safari primary) that transforms a restaurant menu scan — or a restaurant search from home — into an instantly-populated dish collection. Every dish surfaces with its macro breakdown and a photo. Nothing requires a save gesture; scanning or searching *is* capturing. Users curate by removing, not saving.

V2 is not a feature expansion. It is a precision rebuild with three explicit goals: (1) fix the reliability failures that undermine the core loop — dish photos and macro accuracy; (2) sharpen the dish-vs-recipe mental model — restaurants have **dishes**, home cooking produces **recipes**; (3) enforce progressive disclosure so the detail that matters at the restaurant (macros + photo) is never buried under detail that matters only at the stove.

**Target user:** Individual diners who want to understand what they're ordering before they commit, and who want to recreate dishes they love at home. Single-user, no auth, no social layer.

**The problem:** Restaurants present food as names and visuals. There is no fast path from "I want that" → "I know what I'm eating" → "I can make this again." Existing tools require manual entry or produce inconsistent, inaccurate results.

### What Makes This Special

The defining model shift is the inversion of capture intent. Every other food tracking tool asks users to explicitly save what they care about. Plately assumes everything on a menu is worth having and makes removal the only intentional act — eliminating the save-or-not decision at the exact moment cognitive load is highest.

The second differentiator is contextual information layering. At the restaurant, users need a macro signal and a visual confirmation — not an ingredient list. Plately surfaces exactly that at the card level. The ingredient list appears on dish tap; cooking instructions appear only when the user explicitly chooses to make the dish at home — the only moment those details become relevant.

**Core insight:** The gap between "I love this dish" and "I can have it again" is not a data problem — it's a friction problem. Plately closes it by treating every menu interaction as implicit ownership and withholding complexity until the user needs it.

### Project Classification

| Dimension | Value |
|---|---|
| **Project Type** | Web App — PWA, mobile-first, iPhone Safari primary |
| **Domain** | Consumer / Food & Dining |
| **Complexity** | Medium — multi-party API orchestration (Gemini vision, Google Places, USDA, Supabase), AI menu parsing, offline-capable |
| **Project Context** | Brownfield — v1 fully shipped; v2 rebuilt from v1 context |
| **Scope Character** | Stabilization + UX precision. No net-new features. Bulletproof core loop. |

---

## Success Criteria

### User Success

- A user at a restaurant scans the menu → all dishes appear within 10 seconds with macros and a photo, no explicit save required
- A user at home searches for a restaurant → same result: restaurant populated with all its dishes, macros, and photos
- Tapping a dish reveals the ingredient list; cooking instructions appear only when the user chooses to make the dish at home — never at card level
- Removing a dish from Recipes, or an entire restaurant from the collection, is clean and leaves no residual state
- Returning to a previously-scanned restaurant surfaces its dishes immediately (no re-scan required)

### Technical Success

- **Photos:** Google Places dish photos load on ≥90% of dishes where a restaurant is identified. Graceful placeholder renders on failure — no broken layout
- **Macros:** USDA lookups return consistent values for the same dish across repeated requests. Portion adjustment recalculates correctly
- **API boundaries:** Zod validation at every API route input and Gemini/USDA response. No silent data corruption from malformed AI output
- **Schema hygiene:** All schema changes go through numbered migrations. No repair-patch pattern (no more 002/006/008-style fixes)
- **Build stability:** No env var failures at Vercel build time; Supabase client guards in place

### Measurable Outcomes

| Outcome | Signal |
|---|---|
| Photo pipeline reliability | Photos visible on ≥90% of dish cards |
| Macro consistency | Same dish re-scanned returns values within ±5% |
| Core loop completion | Scan → populated restaurant in <10 seconds on LTE |
| Error-free builds | Zero Supabase/env-var build failures on Vercel |
| Progressive disclosure | Ingredient list and cooking instructions never visible at card level |

---

## Product Scope

V2 rebuilds the core loop with reliability and UX precision as the primary goals. The phase structure below defines what is committed, what is conditional, and what is deferred. Full capability detail and risk strategy are in [Project Scoping & Phased Development](#project-scoping--phased-development).

**Phase 1 — MVP:** Restaurant search and menu scan → auto-captured dish collection with macros + photos. Progressive disclosure: macros + photo at card level; ingredient list on tap; cooking instructions only on "Make it at home" intent. Reliable photo pipeline. Validated macro data. Graceful failure recovery.

**Phase 2 — Growth:** Grocery list generation from a dish. URL recipe import. Chain restaurant menu caching (repeat visits skip re-scan).

**Phase 3 — Vision:** Restaurant visit history ("Places I've been"). BYOAK (bring your own API key). Android Chrome support.

---

## User Journeys

The four journeys below trace the emotional arc from confusion to ownership: a restaurant discovery, a pre-visit browse, a home recreation, and a graceful partial failure. Together they cover the full capability surface of MVP and define the quality bar.

### Journey 1 — The Restaurant Discovery _(at-restaurant scan, happy path)_

**Persona:** Frank, at a new Thai restaurant he's never visited. The menu is unfamiliar and he has no idea what to order.

**Opening scene:** He's seated, the paper menu is in front of him. He doesn't recognise most dishes. He opens Plately and taps the camera button.

**Rising action:** He points his phone at the menu. Gemini parses the text; within a few seconds a confirmation banner appears with the restaurant name ("Sala Thai — is this right?"). He taps confirm. The restaurant screen populates: eight dish cards, each with a macro summary (calories, protein, carbs, fat) and a photo pulled from Google Places.

**Climax:** He can see at a glance that the Pad See Ew has 680 cal / 32g protein — exactly what he was hoping for. He also spots that the green curry is nearly 900 cal, more than he expected. The data changes what he orders.

**Resolution:** He orders the Pad See Ew. The entire restaurant — all eight dishes — is already in his collection. He did nothing to save it. Relief: he understood the menu before committing.

**Capabilities revealed:** Camera scan, Gemini menu parsing, restaurant name confirmation, Google Places photo fetch, macro display, auto-capture.

---

### Journey 2 — The Pre-Visit Browse _(at-home search, happy path)_

**Persona:** Frank, on his couch, planning dinner. He's thinking about Indian food and considering a place he's been to once before.

**Opening scene:** He opens Plately, taps Search, and types "Dishoom." The restaurant appears in results.

**Rising action:** He taps it. All dishes populate — sourced from a previously cached menu or freshly fetched. Each dish has a macro summary and a photo. He scrolls through, mentally building his order.

**Climax:** He notices the Chicken Ruby has 420 cal / 38g protein — a better macro split than he remembered. The House Black Daal is 310 cal. He decides: both.

**Resolution:** By the time he arrives, he already knows what he's getting. No deliberating at the table. Nostalgia and anticipation baked in before he's even left the house.

**Capabilities revealed:** Restaurant search, dish population from search (not scan), cached menu data, macro display, dish browsing.

---

### Journey 3 — The Recreation _(cook-at-home, extended journey)_

**Persona:** Frank, the day after a great dinner at an Italian spot. He wants to recreate the pasta carbonara.

**Opening scene:** He opens Plately and finds "Luce Osteria" in his collection. The carbonara dish card is there: 720 cal, macros visible.

**Rising action:** He taps the card. The dish detail expands — ingredient list: guanciale, egg yolks, pecorino, black pepper, rigatoni. He taps "Make it at home." Cooking instructions appear. He adjusts the portion slider from 1 to 2 servings; macros recalculate.

**Climax:** He taps "Add to grocery list." Ingredients are staged, quantities scaled to 2 servings.

**Resolution:** He heads to the store with a clean list. That night he recreates the dish. Payoff: the gap between "I loved that" and "I can have it again" is closed.

**Capabilities revealed:** Dish detail (ingredient list on tap), "Make it at home" intent gate for cooking instructions, portion adjustment with macro recalculation, grocery list generation from dish.

---

### Journey 4 — The Graceful Failure _(error recovery / partial recognition)_

**Persona:** Frank, at a small neighbourhood bistro — or searching a restaurant with limited Google Places data.

**Opening scene (scan path):** He scans a handwritten chalkboard menu. Gemini parses 7 of 10 dishes confidently; 3 are too smudged or ambiguous.

**Opening scene (search path):** He searches for a small restaurant from home. The system auto-scans available Google Places menu photos and reads 7 of 10 dishes.

**Rising action:** A scan confidence banner appears: *"7 of 10 dishes read — 3 couldn't be identified."* The 3 unrecognised dishes are suppressed from the collection entirely — no empty or broken cards.

**Progressive recovery — scan path:**
1. "Retake" → camera reopens; user re-scans the unread section of the menu
2. "Add manually" → user types in missing dish names
3. "Continue with 7" → accept partial results and dismiss

**Progressive recovery — search path:**
1. "Try more images" → system fetches additional photos from the restaurant's Places gallery, attempts to find more menu content automatically
2. "Scan it yourself" → if user has access to a physical menu, opens camera
3. "Add manually" → user types in missing dishes
4. "Continue with 7" → accept partial results and dismiss

**Climax:** For dishes that were recognised but have no Google Places photo, a warm styled placeholder tile renders (cream/greige palette, subtle dish silhouette) with a small *"No photo available"* label — clearly distinct from a real photo, but not broken or alarming.

**Resolution:** Frank uses what's there. Macros are available for all recognised dishes. Missing photos don't break the layout. He removes any dishes he doesn't care about and moves on.

**Capabilities revealed:** Scan confidence banner, dish card suppression for unrecognised items, progressive retry flow (context-aware: scan vs. search path), three-tier dish photo state system, graceful placeholder for recognised/no-photo state.

---

### Dish Photo State System

| State | Condition | Visual Treatment |
|---|---|---|
| **Confirmed** | Dish recognised + Google Places photo found | Full-bleed photo, no indicator |
| **Recognised, no photo** | Dish identified by Gemini, no Places photo available | Warm placeholder tile (cream palette); *"No photo available"* label. Growth: AI-generated image in Plately's visual style |
| **Unrecognised** | Gemini confidence below threshold | Card suppressed entirely + scan confidence banner with progressive retry |

---

### Journey Requirements Summary

| Journey | Capabilities Required |
|---|---|
| Restaurant Discovery | Camera scan, Gemini parsing, restaurant confirm, Places photo fetch, auto-capture, macro display |
| Pre-Visit Browse | Restaurant search, dish population, cached menu data, macro display |
| Recreation | Dish detail (ingredient list on tap), "Make it at home" intent gate, portion adjustment, macro recalculation, grocery list |
| Graceful Failure | Confidence banner, card suppression, context-aware retry (scan vs. search), three-tier photo state, warm placeholder |

---

## Domain-Specific Requirements

### API Cost Governance

Google Places is pay-per-use. Every photo fetch, nearby-places call, and text search incurs cost. Requirements:
- Batch Places photo requests; never fetch individually per dish if multiple dishes share a restaurant
- Cache all Places results aggressively — restaurant ID, photos, and metadata must be stored locally after first fetch
- Never trigger Places calls on keystrokes; fire only on confirmed user intent (tap search, confirm restaurant)

### Nutritional Data Accuracy

Plately is not a clinical tool, but users make food decisions based on macro data. Two display requirements follow:
- USDA-sourced macros display a data provenance indicator ("Source: USDA FoodData Central")
- AI-estimated macros — where no USDA match is found — are visually distinguished with a soft "~" prefix or "estimated" label, making confidence level legible at a glance

### Privacy Model

Single-user, no authentication, no PII stored. Explicit constraints:
- All data lives in Supabase under a single anonymous session
- User-captured images are sent to Gemini for inference only — not stored server-side
- No image data persists beyond the API call lifecycle
- This model must be stated explicitly in any public-facing app description if the app is ever shared or published

---

## Innovation & Novel Patterns

### Detected Innovation Areas

**Capture Inversion Model:** Plately treats every menu interaction as implicit ownership. Unlike all mainstream food tracking tools, which require explicit save gestures, Plately makes removal the only intentional act. This shifts the user's relationship with the app from "logger" to "curator."

**Context-Aware Progressive Resolution:** When AI confidence is partial, the system escalates through automated recovery steps before surfacing user action. The recovery path is context-sensitive — different options for scan path vs. search path — rather than a generic error state.

**Dish Photo State Triality:** A three-tier photo confidence system (confirmed / recognised-no-photo / unrecognised) as a first-class UX concept, with AI-generated imagery as a defined growth path for the middle state.

### Market Context

Mainstream food trackers (MyFitnessPal, Lose It!, Noom, Cronometer) require manual logging with barcode scanning as the fastest input. Restaurant-specific apps (Yelp, Google Maps) show dish photos and reviews but no nutritional data. No existing app combines: real-time menu scan → auto-capture → real restaurant photos → progressive disclosure by cooking intent → macro breakdown. The combination is the innovation.

### Validation Approach

- Core loop completion rate: scan → populated restaurant in <10s, no explicit save required
- User behaviour signal: does removal happen rarely (dishes kept by default) or frequently (suggesting auto-capture creates noise)?
- Photo confidence accuracy: what % of dishes land in state 1 (confirmed) vs. state 2 (recognised, no photo) vs. state 3 (suppressed)?

### Risk Mitigation

- **Capture noise risk:** Auto-capture could flood the collection with unwanted restaurants. Mitigation: restaurant-level removal (remove an entire visit in one action). Individual dish removal applies to the Recipes collection only — restaurants are their menus
- **AI confidence threshold:** If the unrecognised suppression threshold is too aggressive, users lose dishes silently. If too lenient, low-quality dishes pollute the collection. Threshold should be tunable and informed by v1 data

---

## Web App Specific Requirements

### Project-Type Overview

Plately is a Next.js App Router PWA — server-side rendered pages with client-side navigation. It behaves as an SPA for interactions but uses SSR for initial page loads and API key isolation. The primary rendering target is iPhone Safari. No desktop layout is required.

### Browser Matrix

| Browser | Support Level | Notes |
|---|---|---|
| iPhone Safari 16+ | **Primary — must work** | All features, all layouts, camera API |
| Chrome (desktop) | Supported for development/testing | No mobile-specific layout required |
| Android Chrome | Not in MVP scope | Deferred to Vision phase |
| Firefox, Edge | Not targeted | Incidental support only |

### Responsive Design

- Design viewport: 390px width (iPhone 14 base)
- No breakpoints required for desktop — single-column mobile layout throughout
- PWA installable: `manifest.json` with `display: standalone`, icons, theme colour
- Safe area insets respected throughout (`env(safe-area-inset-bottom)` for bottom nav, camera UI)
- No horizontal scroll anywhere

### Performance Targets

| Metric | Target | Context |
|---|---|---|
| Scan → populated restaurant | <10s on LTE | Gemini parse + Places fetch + USDA lookups |
| First Contentful Paint | <3s on LTE | Cold load of app shell |
| Offline read access | Full collection readable | TanStack Query cache; no write operations offline |
| Photo load | <2s per dish card on LTE | Google Places CDN delivery |
| Macro recalculation | Instant (<100ms) | Client-side math, no API call |

### SEO Strategy

Not applicable. Single-user personal app — no public discovery, no indexed pages, no metadata requirements beyond PWA manifest.

### Accessibility Level

WCAG 2.1 AA target, consistent with v1 Epic 6 work:
- Semantic HTML throughout; no `div` soup for interactive elements
- VoiceOver (iOS) tested and functional for core navigation
- `aria-live="polite"` on async state regions (enrichment progress, scan confidence banner) — text content changes, not `aria-label` mutations (v1 bug D3 fix carried forward)
- Minimum touch target 44×44px on all interactive elements
- Sufficient colour contrast across all text/background combinations in the warm greige palette

### Implementation Considerations

- **API key isolation:** All third-party API calls (Gemini, Google Places, USDA) remain server-side in Next.js API routes. No keys in client bundle
- **Progressive enrichment:** UI must handle Phase 1 (immediate Gemini result) and Phase 2 (async Places + USDA) gracefully — dish cards render with available data, update in place as enrichment completes
- **Zod at every boundary:** All API route inputs and all external API responses validated with Zod before touching application state
- **Migration-first schema:** All Supabase schema changes via numbered migration files — no ad-hoc column additions outside the migration pipeline

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Experience MVP — not a minimum proof-of-concept, but a minimum experience that actually delivers the emotional payoff. For a personal app, "users" is Frank. If the core loop doesn't feel reliable and satisfying, there is no product.

**Definition of done for MVP:** Frank can walk into any restaurant, scan or search, and trust that what Plately shows him is accurate and complete. Photos load. Macros are right. Nothing looks broken.

**Resource model:** Single developer with AI assistance. Scope decisions favour depth over breadth — one well-built feature beats three half-built ones. If something can't be done reliably in MVP, it moves to Phase 2.

### MVP Feature Set (Phase 1)

**Core journeys supported:** Restaurant Discovery (scan), Pre-Visit Browse (search), Graceful Failure (partial recognition + recovery)

**Must-have capabilities:**

| Capability | Justification |
|---|---|
| Restaurant search → dishes with macros + photos | The entire product value proposition |
| Menu scan (camera) → dishes with macros + photos | Primary at-restaurant use case |
| Restaurant name confirmation/correction | Required when Gemini can't read the name |
| Auto-capture model (no explicit save) | The defining UX innovation — if this isn't there, it's v1 |
| Dish card: macros + photo only | Progressive disclosure; ingredients hidden at card level |
| Dish detail (tap to expand): full macro breakdown + ingredient list | Second disclosure tier; gated behind tap, not shown at card level |
| Cooking instructions: "Make it at home" intent only | Third disclosure tier; never shown on card or ingredient expansion |
| Restaurant-level removal (collection) + dish removal (Recipes) | Two-collection curation model; removal granularity matches collection type |
| Scan confidence banner + context-aware retry | Graceful failure path; progressive resolution |
| Three-tier photo state system + warm placeholder | Confirmed / recognised-no-photo / suppressed — must be visually legible |
| Zod validation at all API boundaries | Reliability gate; no silent data corruption |
| Migration-first schema | Prevents the repair-patch pattern that plagued v1 |
| Graceful degradation on all external API failures | Places outage, USDA timeout, Gemini error — all handled without broken UI |

### Post-MVP Features

**Phase 2 — Growth:**
- Grocery list generation from a dish (cook-at-home path completion)
- URL recipe import
- Chain restaurant menu caching (repeat visits skip re-scan)

**Phase 3 — Vision:**
- Restaurant visit history ("Places I've been")
- AI-generated placeholder images for recognised/no-photo state
- BYOAK (bring your own API key)
- Android Chrome support

### Risk Mitigation Strategy

**Technical risks:**

| Risk | Mitigation |
|---|---|
| Google Places photo reliability (current pain point) | Implement the three-tier photo state as a first-class system, not an afterthought. Never assume a photo exists; always code for its absence. Test the fallback path as thoroughly as the happy path |
| Gemini macro accuracy / inconsistency | Tighter prompting with explicit JSON schema enforcement; Zod validation on every Gemini response; USDA lookup as the authoritative source, Gemini as the ingredient extractor only |
| Supabase env var failures at build time | Guard already partially in place (recent commit); formalise the pattern — all Supabase client initialisations must check for env vars and throw a clear build-time error, not a runtime one |
| Schema drift recurrence | Migration-first as a non-negotiable rule, not a preference. No column or table changes outside numbered migration files |

**Scope creep risk:** The roadmap already has clear phase boundaries. Any feature not in Phase 1 MVP gets deferred — no exceptions without explicit re-scoping. The v2 goal is reliability, not features.

---

## Functional Requirements

### Menu Capture

- **FR1:** User can capture a restaurant menu using the device camera
- **FR2:** System can extract dish names and descriptions from a captured menu image
- **FR3:** System can extract a restaurant name from a captured menu image
- **FR4:** User can confirm, correct, or skip the automatically detected restaurant name
- **FR5:** User can search for a restaurant by name to associate with an unidentified scan
- **FR6:** System displays a scan confidence indicator showing how many dishes were successfully recognised

### Restaurant Discovery

- **FR7:** User can search for a restaurant by name
- **FR8:** System can populate a restaurant's full dish collection from a search result
- **FR9:** System can retrieve previously cached dish data for a restaurant without requiring a new scan

### Dish Display & Progressive Disclosure

- **FR10:** User can view a dish card showing macro summary (calories, protein, carbs, fat) and a photo
- **FR11:** User can expand a dish card to reveal the dish's typical ingredient list
- **FR12:** User can access cooking instructions for a dish only after choosing to make it at home — not on card expansion
- **FR13:** System does not display cooking instructions at the dish card or ingredient-view level
- **FR14:** System displays a data provenance indicator when macro data is sourced from USDA FoodData Central
- **FR15:** System visually distinguishes AI-estimated macros from USDA-verified macros

### Dish Photo System

- **FR16:** System displays a real photograph for a dish when a Google Places photo is available
- **FR17:** System displays a styled placeholder tile for a dish that was recognised but has no available photo
- **FR18:** System suppresses dish cards for dishes that could not be recognised from the menu scan
- **FR19 _(Growth — pending test)_:** System evaluates whether providing a Google Places dish photo to the AI alongside the dish name improves ingredient accuracy; promotes to feature only if testing confirms meaningful improvement

### Nutritional Data & Ingredient Sourcing

- **FR20:** System infers typical ingredients for a dish from its name and cuisine context using AI knowledge — not from visual photo analysis
- **FR21:** System calculates macro totals (calories, protein, carbs, fat) for each recognised dish
- **FR22:** System sources macro data from USDA FoodData Central as the primary authoritative source
- **FR23:** System labels macro values that could not be verified against USDA as estimated
- **FR24:** User can adjust the serving portion of a dish and receive recalculated macros

### Collection Management

- **FR25:** System automatically adds all recognised dishes from a menu scan or restaurant search to the user's restaurant collection — no explicit save action required
- **FR26:** User can view all restaurants in their collection
- **FR27:** User can view all dishes associated with a specific restaurant
- **FR28:** User can remove an entire restaurant and all its associated dishes from their collection
- **FR29:** User can add a restaurant dish to their personal Recipes collection by choosing to make it at home
- **FR30:** User can view all dishes in their personal Recipes collection
- **FR31:** User can remove a dish from their personal Recipes collection

### Graceful Failure & Progressive Recovery

- **FR32:** System displays a scan confidence banner when not all dishes from a menu were recognised
- **FR33:** User can retake a photo to attempt recognition of previously unread dishes (scan path)
- **FR34:** System can fetch additional menu images from Google Places to attempt recognition of unread dishes (search path)
- **FR35:** User can manually add a dish name when automatic recognition fails
- **FR36:** User can accept a partial dish set and proceed without resolving unrecognised dishes
- **FR37:** System renders a non-broken placeholder when a Google Places photo fetch fails or returns no result

### System & Data Reliability

- **FR38:** System validates all inputs to API routes against a defined schema before processing
- **FR39:** System validates all external API responses (Gemini, Google Places, USDA) against expected schemas before using the data
- **FR40:** User can access their saved restaurant collection and Recipes without an internet connection (read-only)
- **FR41:** System handles failures from any external API without crashing or rendering a broken UI
- **FR42:** All database schema changes are applied through versioned, numbered migration files

### Platform, Navigation & Settings

- **FR43:** User can install Plately as a PWA on their iPhone home screen
- **FR44:** System caches Google Places restaurant data after first fetch to avoid redundant API calls on subsequent views
- **FR45:** Recipes is accessible as a primary bottom navigation destination
- **FR46:** Settings is accessible via a persistent header control — not a primary navigation tab
- **FR47:** Settings provides a complete data reset function to clear all restaurants, dishes, and recipes

### Growth Features _(Phase 2)_

- **FR48 _(Growth)_:** User can view cooking instructions for a dish in their Recipes collection (persistent access after initial "Make it at home" action)
- **FR49 _(Growth)_:** User can generate a grocery ingredient list from a dish in their Recipes collection
- **FR50 _(Growth)_:** User can import a dish from a URL and have it added to their Recipes collection
- **FR51 _(Growth)_:** System caches a scanned restaurant menu so repeat visits do not require re-scanning
- **FR52 _(Growth)_:** System generates an AI-created placeholder image for a recognised dish with no Google Places photo

---

## Non-Functional Requirements

### Performance

- **NFR1:** Menu scan → all dish cards rendered with macros completes in ≤10 seconds on LTE
- **NFR2:** Restaurant search → all dish cards rendered completes in ≤5 seconds on LTE
- **NFR3:** First Contentful Paint on cold app load ≤3 seconds on LTE
- **NFR4:** Individual dish photo loads within ≤2 seconds on LTE (Google Places CDN delivery)
- **NFR5:** Macro recalculation on portion adjustment completes in ≤100ms — client-side computation, no API round-trip
- **NFR6:** Offline collection read is immediate — no network dependency for cached data

### Security

- **NFR7:** All third-party API keys (Gemini, Google Places, USDA) are accessible only from server-side Next.js API routes — never present in the client bundle
- **NFR8:** User-captured images are transmitted to Gemini for inference only and are not persisted server-side beyond the API call lifecycle
- **NFR9:** No personally identifiable information is written to application logs
- **NFR10:** Supabase client initialisation validates required environment variables at build time and throws a descriptive error immediately — not silently at runtime

### Accessibility

- **NFR11:** All screens meet WCAG 2.1 Level AA compliance
- **NFR12:** All interactive elements have a minimum touch target of 44×44px
- **NFR13:** Async state changes (enrichment progress, scan confidence banner) are announced via `aria-live="polite"` regions using text content mutation — not `aria-label` attribute mutation (v1 regression: D3 fix carried forward)
- **NFR14:** Core navigation and dish browsing are functional with VoiceOver enabled on iOS

### Integration Reliability

- **NFR15:** Failure of any single external API (Gemini, Google Places, USDA) does not crash the application or render a broken UI — each has a defined degraded state
- **NFR16:** Google Places photo fetch failures degrade to the warm placeholder tile — no broken `<img>` elements rendered
- **NFR17:** USDA lookup failures degrade to AI-estimated macro display with visual labelling — macros are never silently absent
- **NFR18:** Gemini parsing failures surface a specific, actionable error state with retry options — not a generic error message
- **NFR19:** Google Places API calls are batched per restaurant and cached after first fetch — no per-dish individual requests

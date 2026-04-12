---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage-validation', 'step-04-ux-alignment', 'step-05-epic-quality-review', 'step-06-final-assessment']
documentsIncluded:
  prd: 'planning/prd.md'
  architecture: null
  epics: null
  ux: null
  v1_reference_architecture: '_context/architecture.md'
  v1_reference_epics: '_context/epics.md'
  v1_reference_ux: '_context/ux-design-specification.md'
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-11
**Project:** Plately v2

---

## PRD Analysis

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

**Growth Features (Phase 2)**
- FR48 _(Growth)_: User can view cooking instructions for a dish in their Recipes collection (persistent access after initial "Make it at home" action)
- FR49 _(Growth)_: User can generate a grocery ingredient list from a dish in their Recipes collection
- FR50 _(Growth)_: User can import a dish from a URL and have it added to their Recipes collection
- FR51 _(Growth)_: System caches a scanned restaurant menu so repeat visits do not require re-scanning
- FR52 _(Growth)_: System generates an AI-created placeholder image for a recognised dish with no Google Places photo

**Total FRs: 52 (47 MVP + 5 Growth)**

---

### Non-Functional Requirements

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
- NFR13: Async state changes (enrichment progress, scan confidence banner) are announced via `aria-live="polite"` regions using text content mutation — not `aria-label` attribute mutation (v1 regression: D3 fix carried forward)
- NFR14: Core navigation and dish browsing are functional with VoiceOver enabled on iOS

**Integration Reliability**
- NFR15: Failure of any single external API (Gemini, Google Places, USDA) does not crash the application or render a broken UI — each has a defined degraded state
- NFR16: Google Places photo fetch failures degrade to the warm placeholder tile — no broken `<img>` elements rendered
- NFR17: USDA lookup failures degrade to AI-estimated macro display with visual labelling — macros are never silently absent
- NFR18: Gemini parsing failures surface a specific, actionable error state with retry options — not a generic error message
- NFR19: Google Places API calls are batched per restaurant and cached after first fetch — no per-dish individual requests

**Total NFRs: 19**

---

### Additional Requirements & Constraints

**Domain: API Cost Governance**
- Google Places requests must be batched — never per-dish
- All Places results cached after first fetch (restaurant ID, photos, metadata)
- Places API calls fire only on confirmed user intent — never on keystrokes

**Domain: Nutritional Data**
- USDA-sourced macros must show "Source: USDA FoodData Central" provenance indicator
- AI-estimated macros visually distinguished with "~" prefix or "estimated" label

**Domain: Privacy**
- All data in Supabase under a single anonymous session
- No image data persisted server-side beyond the Gemini API call lifecycle
- Privacy model must be documented in any public-facing app description

**Technical Constraints**
- Framework: Next.js App Router, Tailwind CSS v4, Supabase, TanStack React Query v5
- Design viewport: 390px (iPhone 14 base); single-column mobile layout; no desktop breakpoints required
- PWA: `manifest.json` with `display: standalone`; safe area insets required throughout
- Progressive enrichment model: Phase 1 (Gemini) → Phase 2 (async Places + USDA); cards update in place

---

### PRD Completeness Assessment

**Strengths:**
- All 47 MVP FRs are specific, testable, and assigned to named capability groups
- NFRs have concrete metrics (≤10s, ≤100ms, ≥90%, ±5%) — measurable and verifiable
- Progressive disclosure model is unambiguous: three tiers (card / ingredient expansion / "Make it at home") with explicit suppression rules (FR12, FR13)
- Two-collection model is clearly defined and removal granularity matches collection type
- Three-tier photo state system is precisely documented with visual treatments
- Context-aware recovery paths (scan vs. search) are distinct and complete
- Growth features are clearly flagged and isolated — no MVP scope bleed
- Domain constraints (API cost, privacy, data accuracy) are implementation-ready

**Gaps requiring resolution before epic writing:**

| # | Gap | Severity | Notes |
|---|---|---|---|
| G1 | "Make it at home" UX flow unspecified | **Medium** | FR29 adds a dish to Recipes; FR12 shows instructions — but what is the UX? New screen? Modal? Sheet? No FR defines the interaction model for this transition |
| G2 | Portion adjustment scope ambiguous | **Low** | FR24 doesn't specify which collection(s) allow portion adjustment. The Recreation journey implies Recipes only, but this isn't stated in the FR |
| G3 | Journey 3 references Growth features | **Low** | Journey 3 (Recreation) ends with "Add to grocery list" — but FR49 is a Growth feature. Journey 3 as written describes a Phase 2+ scenario, not MVP. Should be labelled accordingly or split |
| G4 | Skip-name-confirmation handling | **Low** | FR4 allows users to "skip" restaurant name confirmation. No subsequent FR defines what happens to the restaurant in this case (nameless entry? generic placeholder? not added?) |
| G5 | Confidence threshold not defined | **Low** | FR18 suppresses unrecognised cards but no FR defines the threshold or whether it's configurable. PRD text notes it should be "tunable" — this is an engineering decision not yet captured as a requirement |
| G6 | Offline write behaviour | **Low** | FR40 specifies read-only offline access but no FR defines what happens when a user performs a write action (remove restaurant, remove dish) while offline |

---

## Epic Coverage Validation

**Status:** V2 epics not yet written — this is the expected state at PRD completion. The table below is the proposed epic structure derived from the PRD's FR groupings. It serves as the planning input for the epic breakdown workflow.

### Proposed v2 Epic Structure

| Epic | Title | FRs Covered | NFRs Covered |
|---|---|---|---|
| **Epic 1** | App Foundation & Schema | FR42, FR43, FR45, FR46, FR47 | NFR7, NFR10 |
| **Epic 2** | Menu Capture & Auto-Capture | FR1, FR2, FR3, FR4, FR5, FR6, FR25, FR38, FR39 | NFR1, NFR15, NFR18 |
| **Epic 3** | Dish Display, Photos & Nutrition | FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR20, FR21, FR22, FR23, FR24, FR37 | NFR4, NFR5, NFR16, NFR17 |
| **Epic 4** | Restaurant Search & Collection | FR7, FR8, FR9, FR26, FR27, FR28, FR44 | NFR2, NFR19 |
| **Epic 5** | Recipes Collection & Cook-at-Home | FR29, FR30, FR31, FR40 | NFR6 |
| **Epic 6** | Graceful Failure & Progressive Recovery | FR32, FR33, FR34, FR35, FR36, FR41 | NFR15–NFR18 |
| **Epic 7** | Accessibility, PWA & Production Readiness | FR43 (PWA UX), FR47 | NFR3, NFR7–NFR14 |
| **Growth** | Phase 2 features (post-MVP) | FR48, FR49, FR50, FR51, FR52 | — |

### FR Coverage Analysis

| FR | Group | Proposed Epic | Notes |
|---|---|---|---|
| FR1 | Menu Capture | Epic 2 | |
| FR2 | Menu Capture | Epic 2 | |
| FR3 | Menu Capture | Epic 2 | |
| FR4 | Menu Capture | Epic 2 | |
| FR5 | Menu Capture | Epic 2 | |
| FR6 | Menu Capture | Epic 2 | |
| FR7 | Restaurant Discovery | Epic 4 | |
| FR8 | Restaurant Discovery | Epic 4 | |
| FR9 | Restaurant Discovery | Epic 4 | |
| FR10 | Dish Display | Epic 3 | |
| FR11 | Dish Display | Epic 3 | |
| FR12 | Dish Display | Epic 3 | Gap G1: UX flow for "Make it at home" unspecified |
| FR13 | Dish Display | Epic 3 | |
| FR14 | Dish Display | Epic 3 | |
| FR15 | Dish Display | Epic 3 | |
| FR16 | Dish Photo System | Epic 3 | |
| FR17 | Dish Photo System | Epic 3 | |
| FR18 | Dish Photo System | Epic 3 | Gap G5: threshold not defined |
| FR19 | Dish Photo System | Growth | Pending test — not committed MVP |
| FR20 | Nutritional Data | Epic 3 | |
| FR21 | Nutritional Data | Epic 3 | |
| FR22 | Nutritional Data | Epic 3 | |
| FR23 | Nutritional Data | Epic 3 | |
| FR24 | Nutritional Data | Epic 3 | Gap G2: collection scope ambiguous |
| FR25 | Collection Management | Epic 2 | Auto-capture is a capture-time behaviour |
| FR26 | Collection Management | Epic 4 | |
| FR27 | Collection Management | Epic 4 | |
| FR28 | Collection Management | Epic 4 | |
| FR29 | Recipes Collection | Epic 5 | Gap G1: "Make it at home" UX flow |
| FR30 | Recipes Collection | Epic 5 | |
| FR31 | Recipes Collection | Epic 5 | |
| FR32 | Graceful Failure | Epic 6 | |
| FR33 | Graceful Failure | Epic 6 | |
| FR34 | Graceful Failure | Epic 6 | |
| FR35 | Graceful Failure | Epic 6 | |
| FR36 | Graceful Failure | Epic 6 | |
| FR37 | Graceful Failure | Epic 3 | Photo-specific failure — co-located with photo system |
| FR38 | System Reliability | Epic 2 | API validation is a scan-time concern |
| FR39 | System Reliability | Epic 2 | |
| FR40 | System Reliability | Epic 5 | Offline access for collection reads |
| FR41 | System Reliability | Epic 6 | Cross-cutting API failure handling |
| FR42 | System Reliability | Epic 1 | Migration-first schema is a foundation concern |
| FR43 | Platform | Epic 1 / Epic 7 | Manifest in Epic 1; install UX in Epic 7 |
| FR44 | Platform | Epic 4 | Places caching tied to restaurant search |
| FR45 | Platform | Epic 1 | Navigation shell is a foundation concern |
| FR46 | Platform | Epic 1 | |
| FR47 | Platform | Epic 7 | Data reset is a production-readiness concern |
| FR48 | Growth | Growth | Persistent instructions in Recipes screen |
| FR49 | Growth | Growth | Grocery list generation |
| FR50 | Growth | Growth | URL recipe import |
| FR51 | Growth | Growth | Menu caching for repeat visits |
| FR52 | Growth | Growth | AI-generated placeholder images |

### Coverage Statistics

- Total PRD FRs: 52
- MVP FRs mapped to proposed epics: 47 (100% — all accounted for)
- Growth FRs deferred to Phase 2: 5 (FR48–FR52)
- FRs with noted gaps requiring clarification: 3 (FR12, FR18, FR24/FR29)

### Key Structural Differences from v1 Epics

| Aspect | v1 | v2 |
|---|---|---|
| Recipe save flow | Explicit save gesture (Epic 2/3) | Auto-capture at scan/search time (Epic 2) |
| Collection model | Single recipe collection | Two collections: restaurant (auto) + Recipes (explicit) |
| Progressive disclosure | Card + ingredient list | Three tiers: card / ingredient expansion / "Make it at home" |
| Photo system | Enrichment pipeline adds photo async | Three-tier photo state system as first-class feature (Epic 3) |
| Graceful failure | Error state (Epic 2 story 6) | Full recovery workflow with context-aware paths (Epic 6) |
| Grocery list | MVP (Epic 4) | Growth feature (Phase 2) |

---

## UX Alignment Assessment

### UX Document Status

**V2 UX document: NOT FOUND** in `planning/` folder.

Available references:
- `_context/ux-design-specification.md` — v1 UX spec (UX-DR1 through UX-DR18); rich and detailed but maps to v1 model
- `references/style-profile.md` — design tokens, color palette, typography, component library (Bottom Nav Bar, Frosted Card, Camera Modal); covers visual design

**Assessment:** UX is clearly implied throughout the PRD. The v2 app is a mobile-first PWA with camera UI, card-based dish browsing, atmospheric backgrounds, and multi-screen navigation. A v2 UX spec is needed before epic-level stories can be written with confidence.

### Alignment Issues

**V1 UX patterns that carry forward unchanged:**
- Atmospheric background system (TIDE reference, style-profile.md documented)
- Frosted glass card components (style-profile.md documented)
- Camera modal UI (Google Lens + Snapchat reference, style-profile.md documented)
- Bottom navigation bar (Apple TV + Music reference, style-profile.md documented)
- Warm greige palette (style-profile.md documented)
- Spring animation system
- Accessibility requirements (WCAG 2.1 AA, Reduce Motion)

**V2 UX areas requiring new specification (NOT covered by v1 spec or style-profile.md):**

| Area | PRD Reference | Why New Spec Needed |
|---|---|---|
| Navigation model | FR45, FR46 | Recipes → primary bottom nav tab; Settings → header control. V1 has Settings as a nav tab. Full navigation shell needs redesign spec |
| Auto-capture model screens | FR25 | V1 has explicit save CTA. V2 has no save gesture — scan = capture. What does the restaurant screen look like immediately post-scan? No spec. |
| Two-collection layouts | FR26–FR31 | V1 has one recipe collection. V2 has restaurant collection + Recipes collection — two separate screens with different interaction models |
| "Make it at home" interaction | FR12, FR29 | Gap G1: most critical UX gap. What happens when user taps "Make it at home"? Bottom sheet? Full page? Navigation transition? No spec anywhere. |
| Three-tier progressive disclosure | FR10–FR13 | V1 shows ingredients + instructions on card tap. V2 splits into three tiers. Intermediate state (ingredient expansion before "Make it at home") needs visual design. |
| Scan confidence banner | FR6, FR32 | V1 has a partial-result banner but not this specific design. The banner + progressive recovery UI (retake / try more images / add manually / continue) needs specification. |
| Warm placeholder tile | FR17 | "Cream/greige palette, subtle dish silhouette, 'No photo available' label" — described in PRD and journeys but no visual spec |
| Restaurant screen | FR26, FR27 | The screen showing a restaurant + all its dishes needs layout spec |

### Warnings

⚠️ **WARNING: V2 UX specification not yet written.** The v1 UX spec (UX-DR1–UX-DR18) is a strong baseline but cannot be used directly for v2 epics — it maps to v1 interaction models (explicit save, single collection, two-tier disclosure) that have changed in v2.

⚠️ **CRITICAL GAP (G1 from PRD analysis):** The "Make it at home" interaction model is the central UX innovation connecting the restaurant collection to the Recipes collection. Without a UX spec for this interaction, Epic 5 (Recipes Collection & Cook-at-Home) stories cannot be written with sufficient acceptance criteria.

**Recommendation:** Before writing v2 epics, either:
1. Write a v2 UX spec (full or focused on the changed areas above), OR
2. Accept that Epic 5 stories will need G1 resolved as a pre-condition in the story's own discovery/design phase

The v1 UX spec and style-profile.md together provide sufficient coverage for Epics 1, 2, 3 (foundation, capture, display). The UX gap is most acute for Epics 4 and 5 (collection management and Recipes).

---

## Epic Quality Pre-Flight Review

**Note:** V2 epics have not yet been written. This section applies epic quality standards to the *proposed epic structure* from the Epic Coverage Validation step, identifying structural issues to resolve before writing begins.

### User Value Check

| Proposed Epic | Title | User Value Assessment | Pass/Fail |
|---|---|---|---|
| Epic 1 | App Foundation & Schema | "Schema" is developer-facing; "Foundation" is technical. Users get the app shell and navigation. | ⚠️ Rename |
| Epic 2 | Menu Capture & Auto-Capture | Users can scan a menu and have all dishes auto-populated. Clear user value. | ✅ |
| Epic 3 | Dish Display, Photos & Nutrition | Users see dish cards with macros, photos, and can expand to ingredient list. Clear user value. | ✅ |
| Epic 4 | Restaurant Search & Collection | Users can search for restaurants and browse their collection. Clear user value. | ✅ |
| Epic 5 | Recipes Collection & Cook-at-Home | Users can add dishes to personal Recipes and access cooking path. Clear user value — but G1 blocks full specification. | ⚠️ G1 dependency |
| Epic 6 | Graceful Failure & Progressive Recovery | Users receive helpful recovery when scans are partial. User-value framed correctly. | ✅ |
| Epic 7 | Accessibility, PWA & Production Readiness | Mixed: accessibility and PWA are user value; "production readiness" is a technical milestone. | ⚠️ Rename |

### 🔴 Critical Violations

**EQ-C1: Epic 5 cannot be fully specified without resolving G1 (Make it at home UX)**

FR12 and FR29 together define the central interaction in Epic 5, but the UX flow is unspecified. Stories written against this epic will produce vague acceptance criteria (e.g. "user can access cooking instructions" without defining how). This is a forward-dependency on a UX decision that hasn't been made.

_Remediation:_ Resolve G1 before writing Epic 5 stories. Either (a) write a focused UX note capturing the "Make it at home" interaction model, or (b) open Epic 5 with a UX-definition spike story that outputs the design decision as a documented assumption before implementation stories begin.

### 🟠 Major Issues

**EQ-M1: Epic 1 title is technical, not user-centric**

"App Foundation & Schema" describes developer work, not user value. Users experience the navigation shell and visual identity — not the schema.

_Remediation:_ Rename to "App Shell, Navigation & Visual Identity" — carries forward the v1 Epic 1 naming convention that passed quality review.

**EQ-M2: Epic 7 mixes user value with technical milestone**

"Production Readiness" is a developer milestone framing. The actual user value is: "Plately is accessible, installable, and handles every failure state gracefully."

_Remediation:_ Rename to "Accessibility, PWA & Production Hardening" or split the accessibility/PWA story (user-facing) from the performance/security audit story (technical validation).

**EQ-M3: Epic 6 (Graceful Failure) may create artificial sequencing**

Graceful failure handling is traditionally built story-by-story within the feature epic that introduces the failure mode. Pulling all recovery flows into a standalone Epic 6 risks: (a) earlier epics shipping without any error handling until Epic 6 arrives, and (b) Epic 6 having no user-visible feature if all preceding epics already handle their own failures.

_Remediation:_ Consider embedding failure handling in each feature epic (scan failures in Epic 2, photo failures in Epic 3, search failures in Epic 4), and reserving Epic 6 for the recovery flows that are genuinely cross-cutting (progressive retry for partial recognition, confidence banner). Alternatively, accept the standalone epic but define an explicit AC for each Epic 2–5 that includes a "degrade gracefully or surface error state" requirement that is validated in Epic 6.

**EQ-M4: FR43 (PWA install) split across Epic 1 and Epic 7**

The manifest + service worker goes in Epic 1 (infrastructure), but the install UX prompt goes in Epic 7. This is a reasonable split for v2, but the epic boundary needs to be made explicit in the story definitions to avoid duplicate work or omissions.

_Remediation:_ Epic 1 story covers: manifest.json, display: standalone, icon set, service worker registration. Epic 7 story covers: install prompt trigger, value-framing copy, dismiss behaviour.

### 🟡 Minor Concerns

**EQ-m1: Epic 3 is the largest epic (15 FRs)**

Progressive disclosure, photo states, nutritional sourcing, and portion adjustment are all in Epic 3. While the content is cohesive (all dish-card-level concerns), this may produce more stories than typical. Consider a natural break between "dish card display" (FR10-FR18) and "nutritional data & portion adjustment" (FR20-FR24) if stories become unwieldy.

**EQ-m2: Schema creation timing**

Best practice is to create database tables when first needed (not all upfront). For v2 as a brownfield rebuild from known v1 schema, creating the full v2 schema in Epic 1 Story 1 is pragmatic. However, the story should explicitly note the migration-first rule (FR42) so that any schema additions in later epics go through migrations, not ad-hoc column adds.

**EQ-m3: FR38/FR39 placement in Epic 2**

Zod validation at API routes (FR38/FR39) is a cross-cutting concern. Placing it in Epic 2 means it's implemented for scan routes first and expected to carry to all subsequent routes. The Epic 2 story should explicitly define the Zod validation pattern as a standard that all future API routes must follow — not just scan routes.

### Best Practices Compliance Summary

| Check | Status |
|---|---|
| All epics deliver user value | ⚠️ Epics 1 and 7 need renaming |
| Epic independence (each can ship alone) | ✅ Sequential but not circular |
| No forward dependencies | 🔴 Epic 5 depends on unresolved G1 |
| Stories can be completed independently | ⚠️ Cannot assess until stories are written |
| DB tables created when first needed | ⚠️ Note brownfield exception in Epic 1 story |
| Traceability to FRs | ✅ All 47 MVP FRs mapped to epics |
| Brownfield integration handled | ✅ V1 schema, API patterns, and context documented |

---

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK** — PRD is production-quality. One critical UX decision blocks Epic 5. Epic writing can begin for Epics 1–4 immediately.

---

### Critical Issues Requiring Immediate Action

**1. G1 / EQ-C1 — "Make it at home" UX flow is unspecified**

This is the single blocking issue. FR12 and FR29 define the interaction that moves a dish from the restaurant collection into the user's personal Recipes collection and surfaces cooking instructions. The PRD is silent on the UX: is it a bottom sheet? A new screen? A navigation transition? A modal?

Without this decision, Epic 5 stories cannot be written with meaningful acceptance criteria. Any story written now against FR29 will have ACs along the lines of "user can access cooking instructions" — impossible to implement or test.

**2. V2 UX specification does not exist**

The v1 UX spec (UX-DR1–UX-DR18) maps to the v1 interaction model. Eight areas in v2 require new UX specification: navigation shell redesign (FR45/46), auto-capture post-scan screen (FR25), two-collection layouts (FR26–FR31), "Make it at home" (G1 above), three-tier progressive disclosure intermediate state (FR10–FR13), scan confidence banner + recovery UI (FR6/FR32), warm placeholder tile (FR17), and restaurant screen layout (FR26/FR27).

Epics 1–3 can proceed without this document (v1 spec + style-profile.md cover the foundation, camera, and dish-card concerns). Epics 4 and 5 are exposed.

---

### Recommended Next Steps

1. **Resolve G1 before writing Epic 5 stories.** Two options:
   - Write a focused 1–2 page UX note capturing the "Make it at home" interaction model. It needs to answer: what triggers the transition, what the user sees, and how cooking instructions persist in the Recipes screen. This does not require a full UX spec.
   - Open Epic 5 with a spike story: "Define and document the 'Make it at home' interaction model." The spike outputs a recorded design decision that subsequent implementation stories depend on. This keeps Epic 5 in the backlog while Epics 1–4 ship.

2. **Apply the epic name fixes before writing stories.** Rename Epic 1 → "App Shell, Navigation & Visual Identity" and rename Epic 7 → "Accessibility, PWA & Production Hardening". These are one-line changes to whatever epic file the BMAD workflow creates, but making them early prevents the technical framing from infecting the story-writing vocabulary.

3. **Start the epic writing workflow for Epics 1–4.** The PRD fully supports story writing for these four epics. Use the proposed epic structure from this report as the input. Epic 2 (Capture) and Epic 3 (Dish Display) are the highest-value epics to write first — they cover the core product loop.

4. **Resolve low-severity PRD gaps during epic writing (do not block).** G2 (portion adjustment scope), G4 (skip-name handling), G5 (confidence threshold), and G6 (offline write behaviour) are all resolvable as explicit assumptions or ACs within individual stories. Flag them in the relevant story rather than reopening the PRD.

5. **Consider Epic 6 restructuring before writing its stories.** EQ-M3 is the only major structural risk: a standalone graceful-failure epic can leave Epics 2–5 without any error handling until Epic 6 arrives. Discuss whether to embed failure-handling ACs into each feature epic or maintain the standalone structure with explicit cross-epic expectations.

---

### Issues Summary

| Category | Count | Blockers |
|---|---|---|
| PRD gaps | 6 (G1–G6) | G1 blocks Epic 5 |
| UX alignment gaps | 8 areas | All in Epics 4–5 |
| Epic quality — Critical | 1 (EQ-C1) | Same root as G1 |
| Epic quality — Major | 4 (EQ-M1–M4) | None block immediately |
| Epic quality — Minor | 3 (EQ-m1–m3) | None |
| **Total issues** | **22** | **1 hard blocker (G1)** |

**The PRD itself has no structural problems.** All 47 MVP FRs are specific, testable, and mapped. The blocking issue is a UX decision that was deliberately deferred — now is the time to make it.

---

_Assessment completed: 2026-04-11_
_Assessor: Claude Code (bmad-check-implementation-readiness v1)_
_Documents reviewed: planning/prd.md (v2), _context/architecture.md (v1), _context/epics.md (v1), _context/ux-design-specification.md (v1), references/style-profile.md_

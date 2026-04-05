---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-e-01-discovery', 'step-e-02-review', 'step-e-03-edit']
inputDocuments: ['_bmad-output/project-context.md', '_bmad-output/planning-artifacts/research.md']
workflowType: 'prd'
date: '2026-03-17'
lastEdited: '2026-03-17'
editHistory:
  - date: '2026-03-17'
    changes: 'Post-validation edit — added 3 missing FRs (calorie estimate, per-item confidence, proactive restaurant recognition), fixed FR12/FR33/FR35/FR36 language, moved FR39-FR41 architectural constraints to Domain Requirements, fixed NFR02/NFR07/NFR11/NFR13/NFR14 measurability and leakage issues, added Device Permissions section to Mobile PWA Requirements'
classification:
  projectType: mobile_pwa
  domain: food_discovery
  complexity: medium-high
  projectContext: greenfield
  corePositioning: "Take home the food you love"
  simplestMVP: "Scan the menu. Know what you're getting. Love the meal. Take it home."
  productArc:
    moment1: "Transparency — scan a menu, understand the dish before you order (emotion: Relief)"
    moment2: "Capture — scan what you ate, take the recipe home (emotion: Nostalgia)"
    payoff: "Relive the moment — cook it at home with the grocery list in hand"
  productMoat: "The complete journey from 'I see it' to 'I can cook it' — scan, recipe, grocery list, cook."
---

# Product Requirements Document — Plately

**Author:** Frank
**Date:** 2026-03-17

---

## Executive Summary

Plately is a mobile-first Progressive Web App and dining companion — helping users discover what they're about to eat and recreate meals they've loved. The product owns two distinct moments in the dining experience: **pre-order transparency** (understanding an unfamiliar dish before ordering) and **post-meal capture** (taking a beloved recipe home to recreate). These moments form a complete arc from discovery to recreation that no existing product owns end-to-end.

The target user is a food lover who eats out regularly, encounters unfamiliar menus, and wants to cook more at home — not primarily motivated by calorie counting or macro tracking. The core emotional journey is **relief** (confidence in what you're ordering) followed by **nostalgia** (reliving a meal you loved).

The product is single-user with no authentication layer. The primary interface is a camera. The primary output is a saved recipe with an ingredient list that populates a grocery list — the moment the product pays off.

### What Makes This Special

Plately's differentiator is the end-to-end flow from *"I see it"* to *"I can cook it."* Existing alternatives own fragments of this journey: Google Lens reads menus but stops there; Yelp surfaces restaurant context but requires digging; MyFitnessPal has a camera scan but frames the experience around discipline rather than joy. Plately is the only product connecting pre-order discovery directly to post-meal capture to a usable grocery list — without requiring the user to search, log in, or navigate between apps.

**Core insight:** a restaurant meal is an ephemeral moment. Plately makes it permanent.

---

## Project Classification

| Attribute | Value |
|---|---|
| **Project Type** | Mobile-first PWA (iPhone Safari primary target) |
| **Domain** | Food discovery — recipe capture and recreation |
| **Complexity** | Medium-High (multi-modal AI vision, confidence-gated UX, multi-source validation pipeline) |
| **Project Context** | Greenfield (existing MacroLite codebase is reference only) |
| **MVP Scope** | Menu scan + dish scan → recipe + grocery list |
| **Primary Differentiator** | Complete arc: pre-order transparency → post-meal capture → home recreation |

---

## Success Criteria

### User Success

The primary success moment is **home recreation** — the user cooks a dish from a Plately-captured recipe and the result feels close to the restaurant original. This drives retention and word-of-mouth. If this moment fails, the product fails regardless of how well earlier steps work.

A secondary success moment is **pre-order confidence** — the user scans a menu, understands the dish, and orders with certainty. Valuable standalone; does not constitute full product success on its own.

The full journey must hold together. A failure at any step — poor scan accuracy, incomplete ingredient list, missing grocery items — breaks the recreation arc and undermines the emotional payoff.

**User success looks like:**
- User scans a menu or dish and receives an accurate ingredient list without manual correction
- User adds recipe to grocery list and shops for it without external lookup
- User cooks the recipe and the result is recognisably close to the original
- User returns to Plately the next time they eat out

### Business Success

Plately is a personal project and portfolio piece. Success is personal utility and shareability, not commercial metrics.

- Frank uses Plately consistently when eating out
- Friends find it useful and share it organically
- The codebase demonstrates production-quality thinking as a portfolio piece
- Revenue, if it occurs, is a bonus — not a goal

### Technical Success

Accuracy is the primary technical requirement. A slower, accurate result is preferable to a fast, inaccurate one.

- **Scan accuracy:** AI correctly identifies the dish and returns the right ingredients; confidence-gated UX ensures the user is never shown a wrong answer with false certainty
- **Ingredient completeness:** Ingredient list is complete enough to shop from without supplementary research
- **Recipe fidelity:** Resulting recipe, when cooked, produces a dish recognisably similar to the original
- **iOS PWA reliability:** Camera capture, scan processing, and result display work consistently on iPhone Safari without crashes or permission failures

### Measurable Outcomes

| Outcome | Target |
|---|---|
| Scan accuracy | Correct dish identification with complete ingredient list |
| Ingredient completeness | User can shop without supplementary lookup |
| Recipe fidelity | Home cook result is recognisably similar to original |
| Personal retention | Frank uses it on every dining-out occasion |
| Shareability | At least one friend adopts it organically |

---

## Product Scope

### MVP — Minimum Viable Product

The smallest Plately that delivers the full arc from pre-order transparency to home recreation:

- **Menu scan:** Camera captures a menu → AI identifies dishes → user sees dish images and descriptions → selects one to capture
- **Dish scan:** Camera captures a plated dish → AI identifies it → returns ingredient list
- **Recipe output:** Ingredient list with quantities; cooking steps as a secondary layer
- **Grocery list:** Aggregates ingredients from saved recipes; items are checkable in-store
- **Confidence-gated UX:** AI uncertainty visibly changes result presentation; partial results labelled as such
- **Editable results:** User can correct ingredient list and portion sizes before saving
- **Manual search:** User can find a restaurant and dish by name without using the camera
- **No authentication:** Single-user, no login required

### Growth Features (Phase 2 — v1.1 Fast Follow)

| Feature | Why deferred |
|---|---|
| Google Places enrichment (photos, reviews, location) | Optional enhancement; MVP works without it |
| Macro tracking (USDA pipeline) | Valuable but not load-bearing for core loop |
| Chain restaurant fast-path | Optimisation; correctness first |
| Cooking instructions | Nice-to-have; ingredient list ships first |
| Android Chrome support | iPhone validated first |
| URL recipe import | High retention value; fast-follow priority |

### Vision (Phase 3 — Expansion)

| Feature | Why deferred |
|---|---|
| BYOAK (bring your own API key) | Scaling concern; not needed for personal/friends use |
| Recipe book OCR | Tertiary capture mode |
| Restaurant caching | Repeat-visit optimisation |
| Social sharing | Post-validation |
| Local device photo storage | Scaling opportunity; not needed for MVP |

---

## User Journeys

### Journey 1: The Curious Diner — Full Arc (Happy Path)

**Meet Sofia.** She's 29, lives in the city, eats out twice a week. Tonight she's at a new Italian place her friend recommended. She opens the menu and immediately hits a wall — half the dishes are in Italian and she has no idea what *Tagliata di Manzo* is. Googling each item feels tedious.

She opens Plately and points her camera at the menu. In a few seconds, the dishes populate — each with a photo, a plain-English description, and a rough calorie estimate. *Tagliata di Manzo: sliced grilled ribeye with rocket and parmesan. ~620 calories.* She feels a wave of relief. She knows exactly what she's ordering.

The dish arrives and it's incredible. She wants this again. Before she leaves, she scans the plate. Plately identifies the dish, confirms the ingredients, and asks if she wants to save it. She taps save. On the walk home she taps "Add to grocery list." By the time she's on the couch, she has a shopping list ready for the weekend.

**The arc:** Unfamiliar menu → confident order → memorable meal → recipe captured → recreated at home.

**Capabilities revealed:** Menu scan, dish identification, dish images, calorie estimate, recipe save, grocery list generation.

---

### Journey 2: The Home Cook — Post-Meal Only

**Meet Daniel.** He went out for Korean BBQ last night on impulse — no Plately. The galbi was the best thing he's eaten in months.

He opens Plately the next morning. He still has a photo from Instagram he took at the table. He uploads it. Plately identifies it as *Galbi (Korean Short Rib)* with moderate confidence — it prompts him to confirm before proceeding. He confirms. The ingredient list comes back: short ribs, soy sauce, sesame oil, Asian pear, garlic, ginger, brown sugar. He edits the portion size for four servings and saves it. Grocery list updated.

**The arc:** Missed the moment → late capture via photo upload → recipe saved → grocery list ready.

**Capabilities revealed:** Photo upload (not just live camera), confidence confirmation prompt, editable portion size, recipe save.

---

### Journey 3: The Frustrated Scanner — Edge Case & Recovery

**Meet Marcus.** He's at a busy ramen bar, menu printed on a small card under dim yellow lighting. He scans it. Plately returns a partial result — three of seven dishes identified. The app labels it clearly: *"We identified 3 of 7 dishes — lighting may be affecting accuracy. Retake or continue with what we found?"*

Marcus retakes, angling the card toward the window. Six of seven come through. He picks the *Tonkotsu* and saves it. The result screen flags one item: *"Tare (seasoning sauce) — exact composition varies by restaurant."* Plately suggests a standard substitute and lets him edit it. Marcus adjusts and saves.

**The arc:** Bad scan conditions → partial result clearly labelled → retake prompted → uncertain ingredient flagged → user edits and saves.

**Capabilities revealed:** Partial result state, retake prompt, per-item confidence indicators, editable uncertain ingredients, fallback suggestions.

---

### Journey 4: The Repeat Visitor — Returning User

**Meet Priya.** She's been to her favourite Thai place four times this year. She saved the *Pad See Ew* recipe in Plately six months ago. Tonight she's back and wants to try the *Larb*.

She opens Plately and the app recognises the restaurant from her saved recipes: *"You've been here before — 2 saved recipes."* She taps the menu scan for the new dish. She saves the Larb and her grocery list now has ingredients for both dishes — automatically aggregated, duplicates merged.

**The arc:** Return visit recognised → previous recipes surfaced → new dish scanned → grocery list auto-aggregated across both recipes.

**Capabilities revealed:** Restaurant entity persistence, previous recipe surfacing, grocery list aggregation and deduplication.

---

### Journey 5: The Nostalgic New User — Search & Lookup

**Meet Frank.** He just downloaded Plately. He immediately thinks of the Duck Confit he had at *Bistro Margaux* three months ago — one of the best meals of his life. He never captured it.

He searches for *Bistro Margaux* in Plately. He finds *Duck Confit* in the listed dishes and taps it. Plately generates the recipe: duck legs, duck fat, thyme, garlic, bay leaf, sea salt. He adjusts for two servings and saves it. The grocery list updates. His first Plately recipe is saved before he's even eaten out with the app.

**The arc:** New user, no scan opportunity → manual restaurant search → dish found → recipe generated → saved on first session.

**Capabilities revealed:** Restaurant search, dish browse from restaurant menu, recipe generation without camera, first-session value with no dining-out occasion required.

---

### Journey Requirements Summary

| Capability | Revealed By |
|---|---|
| Menu scan with dish images + calorie estimate | Journey 1 |
| Dish scan / photo upload | Journeys 1, 2 |
| Confidence-gated UX + retake prompt | Journeys 2, 3 |
| Partial result state with clear labelling | Journey 3 |
| Per-item confidence + editable uncertain ingredients | Journey 3 |
| Editable portion size | Journeys 2, 3 |
| Recipe save + grocery list generation | All journeys |
| Grocery list aggregation + deduplication | Journey 4 |
| Restaurant entity persistence + return visit recognition | Journey 4 |
| Manual restaurant + dish search (no camera required) | Journey 5 |
| First-session value without dining-out occasion | Journey 5 |

---

## Domain-Specific Requirements

### API Security

All external API keys must be server-side only. No key may be exposed to the client, bundled into frontend code, or appear in network responses visible to the client. All external API calls are mediated through server-side API routes — never called directly from the client.

### Data Privacy & Storage

The data model is intentionally minimal:

- **Scan photos are not stored.** Images are sent to Gemini Vision for processing and immediately discarded. Only extracted recipe data (dish name, ingredients, quantities) is persisted.
- **No user accounts, profiles, or tracking.** Single-user by design; no mechanism for collecting or associating user data.
- **Stored data:** Recipe records (name, ingredients, quantities, source restaurant if available) and grocery list items. Nothing else.

Future consideration: local device photo storage for re-processing is a post-MVP scaling opportunity; must not be designed out of the architecture, but is out of scope for v1.

### External API Resilience

Each external service has an independently defined degradation path — a failure in one must not block the others:

| Service | Failure Mode | Graceful Degradation |
|---|---|---|
| Gemini Vision | Unavailable or timeout | Error state with retry prompt; never silent |
| Google Places | Not found or API down | Skip enrichment; proceed with scan-only result |
| USDA FoodData Central | Lookup fails | Show ingredients; flag as "nutrition unavailable" |

### Data Attribution

USDA FoodData Central data must be attributed per their public use terms wherever nutrition data is displayed.

### Bring Your Own API Key (Post-MVP, v2)

To enable sharing Plately without the owner incurring API costs or hitting shared rate limits, a future setup step will allow users to provide their own keys for Gemini Vision, Google Places, and optionally USDA.

**Architectural requirements for MVP:**
- API keys are read from a configuration layer (environment variables in MVP), not hardcoded into route logic — enabling per-user key injection in v2 without rewriting external API call behaviour
- Scan images are discarded within the same request lifecycle as identification; no image data is written to persistent storage
- The key source is abstracted from route logic so the same routes serve both shared-key (MVP) and user-provided-key (v2) scenarios without code changes

---

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Multi-Modal AI Vision in a Mobile PWA**
Plately delivers a full camera → AI vision → structured recipe output loop inside a PWA on iPhone Safari — a technical context most products avoid in favour of native apps. Executed well, this removes the App Store installation barrier while maintaining a near-native capture experience.

**2. The Pre-Order + Post-Meal Arc as a Single Product**
The Moment 1 → Moment 2 sequence (menu transparency before ordering → dish capture after eating) is a novel product framing. Individual capabilities exist in isolation across Google Lens, Yelp, and MyFitnessPal — but no product owns the continuous arc from "what am I about to eat?" to "I can recreate this at home." Plately's differentiator is the arc itself.

**3. Multi-Source Confidence Transparency**
Most AI food apps behave as binary oracles — they return an answer or an error. Plately's innovation is a stacked validation pipeline that surfaces trustworthiness at every step:

- **Name-based inference:** Well-known dish names carry ingredient expectations cross-referenceable against recipe corpora — an independent confidence signal from visual identification.
- **Visual cross-referencing:** Google Images and Google Places photos provide a visual match layer. High similarity reinforces the AI's identification.
- **Combined confidence score:** The trust signal the user sees is the product of both layers; the more sources agree, the higher the confidence surfaced.

Users learn *how much to trust* a given recipe — not just that a recipe exists. A high-confidence Carbonara (name recognised, visual match confirmed, ingredients cross-referenced) feels different from a "we think this is roughly right" result. That distinction, made transparent, builds durable product trust over time.

### Validation Approach

- **Name inference:** Cross-reference identified dish names against USDA FoodData Central and known recipe corpora; high name recognition → high baseline ingredient confidence
- **Visual validation:** Compare scan against Google Places and Google Images reference photos; strong visual match → confidence boost
- **User correction as signal:** Ingredient edits improve the confidence model for future scans of the same dish; user edits are data, not failures

### Innovation Risk Mitigation

| Risk | Mitigation |
|---|---|
| Confidence model produces false certainty | Never display 100% confidence; always show "based on [sources]" attribution |
| Visual cross-referencing adds latency | Run async after initial result is shown; user sees result immediately, confidence updates when validation completes |
| Unknown or novel dish has no reference data | Degrade to AI-only result with lower confidence label; prompt user to name the dish |
| PWA camera limitations on iOS Safari | Treat camera reliability as explicit acceptance criterion; evaluate Capacitor wrapper if camera UX is unacceptable |

---

## Mobile PWA Specific Requirements

### Platform Support

| Platform | MVP | Post-MVP |
|---|---|---|
| iPhone Safari (iOS) | ✅ Required | — |
| Android Chrome | — | v1.1 consideration |
| Desktop browsers | — | Out of scope |

Mobile-only layout. No desktop breakpoints required for MVP. All UI components designed for phone screen portrait orientation as the primary state.

### PWA Installation

PWA install-to-homescreen is a first-class experience on iPhone Safari:
- App manifest configured with correct name, icon, and display mode
- Install prompt surfaced clearly on first meaningful use
- App behaves as standalone when launched from homescreen (no browser chrome)

### Offline Behaviour

Plately requires an active internet connection for all scan and search functionality. Saved recipes and grocery list are accessible offline via PWA caching (read-only).

### Device Permissions

Camera and photo library access are the primary interface. Permission handling must be explicit:

- Camera permission is requested at the point of first scan, not on app launch
- Photo library permission is requested when the user first initiates a photo upload
- When camera access is denied, the system presents a clear explanation of impact and offers photo upload as an alternative
- When both camera and photo library access are denied, scan functionality is unavailable; manual restaurant search remains fully accessible
- Permission prompts are not repeated on every session — the system respects the user's OS-level decision

### SEO

Not applicable. Plately is a single-user app with no public-facing pages requiring search indexing.

---

## Project Scoping & Phased Development

### MVP Strategy

**Approach:** Experience MVP — the smallest version that delivers the complete emotional arc from pre-order transparency to home recreation. A partial arc does not validate the concept.

**Core thesis:** Users who scan a menu or dish, save the recipe, and successfully recreate it at home will return to Plately every time they eat out.

**Resource profile:** Solo developer. Lean, sequential build.

### MVP Must-Have Capabilities

| Capability | Rationale |
|---|---|
| Menu scan — identify dishes, show images | Moment 1 (Relief) — core to the full arc |
| Dish scan / photo upload | Moment 2 (Nostalgia) — post-meal capture |
| AI identification with confidence-gated UX | Trust signal; never show wrong answers confidently |
| Partial result state + retake prompt | Edge case survival — bad lighting, partial menus |
| Recipe output — ingredient list with quantities | The "take it home" deliverable |
| Editable ingredients + portion size | Accuracy; users must be able to correct |
| Grocery list — aggregated, checkable | Proof-of-value; completes the loop |
| Manual restaurant + dish search | First-session value; no dining-out occasion required |
| PWA install to iPhone homescreen | Near-native experience without App Store |
| No photo storage — process and discard | Privacy + simplicity |
| No authentication | Single-user; zero onboarding friction |
| API key abstraction layer | Architectural prerequisite for future BYOAK |

### Risk Mitigation

| Risk | Mitigation |
|---|---|
| AI accuracy (highest risk) | Confidence-gated UX; user correction flow; async cross-referencing |
| PWA camera on iPhone Safari | Explicit acceptance criterion; evaluate Capacitor wrapper if needed |
| Google Places fragility | Optional enrichment; fallback UX defined |
| External API downtime | Independent degradation paths; no silent failures |

**Resource contingency:** If scope proves too large, URL import and Google Places enrichment are the first Phase 2 cuts without affecting the MVP story.

---

## Functional Requirements

### Capture

- **FR01:** User can capture a menu by pointing their device camera at a physical menu and initiating a scan
- **FR02:** User can capture a dish by pointing their device camera at a plated dish and initiating a scan
- **FR03:** User can upload a photo from their device photo library as an alternative to live camera capture
- **FR04:** User can retake a scan when the initial capture produces a partial or low-confidence result
- **FR05:** User can cancel a scan at any point before saving

### AI Identification & Confidence

- **FR06:** The system identifies dishes from a menu scan and presents them as a selectable list with images and plain-language descriptions
- **FR07:** The system identifies a dish from a dish scan or uploaded photo and presents the result with an ingredient list
- **FR08:** The system assigns a confidence level to each scan result and communicates it using both a visual indicator and a text label
- **FR39:** The system displays a calorie estimate for each dish identified from a menu scan alongside the dish image and description
- **FR40:** The system assigns and displays a confidence indicator for each ingredient in a recipe result, distinguishing high-certainty ingredients from those that vary by restaurant or cannot be confirmed
- **FR09:** The system presents a partial result state when only some dishes or ingredients are identified, clearly labelling what was and was not captured
- **FR10:** The system validates AI identification against known dish names and recipe corpora to produce a combined confidence signal
- **FR11:** The system validates AI identification against reference images asynchronously and updates the confidence signal when validation completes
- **FR12:** The system prompts the user to name or describe the dish when the combined confidence score falls below the threshold required to present a result automatically
- **FR13:** User can confirm or reject an AI-identified result before it is saved

### Recipe Management

- **FR14:** User can view the full ingredient list for an identified dish, including ingredient names and quantities
- **FR15:** User can edit any ingredient in a recipe result before saving
- **FR16:** User can adjust the serving size / portion multiplier for a recipe result before saving
- **FR17:** User can save a recipe result to their personal recipe collection
- **FR18:** User can view all saved recipes in a recipe collection list
- **FR19:** User can open and view the full details of a saved recipe
- **FR20:** User can edit a saved recipe after it has been saved
- **FR21:** User can delete a saved recipe from their collection
- **FR22:** The system associates each saved recipe with a source restaurant entity where available, enabling future grouping and retrieval

### Grocery List

- **FR23:** User can add all ingredients from a recipe to the grocery list in one action
- **FR24:** The system aggregates ingredients from multiple saved recipes into a single grocery list, merging duplicate ingredients
- **FR25:** User can view their full grocery list
- **FR26:** User can check off individual grocery list items while shopping
- **FR27:** User can remove individual items from the grocery list
- **FR28:** User can clear all checked items from the grocery list

### Discovery & Search

- **FR29:** User can search for a restaurant by name without using the camera
- **FR30:** User can browse dishes associated with a found restaurant and select one for recipe generation
- **FR31:** The system generates a recipe for a searched dish using the same AI identification and confidence pipeline as camera captures
- **FR32:** User can view previously saved recipes associated with a restaurant they have visited before
- **FR41:** The system proactively surfaces previously saved recipes when the user opens or scans a restaurant they have visited before

### App Experience & Recovery

- **FR33:** User can install Plately to their iPhone home screen via the app install prompt
- **FR34:** User can access their saved recipes and grocery list without an internet connection (read-only)
- **FR35:** The system presents an error state identifying the failure cause, with a retry option, within 15 seconds of external API unavailability
- **FR36:** The system continues with scan-only results when restaurant data enrichment is unavailable, without surfacing an error to the user
- **FR37:** The system presents a "nutrition unavailable" label when USDA macro data cannot be retrieved, without blocking the recipe save flow
- **FR38:** User can access Plately without creating an account or providing any personal information

---

## Non-Functional Requirements

### Performance

- **NFR01:** Scan submission to first result completes within 10 seconds under normal network conditions on iPhone Safari; target under 5 seconds
- **NFR02:** Confidence enrichment runs asynchronously — the user sees their initial result within 500ms of scan completion; the confidence score updates when validation completes
- **NFR03:** Saved recipe and grocery list views load from local cache within 1 second, with no network dependency
- **NFR04:** All interactive UI elements respond to user input within 100ms

### Security

- **NFR05:** All external API keys are stored server-side only; no key appears in client-side code, browser-exposed environment variables, or network responses visible to the client
- **NFR06:** All client-server communication uses HTTPS; no plaintext HTTP connections permitted
- **NFR07:** Scan images are discarded within the same request lifecycle as identification; no image data is written to persistent storage
- **NFR08:** No personally identifiable information is collected, stored, or transmitted; the system does not log user behaviour, device identifiers, or location data

### Integration Reliability

- **NFR09:** Each external API dependency has an independently defined failure mode — a failure in one does not cascade to block the others
- **NFR10:** A user-visible error state with retry affordance surfaces within 15 seconds of an external API timeout or failure; silent failures are not acceptable
- **NFR11:** Restaurant data enrichment is additive — its absence does not degrade core recipe capture or save functionality
- **NFR12:** USDA nutrition data is optional — its absence does not prevent recipe saving or grocery list generation

### Scalability

- **NFR13:** The system operates within MVP infrastructure tier constraints (500MB database storage, 2GB monthly bandwidth); query patterns and storage schema are designed with these limits in mind
- **NFR14:** The API key configuration layer is extensible to support user-provided keys without changes to external API call behaviour

### Accessibility

- **NFR15:** All interactive elements meet a minimum touch target size of 44×44 points per Apple Human Interface Guidelines
- **NFR16:** AI confidence indicators communicate certainty using both a visual indicator (colour/icon) and a text label — colour alone is not sufficient

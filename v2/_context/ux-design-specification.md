---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/research.md
  - _bmad-output/project-context.md
date: '2026-03-19'
project_name: Plately
user_name: Frank
---

# UX Design Specification — Plately

**Author:** Frank
**Date:** 2026-03-19

---

## Executive Summary

### Project Vision

Plately is a mobile-first PWA that owns the complete dining arc — from pre-order
transparency (scan a menu, understand what you're ordering) to post-meal capture
(scan a dish, take the recipe home, cook it). The emotional spine is relief →
nostalgia → recreation. The primary interface is a camera. No login, no friction.

The product's core promise: a restaurant meal is an ephemeral moment — Plately
makes it permanent.

### Target Users

Five user archetypes shape the design:

- **The Curious Diner (Sofia)** — at the table in a social situation, needs the
  scan to feel invisible and quick; expects results to resurface reliably even
  on silent mode
- **The Home Cook (Daniel)** — uploading a casual photo after the fact; needs
  confidence prompts that feel conversational, not procedural; the recipe screen
  visual identity matters emotionally
- **The Frustrated Scanner (Marcus)** — dealing with real-world conditions
  (dim lighting, partial menus); needs one-tap retake and resilience if
  network changes mid-processing; confidence UI that earns trust by being
  right when it claims to be
- **The Repeat Visitor (Priya)** — returns to favourite restaurants; expects
  passive recognition; needs grocery list attribution by recipe; has questions
  about location awareness
- **The Nostalgic User (Frank)** — first session with no scan occasion; manual
  search must be the hero affordance on an empty state; needs graceful fallbacks
  for unknown restaurants

### Key Design Challenges

1. **Background processing resilience** — the camera must dismiss immediately,
   but result delivery cannot depend on push notifications alone; iOS PWA
   notifications are unreliable and frequently denied; a persistent in-app
   processing strip (mini-player model) is the primary delivery mechanism —
   always visible across the app, tappable when the result is ready;
   notification is supplementary

2. **Adaptive theming with guaranteed legibility** — dynamic colour extraction
   from restaurant/cuisine context must never compromise text legibility;
   contrast ratios enforced programmatically regardless of palette; three-tier
   theming: restaurant-specific extraction (when quality is high) → cuisine-type
   fallback palette → clean neutral default; never apply a theme that fails the
   contrast check or looks broken

3. **Confidence UI that always provides confidence** — results are always
   presented positively and assuredly regardless of confidence level; the
   confidence signal drives what evidence is surfaced (how the system shows
   its reasoning), not the visual character of the result; users always leave
   with something usable and a clear next action

4. **Grocery list depth from v1** — a flat aggregated list breaks at scale;
   two views required from v1: ingredient view (flat, for in-store shopping)
   and recipe view (grouped by meal, for planning); deduplication must be
   visible; bulk-remove by recipe is a required affordance;
   Phase 2: ingredient → recipe matching (what can I cook with what I have?)

5. **First launch and empty state** — the empty state must not assume a scan
   occasion; manual search is the hero CTA for new users; a specific prompt
   routes users toward first-session value without requiring a restaurant
   in front of them

6. **Camera reliability on iOS PWA** — camera and photo upload are co-equal
   capture modes; neither is labelled secondary; if camera fails, the photo
   upload path delivers the same full experience without degradation

### Design Opportunities

1. **Home screen as food companion, not scanner** — the default view is saved
   recipes and grocery list; the camera is a persistent FAB, always one gesture
   away but not dominating; returning users land in their world; new users see
   a clear path to manual search; the app is a companion first, a scanner second

2. **The atmosphere layer** — dynamic, content-aware backgrounds (cuisine and
   restaurant-driven colour and tone); three-tier theming system degrades
   gracefully with programmatic contrast enforcement; reference: Apple Music
   / Apple TV / Tide fluidity

3. **The persistent processing strip** — a mini-player-style strip visible
   across the whole app while a scan processes in the background; solves the
   iOS PWA notification reliability problem without depending on push;
   the user always knows where to find their result; disappears cleanly
   when dismissed

4. **Dish detail as bottom sheet** — tapping a dish from the menu scan list
   opens a bottom sheet from below; the menu list remains visible as context
   behind it; swipe down or tap outside to dismiss back to the list;
   full room for image, description, ingredients, and actions without compression

5. **Auto-save on confirmation** — results save automatically when confirmed;
   discard is an equally prominent choice alongside save; undo available for
   accidental captures; recipe list supports quick swipe-to-remove;
   aligns with the core promise of making the moment permanent

6. **Grocery list as dual-view tool** — ingredient view (flat list, optimised
   for one-handed in-store check-off) and recipe view (grouped by meal,
   for planning); same data, two lenses; toggle between views;
   Phase 2: reverse the flow — ingredient → recipe matching

7. **Passive restaurant recognition** — triggered by scan match or manual
   selection, not GPS dependency; location permission is opt-in with clear
   value framing — never assumed; previous recipes surface automatically
   when a saved restaurant is revisited

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Home screen = recipes + grocery list; camera is FAB | App is a companion first, scanner second |
| Camera + photo upload are co-equal entry points | Camera reliability on iOS PWA cannot be assumed |
| Persistent processing strip as primary result delivery | iOS PWA push notifications are unreliable |
| Dish detail opens as bottom sheet, swipe to dismiss | Cleaner than inline expansion on small screens |
| Three-tier adaptive theming with contrast enforcement | Bad source material must never produce a broken UI |
| Confidence = evidence-based messaging, not visual degradation | Results always presented positively; system shows its reasoning |
| Auto-save on confirmation; discard equally prominent | Exploratory scanning must not pollute the collection |
| Grocery list has two views from v1 | Flat list breaks at scale; recipe grouping is load-bearing |
| Location is enhancement only; scan match is trigger | Most users deny location permission on iOS PWA |
| Light and dark mode both supported | Dark is primary; light serves daytime and in-store use; follows system by default with in-app override |

---

## Core User Experience

### Defining Experience

The defining experience of Plately is the moment results appear after a scan.
A physical menu — often text-heavy, imageless, sometimes in another language —
transforms into a clean, visual, browsable dish list with photos, plain-language
descriptions, and calorie estimates. No typing. No searching. No scrolling through
review sites. The information you would have looked up anyway is surfaced
instantly, in the context of the dining decision you're already making.

This is the moment users think "this is better." Not because of novelty, but
because it removes a real friction they experience every time they eat somewhere
new.

The secondary defining experience is the grocery list payoff — ingredients from
a saved recipe, ready to shop from, without having entered a single thing manually.

### Platform Strategy

- **Primary platform:** iPhone Safari PWA — mobile-only, portrait orientation,
  touch-first, one-handed operation as the design target
- **Capture modes:** Live camera and photo upload are co-equal entry points;
  neither is labelled secondary; same result quality expected from both
- **Offline:** Saved recipes and grocery list are read-only accessible offline
  via PWA caching; all scan and search functionality requires a connection
- **Result display (MVP):** Clean designed results screen with fetched dish
  images (Google Places), names, descriptions, calorie estimates;
  atmosphere layer applies cuisine/restaurant-driven colour and tone
- **Result display (V2):** AR-style overlay — dish labels and images
  superimposed on the captured menu photo; deferred until core scan
  experience is validated

### Effortless Interactions

The following must require zero conscious thought — executable mid-conversation,
at a table, one-handed:

- **Initiating a scan** — one tap from anywhere in the app via persistent FAB
- **Browsing results** — the dish list after a menu scan must be immediately
  scannable; image-led, fast to scroll, decision-ready; users are at a table
  making a choice, not leisurely browsing
- **Opening a dish detail** — one tap opens a bottom sheet; swipe down to
  dismiss back to the list; no navigation required
- **Checking off a grocery item** — large touch targets, one tap, satisfying
  feedback; designed for in-store, one-handed use
- **Adding a recipe to the grocery list** — one action from the recipe screen;
  no confirmation dialogs

### Critical Success Moments

**Make-or-break flows — if these fail, the product fails:**

1. **Scan → results** — the menu scan must reliably return a clean, accurate
   dish list with images; a failed or empty result at this moment breaks trust
   immediately and permanently; this is the product's first impression
   in the context it was built for

2. **Recipe fidelity** — the saved recipe must produce a result recognisably
   close to the restaurant original when cooked; if the ingredient list is
   wrong or incomplete, the grocery list trip is wasted and the emotional
   payoff (recreation) never arrives; this is the product's ultimate promise

**High-value moments — if these land, users return:**

3. **First results screen** — the first time a menu scan produces a visual,
   image-rich dish list, the user understands immediately what Plately is
   and why it's better than googling; this moment requires no explanation

4. **Grocery list in-store** — the first time a user shops from a Plately
   grocery list without supplementary lookup, the loop closes; this is
   the retention moment

### Experience Principles

1. **Results first** — every interaction optimises toward getting the user
   to a result faster; no unnecessary steps between scan and information

2. **The table is the context** — all scan and browse interactions are
   designed for a social dining environment; quick, glanceable, dismissible,
   one-handed; the app never demands the user's full attention

3. **Earn trust, don't claim it** — confidence is communicated through
   evidence and reasoning, not assertions; the system shows its work;
   conservative confidence builds durable trust over time

4. **The moment becomes permanent** — default behaviour preserves captures;
   saving is automatic on confirmation; deletion is the deliberate act,
   not saving; the product fulfils its promise by making ephemeral
   meals retrievable

5. **Companion, not tool** — the home screen is a food companion (saved
   recipes, grocery list); the camera is always one tap away but never
   the only thing on screen; the app has a life between dining occasions

---

## Desired Emotional Response

### Primary Emotional Goals

Plately's emotional arc across the dining experience:

| Moment | Primary Emotion | Supporting Emotion |
|---|---|---|
| Menu scan result appears | Confidence | Excitement |
| Browsing dish list | Informed, capable | Calm, in control |
| Low confidence / novel dish | Reassured | Curious |
| Recipe saved | Satisfied | Anticipation |
| Grocery list in-store | Calm, capable | Accomplished |
| Dish recreated at home | Nostalgic | Proud |

**The core emotional promise:** Plately makes you feel smart. Not because
the app is clever — because *you* have all the knowledge you need to make
an informed decision. The app is invisible; the user feels capable.

### Emotional Journey Mapping

**First scan (menu):**
Anxiety dissolves the moment the dish list appears. The unfamiliar menu
becomes a curated, visual, understandable set of choices. The user feels
confident — not because they were told what to order, but because they
now understand what they're looking at. Excitement at the result's speed
and accuracy; confidence in the decision they're about to make.

**Low confidence / novel dish:**
The app never says "we don't know." Instead it bridges the gap —
shows the user's photo alongside a reference, surfaces the closest match,
explains the reasoning. The user feels *reassured*, not let down. The app
is a knowledgeable companion making its best inference, not a tool
admitting failure. The inference model reframes uncertainty as helpfulness.

**Post-meal capture:**
A warm, nostalgic feeling. The meal is no longer just a memory — it's
something retrievable, reproducible. Anticipation for the recreation moment.

**In-store grocery list:**
Calm and capable. No hunting through multiple apps or hand-written notes.
The list is exactly right, built without any manual effort. Checking off
items is satisfying and tactile.

**Home recreation:**
Nostalgia, pride, connection. The dish comes back. The restaurant moment
is relived. This is the emotional payoff the entire product is built toward.

### Micro-Emotions

**Emotions to cultivate:**
- **Confidence** — the user knows what they're getting; informed decisions
  feel effortless
- **Excitement** — the results screen is visually rich and fast; it delivers
  more than expected
- **Reassurance** — uncertainty is handled gracefully; the user is never
  left with nothing
- **Anticipation** — saving a recipe creates a forward-looking feeling;
  the meal isn't over, it's continuing
- **Pride** — recreating a restaurant dish at home is an accomplishment
  worth sharing

**Emotions to avoid:**
- **Frustration** — no dead ends, no empty states without a path forward,
  no confidence claims that turn out to be wrong
- **Embarrassment** — the scan must feel quick and subtle at the table;
  the app must never draw unwanted attention or make the user feel foolish
  for using it
- **Mistrust** — overclaiming confidence destroys trust faster than
  admitting uncertainty; the evidence-based model earns trust by showing
  its reasoning
- **Overwhelm** — the results screen must be fast to scan and decision-ready;
  too much information at once undermines the "feel smart" goal

### Design Implications

| Emotional Goal | UX Design Approach |
|---|---|
| Confidence at results | Image-led dish list; clean typography; atmosphere layer signals quality |
| Excitement at results | Fast appearance; rich visuals; cuisine-adaptive colour and tone |
| Reassurance in low-confidence state | Inference model: user photo + reference photo + closest match + evidence; never a dead end |
| No embarrassment at the table | Camera UI is minimal and quick-to-dismiss; no loud UI elements during capture |
| Pride in recreation | Recipe screen is beautiful; the dish is the hero, not the data |
| Satisfaction in grocery list | Large touch targets; tactile check-off feedback; recipe grouping for clarity |

### Emotional Design Principles

1. **The app makes you feel smart, not the app** — the user's confidence
   is the outcome; the product's cleverness is invisible

2. **Uncertainty is a feature, not a failure** — the inference model
   transforms low-confidence states into moments of helpfulness; the app
   always offers its best read with clear attribution

3. **Every moment has an emotional destination** — design each screen
   and transition toward its target emotion; confidence at results,
   reassurance at uncertainty, anticipation at save, satisfaction at
   check-off, nostalgia at recreation

4. **Subtlety at the table** — the dining context demands emotional
   restraint during capture; the app is a quiet companion, not a
   performance; the result screen can be expressive, the capture
   moment cannot

5. **The payoff is the arc** — no single moment delivers the full
   emotional value; the product succeeds when the whole journey —
   scan to grocery list to home kitchen — holds together

### V2 Resurface

The AR camera experience (Google Lens-style — dish identification
overlaid directly on the live camera view) was discussed and deferred
to V2. When the core scan experience is validated and reliable,
this mode would add an additional layer of excitement and immediacy
to the capture moment. The emotional goal is the same; the delivery
mechanism is more visceral.

---

## Inspiration Analysis

### Visual Language Direction

**Primary aesthetic: Liquid glass, dark base, atmospheric content**

The visual system draws from the design language established by Apple Music,
Apple TV, and Tide — not from the nutrition or fitness app category. The
defining characteristics:

- **Full-bleed atmospheric backgrounds** — cuisine and restaurant-driven
  imagery fills the screen; the UI floats above it rather than sitting
  on a flat surface; the background *is* the design
- **Liquid glass components** — cards, sheets, tab bars, and overlays
  use frosted glass treatment with blur and translucency; they belong
  to the environment rather than sitting on top of it
- **Dark base** — dark theme is the default; it makes atmospheric
  content richer, glass effects more visible, and food photography
  more vivid; it also reads better in dim restaurant environments
- **Minimal chrome** — the UI frame is as invisible as possible;
  navigation is a glass tab bar or persistent FAB; no heavy headers,
  no opaque backgrounds, no unnecessary UI decoration

**Reference apps and what to borrow:**

| Reference | What to borrow |
|---|---|
| **Tide** | Full-bleed atmospheric background, frosted glass cards, glass tab bar, generous whitespace, warm dark palette, fluid transitions |
| **Apple Music** | Dynamic colour extraction from content, smooth transitions between content-adaptive themes, artwork as the visual hero |
| **Apple TV** | Large-format visual cards, content-first layout, minimal navigation, cinematic atmosphere |
| **Google Lens** | Camera UI simplicity — corner brackets, one capture button, one upload button, no explanation needed |
| **Snapchat Scan** | Grouped card results model, clear result header, dismiss affordance (× top right) |

### Anti-Patterns to Avoid

The nutrition and fitness app category has established a set of UX
conventions that Plately explicitly rejects:

- **The dashboard** — rings, streaks, macro breakdowns, calorie
  counters, progress bars front and centre; Plately is not a
  management tool; numbers are available but never the hero
- **Information overload at rest** — MyFitnessPal, Factor, and
  similar apps show everything all at once; Plately shows only
  what the user needs in the current context
- **Clinical visual language** — white backgrounds, data tables,
  form-heavy inputs, badge-driven engagement mechanics; these
  reinforce a "discipline and tracking" emotional frame that
  is the opposite of Plately's emotional contract
- **Feature tabs as navigation** — a tab for every feature
  category creates a sense of scale and complexity; Plately's
  navigation should feel like moving through a single connected
  experience, not switching between departments

### Core Design Principle: Progressive Disclosure

**Show only what the user needs, when they need it.**

This is the defining UX decision for Plately and the clearest
differentiator from the competition. Applied across the product:

| Context | Show | Hide (accessible but not visible) |
|---|---|---|
| At the table, scanning | Dish list with images and one-line descriptions | Calorie detail, full ingredients, macro breakdown |
| Viewing a dish | Name, photo, brief description, save CTA | Full recipe, ingredient list, preparation steps |
| Viewing a recipe | Ingredients and key steps | Macro breakdown, calorie count, serving variations |
| Grocery list in-store | Item name, quantity, check-off | Recipe source, unit conversion, nutritional detail |
| Home screen | Saved recipes, grocery list summary | Everything else |

Nutritional data is always accessible — one tap deeper — but it
is never the first thing visible. The food is the hero; the data
supports the user when they seek it.

### Camera UI Direction

Informed by Google Lens: the capture moment should have almost
no UI. Corner brackets to suggest framing, a single capture
button, a single upload button. No instructions, no overlays,
no mode switching. The action is self-evident.

The camera UI is the most time-sensitive, social-context-sensitive
moment in the product. Less is more.

### Transition and Motion Direction

Informed by Tide: transitions should feel physical and fluid —
content slides and fades as if the UI has weight and atmosphere.
The atmospheric background should transition smoothly when
cuisine context changes, not snap. Glass elements should
appear and dismiss with natural spring physics.

Motion is an emotional signal: smooth = confident, premium, calm.
Abrupt = cheap, anxious, unpolished.

---

## Information Architecture

### Navigation Model

**Three tabs + one persistent FAB.**

The glass tab bar provides access to the three areas of the app that
have a life between dining occasions. The camera FAB is always present
regardless of active tab — one tap to capture, from anywhere.

```
[ Home ]  [ Search ]  [ Grocery ]        [camera FAB]
```

- **Home** — saved recipes, recently visited restaurants,
  passive restaurant recognition surface
- **Search** — manual search for dishes and restaurants;
  first-class path; hero CTA for new users and empty states
- **Grocery** — dual-view list (ingredient / recipe toggle);
  in-store check-off; recipe attribution
- **Camera FAB** — persistent floating action; opens capture
  modal; always one tap away from any screen

No settings tab. Settings are accessible via a minimal gesture
or secondary affordance — never prime real estate.

### Screen Inventory

**Capture flow:**
- Camera screen (modal — corner brackets, capture button,
  upload button; minimal chrome; quick-dismiss)
- Processing strip (persistent overlay across all tabs while
  scan is processing; mini-player model; tappable when result ready)

**Results flow:**
- Menu scan results (dish list — image-led, fast to scroll,
  one-line descriptions; bottom sheet on tap)
- Dish detail bottom sheet (photo, name, description,
  evidence block, save CTA; swipe down to dismiss)
- Inference state (low-confidence: user photo + reference photo
  side-by-side + closest match + evidence block; never a dead end)

**Recipe flow:**
- Recipe detail (ingredients, key steps, restaurant source,
  add to grocery list CTA; macro detail one tap deeper)
- Recipe edit (ingredient correction, portion adjustment)

**Home:**
- Home screen (saved recipe cards, recently visited
  restaurants, passive recognition banner when at a
  known restaurant)
- Restaurant profile (saved recipes from this location,
  visit history, return-visit surface)

**Search:**
- Search screen / empty state (search input hero;
  prompt copy to drive first-session action;
  recent searches below)
- Search results (dish and restaurant results;
  same visual language as scan results)

**Grocery:**
- Grocery list — ingredient view (flat list, large touch
  targets, one-handed check-off optimised)
- Grocery list — recipe view (grouped by recipe,
  bulk-remove by recipe, deduplication visible)

**System:**
- Permission moments (camera, location, notifications —
  each with clear value framing at the moment of ask;
  never pre-emptive)
- Empty states (each with a specific CTA; none are dead ends)
- Error / offline states (read-only mode for saved content;
  clear messaging for connectivity issues)

### User Flow Map

**Flow 1: Scan a menu at a restaurant**
```
FAB tap → Camera screen → capture → dismiss (camera closes)
→ Processing strip appears → [background processing]
→ Strip activates → tap → Menu scan results
→ Tap dish → Dish detail bottom sheet
→ Save → Recipe added (auto-save) → strip dismisses
```

**Flow 2: Upload a photo (post-meal or from camera roll)**
```
FAB tap → Camera screen → upload button → photo picker
→ Processing strip appears → [same as Flow 1 from here]
```

**Flow 3: Manual search (new user, no scan occasion)**
```
Home empty state CTA / Search tab
→ Search screen → type dish or restaurant name
→ Search results → select dish
→ Dish detail bottom sheet → save → recipe added
```

**Flow 4: Return to a saved recipe and shop**
```
Home → saved recipe card → recipe detail
→ "Add to grocery list" → ingredients added
→ Grocery tab → ingredient view → in-store check-off
```

**Flow 5: Return visit to a known restaurant**
```
[Location detected OR user opens restaurant from saved list]
→ Passive recognition banner on Home
→ Tap → Restaurant profile → saved recipes from this location
→ [scan new dishes or revisit saved ones]
```

### Progressive Disclosure Map

Each screen reveals the minimum necessary for the current context.
Deeper information is always one tap away, never surfaced by default.

| Screen | Visible by default | One tap deeper |
|---|---|---|
| Home | Recipe photo, name, restaurant | Ingredients, steps, macro detail |
| Dish detail (bottom sheet) | Photo, name, one-line description, evidence block, save | Full ingredients, preparation, macro |
| Recipe detail | Ingredients, key steps, source | Macro breakdown, calorie count, serving notes |
| Scan results | Dish image, name, brief description | Dish detail bottom sheet |
| Grocery — ingredient view | Item name, quantity, check-off | Recipe source, unit conversion |
| Grocery — recipe view | Recipe name, item count | Full ingredient list for that recipe |

### Empty State Strategy

No empty state is a dead end. Each has a specific, contextual CTA:

| Screen | Empty state CTA |
|---|---|
| Home (first launch) | "Eaten somewhere great recently? Search for it →" |
| Home (has recipes) | [never truly empty — always has saved content] |
| Search | "Try a dish name, restaurant, or cuisine" |
| Grocery | "Add a saved recipe to start your list →" |
| Scan results (failed) | Inference state or "Try uploading a photo instead" |

### Permission Moment Strategy

Permissions are requested at the moment of value — never pre-emptively:

| Permission | Triggered by | Value framing |
|---|---|---|
| Camera | First FAB tap | "To scan menus and dishes" |
| Photo library | First upload button tap | "To scan from your camera roll" |
| Location | First return-visit recognition | "So we can recognise restaurants you've visited" |
| Notifications | First background scan | "So we can tell you when your results are ready" |

---

## Component Design Patterns

### Design System Foundation

**Base:** Liquid glass, adaptive atmosphere, light and dark modes
**Typography:** System font (SF Pro) — clean, legible, no display font needed;
  the food and photography are the visual expression
**Colour:** No fixed brand palette; the atmospheric layer drives colour;
  content-extracted accent adapts to mode; text always system-appropriate
  (near-black on light, near-white on dark)
**Motion:** Spring physics throughout; no linear transitions;
  atmospheric background crossfades (400ms ease); sheets spring up;
  glass elements fade in with subtle scale (0.96 → 1.0)
**Iconography:** Minimal, line-weight icons; SF Symbols preferred;
  never decorative, always functional

### Light / Dark Mode

Plately supports both light and dark modes.

**Default:** Follows iOS system appearance setting automatically.
**Override:** User can set a preferred mode inside the app
  (Settings → Appearance → Light / Dark / System), independently
  of the system setting.

**Dark mode (primary aesthetic):**
- Base: near-black (#0a0a0a)
- Glass cards: white 8–12% opacity, blur 20px
- Glass tab bar: white 8%, blur 24px
- Text primary: white 100%; secondary: white 60%
- Atmospheric background: blurred image + dark gradient overlay
- Best for: dim restaurant environments, evening use, cinematic food photography

**Light mode:**
- Base: near-white (#f5f5f5)
- Glass cards: white 60–70% opacity, blur 20px — brighter, airier
- Glass tab bar: white 70%, blur 24px
- Text primary: black 90%; secondary: black 50%
- Atmospheric background: blurred image + light gradient overlay
  (overlay is white-tinted rather than dark, keeps image visible but airy)
- Best for: daytime use, bright environments, grocery list in-store

**What stays consistent across modes:**
- Atmospheric background is always present — never flat colour alone
- Glass treatment is always applied — never opaque solid containers
- Contrast enforcement runs in both modes (WCAG AA minimum)
- Spring physics and motion behaviour identical
- Content-extracted accent colour adapts automatically to mode

**Reference:** Apple Music Library (light) and Now Playing (dark) demonstrate
the glass system working cleanly in both directions — same components,
mode-appropriate treatment.

---

### Core Components

#### Atmospheric Background
The full-bleed background layer present on every screen.

**Behaviour:**
- Defaults to a dark neutral base on first launch and empty states
- Adopts cuisine-extracted or restaurant-extracted imagery and colour
  when content context is available
- Crossfades between states — never cuts
- Three-tier fallback: restaurant-specific → cuisine-type palette →
  dark neutral base
- Programmatic contrast check runs on every palette change before apply;
  if contrast fails, falls back one tier

**Visual treatment:**
- Full bleed, edge to edge including behind status bar and home indicator
- Gaussian blur applied to background image (radius 40–60px) to prevent
  competing with foreground content
- Dark gradient overlay (bottom 60% of screen) to ensure text legibility
  regardless of image content
- Vignette at edges

---

#### Glass Card
The primary content container. Used for recipe cards, dish results,
scan action items, and grocery list entries.

**Visual treatment:**
- Background: white 8–12% opacity with backdrop blur (saturation: 1.8,
  blur: 20px) — matches Tide and Apple glass conventions
- Border: white 15% opacity, 0.5px, full radius (16px default)
- Shadow: none — glass cards float naturally against the atmospheric layer
- Corner radius: 16px standard, 12px compact (grocery list items)

**States:**
- Default: glass as described
- Pressed: scale 0.97, brightness +5% — tactile feedback
- Selected / saved: subtle white border brightens to 30% opacity

**Variants:**
- **Standard card** — recipe and dish result cards; image top half,
  text bottom half; 16:9 or 4:3 image ratio
- **Compact card** — grocery list items; single row, large touch target
  (min 56px height), check-off affordance left or right
- **Feature card** — home screen hero cards; larger format, more image,
  less text overlay

---

#### Bottom Sheet
The primary detail surface. Used for dish detail, confirmation states,
and secondary actions.

**Behaviour:**
- Springs up from bottom of screen on tap
- Drag handle visible at top (4×36px pill, white 30%)
- Swipe down to dismiss — returns to originating list/screen
- Background screen dims to 40% and scales to 0.95 during sheet open
- Sheet sits at approximately 70% screen height by default;
  scrollable for longer content
- Does not push a new navigation stack — always dismisses back to origin

**Visual treatment:**
- Glass background (white 10%, blur 30px, saturation 1.6)
- Top corners rounded (24px); full width
- Content padding: 24px horizontal, 20px vertical

**Content structure (dish detail):**
1. Drag handle
2. Dish image (full width, 200px height, object-fit cover)
3. Dish name (large, white, bold)
4. Evidence block (see Confidence Indicator below)
5. One-line description (white 60%)
6. Divider (white 10%)
7. Primary CTA — "Save Recipe" (full width, glass button)
8. Secondary CTA — "See Full Details" (text link)

---

#### Confidence Indicator
**Evidence-based confidence — not visual degradation.**

The result screen always presents positively and assuredly regardless
of confidence level. The confidence signal is an internal system value
that determines which evidence is surfaced to the user — not a visual
mode that changes the character of the UI.

The goal in every state: give the user enough information to feel
certain about what they're looking at. The app always shows its
reasoning; the user is always the final, informed judge.

**What stays constant across all confidence levels:**
- Full-colour, image-rich result presentation
- Atmospheric layer active
- Save CTA prominent and primary
- Tone: assured and informative, never apologetic or hedging

**What changes: the evidence block**

The evidence block sits below the dish name — a compact, readable
summary of how the result was determined. Its content adapts based
on the confidence signal.

---

**Evidence block — High confidence**
*Markers: dish name matches, photo consistent,
  restaurant/cuisine context confirmed,
  ingredient profile aligns with known recipe*

> "Classic Carbonara — confirmed by dish name, photo,
>  and ingredients consistent with the traditional preparation."

Visual: single line, white 60%, no supporting imagery needed.
The evidence is simple and complete.

---

**Evidence block — Medium confidence**
*Markers: name is ambiguous or missing, but ingredients
  and/or photo give strong identification signals*

> "The ingredients and photo identify this as a Carbonara —
>  guanciale, egg yolk, Pecorino, black pepper — even though
>  the menu name doesn't say so."

Visual: two lines, white 60%, key ingredients as small pills
(3–4 items). The system explains what it used to reach the result.

---

**Evidence block — Inference state**
*Markers: dish name ambiguous, photo is the primary signal,
  restaurant context helps narrow it down*

> "Based on this photo, this looks most like a classic
>  Carbonara. Here's a reference — does that match
>  what you ordered?"

Visual:
- User's captured photo (small, left) alongside a reference
  photo of the closest match (small, right) — side-by-side
  comparison, same dimensions, rounded corners
- A single natural-language question inviting the user
  to confirm or redirect
- Accuracy indicator optional and secondary
  (e.g. "~78% match") — never the headline

**The comparison pattern:** showing the user's photo next to a
reference photo turns inference into a collaborative act — the
user becomes the final judge, and the app provides the evidence
to make that judgement easy. "Yeah, that's it" or "No, mine had
no cream" — both are useful outcomes.

---

**What confidence never does:**
- Changes the visual richness or atmosphere of the result
- Uses amber, red, or warning colours
- Says "we're not sure" or "low confidence"
- Presents a degraded or muted result
- Dead-ends the user

**Every result, at every confidence level, gives the user
something usable and a clear next action.**

---

#### Camera UI
Minimal capture interface. The camera moment should feel like nothing.

**Elements:**
- Full-bleed camera preview — no border, no frame
- Corner bracket guides (white 40%, 32px each corner) — framing aid only;
  disappear 2 seconds after camera opens
- Capture button — centred, bottom third; 72px diameter;
  white 20% glass fill, white border 1px; camera icon inside
- Upload button — left of capture; 48px diameter; glass treatment;
  image icon
- Dismiss — top right; glass × button; always visible
- No flash toggle, no zoom controls, no mode switcher visible by default

**Behaviour:**
- Opens as a modal over whatever tab is active
- On capture: brief shutter animation, then smooth dismiss
- Processing strip appears 300ms after dismiss
- No loading state in the camera screen itself — it closes and
  hands off immediately

---

#### Processing Strip
A persistent mini-player-style strip at the bottom of the app
(above the tab bar) while a scan is processing.

**Visual treatment:**
- Full width, 56px height
- Glass background (white 12%, blur 24px)
- Left: thumbnail of captured image (32×32px, rounded 8px)
- Centre: "Identifying your menu..." with animated ellipsis
- Right: animated activity indicator (subtle spinner, white 60%)
- When result is ready: text changes to "Your results are ready →";
  right element becomes a chevron; subtle pulse animation on strip

**Behaviour:**
- Appears with a spring-up animation from below tab bar (300ms)
- Persists across all tabs until tapped or dismissed
- Tap when ready → navigates to results screen
- Swipe down to dismiss (only available before result is ready —
  dismissing cancels; confirmed with a brief inline warning)
- Disappears with a spring-down animation after result is viewed

---

#### Glass Tab Bar
The primary navigation.

**Visual treatment:**
- Full-width glass bar (white 8%, blur 24px, border white 12% 0.5px)
- Three tab items: Home, Search, Grocery
- Active tab: icon and label white 100%; inactive: white 40%
- Tab labels: SF Pro, 10px, medium weight
- Camera FAB: positioned right of or above the tab bar;
  56px diameter; stronger glass treatment (white 16%); camera icon

**Behaviour:**
- Tab switches use crossfade (200ms) — no slide transitions
- FAB tap always opens camera modal regardless of active tab

---

#### Empty State
Each empty state has one specific CTA.

**Structure:**
- Large text prompt (white, 24px, medium weight) — the CTA question
- Supporting text (white 60%, 16px) — one line of context
- Single action button (glass, full-width, 56px height)

**Tone:** Warm and inviting, not apologetic. Never "Nothing here yet."
Always "here's what you can do right now."

---

### Interaction Patterns

| Pattern | Behaviour |
|---|---|
| Save a recipe | Auto-saves on confirmation; no explicit save step; undo toast appears for 4 seconds |
| Check off grocery item | Single tap; item fades to 40% opacity and gets strikethrough; tap again to uncheck |
| Remove a recipe | Swipe left on card → delete affordance appears; tap to confirm; no second modal |
| Bulk remove by recipe | Grocery recipe view → swipe on recipe group → "Remove all X items" |
| Retake a scan | From any result screen: persistent "Retake" button top right; one tap back to camera |
| Switch grocery views | Toggle pill at top of grocery screen: "Ingredients" / "By Recipe" |
| Access macro detail | Any dish or recipe screen: "Nutrition" text link below primary content; opens bottom sheet |

---

## Accessibility & Technical Considerations

### Accessibility

#### Contrast and Legibility
The adaptive atmospheric layer is the highest accessibility risk
in the product. Mitigation is non-negotiable:

- **Programmatic contrast enforcement** runs on every palette change
  before it is applied; WCAG AA minimum (4.5:1 for body text,
  3:1 for large text and UI components)
- **Dark gradient overlay** on atmospheric backgrounds ensures text
  legibility regardless of image content; gradient is always present,
  not conditional
- **Glass components** use sufficient opacity to guarantee legibility
  against any background; opacity values are not reduced below
  tested minimums for aesthetic reasons
- **Three-tier fallback** (restaurant → cuisine → neutral dark base)
  ensures a legible state is always available when extracted palettes
  fail contrast checks

#### Touch Targets
All interactive elements meet or exceed iOS Human Interface Guidelines:

- Minimum touch target: 44×44px for all tappable elements
- Grocery list check-off items: minimum 56px height — optimised
  for one-handed in-store use
- Bottom sheet drag handle: full-width tap zone, not just the
  visible pill
- FAB: 56px diameter minimum

#### Motion and Animation
- **Reduce Motion** system preference respected throughout; all spring
  animations replaced with simple opacity fades; atmospheric background
  crossfades shortened to 150ms or disabled
- No motion used to convey critical information — state changes are
  always accompanied by a text or icon change, never motion alone
- Processing strip animation (ellipsis, spinner) has static fallback

#### Screen Reader Support
- All dish images have descriptive alt text (AI-generated from
  identification result)
- Evidence block is readable as plain text; the side-by-side photo
  comparison is labelled with context ("Your photo" / "Reference:
  Classic Carbonara")
- Bottom sheet announces as a modal region; focus moves into
  it on open; returns to trigger on dismiss
- Processing strip announces state change when result is ready
  ("Your results are ready")

#### Cognitive Accessibility
Progressive disclosure is inherently accessible — users are never
overwhelmed with information. Additional considerations:
- Plain language throughout; no nutrition jargon surfaced by default
- The inference state uses a question ("does that match what you
  ordered?") rather than a percentage or technical confidence score
  as the primary communication
- One primary action per screen; secondary actions clearly
  distinguished by visual weight

---

### Technical Considerations

#### Platform: iOS Safari PWA
The primary platform introduces known constraints that shape
design decisions:

| Constraint | Impact | Design response |
|---|---|---|
| Push notifications unreliable / denied | Background processing result may not surface | Processing strip is the primary delivery mechanism; notification is supplementary |
| Camera API limited in Safari | Capture quality and reliability variable | Photo upload is co-equal entry point; camera failure gracefully offers upload path |
| No true background processing | Scan must complete while app is active or recently active | Processing strip keeps user in-app context; result is cached and surfaced on next open if processing completes while backgrounded |
| PWA install not guaranteed | App may run in Safari tab without install | Core flows work fully in browser; install prompt offered after first successful scan |
| Backdrop-filter (blur) performance | Glass effects can cause jank on older devices | Backdrop blur progressively enhanced; fallback is semi-opaque solid fill on devices that flag performance issues |

#### Atmospheric Background Pipeline
Dynamic colour and image extraction requires a reliable pipeline:

1. **Source resolution** — restaurant identified via scan context,
   location, or manual search; Google Places API returns photos
   and metadata
2. **Image selection** — food photography preferred over exterior
   or interior shots; quality gate applied (minimum resolution,
   face-detection exclusion)
3. **Colour extraction** — dominant palette extracted from selected
   image; cuisine-type fallback palette applied if restaurant-specific
   extraction fails or returns insufficient data
4. **Contrast check** — extracted palette run through contrast
   validation before application; if any primary text combination
   fails WCAG AA, falls back one tier
5. **Application** — background image blurred and composited;
   gradient overlay applied; glass components render above

#### Performance Targets
- **Time to camera open:** <300ms from FAB tap
- **Time to results screen:** processing strip appears within
  500ms of capture; result time dependent on API (target <8s
  for standard menu; strip messaging manages expectation)
- **Atmospheric transition:** crossfade completes within 400ms;
  no layout shift during transition
- **Grocery list:** renders instantly from local cache; no
  loading state for saved content
- **Glass blur effects:** target 60fps on iPhone 12 and above;
  progressive fallback for older devices

#### Offline Behaviour
- Saved recipes and grocery list are fully readable offline
  via PWA service worker cache
- Scan, search, and recipe fetch require connectivity;
  clear offline indicator shown; no silent failures
- Grocery check-off state is written locally first,
  synced when connection returns

#### Data Model Highlights
- Recipe confidence metadata stored alongside recipe — used to
  surface evidence block on re-open; not shown to user as a score
- Grocery list items store recipe source ID — enables recipe-view
  grouping and bulk-remove by recipe
- Atmospheric state (extracted palette, source image URL) cached
  per restaurant — no re-extraction on return visit
- All scan results stored temporarily regardless of save action —
  undo window (4 seconds) reads from this temporary store before
  permanent deletion

#### V2 Technical Flag: AR Overlay
The AR camera experience (real-time dish identification overlaid
on live camera view) was deferred to V2. Technical prerequisites:
- Reliable real-time object detection API with <500ms latency
- Stable ARKit/WebXR integration in Safari PWA context
- Validated core scan accuracy before adding real-time complexity
When V2 is scoped, the camera UI component is designed to extend —
the capture-and-dismiss model and the AR-overlay model share the
same entry point and result pipeline.

---

## Design Tokens

Extracted from reference screens (Tide, Apple Music, Apple TV) using
known iOS anchors: iPhone 14/15 screen width = 390pt, @3x pixel
density, standard tab bar = 49pt, status bar = ~54pt.

Values are in points (pt) unless noted. Treat as a starting baseline —
minor adjustments expected after first device render.

### Typography

All text uses SF Pro (system font). No custom typeface.

| Token | Size | Weight | Usage |
|---|---|---|---|
| `text-2xs` | 11pt | Regular | Tab bar labels, day initials, badges |
| `text-xs` | 12–13pt | Regular | Section labels, captions, genre tags, evidence block |
| `text-sm` | 15pt | Regular | Secondary body, list values, descriptions |
| `text-base` | 17pt | Regular | List row labels, primary body |
| `text-lg` | 20–22pt | Semibold | Section headings, card titles |
| `text-xl` | 28pt | Bold | Page titles |
| `text-2xl` | 34pt | Bold | Large titles (home screen greeting) |
| `text-hero` | 36–40pt | Bold | Featured numbers, dish names in bottom sheet |

**Line height:** 1.3× size for headings, 1.5× for body
**Letter spacing:** Default system spacing; no custom tracking

---

### Corner Radius

| Token | Value | Usage |
|---|---|---|
| `radius-xs` | 8pt | Thumbnails, small chips, mini-player artwork, reference photos |
| `radius-sm` | 12pt | Content cards in rows, album/recipe grid cards |
| `radius-md` | 16pt | Glass cards (standard), settings list cards |
| `radius-lg` | 20–24pt | Bottom sheet top corners, large feature cards |
| `radius-xl` | 28pt | Primary CTA buttons (Start, Save, Confirm) |
| `radius-full` | 999pt | Tab bar pill, filter pills, processing strip, FAB |

---

### Spacing

| Token | Value | Primary usage |
|---|---|---|
| `space-1` | 4pt | Fine gaps, divider offsets, border widths |
| `space-2` | 8pt | Card gaps in grid, icon-to-label, chip internal gap |
| `space-3` | 12pt | Compact card internal padding, strip padding |
| `space-4` | 16pt | Standard horizontal screen margin, list row padding |
| `space-5` | 20pt | Bottom sheet horizontal padding |
| `space-6` | 24pt | Section spacing, bottom sheet top padding, card vertical padding |
| `space-8` | 32pt | Large section gaps, hero content spacing |
| `space-12` | 48pt | Hero breathing room, large vertical offsets |

**Standard screen margin:** 16pt horizontal (left and right)
**Standard section gap:** 24–32pt vertical

---

### Component Heights

| Component | Height | Notes |
|---|---|---|
| List row — standard | 50–52pt | Single line label + value + chevron |
| List row — tall | 68–72pt | Two-line label or with supporting description |
| CTA button — primary | 56pt | Full width, `radius-xl` |
| Filter pill | 36pt | Horizontally scrollable, `radius-full` |
| Action card (home quick actions) | 82–88pt | Icon + label, `radius-md` |
| Processing strip | 64–68pt | Above tab bar, `radius-full` |
| Tab bar content area | 49pt | Plus system safe area below |
| Bottom sheet drag handle | 4pt × 36pt | Centred, `radius-full`, white 30% |
| Dish image in bottom sheet | 200pt | Full width, `radius-sm` top corners only |
| FAB | 56pt diameter | `radius-full` |
| Grocery list row | 56pt | One-handed touch target minimum |

---

### Icon Sizes

| Usage | Size | Notes |
|---|---|---|
| Tab bar icons | 22–24pt | SF Symbols, regular weight |
| List row icons | 20–22pt | SF Symbols, left-aligned |
| Inline button icons | 16–18pt | Within labels or pills |
| FAB icon | 28pt | Camera icon centred in 56pt FAB |
| Mini-player / strip controls | 28pt touch target | Actual icon ~20pt |
| Featured / hero icons | 32pt | Standalone, not in rows |

---

### Glass System Values

All glass effects use CSS `backdrop-filter: blur()` with
`background: rgba()`. Values differ by mode.

#### Dark mode

| Element | Background | Border | Blur |
|---|---|---|---|
| Glass card | `rgba(255,255,255,0.09)` | `rgba(255,255,255,0.13)` 0.5pt | 20px |
| Bottom sheet | `rgba(255,255,255,0.10)` | none | 30px |
| Tab bar | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.12)` 0.5pt | 24px |
| Processing strip | `rgba(255,255,255,0.12)` | none | 24px |
| Filter pill | `rgba(255,255,255,0.10)` | `rgba(255,255,255,0.15)` 0.5pt | 16px |
| FAB | `rgba(255,255,255,0.16)` | `rgba(255,255,255,0.20)` 1pt | 20px |

#### Light mode

| Element | Background | Border | Blur |
|---|---|---|---|
| Glass card | `rgba(255,255,255,0.65)` | `rgba(255,255,255,0.80)` 0.5pt | 20px |
| Bottom sheet | `rgba(255,255,255,0.70)` | none | 30px |
| Tab bar | `rgba(255,255,255,0.72)` | `rgba(255,255,255,0.85)` 0.5pt | 24px |
| Processing strip | `rgba(255,255,255,0.75)` | none | 24px |
| Filter pill | `rgba(255,255,255,0.65)` | `rgba(255,255,255,0.80)` 0.5pt | 16px |
| FAB | `rgba(255,255,255,0.80)` | `rgba(255,255,255,0.90)` 1pt | 20px |

---

### Atmospheric Background

| Property | Value |
|---|---|
| Image blur | `blur(48px)` |
| Image saturation boost | `saturate(1.4)` |
| Dark mode gradient | `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)` |
| Light mode gradient | `linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 100%)` |
| Crossfade transition | `400ms ease` |
| Background size | `cover` |
| Background position | `center` |

---

### Colour — Text

| Token | Dark mode | Light mode | Usage |
|---|---|---|---|
| `text-primary` | `rgba(255,255,255,1.0)` | `rgba(0,0,0,0.90)` | Headlines, primary labels |
| `text-secondary` | `rgba(255,255,255,0.60)` | `rgba(0,0,0,0.55)` | Descriptions, values, evidence block |
| `text-tertiary` | `rgba(255,255,255,0.35)` | `rgba(0,0,0,0.30)` | Placeholder, disabled, tab inactive |
| `text-on-button` | `rgba(0,0,0,0.90)` | `rgba(0,0,0,0.90)` | Text on white primary CTA |

---

### Grid

| Pattern | Value |
|---|---|
| Screen horizontal margin | 16pt |
| Card gap — grid | 8–10pt |
| Card gap — list | 8pt vertical |
| 3-column card width | ~110pt |
| 2-column card width | ~179pt |
| Section label to content gap | 8pt |
| Section to section gap | 24–32pt |

---

### Motion

| Property | Value | Usage |
|---|---|---|
| Spring animation | `spring(mass: 1, stiffness: 300, damping: 30)` | All sheet and card appearances |
| Crossfade | `400ms ease` | Atmospheric background transitions |
| Scale on appear | `0.96 → 1.0` | Glass cards, bottom sheets |
| Opacity on appear | `0 → 1` | 200ms, all overlays |
| Tab switch | `200ms ease` crossfade | No slide between tabs |
| Pressed state scale | `1.0 → 0.97` | Cards, buttons on press |
| Reduce Motion fallback | `150ms ease` opacity only | Respects iOS Reduce Motion |

---

## Wireframes

All wireframes are at 390pt width. Annotations reference component
tokens defined in Design Tokens and Component Design Patterns sections.

```
Key:
  ▓▓▓  = atmospheric background (full-bleed, blurred)
  ░░░  = glass surface (card, sheet, tab bar)
  ███  = image / media
  [  ] = interactive element
  ---  = divider / separator
  ⊙    = icon
  ●    = filled / selected state
  ○    = empty / unselected state
```

---

### Screen 1 — Home (Populated)

```
┌─────────────────────────────────────┐
│ 9:41              ▓▓▓▓▓▓▓  ●●● ▓▓▓ │  ← status bar
├─────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓                                 ▓ │
│ ▓  Good evening, Frank     [⊙ ⊙] ▓ │  ← text-2xl, tertiary actions
│ ▓  Wednesday                      ▓ │  ← text-xs, text-secondary
│ ▓                                 ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │  ← featured recipe card
│ ▓  │ ███████████████████████████ │ ▓ │    radius-lg, full width
│ ▓  │ ███████████████████████████ │ ▓ │    image height ~180pt
│ ▓  │ ███████████████████████████ │ ▓ │
│ ▓  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ ▓ │  ← glass overlay on card
│ ▓  │  Duck Confit                │ ▓ │    text-lg, text-primary
│ ▓  │  Le Diplomate · DC          │ ▓ │    text-xs, text-secondary
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓                                 ▓ │
│ ▓  Your Collection                ▓ │  ← text-base, semibold
│ ▓                                 ▓ │    space-4 left margin
│ ▓  ┌──────────────┐ ┌────────────┐ ▓ │  ← 2-col grid, space-2 gap
│ ▓  │ ████████████ │ │ ██████████ │ ▓ │    radius-sm cards
│ ▓  │ ████████████ │ │ ██████████ │ ▓ │    ~179pt wide each
│ ▓  │ ░ Tonkotsu   │ │ ░ Carbonar │ ▓ │
│ ▓  └──────────────┘ └────────────┘ ▓ │
│ ▓                                 ▓ │
│ ▓  Recent Restaurants             ▓ │  ← text-base, semibold
│ ▓  ┌──────┐  ┌──────┐  ┌────────┐ ▓ │  ← horizontal scroll
│ ▓  │ ████ │  │ ████ │  │ ██████ │ ▓ │    small square cards
│ ▓  │ Le D │  │ Nobu │  │ Rosso  │ ▓ │    ~80pt wide, radius-sm
│ ▓  └──────┘  └──────┘  └────────┘ ▓ │
│ ▓                                 ▓ │
├─────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← glass tab bar, radius-full
│  ● Home    ⊙ Search   ⊙ Grocery   │  ← text-2xs, active = text-primary
│                              [⊙]   │  ← FAB, 56pt, radius-full
└─────────────────────────────────────┘
```

---

### Screen 2 — Home (Empty State / First Launch)

```
┌─────────────────────────────────────┐
│ 9:41              ▓▓▓▓▓▓▓  ●●● ▓▓▓ │
├─────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓                                 ▓ │
│ ▓                                 ▓ │
│ ▓                                 ▓ │
│ ▓                                 ▓ │
│ ▓                                 ▓ │
│ ▓   Eaten somewhere great         ▓ │  ← text-xl, text-primary
│ ▓   recently?                     ▓ │    centered
│ ▓                                 ▓ │
│ ▓   Find the dish and save the    ▓ │  ← text-sm, text-secondary
│ ▓   recipe for next time.         ▓ │    centered
│ ▓                                 ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │  ← primary CTA button
│ ▓  │      Search for a dish      │ ▓ │    56pt height, radius-xl
│ ▓  └─────────────────────────────┘ ▓ │    white, text-base
│ ▓                                 ▓ │
│ ▓         or scan a menu          ▓ │  ← text-xs, text-tertiary
│ ▓           [ ⊙ camera ]          ▓ │    inline FAB hint
│ ▓                                 ▓ │
├─────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ● Home    ⊙ Search   ⊙ Grocery   │
│                              [⊙]   │
└─────────────────────────────────────┘
```

---

### Screen 3 — Camera Modal

```
┌─────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓                        [ ✕ ]   ▓ │  ← glass × dismiss, top right
│ ▓                                 ▓ │    44pt touch target
│ ▓  ╔═══╗                   ╔═══╗  ▓ │  ← corner brackets
│ ▓  ║   ║                   ║   ║  ▓ │    white 40%, 32pt each
│ ▓                                 ▓ │    disappear after 2s
│ ▓                                 ▓ │
│ ▓         LIVE CAMERA VIEW        ▓ │
│ ▓         (full screen)           ▓ │
│ ▓                                 ▓ │
│ ▓                                 ▓ │
│ ▓  ║   ║                   ║   ║  ▓ │
│ ▓  ╚═══╝                   ╚═══╝  ▓ │
│ ▓                                 ▓ │
│ ▓                                 ▓ │
│ ▓                                 ▓ │
│ ▓  [▣]          [ ◉ ]             ▓ │  ← upload (48pt) | capture (72pt)
│ ▓  upload      capture            ▓ │    both glass, radius-full
│ ▓                                 ▓ │
└─────────────────────────────────────┘
Note: no tab bar — modal overlay, full screen
```

---

### Screen 4 — Menu Scan Results

```
┌─────────────────────────────────────┐
│ 9:41              ▓▓▓▓▓▓▓  ●●● ▓▓▓ │
├─────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← restaurant-driven atmosphere
│ ▓                                 ▓ │
│ ▓  [←]   Le Diplomate       [↺]  ▓ │  ← back | name | retake
│ ▓         8 dishes found          ▓ │  ← text-xs, text-secondary
│ ▓                                 ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ██ │  Duck Confit           │ ▓ │  ← dish card, radius-md
│ ▓  │ ██ │  Crispy duck leg,      │ ▓ │    image: 64×64pt, radius-xs
│ ▓  │ ██ │  cherry jus            │ ▓ │    name: text-base
│ ▓  └─────────────────────────────┘ ▓ │    desc: text-xs, text-secondary
│ ▓                                 ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ██ │  Bouillabaisse         │ ▓ │
│ ▓  │ ██ │  Classic Marseille-    │ ▓ │
│ ▓  │ ██ │  style fish stew       │ ▓ │
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓                                 ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ██ │  Steak Frites          │ ▓ │
│ ▓  │ ██ │  Hanger steak, hand-   │ ▓ │
│ ▓  │ ██ │  cut frites, aioli     │ ▓ │
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓         · · · (scrolls) · · ·   ▓ │
├─────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ⊙ Home    ⊙ Search   ⊙ Grocery   │
│                              [⊙]   │
└─────────────────────────────────────┘
```

---

### Screen 5 — Dish Detail (Bottom Sheet)

```
┌─────────────────────────────────────┐
│ 9:41              ▓▓▓▓▓▓▓  ●●● ▓▓▓ │
├─────────────────────────────────────┤
│ ▓  [←]   Le Diplomate       [↺]  ▓ │  ← results screen behind,
│ ▓  ░ Duck Confit          ░░░░░░  ▓ │    dimmed 40%, scaled 0.95
│ ▓  ░ Bouillabaisse        ░░░░░░  ▓ │
│ ▓                                 ▓ │
│                                     │
│ ┌─────────────────────────────────┐ │  ← bottom sheet springs up
│ │          ─────                  │ │    glass, radius-lg top corners
│ │         drag handle             │ │    4×36pt, white 30%
│ │ ███████████████████████████████ │ │  ← dish image
│ │ ███████████████████████████████ │ │    full width, 200pt
│ │ ███████████████████████████████ │ │
│ │                                 │ │
│ │  Duck Confit                    │ │  ← text-hero, text-primary
│ │                                 │ │
│ │  ✓ Confirmed by dish name,      │ │  ← evidence block
│ │    photo and ingredients.       │ │    text-xs, text-secondary
│ │                                 │ │
│ │  Crispy duck leg slow-cooked    │ │  ← description, text-sm
│ │  in its own fat, served with    │ │
│ │  cherry jus and pommes sarla.   │ │
│ │                                 │ │
│ │ ─────────────────────────────── │ │  ← divider, white 10%
│ │                                 │ │
│ │  ┌─────────────────────────────┐│ │  ← primary CTA, 56pt, radius-xl
│ │  │        Save Recipe          ││ │
│ │  └─────────────────────────────┘│ │
│ │        See Full Details         │ │  ← secondary, text-xs link
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

### Screen 6 — Search

```
┌─────────────────────────────────────┐
│ 9:41              ▓▓▓▓▓▓▓  ●●● ▓▓▓ │
├─────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓                                 ▓ │
│ ▓  Search                         ▓ │  ← text-2xl, text-primary
│ ▓                                 ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │  ← search input
│ ▓  │ ⊙  Dish, restaurant...      │ ▓ │    glass, radius-full, 52pt
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓                                 ▓ │
│ ▓  Recent                         ▓ │  ← text-sm, text-secondary
│ ▓                                 ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ⊙  Duck Confit              │ ▓ │  ← recent search rows
│ ▓  └─────────────────────────────┘ ▓ │    50pt, radius-md
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ⊙  Le Diplomate             │ ▓ │
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ⊙  Tonkotsu ramen           │ ▓ │
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓                                 ▓ │
│ ▓  Try: "carbonara", "sushi",     ▓ │  ← text-xs, text-tertiary
│ ▓  "bistro near me"               ▓ │
│ ▓                                 ▓ │
├─────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ⊙ Home    ● Search   ⊙ Grocery   │
│                              [⊙]   │
└─────────────────────────────────────┘
```

---

### Screen 7 — Grocery List (Ingredient View)

```
┌─────────────────────────────────────┐
│ 9:41              ▓▓▓▓▓▓▓  ●●● ▓▓▓ │
├─────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓                                 ▓ │
│ ▓  Grocery                        ▓ │  ← text-2xl
│ ▓                                 ▓ │
│ ▓  ░ Ingredients ░  ░ By Recipe ░ ▓ │  ← toggle pill, radius-full
│ ▓    ●──────────●     ○─────────○  ▓ │    active = white
│ ▓                                 ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │  ← item rows, 56pt, radius-md
│ ▓  │ ○  Duck leg (2)        500g │ ▓ │    ○ = check circle 24pt
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ○  Cherry preserves    1 jar│ ▓ │
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ●  Thyme            checked │ ▓ │  ← checked: strikethrough
│ ▓  └─────────────────────────────┘ ▓ │    40% opacity
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ○  Garlic cloves         4  │ ▓ │
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ○  Guanciale           200g │ ▓ │
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓         · · · (scrolls) · · ·   ▓ │
├─────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ⊙ Home    ⊙ Search   ● Grocery   │
│                              [⊙]   │
└─────────────────────────────────────┘
```

---

### Screen 8 — Grocery List (Recipe View)

```
┌─────────────────────────────────────┐
│ 9:41              ▓▓▓▓▓▓▓  ●●● ▓▓▓ │
├─────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓                                 ▓ │
│ ▓  Grocery                        ▓ │
│ ▓                                 ▓ │
│ ▓  ░ Ingredients ░  ░ By Recipe ░ ▓ │
│ ▓    ○──────────○     ●─────────●  ▓ │  ← By Recipe active
│ ▓                                 ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │  ← recipe group card, radius-md
│ ▓  │ ██  Duck Confit             │ ▓ │    header: image + name + count
│ ▓  │      Le Diplomate  5 items  │ ▓ │
│ ▓  │ ─────────────────────────── │ ▓ │
│ ▓  │  ○  Duck leg (2)       500g │ ▓ │    nested rows, 56pt
│ ▓  │  ○  Cherry preserves  1 jar │ ▓ │
│ ▓  │  ●  Thyme           checked │ ▓ │
│ ▓  │       + 2 more items   [v]  │ ▓ │  ← collapsed overflow
│ ▓  │  [ Remove all 5 items ]     │ ▓ │  ← bulk remove, text-xs
│ ▓  └─────────────────────────────┘ ▓ │
│ ▓                                 ▓ │
│ ▓  ┌─────────────────────────────┐ ▓ │
│ ▓  │ ██  Carbonara               │ ▓ │
│ ▓  │      Home · 4 items         │ ▓ │
│ ▓  │ ─────────────────────────── │ ▓ │
│ ▓  │  ○  Guanciale          200g │ ▓ │
│ ▓  │  ○  Pecorino            80g │ ▓ │
│ ▓  │       + 2 more items   [v]  │ ▓ │
│ ▓  │  [ Remove all 4 items ]     │ ▓ │
│ ▓  └─────────────────────────────┘ ▓ │
├─────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  ⊙ Home    ⊙ Search   ● Grocery   │
│                              [⊙]   │
└─────────────────────────────────────┘
```

---

### Processing Strip States (overlay, all screens)

```
Processing (scan in progress):
┌─────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← 64pt, radius-full
│  [██]  Identifying your menu...  ◌ │  ← thumbnail | text-sm | spinner
└─────────────────────────────────────┘

Result ready:
┌─────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← pulse animation
│  [██]  Your results are ready   →  │  ← thumbnail | text-sm | chevron
└─────────────────────────────────────┘

Positioned above tab bar. Springs up on processing start (300ms),
springs down after result is viewed or dismissed.
Thumbnail: 32×32pt, radius-xs. Text: text-sm. Controls: 28pt.
```

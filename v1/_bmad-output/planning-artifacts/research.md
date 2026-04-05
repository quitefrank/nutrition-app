---
project: Plately
date: 2026-03-17
author: Frank
type: research
---

# Plately — Research & Assumptions

This document captures the competitive context, product assumptions, user archetypes, emotional arc rationale, and technical bets underpinning the Plately PRD. It exists to keep the PRD focused on *what* the product is — this document holds the *why* behind the decisions.

---

## 1. Competitive Landscape

No existing product owns the full arc from pre-order transparency to post-meal capture to home recreation.

| Product | What It Does | Where It Stops |
|---|---|---|
| Google Lens | Reads menus, identifies dishes visually | Stops at identification — no recipe, no grocery list |
| Yelp | Restaurant context, photos, reviews | Requires active searching; framed around reviews not meals |
| MyFitnessPal | Camera scan for macro logging | Discipline/tracking framing; no recipe or recreation path |
| Recipe apps (general) | Recipe browse and saving | No capture from real-world dining; starts from known dish |

**The gap:** Discovery → capture → recreation as a single, continuous flow. No product makes the restaurant meal permanent in a way that connects back to the home kitchen.

**Core competitive insight:** Plately's differentiator is not any individual feature — it's the arc. Each competitor owns a fragment. Plately owns the journey.

---

## 2. Core Product Assumptions

Things we believe are true that drive product and scope decisions. These should be revisited as the product matures.

| Assumption | Confidence | Implication if Wrong |
|---|---|---|
| The two-moment arc (relief + nostalgia) is emotionally distinct enough to anchor a product | High — validated by personal experience and user narrative work | Would require repositioning around a single moment |
| PWA camera on iPhone Safari is viable without a native wrapper | Medium — known PWA camera limitations exist | May require Capacitor wrapper; explicit acceptance criterion in PRD |
| Gemini Vision accuracy will be sufficient with confidence-gating | Medium — untested at this fidelity | Confidence-gating is the mitigation; accuracy is the #1 technical risk |
| Single-user, no-auth design covers the personal/friends use case for MVP | High — deliberate scope decision | No change needed for MVP; BYOAK path covers sharing in v2 |
| The recreation moment (cooking at home) drives retention | High — it is the product's emotional payoff | If recreation fails, the product fails regardless of earlier steps |
| Supabase free tier is sufficient for personal/friends scale | High — minimal data model by design | Free tier limits explicitly tracked in NFR13 |

---

## 3. User Personas

Five archetypes derived from user journey work. Full journey narratives live in the PRD — these are the archetype summaries for downstream reference.

**Sofia — The Curious Diner**
Eats out regularly, encounters unfamiliar menus. Uses Plately for the full arc: scans the menu before ordering, captures the dish after eating, recreates it at home. Represents the primary retention loop.

**Daniel — The Home Cook**
Missed the capture moment at the restaurant. Returns the next day with a photo from Instagram or memory. Represents the post-meal-only use case and validates photo upload as a first-class feature.

**Marcus — The Frustrated Scanner**
Operating in bad conditions — dim lighting, small menus, unusual dishes. Encounters partial results and low-confidence states. Represents the edge case survival requirement; the app must handle failure gracefully without breaking trust.

**Priya — The Repeat Visitor**
Returns to the same restaurants. Expects the app to recognise her history and surface saved recipes automatically. Represents the return-visit recognition and grocery list aggregation requirements.

**Frank — The Nostalgic New User**
No dining-out occasion required. Searches for a dish from memory and generates a recipe without ever using the camera. Represents first-session value and validates manual search as a load-bearing feature.

---

## 4. Emotional Arc Rationale

Why these two moments, in this order, as a single product.

**Moment 1 — Relief (pre-order transparency)**
The user faces an unfamiliar menu and feels uncertainty. Plately resolves it immediately — dish identified, described, understood. The emotion is relief: confidence in what you're about to eat. This moment is valuable standalone but does not constitute full product success on its own.

**Moment 2 — Nostalgia (post-meal capture)**
The meal was good. The user wants it again. Plately makes the ephemeral permanent — the dish is captured, the recipe is saved, the grocery list is ready. The emotion is nostalgia: a desire to relive something that mattered.

**The Payoff — Recreation**
The user cooks the dish at home and it's recognisably close to the original. This is when the product earns loyalty. If this moment fails, both preceding moments lose their meaning. The full arc must hold together.

**Why the arc must be end-to-end for MVP:**
A partial arc — menu scan without recipe capture, or recipe capture without grocery list — does not validate the core thesis. The emotional payoff only lands when the user completes the loop from restaurant to home kitchen. Scope decisions were made to protect this arc over adding features.

---

## 5. Technical Assumptions

Research-level bets the architecture depends on. Framed as beliefs, not facts.

| Assumption | Basis | Risk |
|---|---|---|
| Gemini Vision is the right AI layer for multi-modal menu + dish identification | Capability match; handles both text and visual identification in one model | Accuracy at production scale is unvalidated — confidence-gating is the mitigation |
| Multi-source confidence pipeline (name inference + visual cross-referencing) produces meaningfully better trust signals than single-source | Logical — independent signals agreeing increases confidence | Implementation complexity; async validation adds latency |
| Next.js API routes provide sufficient abstraction for the BYOAK key injection path in v2 | Route layer reads from config, not hardcoded — per-user injection is additive | Only true if the abstraction is disciplined from day one; shortcuts will break it |
| Supabase free tier (500MB DB, 2GB bandwidth/month) covers personal + friends usage | Minimal data model: recipes + ingredients + grocery items only; no media storage | Needs monitoring; scan images are explicitly discarded to stay within limits |
| PWA install-to-homescreen on iPhone Safari delivers near-native camera experience | Community evidence; major PWAs have validated this path | Specific camera permission flows on iOS Safari have known quirks; treated as explicit acceptance criterion |

# Plately v2 — Planning Workspace

This folder is the v2 planning workspace. Keep all v2 work scoped here. Do not modify files in the parent `nutrition-app/` directory (the v1 codebase).

## BMAD Method

BMAD is installed at `../../_bmad/`. All `/bmad-*` skills are available automatically.

- **v1 context (read-only):** `_context/` — PRD, epics, architecture, UX spec, project-context, sprint status
- **v2 planning output:** `planning/` — new PRDs, epics, stories, architecture decisions
- **Design references:** `references/` — iOS app screenshots for visual inspiration

## Product Thesis

**Tagline:** _"Take home the food you love"_

**Simplest MVP statement:** _"Scan the menu. Know what you're getting. Love the meal. Take it home."_

**Emotional arc:**
1. **Relief** — pre-order transparency (understand an unfamiliar dish before ordering)
2. **Nostalgia** — post-meal capture (take a beloved recipe home)
3. **Payoff** — home recreation (cook it with the grocery list in hand)

## Defining v2 Improvement: Zero-Friction Capture

The single biggest change from v1: **everything is auto-saved. No explicit save step.**

| v1 flow | v2 flow |
|---------|---------|
| Scan menu → select dish → tap Save | Scan menu → restaurant + all dishes instantly in your collection |
| Search restaurant → browse dishes → tap Save | Search restaurant → all dishes instantly in your collection |
| User manages what to keep | User can remove: individual recipes or the whole restaurant |

The scan itself is the capture. The emotional framing shifts from "did I remember to save it?" to "do I want to keep it?"

**Data model consequence:** A restaurant visit/search creates a visit record. Dishes become recipes immediately with an auto-captured status. Removal (not saving) is the user's primary management action.

## v1 Growth Features — Promoted to v2 Core

These were deferred in v1 and are now first-class requirements:

- **Google Places enrichment** — auto-save flow needs restaurant context immediately
- **Macro tracking (USDA pipeline)** — already implemented in v1; refine UX in v2
- **Chain restaurant fast-path** — cache scanned menus so repeat visits are instant
- **URL recipe import** — high retention value; good first-session hook
- **BYOAK** — architectural groundwork laid in v1; surface it in v2
- **Restaurant caching** — central to the auto-save and repeat-visit flows

Still deferred to Phase 2/3:
- Cooking instructions
- Android Chrome support
- Recipe book OCR
- Social sharing
- Local device photo storage

## v1 Gaps to Fix

1. **Dish search hallucination** — v1 infers dishes from restaurant name alone (no real menu data). v2 caches actual scanned menus per restaurant.
2. **Shallow nutrition math** — macros snapshot at save time; no recalculation for portion changes; no add/remove ingredients. v2 treats nutrition as an editable ledger.
3. **Half-built atmospheric system** — `atmospheric_palette_json` stored in DB but color extraction never runs. v2 implements or removes it cleanly.
4. **No validation layer** — Gemini JSON parsed optimistically. v2 adds Zod at every API boundary.
5. **N serial USDA requests** — slow saves for multi-ingredient recipes. v2 batches USDA lookups.
6. **Silent grocery merge** — users don't see what was merged vs. skipped. v2 shows a merge summary.

## Tech Stack (carry forward from v1)

- **Framework:** Next.js (App Router) + React + TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** Supabase (PostgreSQL)
- **AI/Vision:** Google Gemini 2.5 Flash
- **Restaurant data:** Google Places API
- **Nutrition:** USDA FoodData Central
- **State:** TanStack React Query v5
- **Testing:** Vitest + React Testing Library
- **Deployment:** Vercel

## Starting the v2 PRD

Open this folder in a new Claude Code conversation and run:

```
/bmad-create-prd
```

Point the agent at `_context/prd.md` as the v1 baseline. The v2 PRD should reflect the zero-friction capture direction, the promoted growth features, and the v1 gap fixes above.

## Rules

- All v2 planning artifacts go into `planning/`
- Do not modify anything in `_context/` — it is v1 history
- Do not modify anything in the parent `nutrition-app/` directory
- Work only within `v2/`

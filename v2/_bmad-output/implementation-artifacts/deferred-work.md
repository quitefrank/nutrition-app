# Deferred Work

Goals scoped out of Spec 1 (App Foundation + Design System). Each is independently shippable.

## Spec 2 — Capture + Auto-Save
- Camera modal (full-bleed, scan guides)
- Photo upload
- Gemini menu/dish scan → dishes auto-added to collection (no tap-to-save)
- Processing strip mini-player for async results
- Google Places restaurant auto-association

## Spec 3 — Recipe Collection + Nutrition
- Home screen: restaurant cards + recipe grid
- Recipe detail: editable ingredients, proportional macro scaling
- USDA batch lookup (parallel Promise.allSettled)
- Zod validation at every API boundary

## Spec 4 — Grocery List
- Add recipe → aggregate + deduplicate ingredients
- Merge summary shown on add
- Flat view (check-off) + By Recipe grouped view
- Offline read-only with queued sync

## Spec 5 — Search + Discovery
- Google Places restaurant search (debounced 300ms)
- Browse dishes from search → auto-added to collection
- URL recipe import
- BYOAK (Bring Your Own API Key)
- Chain restaurant fast-path (scanned menu caching)

# Story 1.7: Home Screen Empty State & Atmospheric Background

Status: done

## Story

As a new user with no restaurants saved,
I want to see a welcoming empty state with one clear call-to-action, set against an atmospheric food-photography backdrop,
So that I immediately understand the app's purpose and know how to get started.

## Acceptance Criteria

1. Empty state shows: 52px icon, Playfair 22px "Take home the food you love", 13px body (max 210px), terracotta pill CTA "📷 Scan a menu" (50px, 9999px radius); no placeholder cards
2. No food photography available: falls back to warm cream gradient overlay
3. Atmospheric background at `app/layout.tsx`: persistent fixed layer behind all screens
4. `role="main"` wraps the empty state content area; CTA has `aria-label="Open camera to scan a menu"`

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List

- 2026-04-12: Story implemented. Added `.atmospheric-bg` div (with `.atmospheric-bg__overlay` fallback) to `src/app/layout.tsx` as first child of body, before ServiceWorkerRegistrar. Rewrote `EmptyState` component in `src/components/screens/HomeScreen.tsx` to match v2 spec: 52px camera icon, Playfair 22px title, 13px body (max 210px), terracotta pill CTA with aria-label. Removed deprecated HintCard, CameraHintIcon, SearchHintIcon, and PlateIllustration helpers.

### File List

- `src/app/layout.tsx` — modified: atmospheric background layer added
- `src/components/screens/HomeScreen.tsx` — modified: EmptyState rewritten to v2 spec

# Story 1.6: FloatingNavBar Component

Status: done

## Story

As a user,
I want a floating frosted-glass nav bar at the bottom of every screen with tabs for Restaurants and Recipes, and a prominent camera button,
So that I can always reach my collection and scan a new menu in one tap.

## Acceptance Criteria

1. Frosted glass capsule pill (62px height, `border-radius: 9999px`, `--glass-elevated` + `--blur-elevated`) contains Restaurants and Recipes tabs, floating 16px from edges
2. Camera button is 62×62px terracotta circle outside the pill, `aria-label="Scan a menu"`
3. Active tab: filled icon + terracotta label; inactive: stroke icon + tertiary label
4. Camera press: scales to 0.88 using `SPRING_CARD_EXPAND`
5. Nav has semantic `<nav>` element (navigation landmark); camera has `role="button"`; ≥44px touch targets
6. No Settings tab; Settings is accessible only from a persistent header icon

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List

- 2026-04-12: Story implemented. Updated `src/components/layout/TabBar.tsx`: tabs changed from [Home, Search, Grocery, Settings] to [Restaurants, Recipes]; imported SPRING_CARD_EXPAND from @/lib/springs; updated camera aria-label to "Scan a menu"; made onCameraPress optional. Wired TabBar into `src/app/layout.tsx` inside .app-shell div.

### File List

- `src/components/layout/TabBar.tsx` — modified: tabs updated, springs imported
- `src/app/layout.tsx` — modified: TabBar wired in

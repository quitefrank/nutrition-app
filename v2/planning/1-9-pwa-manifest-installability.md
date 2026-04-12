# Story 1.9: PWA Manifest & Installability

Status: done

## Story

As a user,
I want to install Plately on my iPhone home screen from Safari,
So that I can launch it like a native app with full-screen experience.

## Acceptance Criteria

1. **Given** the user visits Plately in iPhone Safari **When** they tap "Add to Home Screen" **Then** the app installs with the name "Plately", a correct app icon, and launches with `display: standalone` (no Safari browser chrome)

2. **Given** the app is launched from the home screen icon **When** it opens **Then** the status bar is correctly themed; safe area insets are respected; there is no browser address bar

3. **Given** the PWA manifest is in place **When** validated **Then** `manifest.json` includes: `name`, `short_name`, `display: "standalone"`, `theme_color: "#C4622D"`, `background_color`, and at least one icon at 192×192px

## Tasks / Subtasks

- [x] Task 1: Resolve manifest conflict — choose one canonical approach (AC: #3)
  - [x] 1.1 — Determine which manifest is served: `public/manifest.json` vs. `src/app/manifest.ts`; Next.js 13+ App Router serves `src/app/manifest.ts` at `/manifest.json` automatically and supersedes any `public/manifest.json` with the same path
  - [x] 1.2 — Decide canonical approach: App Router `src/app/manifest.ts` is preferred for Next.js 16; if keeping `public/manifest.json`, remove `src/app/manifest.ts` to avoid ambiguity; pick one and remove the other
  - [x] 1.3 — Fix `theme_color` in `src/app/manifest.ts`: currently `"#FAFAF7"` (background colour); correct value is `"#C4622D"` (terracotta accent, matching `layout.tsx` and `public/manifest.json`)

- [x] Task 2: Provide PNG app icons (AC: #1, #3)
  - [x] 2.1 — `src/app/manifest.ts` currently references `/icon-192.png` and `/icon-512.png` but only SVG equivalents exist in `public/icons/`; `public/manifest.json` references SVGs at `/icons/icon-192.svg` and `/icons/icon-512.svg`
  - [x] 2.2 — Determine whether to use the existing SVG icons or create PNG equivalents; note: iPhone Safari "Add to Home Screen" requires PNG or JPEG icons — it does not render SVG icons reliably for the home screen tile
  - [x] 2.3 — Add PNG icons at minimum sizes: `public/icons/icon-192.png` (192×192), `public/icons/icon-512.png` (512×512)
  - [x] 2.4 — Add `public/icons/apple-touch-icon.png` (180×180); this is the icon Safari uses for the home screen tile — it is separate from and takes priority over the manifest `icons` array on iOS
  - [x] 2.5 — Update whichever manifest file is canonical so `icons` entries point to the PNG files

- [x] Task 3: Verify Apple-specific meta tags in `layout.tsx` (AC: #1, #2)
  - [x] 3.1 — Confirm `<meta name="apple-mobile-web-app-capable" content="yes">` is present in `layout.tsx` (already present at line 49 — verify, do not duplicate)
  - [x] 3.2 — Confirm `<meta name="apple-mobile-web-app-status-bar-style" content="default">` is present (already present at line 50 — verify, do not duplicate)
  - [x] 3.3 — Add `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` to `<head>` in `layout.tsx` (not currently present — this is required for iOS to find the icon)
  - [x] 3.4 — Confirm `metadata.manifest` points to the correct manifest URL (`"/manifest.json"` — already at line 19)
  - [x] 3.5 — Confirm `viewport.viewportFit: "cover"` is set (already at line 32 — required for safe area insets to apply when launched standalone)

- [x] Task 4: Verify safe area insets are in place for standalone launch (AC: #2)
  - [x] 4.1 — Confirm `env(safe-area-inset-bottom)` is used in the nav bar and bottom content areas (Story 1.4 covers this; verify it is already implemented and not blocked by this story)
  - [x] 4.2 — Confirm `env(safe-area-inset-top)` is applied where content sits behind the status bar (check `globals.css` or `AppShell` for `.app-shell` padding-top)

- [ ] Task 5: Manual verification on iPhone Safari (AC: #1, #2, #3) — DEFERRED: cannot execute in this environment; requires physical device or Vercel preview URL
  - [ ] 5.1 — Load the app in iPhone Safari; tap Share → "Add to Home Screen"; confirm the icon renders correctly (not blank, not a generic globe)
  - [ ] 5.2 — Launch from home screen icon; confirm: no Safari browser chrome, status bar themed terracotta, no content hidden behind status bar or home indicator
  - [ ] 5.3 — Run the manifest through a PWA validation tool (Lighthouse or Chrome DevTools Application panel) to confirm all required fields are present

## Dev Notes

### Current State — What Already Exists

This story is largely about verifying, fixing, and completing work that is partially in place. Do not implement from scratch — audit first.

**What is already implemented:**

| Item | Location | Status |
|------|----------|--------|
| `metadata.manifest` pointing to `/manifest.json` | `src/app/layout.tsx:19` | Done |
| `appleWebApp: { capable: true, statusBarStyle: "default", title: "Plately" }` in metadata | `src/app/layout.tsx:20–24` | Done — this generates `apple-mobile-web-app-*` meta tags via Next.js |
| `viewport.viewportFit: "cover"` | `src/app/layout.tsx:32` | Done |
| `viewport.themeColor: "#C4622D"` | `src/app/layout.tsx:33–34` | Done |
| `<meta name="theme-color" content="#C4622D">` explicit | `src/app/layout.tsx:45–46` | Done |
| `<meta name="apple-mobile-web-app-capable" content="yes">` explicit | `src/app/layout.tsx:49` | Done (redundant with `appleWebApp.capable` — acceptable) |
| `<meta name="apple-mobile-web-app-status-bar-style" content="default">` | `src/app/layout.tsx:50` | Done (redundant with `appleWebApp.statusBarStyle` — acceptable) |
| App Router manifest (`src/app/manifest.ts`) | `src/app/manifest.ts` | Exists but has `theme_color` bug and references non-existent PNG files |
| Static manifest (`public/manifest.json`) | `public/manifest.json` | Exists; correct theme_color; references SVG icons |
| SVG icons | `public/icons/icon-192.svg`, `public/icons/icon-512.svg` | Exist but insufficient for iPhone home screen |
| `ServiceWorkerRegistrar` component | `src/components/pwa/ServiceWorkerRegistrar.tsx` | Exists — **do not modify** (service worker is Epic 7, Story 7.1 scope) |
| `InstallPromptBanner` component | `src/components/pwa/InstallPromptBanner.tsx` | Exists — **do not modify** |
| `sw.js` | `public/sw.js` | Exists — **do not modify** (Story 7.1 scope) |

**What is missing or broken:**

| Item | Issue |
|------|-------|
| PNG icons | `src/app/manifest.ts` references `/icon-192.png` and `/icon-512.png` — these files do not exist in `public/` |
| `apple-touch-icon` PNG | No `apple-touch-icon.png` in `public/` or `public/icons/`; required for the iOS home screen tile |
| `apple-touch-icon` link tag | `<link rel="apple-touch-icon">` is not in `layout.tsx` |
| `theme_color` in `src/app/manifest.ts` | Set to `"#FAFAF7"` (background colour) instead of `"#C4622D"` (terracotta) |
| Manifest conflict | Both `src/app/manifest.ts` and `public/manifest.json` exist and serve to `/manifest.json` — Next.js App Router's `manifest.ts` takes precedence; one should be removed |

---

### Next.js 16 App Router Manifest Approach

**Project is on Next.js 16.2.2.** The App Router manifest API (`src/app/manifest.ts`) was introduced in Next.js 13.3 and is the canonical approach for Next.js 13+.

**How it works:** Exporting a default function from `src/app/manifest.ts` causes Next.js to serve it at `/manifest.json` (or `/manifest.webmanifest`). The function returns a `MetadataRoute.Manifest` object.

**Conflict resolution:** When both `src/app/manifest.ts` and `public/manifest.json` exist, `src/app/manifest.ts` wins because Next.js generates the route at build time and does not fall through to `public/` for the same path. The `public/manifest.json` is dead weight. Remove it to avoid confusion.

**Recommended canonical approach:**
- Keep `src/app/manifest.ts` (App Router pattern)
- Remove `public/manifest.json`
- Fix `theme_color` in `src/app/manifest.ts` to `"#C4622D"`
- Update `icons` in `src/app/manifest.ts` to point to the PNG files that will be added

**Correct `src/app/manifest.ts` after fix:**
```typescript
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plately",
    short_name: "Plately",
    description: "Take home the food you love.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAFAF7",
    theme_color: "#C4622D",   // Fix: was "#FAFAF7"
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
```

---

### iOS-Specific Requirements (Apple Does Not Follow the Standard)

iPhone Safari has its own requirements on top of the W3C manifest spec. These are not covered by the manifest file alone:

**`apple-touch-icon`** — This is what Safari uses when the user taps "Add to Home Screen". It must be a PNG, and it should be 180×180px for current iPhones. Safari ignores the manifest `icons` array for this purpose.

Add to `src/app/layout.tsx` inside `<head>`:
```tsx
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

This tag is not generated by Next.js `metadata.appleWebApp` — it must be added explicitly.

**`apple-mobile-web-app-capable`** — Already present via `metadata.appleWebApp.capable: true` (which generates the tag) AND explicit `<meta>` in the `<head>`. The redundancy is harmless.

**`apple-mobile-web-app-status-bar-style`** — Already present. Valid values: `"default"` (black text on white/transparent), `"black"` (black bar), `"black-translucent"` (status bar overlays content). `"default"` is correct for Plately's design.

**`viewportFit: "cover"`** — Already set in `viewport`. Required to allow content to extend into the notch/island area, which is then managed with `env(safe-area-inset-*)` CSS.

---

### Icon Files Required

| File | Size | Purpose |
|------|------|---------|
| `public/icons/apple-touch-icon.png` | 180×180px | iOS home screen tile (Safari "Add to Home Screen") |
| `public/icons/icon-192.png` | 192×192px | Android PWA / generic manifest icon |
| `public/icons/icon-512.png` | 512×512px | Splash screen, high-DPI |

**Existing SVG icons** (`public/icons/icon-192.svg`, `public/icons/icon-512.svg`) are not sufficient for iPhone home screen installation. Safari does not render SVG reliably for home screen tiles. PNG is required.

**Creating the icons:** The app's brand colour is terracotta `#C4622D`. The icon should be a simple, legible mark at small sizes (a plate or "P" logotype on a terracotta background works). For a development placeholder, a solid `#C4622D` square with "P" in white at 180×180px is acceptable — the icon can be refined later without any code changes.

**Placing icons:** All icons go in `public/icons/`. Do NOT place them in `public/` root — the `layout.tsx` link tag and manifest `src` entries must use `/icons/` paths.

---

### Scope Boundary — Service Worker Is NOT This Story

`ServiceWorkerRegistrar` and `InstallPromptBanner` already exist. **Do not modify them.** Service worker registration, offline caching, and the "beforeinstallprompt" flow are covered by Story 7.1 (Epic 7). This story is:

- manifest.json content and correctness
- Apple-specific meta tags in layout.tsx
- PNG icon files
- The `apple-touch-icon` link tag

This story is **not**:
- `/sw.js` implementation
- Offline caching strategy
- `ServiceWorkerRegistrar` logic
- `InstallPromptBanner` trigger logic

---

### How to Test on iPhone Safari

1. Deploy to Vercel preview URL (or use local dev server with `ngrok`/Vercel CLI's `--local-tunnel`)
2. Open in iPhone Safari
3. Tap the Share button (box with arrow pointing up)
4. Scroll down and tap "Add to Home Screen"
5. Confirm the icon shows the Plately icon (not a blank square or generic globe)
6. Confirm the suggested name is "Plately"
7. Tap Add
8. Tap the home screen icon
9. Verify: app launches without Safari address bar, status bar is present and styled, content is not cut off by the home indicator at the bottom

**Lighthouse check:** In Chrome DevTools → Lighthouse → Progressive Web App audit. The manifest and meta tag requirements will surface as pass/fail items.

**Key Lighthouse checks for this story:**
- "Web app manifest meets the installability requirements" — requires `name`, `short_name`, `icons` with at least one 192×192 icon, `start_url`, `display: standalone`
- "Provides a valid `apple-touch-icon`" — requires `<link rel="apple-touch-icon">`

---

### Anti-Patterns to Avoid

```tsx
// ❌ WRONG — SVG icons do not work reliably for iPhone home screen
{ src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" }

// ✅ CORRECT — PNG required for iOS
{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }

// ❌ WRONG — apple-touch-icon not generated by Next.js metadata API
// (appleWebApp.capable does NOT add the link tag for the icon)

// ✅ CORRECT — must be explicit in <head>
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

// ❌ WRONG — theme_color mismatch (was set to background colour in manifest.ts)
theme_color: "#FAFAF7"

// ✅ CORRECT — terracotta accent, consistent with layout.tsx viewport config
theme_color: "#C4622D"
```

### Project Structure Notes

**Files this story touches:**

| File | Action |
|------|--------|
| `src/app/manifest.ts` | Fix `theme_color`; update `icons` to PNG paths |
| `src/app/layout.tsx` | Add `<link rel="apple-touch-icon">` to `<head>` |
| `public/manifest.json` | Remove (superseded by `src/app/manifest.ts`) |
| `public/icons/apple-touch-icon.png` | Create (180×180px PNG) |
| `public/icons/icon-192.png` | Create (192×192px PNG) |
| `public/icons/icon-512.png` | Create (512×512px PNG) |

**Files this story does NOT touch:**

| File | Reason |
|------|--------|
| `src/components/pwa/ServiceWorkerRegistrar.tsx` | Story 7.1 scope |
| `src/components/pwa/InstallPromptBanner.tsx` | Story 7.1 scope |
| `public/sw.js` | Story 7.1 scope |
| `public/icons/icon-192.svg` | Can remain; PNG additions are separate |
| `public/icons/icon-512.svg` | Can remain; PNG additions are separate |

### References

- **epics.md** — Epic 1, Story 1.9 acceptance criteria; FR43 ("User can install Plately as a PWA on their iPhone home screen")
- **architecture.md** — "Platform, Navigation & Settings" group; `src/app/manifest.ts` listed in project directory structure under `app/` as "PWA manifest (Next.js generated)"
- **prd.md** — FR43; Responsive Design section: "PWA installable: `manifest.json` with `display: standalone`, icons, theme colour"
- **layout.tsx** — Current state of PWA meta tags (lines 16–35 metadata/viewport exports; lines 44–51 explicit head tags)

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

**2026-04-12 — Story completed by claude-sonnet-4-6**

**What was already correct (no changes needed):**
- `metadata.manifest: "/manifest.json"` in `layout.tsx` — already present
- `appleWebApp: { capable: true, statusBarStyle: "default", title: "Plately" }` in `layout.tsx` — already present
- Explicit `<meta name="apple-mobile-web-app-capable">` and `<meta name="apple-mobile-web-app-status-bar-style">` in `layout.tsx` — already present
- `viewport.viewportFit: "cover"` and `viewport.themeColor: "#C4622D"` — already correct
- SVG icons (`public/icons/icon-192.svg`, `public/icons/icon-512.svg`) — left in place (coexist with new PNGs)

**What was fixed:**
- `theme_color` in `src/app/manifest.ts`: changed from `"#FAFAF7"` (background) to `"#C4622D"` (terracotta)
- Icon `src` paths in `src/app/manifest.ts`: corrected from `/icon-192.png`/`/icon-512.png` (public root, non-existent) to `/icons/icon-192.png`/`/icons/icon-512.png` (correct `public/icons/` subdirectory)

**What was created:**
- `public/icons/apple-touch-icon.png` (180×180px) — solid terracotta `#C4622D` PNG, generated via raw Node.js Buffer (no external dependencies)
- `public/icons/icon-192.png` (192×192px) — solid terracotta `#C4622D` PNG
- `public/icons/icon-512.png` (512×512px) — solid terracotta `#C4622D` PNG
- Note: icons are color-fill placeholders; refined artwork can replace these files without any code changes

**What was removed:**
- `public/manifest.json` — deleted; superseded by `src/app/manifest.ts` (Next.js App Router serves this to `/manifest.json` and takes precedence)

**What was added to `layout.tsx`:**
- `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />` — required for Safari "Add to Home Screen" to pick up the icon; not generated by Next.js `metadata.appleWebApp`

**Task 5 deferred:** Manual iPhone Safari verification cannot be performed in this environment. Requires a Vercel preview URL or local dev server exposed via ngrok, and a physical iOS device.

### File List

- `src/app/manifest.ts` — fixed `theme_color` and icon `src` paths
- `src/app/layout.tsx` — added `<link rel="apple-touch-icon">` to `<head>`
- `public/manifest.json` — removed
- `public/icons/apple-touch-icon.png` — created (180×180px PNG)
- `public/icons/icon-192.png` — created (192×192px PNG)
- `public/icons/icon-512.png` — created (512×512px PNG)

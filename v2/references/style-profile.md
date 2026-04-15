# Design Style Profile

_Last updated: 2026-04-13_

> **Reference priority:**
> - **Navigation & system components** → Apple TV + Apple Music (primary)
> - **Content blocks** (cards, atmospheric background, spacing, typography) → TIDE (primary)
> - **Camera UI validation** → Google Lens, Snapchat

## Analyzed Images

- Apple TV iOS 3.png
- Apple TV iOS 4.png
- Apple TV iOS 7.png
- Apple TV iOS 12.png
- Apple TV iOS 13.png
- Apple TV iOS 14.png
- Apple TV iOS 15.png
- Apple TV iOS 17.png
- Apple TV iOS 21.png
- Apple TV iOS 42.png
- Apple TV iOS 60.png
- Apple TV iOS 64.png
- Apple TV iOS 118.png
- Apple Music iOS 2.png
- Apple Music iOS 49.png
- Apple Music iOS 105.png
- Apple Music iOS 108.png
- Apple TV iOS 64.png
- Apple Music iOS 2.png
- TIDE iOS 76.png
- TIDE iOS 27.png
- TIDE iOS 58.png
- TIDE iOS 62.png
- TIDE iOS 75.png
- TIDE iOS 76.png
- TIDE iOS 106.png
- TIDE iOS 121.png
- TIDE iOS 123.png
- TIDE iOS 130.png
- TIDE iOS 138.png
- TIDE iOS 140.png
- TIDE iOS 163.png
- Google iOS 50.png
- Google iOS 51.png
- Google iOS 52.png
- Google iOS 57.png
- Snapchat iOS 224.png

## Color Palette

**Backgrounds (TIDE reference — light mode):**
- Primary base: warm greige `#FAFAF7` — never cold white
- Elevated surface: `#EFEDE6`
- Sunken surface: `#E8E6DF`
- Card surface: `rgba(255, 252, 247, 0.88)` — frosted cream

**Text (TIDE reference):**
- Primary: `#1A1612` warm near-black
- Secondary: `#6B6458`
- Tertiary: `#9E9589`
- Disabled: `#C4BDB5`

**Accent (Plately-specific, harmonizes with TIDE warm palette):**
- Primary: terracotta `#C4622D`
- Light tint: `#FAEEE6`
- Dark: `#9E4B1F`

**Status tints:**
- Error: dusty rose `rgba(251, 234, 234, 0.95)`
- Success: muted green `rgba(232, 245, 238, 0.95)`
- Warning: warm amber `rgba(251, 243, 226, 0.95)`

**Borders:** `rgba(180, 170, 158, 0.22–0.28)` — warm-toned, very subtle

**Gradient (atmospheric overlay on food photos):**
```
linear-gradient(180deg, rgba(250,250,247,0.55) 0%, rgba(244,243,238,0.72) 60%, rgba(239,237,230,0.88) 100%)
```

## Typography

**Font families:**
- Display / editorial h1: **Playfair Display** — used sparingly for hero titles only
- Body / all UI: **DM Sans** — clean, warm, humanist

**Weight scale:**
- 400 regular — body text, labels
- 500 medium — secondary UI, tab labels
- 600 semibold — section headers, card titles, CTAs

**Size hierarchy:**
- Display h1: `2rem` (32px), Playfair Display, letter-spacing `-0.01em`
- h2: `1.5rem` (24px); h3: `1.25rem`; h4: `1.0625rem`
- Body: `0.9375rem` (15px), `line-height: 1.6`
- Caption/label: `10–12px`, normal weight, muted color
- Tab labels: `10px`, medium weight, wide tracking

## Spacing & Layout

**Horizontal padding:** `16–20px` consistently
**Card inner padding:** `16–20px` all sides
**Inter-section gap:** `20–24px`
**Card margin:** `mx-4` (16px from screen edge)

**Philosophy (TIDE):** Airy, never cramped. Generous vertical breathing room.

**Grid density:** 2-column card grid for collections, single-column for detail, horizontal scroll for row sections.

## Component Style (General)

**Icons:** Stroke/outlined, weight `1.5–1.75px`, size `22–24px`. Filled only for active nav tab state.

**Cards (TIDE):** `20–24px` radius, `rgba(255,252,247,0.88)` frosted cream, `1px` warm border, soft warm shadow. No dark glass.

**Pill CTAs:** `52–56px` height, `border-radius: 9999px`, full-width `mx-4`, terracotta fill.

**Animation:** Spring `stiffness:400 damping:22`. Page transitions `250ms ease-out`. Background crossfade `400ms ease-out`.

**Atmospheric background:** Full-bleed food photo, `blur(40px) saturate(1.3)`, `scale(1.05)`, warm cream gradient overlay.

---

## Component Library

### Bottom Navigation Bar

**Source images:** Apple TV iOS 3.png, Apple TV iOS 4.png, Apple TV iOS 7.png, Apple Music iOS 105.png, Apple Music iOS 108.png

**Layout diagram:**
```
screen left                                            screen right
↓                                                              ↓
|←16px→[ Tab1  |  Tab2  |  Tab3  ]←—gap ~12px—→[ ○ ]←16px→|
        └─── frosted glass pill ──┘               └── action FAB
             capsule shape                            separate circle
             NOT edge-to-edge                         NOT inside pill
        ↑                                         ↑
  rounded left end                          rounded right end
  (border-radius 9999px)                    (border-radius 9999px)

Both elements float above home indicator:
paddingBottom = env(safe-area-inset-bottom, 0px) + 12–16px
```

**Structure:** Two sibling flex children — (1) a frosted glass capsule pill containing labeled nav tabs with `flex-1` growth, and (2) a separate solid-color circle for the primary action. Both share the same flex row; neither touches the screen edge.

**Dimensions:**
- Pill height: `~62px`
- Pill width: `flex: 1` (grows to fill row minus camera + gap + outer padding)
- Pill border-radius: `9999px` (fully rounded capsule ends)
- Camera circle: `62px × 62px`
- Outer side padding: `~16px` from screen edges (each side)
- Gap between pill and camera: `~12px`

**Internal spacing (pill):**
- Each tab item: `flex-1`, `flex-col`, icon centered above 10px label
- Horizontal padding per tab: `px-4` to `px-5` (tabs determine pill width via content)
- Icon size: `22px`, stroke `1.75px`
- Icon-to-label gap: `2–4px`

**Position:**
- `position: fixed; bottom: 0; left: 0; right: 0`
- Outer container: `display: flex; align-items: flex-end; justify-content: center; padding: 0 16px`
- Bottom padding: `calc(max(env(safe-area-inset-bottom, 0px), 8px) + 12px)`
- Content floats visibly above the home indicator — does NOT sit flush to bottom edge

**Visual treatment — Plately light mode (adapt from Apple's dark):**
- Pill background: `frosted-elevated` — `rgba(255,252,245,0.94)`, `backdrop-filter: blur(32px) saturate(1.5)`
- Pill border: `1px solid rgba(180,170,158,0.22)`
- Pill shadow: `0 8px 32px rgba(80,60,40,0.12), 0 2px 8px rgba(80,60,40,0.08)`
- Camera background: `var(--color-accent)` — terracotta `#C4622D`
- Camera icon: white, `22px`
- Camera ring: `box-shadow: 0 0 0 3px rgba(250,242,237,1), 0 4px 14px rgba(196,98,45,0.40)`

**States:**
- Active tab: filled icon variant, `color: var(--color-accent)`, label colored accent — no background chip
- Inactive tab: stroke icon variant, `color: var(--color-text-tertiary)`
- Camera pressed: `scale(0.88)` spring, `transition: spring stiffness:400 damping:22`

**NOT:**
- NOT an edge-to-edge bar spanning the full screen width
- NOT attached to screen left or right edges — 16px margin each side
- NOT a single container that includes the camera button inside it
- NOT a notch pattern with a center-embedded FAB
- NOT a bar where camera sits at the right end of the same full-width background
- NOT a tab item — camera has no label and has a solid colored background distinct from the pill

---

### Frosted Card (TIDE)

**Source images:** TIDE iOS 27.png, TIDE iOS 75.png, TIDE iOS 121.png, TIDE iOS 130.png

**Layout diagram:**
```
|←16px→[                                  ]←16px→|
        └── frosted cream card, mx-4 ────┘
            border-radius: 20–24px
            padding: 16–20px inside
            floats on atmospheric background
```

**Structure:** Rounded rectangle floating over the atmospheric blurred background. Full width minus `mx-4` margins.

**Dimensions:** border-radius `20–24px`; inner padding `16–20px`; no fixed height (content-driven)

**Visual treatment:**
- Background: `rgba(255,252,247,0.88)`, `backdrop-filter: blur(24px) saturate(1.4)`
- Border: `1px solid rgba(180,170,158,0.28)`
- Shadow: `0 2px 12px rgba(80,60,40,0.08), 0 1px 3px rgba(80,60,40,0.06)`

**NOT:** NOT dark glass. NOT hard drop shadows. NOT full-bleed (always has mx-4 margins).

---

### Camera / Scan Modal (Google Lens + Snapchat)

**Source images:** Google iOS 50.png, Google iOS 51.png, Google iOS 52.png, Snapchat iOS 224.png

**Layout diagram:**
```
┌─────────────── full screen overlay ───────────────┐
│  [✕ close]                        [⬆ upload]     │  ← top row, frosted circle buttons
│                                                   │
│           ┌─────────────────┐                     │
│           │   scan frame    │   ← corner brackets │
│           └─────────────────┘                     │
│                                                   │
│               [  ●  ]                             │  ← capture button, bottom center
│           large white ring / colored inner circle │
└───────────────────────────────────────────────────┘
```

**Structure:** Full-screen dark overlay. Frosted circle buttons top-left and top-right. Scan frame brackets centered. Large shutter button bottom-center above safe area.

**Capture button:** `~80px` circle, white ring outer, accent-colored inner circle. Disabled = muted. Centered horizontally.

**NOT:** NOT a bottom sheet. NOT a partial overlay. Fully replaces the screen.

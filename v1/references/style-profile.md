# Design Style Profile

_Last updated: 2026-04-09_

> **Reference priority note:** TIDE is the primary structural reference for layout, tab bar, glass card treatment, and CTA buttons. Apple TV is the primary reference for dark content browsing, hero images, and section list patterns. Apple Music covers filter chips, library list rows, and mini-player patterns. Google Lens covers scan/camera UI and mode pill strips.

## Analyzed Images
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
- Apple Music iOS 108 (1).png
- Google iOS 50.png
- Google iOS 51.png
- Google iOS 52.png
- Google iOS 57.png
- Snapchat iOS 224.png

## Color Palette

**Dark mode (default — Plately primary):**
- Base background: `#0a0a0a` — true near-black (Apple TV reference: pure black base)
- Elevated surface: `rgba(255,255,255,0.09)` — ultra-subtle white glass (glass cards)
- Sheet surface: `rgba(255,255,255,0.10)` — bottom sheets, modals
- Tab bar surface: `rgba(255,255,255,0.08)` — floating pill
- Primary text: `rgba(255,255,255,1.0)` — full white
- Secondary text: `rgba(255,255,255,0.60)` — labels, captions
- Tertiary text: `rgba(255,255,255,0.35)` — placeholders, dim metadata
- Text on buttons: `rgba(0,0,0,0.90)` — dark text on white CTA
- Border/divider: `rgba(255,255,255,0.12–0.20)` — glass card edges
- Atmospheric gradient: vertical `rgba(0,0,0,0) → rgba(0,0,0,0.65)` — hero overlays
- Accent: white (primary CTA), no colored accent in Plately dark mode

**Light mode (TIDE reference — warm beige/neutral):**
- Background: `#f5f5f5` to warm `#e8e4df` depending on content
- Cards: `rgba(255,255,255,0.65)` frosted glass
- Text primary: `rgba(0,0,0,0.90)`
- Text secondary: `rgba(0,0,0,0.55)`
- Atmospheric: soft warm gradients, not used in Plately's default dark mode

**Accent colors seen in references:**
- TIDE uses no strong accent — relies on atmospheric photo tints
- Apple TV uses no accent — white on black throughout
- Apple Music uses red (brand) for active icons and CTAs
- Google Lens uses blue for links; grey for mode pills
- Snapchat uses yellow for brand badge

## Typography

**Font family:** System font — `-apple-system, BlinkMacSystemFont, 'SF Pro Text'` — used universally across all references

**Weight hierarchy:**
- Display/hero numbers (TIDE clock): extra-bold or ultra-heavy, often `700–800`
- Page titles / modal headers: `600–700` (semibold/bold)
- Section headers: `600` (semibold)
- Body / list labels: `400–500` (regular/medium)
- Captions / metadata: `400`, muted color

**Size hierarchy (observed):**
- Hero / timer: ~40–48pt — very large, occupies upper third
- Page title ("Good Day", "Matches"): ~28–34pt bold, top-left aligned
- Section header ("Top 10 on Apple TV", "Category"): ~17–20pt semibold
- List row label: ~15–17pt regular
- Caption / subtext: ~13–15pt muted
- Tab bar label: ~10–11pt, very compact

**Letter spacing:** Tight to normal — no wide tracking. Apple TV uses slightly condensed display titles.

**Line height:** Standard iOS — 1.2–1.4× for body, 1.1× for display sizes

**Special treatments:**
- All-caps NOT used in primary UI
- Pill category labels are title-case, light weight
- TIDE uses large centered time/number as focal point

## Spacing & Layout

**Screen margins:** 16pt (standard) — used across TIDE, Apple TV, Apple Music
**Section gaps:** 24–32pt between major content sections
**Card internal padding:** 12–16pt on all sides
**List row height:** 44–56pt minimum (Apple HIG compliance)
**Header area:** 56–80pt from status bar to first content
**Bottom safe area:** Content bottom-pads 80–96pt to clear floating tab bar + safe area

**Grid density:** Comfortable, not tight — 2-column grid for cards (TIDE soundscapes), 3-column for thumbnails (Apple TV category grid)
**Column gap:** 8–12pt between grid items
**Card aspect ratios:**
- Portrait cards (TIDE soundscape): ~2:3
- Landscape/wide cards (Apple TV trailers): ~16:9
- Square thumbnails (Apple Music): 1:1

**Whitespace philosophy:** Generous — large hero areas, breathing room between sections. TIDE especially uses empty atmospheric space intentionally.

**Alignment:** Left-heavy for titles and section headers. Centered only for modal headers and timer displays.

## Component Style

**General principles:**
- **Buttons:** Full-width white pill (rounded-full) for primary CTA. Ghost/outline variants not used. All CTAs bottom-anchored.
- **Cards:** Rounded rectangle (16–20pt radius). Dark mode: ultra-thin glass border + backdrop blur. Light mode: stronger white fill + softer border.
- **Input fields / search:** Rounded pill or rect with glass fill, no hard border, subtle placeholder text.
- **Icons:** SF Symbols style — thin to regular stroke weight. No filled colorful icons in primary UI (exception: Apple Music uses colored tab icons).
- **Hover/focus states:** Not applicable on mobile. Tap states use opacity reduction (0.6–0.7) or slight scale-down.
- **Animation character:** Spring/ease-out, not linear. Sheet presentations spring up from bottom. Content transitions use opacity + translate-y fade-in.
- **Chip/pill filters:** Small, floating pills above content rows, with one "selected" pill rendered white/filled and rest ghost. Radius: full pill (999px).

## Component Library

---

### Tab Bar (Floating Pill)

**Source images:** TIDE iOS 27.png, TIDE iOS 58.png, TIDE iOS 62.png, TIDE iOS 138.png, TIDE iOS 140.png, TIDE iOS 163.png

**Layout diagram:**
```
|<--- screen width --->|
                        
                        
   [  🏠    🌙    🧘    🔊  ]   ← floating pill, centered
         ↑ ~12–16px gap
|__________________________|
          home indicator
```

**Structure:** Single horizontal pill container. Icons + text labels stacked vertically inside. Floats above the bottom safe-area with a gap. NOT attached to screen edge.

**Dimensions:**
- Height: ~56–64px (includes padding + icon + label)
- Width: ~75–85% of screen width (auto-sized to tab count)
- Border radius: 9999px (full pill)

**Internal spacing:**
- ~12–16px horizontal padding on each end
- ~16–20px gap between tab items
- Icon ~22px, label ~10–11pt below icon with 2–4px gap

**Position:**
- Fixed bottom, horizontally centered
- Floats 8–14px above safe area inset (not flush to bottom edge)

**Visual treatment:**
- Background: frosted glass — `rgba(255,255,255,0.08–0.12)` in dark mode, `rgba(255,255,255,0.72–0.80)` in light
- Border: `0.5px solid rgba(255,255,255,0.12)` (dark) / `rgba(255,255,255,0.85)` (light)
- Blur: `backdrop-filter: blur(24px) saturate(1.6)`
- Shadow: subtle diffuse drop shadow in light mode only

**States:**
- Active tab: icon + label at full opacity (white in dark mode), possibly lighter background pill behind the active icon
- Inactive tab: icon + label at ~40–50% opacity

**NOT:**
- NOT edge-to-edge (Apple-Music-style full-width iOS tab bar)
- NOT a solid opaque background
- NOT without labels — icon + label always both shown
- NOT anchored to the bottom screen edge — it floats

---

### Glass Card

**Source images:** TIDE iOS 27.png, TIDE iOS 62.png, TIDE iOS 75.png, TIDE iOS 76.png, Apple TV iOS 12.png, Apple TV iOS 7.png

**Layout diagram:**
```
┌─────────────────────────────┐  ← 0.5px glass border
│  [icon]  Title         value│
│          Subtitle           │
└─────────────────────────────┘
```

**Structure:** Rounded rectangle. Content arranged as icon/image + text block + optional trailing value/chevron. Stacks vertically in a list.

**Dimensions:**
- Height: 56–80px for list-style rows; varies for content cards
- Width: full-width of content area (screen - 2×16px padding)
- Border radius: 12–16px

**Internal spacing:**
- 12–16px horizontal padding
- 12–14px vertical padding
- 8–12px gap between icon and text block

**Visual treatment:**
- Background: `rgba(255,255,255,0.09)` dark mode
- Border: `0.5px solid rgba(255,255,255,0.13)`
- Blur: `backdrop-filter: blur(20px) saturate(1.8)`

**NOT:**
- NOT a solid dark surface (always glass/translucent)
- NOT a heavy drop shadow — elevation implied by blur + border only
- NOT square corners

---

### Primary CTA Button (White Pill)

**Source images:** TIDE iOS 62.png, TIDE iOS 76.png, TIDE iOS 121.png, TIDE iOS 138.png, TIDE iOS 163.png

**Layout diagram:**
```
|<---- screen - 2×16px ---->|
[           Start            ]  ← full-width, bottom-anchored
```

**Structure:** Full-width pill. Single centered label. No icon. Always bottom-anchored in its container, often the last element above safe area.

**Dimensions:**
- Height: 52–60px
- Width: 100% of content area
- Border radius: 9999px (full pill)

**Visual treatment:**
- Background: `rgba(255,255,255,0.90–1.0)` — near-solid white
- Text: `rgba(0,0,0,0.90)` — dark
- No border in dark mode (sufficient contrast from white on dark bg)
- Font weight: 600 (semibold), ~17pt

**States:**
- Default: white fill, dark label
- Disabled: reduced opacity (~0.4)
- Pressed: slight scale-down (0.97) + opacity reduction

**NOT:**
- NOT a colored accent button (no blue/red/green fill)
- NOT outline-only
- NOT icon-prefixed in CTA usage
- NOT partial width — always fills content area

---

### Bottom Sheet Modal

**Source images:** TIDE iOS 62.png, TIDE iOS 76.png, TIDE iOS 121.png, Snapchat iOS 224.png

**Layout diagram:**
```
|__________________________|
|  ——  (drag handle)       |  ← 4×36px pill, centered, 8px from top
|  Modal Title             |
|                          |
|  [content]               |
|                          |
|  [Primary CTA Button]    |
|__________________________|  ← extends to bottom of screen
```

**Structure:** Full-width panel that slides up from bottom. Rounded top corners only. Drag handle centered at top. Content scrollable. Primary CTA pinned above safe area.

**Dimensions:**
- Top corner radius: 20–24px
- Drag handle: 4px tall × 36px wide, `rgba(255,255,255,0.30)`
- Handle margin-top: 8px

**Visual treatment:**
- Background: `rgba(255,255,255,0.10)` + `backdrop-filter: blur(30px)`
- No border on bottom sheet top edge — only the handle signals dismissibility

**NOT:**
- NOT a floating card — it attaches to the bottom edge
- NOT scrollable by itself in the page sense — it overlays and dims the background

---

### Filter Pill Strip

**Source images:** TIDE iOS 58.png, Apple Music iOS 105.png, Google iOS 57.png

**Layout diagram:**
```
[ For You ] [ Nature ] [ Melody ] [ Moods ] →  (horizontal scroll)
     ↑ selected (filled white)   ↑ ghost (glass)
```

**Structure:** Horizontal scroll row of pill chips. One selected state (filled), rest ghost (glass outline). Positioned at top of content area below page header.

**Dimensions:**
- Pill height: ~32–36px
- Pill horizontal padding: 14–18px each side
- Gap between pills: 8px
- Border radius: 9999px (full pill)

**Visual treatment:**
- Selected: white fill, dark text (`rgba(0,0,0,0.80)`)
- Unselected: `rgba(255,255,255,0.10)` glass fill + `0.5px rgba(255,255,255,0.15)` border

**NOT:**
- NOT tabs (no underline indicator)
- NOT a segmented control (not attached, they float independently)
- NOT full-width items

---

### Hero / Atmospheric Header

**Source images:** Apple TV iOS 3.png, Apple TV iOS 4.png, TIDE iOS 27.png, TIDE iOS 62.png

**Layout diagram:**
```
┌─────────────────────────────┐
│  [full-bleed photo]         │
│                             │
│                             │
│  ////gradient scrim/////    │
│  Badge text                 │
│  TITLE                      │
│  Metadata chips             │
│  [ CTA ]  [ + ]             │
└─────────────────────────────┘
```

**Structure:** Full-screen-width image with a vertical gradient scrim from transparent at top to dark at bottom. Title, metadata, and CTA overlaid at the bottom.

**Dimensions:**
- Image height: ~40–55% of screen height
- Gradient: starts ~40% from bottom, ends at 100%
- CTA: pill button anchored ~24–32px above next section

**Visual treatment:**
- `background: linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%)`
- Title: white, bold, ~28–34pt
- Metadata: white, small pills or dot-separated text at ~13pt

**NOT:**
- NOT a contained card — always full-bleed
- NOT used as a scrolling carousel item (it's a hero, pinned above fold)

---

### List Row (Content Item)

**Source images:** Apple TV iOS 64.png, Apple TV iOS 21.png, Snapchat iOS 224.png, TIDE iOS 75.png

**Layout diagram:**
```
┌─────────────────────────────────────────┐
│ [thumb] Title                      ···  │
│         Subtitle / metadata             │
└─────────────────────────────────────────┘
```

**Structure:** Horizontal row. Leading thumbnail (square or rounded rect), title + subtitle stacked, optional trailing action icon. Stacks vertically in a list.

**Dimensions:**
- Row height: 60–72px (with thumbnail) or 44–56px (text-only)
- Thumbnail: 40–52px square, ~8px radius
- Horizontal padding: 16px
- Gap between thumb and text: 12px

**Visual treatment:**
- Background: transparent on dark base (Apple TV) or glass card (TIDE/Snapchat)
- Divider: `0.5px rgba(255,255,255,0.10)` between rows when in list
- No rounded corners on the row itself in list context

**NOT:**
- NOT a card with its own background per row — background only on containing card
- NOT right-aligned primary text

---

### Scan / Camera Viewfinder

**Source images:** Google iOS 50.png, Google iOS 52.png

**Layout diagram:**
```
|                          |
|  ┌─             ─┐       |
|  |               |       |  ← corner brackets, not full border
|  |               |       |
|  └─             ─┘       |
|                          |
|  "Tap shutter to search" |
|                          |
|  [gallery]  [  ●  ]      |  ← bottom controls row
|  [ Translate ] [ Search ] [ Homework ]  ← mode pills
```

**Structure:** Full-screen dark background. Animated corner brackets (not a full rectangle) define the scan area. Bottom strip has gallery thumbnail, large central shutter, and mode pill strip.

**Dimensions:**
- Corner brackets: ~24×24px, ~3px stroke, rounded tips
- Shutter button: ~64px diameter
- Mode pills: ~32px height, full pill radius, glass

**Visual treatment:**
- Background: near-black `#0a0a0a`
- Corner brackets: white `rgba(255,255,255,0.80)`
- Shutter: `rgba(255,255,255,0.20)` glass fill, white border

**NOT:**
- NOT a full rectangle overlay — only corners
- NOT colored brackets (always white/neutral)

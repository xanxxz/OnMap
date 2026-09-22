# OnMap Visual System

<!-- impeccable:design-schema 1 -->

## Direction: Dawn Road Atlas

OnMap feels like opening a calm field atlas at first light: a living map sits beneath quiet cream materials, forest-green ink, sky-blue orientation cues, and restrained organic arcs that suggest roads and horizons without becoming decoration.

The supplied OnMap moodboard is the binding emotional reference. The interface does not reproduce its photographic advertising composition; it translates its forest, air, road curve, soft light, and rounded wordmark into a practical map product.

## Experience Mode

Operate. The map and the current road situation remain more important than branding. Brand expression is concentrated in launch, onboarding, typography, material, and small signature geometry.

## Composition

- The map is full bleed and owns the viewport.
- Floating map controls use compact misted-cream surfaces with restrained borders and shadows.
- Sheets are calm reading surfaces rather than dashboard panels.
- Onboarding uses one editorial statement per screen, a large quiet visual field, and a low action rail.
- The signature motif is a pair of curved road/horizon bands with a single sky disc. It may appear on launch and onboarding, never repeatedly across operational UI.

## Palette

- `brandForest` `#153D32`: primary action and wordmark ink.
- `brandDeepForest` `#0B281F`: dark emphasis and launch contrast.
- `brandLeaf` `#4F8A58`: positive state and selected accents.
- `brandFreshGreen` `#83B968`: soft living accent.
- `brandSky` `#55B8DE`: orientation and informational accent.
- `surfaceCream` `#F7F4EA`: primary surface.
- `surfaceMist` `#EDF1EA`: quiet background.
- `surfaceGlass` `rgba(247,244,234,0.91)`: map overlays.
- `textPrimary` `#14241E`: primary text.
- `textSecondary` `#617069`: secondary text.
- `borderSoft` `rgba(21,61,50,0.12)`: structural borders.
- Event semantic colors remain distinct and are softened to harmonize with forest surfaces.

## Typography

- Brand/display: `Avenir Next` on iOS and the platform geometric sans on Android until a licensed Manrope asset is supplied.
- Body and controls: native system sans for dependable Cyrillic, Dynamic Type/font scaling, and platform familiarity.
- Display 32/38, 800; title 22/28, 700; heading 18/23, 700; body 15/21, 400; label 13/17, 600; micro 11/14, 600 with restrained tracking.
- `OnMap` is always one word with a heavier display weight and compact tracking.

## Shape and Material

- Core radii: 14, 18, 22, 28, and full pill.
- Map cards: translucent cream, hairline forest border, one soft low shadow.
- Primary controls: deep forest fill, cream content.
- Secondary controls: mist/cream fill, forest content.
- Destructive states: muted berry red, never saturated alarm red unless the event semantics require it.

## Motion

- Launch and onboarding are rare first-run moments: use 240–500 ms opacity and small 8–16 pt vertical translation on the UI thread.
- No looping map animation.
- Press feedback remains near-imperceptible.
- Reduced Motion keeps fades and removes scale/translation.

## Accessibility

- Minimum touch target: 44 pt iOS / 48 dp Android.
- Microcopy never falls below 11 pt.
- Color is never the only state signal.
- Onboarding progression is time-gated but remains short and clearly explained.
- Safe-area insets govern every top and bottom overlay.

## Native Identity

- User-facing display name is OnMap.
- Existing iOS target/scheme, bundle identifier, Android namespace/application ID, React Native module name, storage keys, and domain terminology remain unchanged to protect signing, updates, and persisted data.

## Direction Review

- Vertical full-screen media grammar was declined: it weakens map scanning, but its discipline of letting one surface own the viewport strengthens the map-first composition.
- Night instruments were declined: they recreate the technical scanner feeling the rebrand explicitly rejects; their strict semantic state hierarchy is retained.
- Dawn cyclorama was competitive for atmosphere but weaker for operational clarity; its restrained horizon-light transitions strengthen launch and onboarding.
- Pixel and alphabet systems were declined because they reduce trust and legibility for daily road use; their economy of state and typography remains a quality constraint.

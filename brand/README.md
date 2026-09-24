# Hangar brand marks

Source of truth for the platform's logo marks. Canonical direction picked from the
4-concept review (see memory `idp_branding_hangar_glidepath_tower`, artifact
[Hangar Logo Concepts](https://claude.ai/code/artifact/6ee3c0aa-af3e-4eae-a47f-1d2e42d65fee)):
**Instrument Dial, full detail** — a gauge ring with 8 compass ticks, a heading-bug
index at 12 o'clock, and a product-specific glyph centered where a needle would point.

## Files

Every product gets two renderings of the same mark — not two different logos, two jobs:

- **`<product>-inline.svg`** — transparent background. Sits directly on whatever
  surface it's placed on. Use this only where the surrounding page/app controls its
  own background (e.g. embedded as a themed React component inside Backstage).
- **`<product>-tile.svg`** — fixed instrument-black (`#0B0D10`) rounded-square
  background, same on every page theme. Use this everywhere the mark has to *be* a
  flat square asset: README headers, favicons, org avatars, catalog tiles, docs
  covers. This is the default choice unless you specifically need transparency.
- **`hangar-mask-icon.svg`** — single-color (black) silhouette for Safari's pinned-tab
  `mask-icon`, per Apple's spec. Safari re-tints it; don't recolor this file.

## Family vocabulary

All five marks share the same ring + 8 ticks + heading bug. Only the center glyph and
its color change:

| Product | Glyph | Color |
|---|---|---|
| Hangar | Arch / doorway | Amber `#E8A33D` |
| Tower | Mast + signal arcs | Amber `#E8A33D` |
| Glidepath | Descent diagonal + dot | Sky `#6FB2D9` |
| Airframe | Spar + rivets | Sky `#6FB2D9` |
| Apron | 2×2 parking grid | Gray `#96A2AC` |

Amber marks the two products that need attention (home base, command console); sky
marks the informational/structural ones; gray marks ground infrastructure at rest —
the same "calm cockpit" rule the [Hangar Brand System](https://claude.ai/code/artifact/de0e3df6-a73b-4cc0-ad5b-ade5f2ede9a2)
already applies to UI status colors.

## Regenerating

All 11 files are produced by one script, `gen-marks.sh` (not checked in here — see the
build session that produced this directory if it needs re-running with a design
change). Colors and the ring/tick geometry are hardcoded per file rather than
referencing CSS custom properties, since these ship as standalone assets read outside
any page that would define those tokens (GitHub READMEs, browser favicon chrome).

## Where each product's own copy lives

`glidepath`, `airframe`, and `apron` each keep a local copy of just their own
`<product>-tile.svg` under their own `docs/brand/` so the repo stays self-contained
for standalone install — no cross-repo path dependency on `hangar/brand/` at
render time. This directory is still the canonical source; if the mark changes,
re-copy from here.

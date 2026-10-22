import { useTheme } from '@material-ui/core/styles';

// Hangar Brand System tokens - see the published mockup (memory:
// idp_branding_hangar_glidepath_tower, artifact
// de0e3df6-a73b-4cc0-ad5b-ade5f2ede9a2). Originally scoped to Tower only
// (Tower shipped before the app-wide theme was repainted to match), now
// promoted to a shared `brand` module since ../nav's sidebar wordmark needs
// the same mark/tokens and nav isn't part of Tower. ../theme/idpThemes.ts
// (the whole app's MUI theme) now carries these same color/background values
// as its own palette - this file still exists as the plain-token form
// (matching the published mockup's CSS custom properties) for components
// that want the raw values directly rather than through MUI's theme
// indirection. Picks light/dark off the ambient MUI theme's own
// palette.type so it still follows the app's light/dark toggle.
export interface HangarTokens {
  bg: string;
  bgRaised: string;
  panel: string;
  panelAlt: string;
  line: string;
  lineSoft: string;
  textHi: string;
  textLo: string;
  textFaint: string;
  /** Strokes, dots, bars, underlines: anything amber that is not a fill behind text and not text. */
  amber: string;
  /** Fill behind text: the primary button, a count badge. Text on it is `onAmber`; its edge is `amber`. */
  amberFill: string;
  amberFillHover: string;
  amberFillPress: string;
  /** Amber words on a panel (an eyebrow, a Flight chip, a slow time). `amber` itself fails AA as text in light. */
  amberText: string;
  amberInk: string;
  /** Text on a solid `amber` fill (a primary button). `amberInk` is for text on `amberSoft`, not on amber. */
  onAmber: string;
  amberSoft: string;
  amberLine: string;
  sky: string;
  skySoft: string;
  skyLine: string;
  good: string;
  goodSoft: string;
  bad: string;
  badSoft: string;
}

const light: HangarTokens = {
  bg: '#F1F3F5',
  bgRaised: '#FFFFFF',
  panel: '#FFFFFF',
  panelAlt: '#E8ECEF',
  line: '#D5DBE0',
  lineSoft: '#E3E7EA',
  textHi: '#171B1F',
  textLo: '#5B6570',
  textFaint: '#88919A',
  amber: '#B9791F',
  amberFill: '#E2A03A',
  amberFillHover: '#EAAB48',
  amberFillPress: '#D4922C',
  amberText: '#7A5115',
  amberInk: '#7A5115',
  onAmber: '#1A1204',
  amberSoft: '#F4E6C9',
  amberLine: '#E0BE84',
  sky: '#2E7BA6',
  skySoft: '#DCEDF6',
  skyLine: '#B7D7E6',
  good: '#2E8B57',
  goodSoft: '#DCF0E4',
  bad: '#B23B2E',
  badSoft: '#F6DEDA',
};

const dark: HangarTokens = {
  bg: '#0B0D10',
  bgRaised: '#12161B',
  panel: '#12161B',
  panelAlt: '#1A1F26',
  line: '#262C33',
  lineSoft: '#1D232A',
  textHi: '#E9ECEF',
  textLo: '#96A2AC',
  textFaint: '#66717B',
  amber: '#E8A33D',
  amberFill: '#E8A33D',
  amberFillHover: '#F0B04A',
  amberFillPress: '#D9922C',
  amberText: '#E8A33D',
  amberInk: '#F4C67D',
  onAmber: '#1A1204',
  amberSoft: '#3A2C15',
  amberLine: '#5C4520',
  sky: '#6FB2D9',
  skySoft: '#152530',
  skyLine: '#2C4756',
  good: '#5FAE84',
  goodSoft: '#16281F',
  bad: '#D9776A',
  badSoft: '#301A17',
};

export function useHangarTokens(): HangarTokens {
  const theme = useTheme();
  return theme.palette.type === 'dark' ? dark : light;
}

export const fontDisplay = '"IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif';
export const fontBody = '"IBM Plex Sans", -apple-system, "Segoe UI", sans-serif';
export const fontMono = '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace';

/**
 * The type scale (2026-10-22 UI pass): seven sizes, nothing under 11px. Before it Tower used 28 sizes from 8 to 64px,
 * 139 declarations under 11. scripts/style-ratchet.mjs fails on any other text size (icon sizes are exempt).
 *   xs 11 labels, chips, column heads · sm 12 meta, mono values, hints · md 13 body, buttons, cells
 *   lg 15 section title · xl 18 card / dialog title · x2 22 stat value, page title · x3 32 Ops Wall KPIs
 */
export const fontScale = { xs: 11, sm: 12, md: 13, lg: 15, xl: 18, x2: 22, x3: 32 } as const;

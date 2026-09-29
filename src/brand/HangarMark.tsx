import { useHangarTokens } from './tokens';

// The Hangar "instrument dial" mark - ring + 8 compass ticks + heading bug,
// full detail (the direction picked from the 4-concept review, see memory
// idp_branding_hangar_glidepath_tower / artifact 6ee3c0aa-af3e-4eae-a47f-1d2e42d65fee).
// Inline rendering only (no tile background) - this sits on the app's own
// themed surface (sidebar, Tower console header, etc.), which already
// provides the background. See hangar/brand/README.md for the tile
// (fixed-background) version used for favicons and README headers.
//
// Glyph vocabulary - only the centre glyph and its colour change, the dial never does:
//   hangar     arch / doorway                          amber  (home base, needs attention)
//   tower      mast + signal arcs                      amber  (command console)
//   glidepath  descent diagonal + dot                  sky    (informational)
//   airframe   spar + rivets                           sky    (structural)
//   apron      2x2 parking grid                        gray   (ground, at rest)
//   autopilot  nose held between brackets              amber  (heading hold: the agent flies the course you
//              set, inside limits; amber because an agent acting on its own needs supervision)
// Autopilot was chosen 2026-09-26 as Option A, "Hold", from five candidates (Hold, Flight director,
// Annunciator, Corridor, Loop): hangar/docs/brand/autopilot-logo-options.html. The geometry below is the same
// as hangar/brand/marks/autopilot-inline.svg; change both together. Clearance, Preflight and Flight recorder
// are features of Autopilot and have no glyph.
export type HangarGlyph = 'hangar' | 'tower' | 'glidepath' | 'airframe' | 'apron' | 'autopilot';

const TICK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function HangarMark({
  glyph,
  size = 24,
}: {
  glyph: HangarGlyph;
  size?: number;
}) {
  const t = useHangarTokens();
  let accent = t.sky;
  if (glyph === 'hangar' || glyph === 'tower' || glyph === 'autopilot') accent = t.amber;
  else if (glyph === 'apron') accent = t.textLo;

  let center: JSX.Element = <></>;
  switch (glyph) {
    case 'hangar':
      center = (
        <>
          <path d="M32,64 V48 A16,16 0 0 1 64,48 V64" fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" />
          <line x1="26" y1="68" x2="70" y2="68" stroke={t.line} strokeWidth={2} />
        </>
      );
      break;
    case 'tower':
      center = (
        <>
          <line x1="48" y1="34" x2="48" y2="64" stroke={accent} strokeWidth={4} strokeLinecap="round" />
          <rect x="42" y="64" width="12" height="5" rx="1" fill={accent} />
          <path d="M40,34 A8,8 0 0 1 56,34" fill="none" stroke={accent} strokeWidth={2} />
          <path d="M34,34 A14,14 0 0 1 62,34" fill="none" stroke={accent} strokeWidth={2} opacity={0.5} />
        </>
      );
      break;
    case 'glidepath':
      center = (
        <>
          <line x1="32" y1="36" x2="60" y2="60" stroke={accent} strokeWidth={4} strokeLinecap="round" />
          <circle cx="60" cy="60" r="4" fill={accent} />
          <line x1="28" y1="66" x2="68" y2="66" stroke={t.line} strokeWidth={2} />
        </>
      );
      break;
    case 'airframe':
      center = (
        <>
          <line x1="28" y1="48" x2="68" y2="48" stroke={accent} strokeWidth={4} strokeLinecap="round" />
          {[36, 44, 52, 60].map(x => (
            <line key={x} x1={x} y1="44" x2={x} y2="52" stroke={accent} strokeWidth={2} />
          ))}
        </>
      );
      break;
    case 'apron':
      center = (
        <>
          {[
            [34, 34],
            [52, 34],
            [34, 52],
            [52, 52],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="10" height="10" rx="2" fill="none" stroke={accent} strokeWidth={2} />
          ))}
        </>
      );
      break;
    case 'autopilot':
      // Heading-hold brackets around a nose (the bug at 12 o'clock, pointing up, held in place).
      center = (
        <>
          <path
            d="M33,34 H28 V62 H33 M63,34 H68 V62 H63"
            fill="none"
            stroke={accent}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polygon
            points="48,33 57.5,59 48,53.5 38.5,59"
            fill={accent}
            stroke={accent}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </>
      );
      break;
    default:
      break;
  }

  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={`${glyph} mark`}>
      <circle cx="48" cy="48" r="40" fill="none" stroke={t.line} strokeWidth={2} />
      <g stroke={t.textFaint} strokeWidth={2}>
        {TICK_ANGLES.map(angle => (
          <line key={angle} x1="48" y1="8" x2="48" y2="15" transform={`rotate(${angle} 48 48)`} />
        ))}
      </g>
      <polygon points="44,2 52,2 48,9" fill={accent} />
      {center}
    </svg>
  );
}

import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { Button, Callout, TextLink } from './index';

// Loading and error in Hangar's own look (2026-10-22 UI pass, recommendation 3). Tower used Backstage's thin linear
// <Progress /> over an empty page (21 files: then everything jumped in) and its ResponseErrorPanel (Roboto, Material
// red, the raw message, the whole tab replaced, no Retry).
//
//   TabSkeleton    a whole tab loading: a header, three stat tiles and a panel of rows, in the kit's own shapes.
//   PanelSkeleton  one panel loading inside a tab: a few rows.
//   TabError       a whole tab (or panel) that could not load: what failed, Retry, the raw message behind Details.
//
// The shimmer is off under prefers-reduced-motion.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  bone: {
    display: 'block',
    borderRadius: 4,
    backgroundColor: ({ t }) => t.panelAlt,
    backgroundImage: ({ t }) => `linear-gradient(90deg, ${t.panelAlt} 0%, ${t.lineSoft} 50%, ${t.panelAlt} 100%)`,
    backgroundSize: '200% 100%',
    animation: '$shimmer 1.6s ease-in-out infinite',
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  },
  '@keyframes shimmer': { '0%': { backgroundPosition: '100% 0' }, '100%': { backgroundPosition: '-100% 0' } },
  page: { display: 'flex', flexDirection: 'column', gap: 16 },
  head: { display: 'flex', flexDirection: 'column', gap: 8 },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  tile: {
    height: 68,
    boxSizing: 'border-box',
    padding: 12,
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panel,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  panel: {
    padding: 14,
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panel,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  row: { display: 'grid', gridTemplateColumns: '90px 1fr 140px', gap: 12 },
  caption: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textLo },
  detail: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, overflowWrap: 'anywhere', marginTop: 6 },
}));

function useLoad() {
  const t = useHangarTokens();
  return useStyles({ t });
}

export function Skeleton({ width = '100%', height = 12 }: { width?: number | string; height?: number }) {
  const c = useLoad();
  return <span className={c.bone} style={{ width, height }} aria-hidden />;
}

export function PanelSkeleton({ rows = 4, label, announce = true }: { rows?: number; label?: string; announce?: boolean }) {
  const c = useLoad();
  return (
    <div className={c.panel} role={announce ? 'status' : undefined} aria-label={announce ? label ?? 'Loading' : undefined}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={c.row}>
          <Skeleton />
          <Skeleton width={`${85 - i * 9}%`} />
          <Skeleton />
        </div>
      ))}
      {label && <span className={c.caption}>{label}</span>}
    </div>
  );
}

export function TabSkeleton({ label }: { label?: string }) {
  const c = useLoad();
  return (
    <div className={c.page} role="status" aria-label={label ?? 'Loading'}>
      <div className={c.head}>
        <Skeleton width={200} height={18} />
        <Skeleton width={420} height={12} />
      </div>
      <div className={c.tiles}>
        {[0, 1, 2].map(i => (
          <div key={i} className={c.tile}>
            <Skeleton width="45%" height={10} />
            <Skeleton width="70%" height={16} />
          </div>
        ))}
      </div>
      <PanelSkeleton rows={5} label={label} announce={false} />
    </div>
  );
}

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split('\n')[0];
}

export function TabError({ error, what = 'this tab', onRetry }: { error: unknown; what?: string; onRetry?: () => void }) {
  const c = useLoad();
  const [open, setOpen] = useState(false);
  const full = error instanceof Error ? error.message : String(error);
  return (
    <Callout tone="bad" title={`Couldn't load ${what}`} actions={onRetry ? <Button small onClick={onRetry}>Retry</Button> : undefined}>
      {firstLine(error)}
      {full !== firstLine(error) && (
        <div>
          <TextLink expanded={open} onClick={() => setOpen(v => !v)}>
            Details
          </TextLink>
          {open && <div className={c.detail}>{full}</div>}
        </div>
      )}
    </Callout>
  );
}

import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { displayScore, type ReleaseRecord } from './useReleaseRecords';
import type { ReadinessState } from './nextRelease';
import { Hint, TextLink } from './ui';

// Autoland eligibility (Release Record R4). Autoland, the mode where releases land in production with
// no human, is not available yet; this says what an app would need before it could be, from its own
// release history, the way a team earns an exemption from change review by meeting set criteria.
// Display only: it changes nothing about how the app releases.

export interface EligibilityItem {
  id: string;
  label: string;
  state: ReadinessState;
  detail: string;
}

const RECENT = 5;

export function autolandEligibility(records: ReleaseRecord[], signoffEnv?: string): EligibilityItem[] {
  const recent = [...records].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, RECENT);
  const closed = records.filter(r => r.outcome?.result);
  const rolledBack = closed.filter(r => r.outcome?.result === 'rolled-back').length;
  const items: EligibilityItem[] = [];

  // A release counts when its image carries a passed check ride: frozen into the record at sealing, or read
  // live from the image's provenance (Glidepath test framework).
  const withTests = recent.filter(r => (r.testEvidence ?? r.checkRide)?.outcome === 'passed' && (r.testEvidence ?? r.checkRide)?.role === 'check-ride').length;
  items.push({
    id: 'tests',
    label: 'Tests report results',
    state: recent.length > 0 && withTests === recent.length ? 'ok' : 'todo',
    detail: `${withTests} of the last ${recent.length} releases carry a passed check ride on the image`,
  });

  const prod = recent[0]?.deployments.find(d => d.env.toLowerCase() === (signoffEnv ?? '').toLowerCase());
  items.push({
    id: 'canary',
    label: 'Canary rollout in production',
    state: prod?.rolloutStrategy === 'canary' ? 'ok' : 'todo',
    detail: prod?.rolloutStrategy ? `${signoffEnv} rolls out with ${prod.rolloutStrategy}` : `No rollout strategy seen on ${signoffEnv ?? 'production'}`,
  });

  // Canary analysis reads the production cluster's Prometheus, so a canary in production is judged on real metrics.
  // The bake window doesn't read them yet: an outcome is still decided from the rollout alone.
  const canary = prod?.rolloutStrategy === 'canary';
  items.push({
    id: 'metrics',
    label: 'Production metrics',
    state: canary ? 'ok' : 'todo',
    detail: canary
      ? `Canary analysis on ${signoffEnv} reads the production cluster's Prometheus`
      : 'Production metrics are read by canary analysis, so they need a canary rollout in production',
  });

  items.push({
    id: 'bake',
    label: 'SLO burn read during the bake',
    state: 'todo',
    detail: 'Tower does not read SLO burn during the bake window yet; an outcome is decided from the rollout alone',
  });

  const cfr = closed.length > 0 ? rolledBack / closed.length : undefined;
  items.push({
    id: 'outcomes',
    label: 'Clean release history',
    state: closed.length >= RECENT && cfr !== undefined && cfr < 0.15 ? 'ok' : 'todo',
    detail:
      closed.length >= RECENT
        ? `${rolledBack} of ${closed.length} recorded releases rolled back (${Math.round((cfr ?? 0) * 100)}%, needs under 15%)`
        : `${closed.length} recorded outcome${closed.length === 1 ? '' : 's'}; needs at least ${RECENT}`,
  });

  const avg = recent.length ? Math.round(recent.reduce((n, r) => n + displayScore(r), 0) / recent.length) : 0;
  items.push({
    id: 'readiness',
    label: 'High readiness',
    state: recent.length > 0 && avg >= 80 ? 'ok' : 'todo',
    detail: `Average readiness ${avg} over the last ${recent.length} releases (needs 80)`,
  });
  return items;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { marginBottom: 12, fontSize: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 },
  item: { display: 'flex', gap: 8, alignItems: 'baseline' },
  mark: { fontFamily: fontMono, width: 14, textAlign: 'center' },
  name: { color: ({ t }) => t.textHi },
  detail: { color: ({ t }) => t.textFaint },
}));

export function AutolandEligibility({ records, signoffEnv }: { records: ReleaseRecord[]; signoffEnv?: string }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [open, setOpen] = useState(false);
  const items = autolandEligibility(records, signoffEnv);
  const ok = items.filter(i => i.state === 'ok').length;
  return (
    <div className={classes.wrap}>
      <TextLink expanded={open} onClick={() => setOpen(v => !v)}>
        {`Autoland eligibility · ${ok} of ${items.length}`}
      </TextLink>
      {open && (
        <div className={classes.list}>
          {items.map(i => (
            <div key={i.id} className={classes.item}>
              <span className={classes.mark} style={{ color: i.state === 'ok' ? t.good : t.amberInk }}>
                {i.state === 'ok' ? '✓' : '!'}
              </span>
              <span className={classes.name}>{i.label}</span>
              <span className={classes.detail}>{i.detail}</span>
            </div>
          ))}
          <Hint>Autoland is not available yet. This says what this app would need first; it changes nothing today.</Hint>
        </div>
      )}
    </div>
  );
}

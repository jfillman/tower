import { useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { buildEnvironmentRows, type EnvironmentRow } from '../environmentRows';
import { formatDateTime, relativeTime } from '../shared/format';
import { useReleaseContext } from '../useReleaseContext';
import type { Health } from '../types';

// The Environments tab: every environment of the service in promotion order, whichever way its
// cicd.yaml declares them (deploy.environments, or the older lowerEnvironments/upperEnvironments)
// and whether it runs on Kubernetes or a cloud target. Read-only for now: environments are still
// edited in the Glidepath tab (cicd.yaml) and, for Flight environments, App Configuration (values).
// The table, in-place editing and the pending-changes panel come next (glidepath
// docs/admin/envs-overhaul-requirements.md, section 4).

const HEALTH_LABEL: Record<Health, string> = {
  healthy: 'Healthy',
  progressing: 'Progressing',
  paused: 'Paused',
  degraded: 'Degraded',
  unknown: 'Unknown',
};

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { padding: '20px 24px 40px', maxWidth: 1180 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 20, color: ({ t }) => t.textHi },
  sub: { fontSize: 13, color: ({ t }) => t.textLo, marginTop: 2, marginBottom: 12 },
  note: {
    fontSize: 12.5,
    color: ({ t }) => t.textLo,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 6,
    padding: '9px 12px',
    marginBottom: 14,
  },
  empty: {
    border: ({ t }) => `1px dashed ${t.line}`,
    borderRadius: 6,
    padding: 24,
    color: ({ t }) => t.textLo,
    textAlign: 'center',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: ({ t }) => `1px solid ${t.line}`,
  },
  td: {
    padding: '11px 10px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    color: ({ t }) => t.textHi,
    verticalAlign: 'middle',
  },
  name: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 15 },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  muted: { color: ({ t }) => t.textFaint },
  chip: {
    display: 'inline-block',
    fontFamily: fontMono,
    fontSize: 11,
    padding: '3px 7px',
    borderRadius: 4,
    border: '1px solid',
  },
  ground: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine },
  flight: { color: ({ t }) => t.amber, borderColor: ({ t }) => t.amberLine },
  health: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, display: 'inline-block' },
}));

function dotColor(h: Health, t: HangarTokens): string {
  switch (h) {
    case 'healthy':
      return t.good;
    case 'degraded':
      return t.bad;
    case 'progressing':
      return t.sky;
    case 'paused':
      return t.amber;
    default:
      return t.textFaint;
  }
}

export function EnvironmentsTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { environments, pipelineOrder, loading, error } = useReleaseContext();
  const rows: EnvironmentRow[] = useMemo(
    () => buildEnvironmentRows(environments, { lower: pipelineOrder.lower, upper: pipelineOrder.upper }),
    [environments, pipelineOrder.lower, pipelineOrder.upper],
  );

  if (loading && rows.length === 0) return <Progress />;
  if (error && rows.length === 0) return <ResponseErrorPanel error={new Error(String(error))} />;

  return (
    <div className={classes.wrap}>
      <Typography className={classes.title}>Environments</Typography>
      <div className={classes.sub}>Every environment of this service, in promotion order.</div>
      <div className={classes.note}>
        Read-only for now. Change the list and its order in the Glidepath tab; Flight environment values are in App
        Configuration. Editing from here comes next.
      </div>
      {rows.length === 0 ? (
        <div className={classes.empty}>No environments yet. They appear here once the service declares or deploys to one.</div>
      ) : (
        <table className={classes.table}>
          <thead>
            <tr>
              {['Environment', 'Tier', 'Target', 'Where', 'Health', 'Live image', 'Deployed'].map(h => (
                <th key={h} className={classes.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name}>
                <td className={`${classes.td} ${classes.name}`}>{r.name}</td>
                <td className={classes.td}>
                  <span className={`${classes.chip} ${r.tier === 'flight' ? classes.flight : classes.ground}`}>
                    {r.tier === 'flight' ? 'Flight' : 'Ground'}
                  </span>
                </td>
                <td className={classes.td}>{r.target}</td>
                <td className={`${classes.td} ${classes.mono}`}>{r.where}</td>
                <td className={classes.td}>
                  <span className={classes.health}>
                    <i className={classes.dot} style={{ backgroundColor: dotColor(r.health, t) }} aria-hidden="true" />
                    {HEALTH_LABEL[r.health]}
                  </span>
                </td>
                <td className={`${classes.td} ${classes.mono}`}>
                  {r.deployed ? r.image : <span className={classes.muted}>not deployed yet</span>}
                </td>
                <td className={classes.td} title={r.deployedAt ? formatDateTime(r.deployedAt) : undefined}>
                  {r.deployedAt ? relativeTime(r.deployedAt) : <span className={classes.muted}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import { relativeTime } from '../../../shared/format';
import { useFleetRoster } from '../../useFleetRoster';
import { useFleetEnvironments } from '../../useFleetEnvironments';
import { useFleetSlos } from '../../useFleetSlos';
import { health, imageTag, isRolloutActive } from '../../types';
import { healthColor, healthLabel, latestEnv, worstStatus } from './dashboardStyles';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  kpis: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  kpi: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderTop: '3px solid',
    borderRadius: 6,
    padding: '20px 22px',
    backgroundColor: ({ t }) => t.panel,
  },
  kpiLabel: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    marginBottom: 8,
  },
  kpiValue: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 56, lineHeight: 1 },
  kpiSub: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 8 },
  table: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    backgroundColor: ({ t }) => t.panel,
    overflow: 'hidden',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '2fr 1.6fr 1.1fr 1fr 1.3fr',
    alignItems: 'center',
    gap: 12,
    padding: '10px 20px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    '&:last-child': { borderBottom: 'none' },
  },
  head: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    backgroundColor: ({ t }) => t.panelAlt,
  },
  appName: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 14.5, color: ({ t }) => t.textHi },
  status: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ({ t }) => t.textLo },
  statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  mono: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.textLo },
  ownerCell: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textFaint, textAlign: 'right' },
  empty: { padding: 48, textAlign: 'center', color: ({ t }) => t.textLo, fontSize: 13 },
}));

export function OpsWallDashboard() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const roster = useFleetRoster();
  const { apps, loading: appsLoading, probes } = useFleetEnvironments(roster.entities);

  const allEnvs = useMemo(() => apps.flatMap(a => a.environments), [apps]);
  const totalEnvs = allEnvs.length;
  const degradedEnvs = allEnvs.filter(e => health(e) === 'degraded').length;
  const activeRollouts = allEnvs.filter(isRolloutActive).length;
  const clusters = useMemo(() => [...new Set(allEnvs.map(e => e.cluster))], [allEnvs]);
  const { summary: sloSummary, probes: sloProbes } = useFleetSlos(clusters);

  const loading = roster.loading || appsLoading;
  const rows = useMemo(
    () => [...apps].sort((a, b) => a.appName.localeCompare(b.appName)),
    [apps],
  );

  return (
    <div>
      {probes}
      {sloProbes}
      {loading ? (
        <Progress />
      ) : apps.length === 0 ? (
        <div className={classes.empty}>
          No NodeJSApplication / SpringBootApplication / PythonApplication / GoApplication services found in the catalog.
        </div>
      ) : (
        <>
          <div className={classes.kpis}>
            <div className={classes.kpi} style={{ borderTopColor: t.sky }}>
              <div className={classes.kpiLabel}>Services monitored</div>
              <div className={classes.kpiValue} style={{ color: t.sky }}>
                {apps.length}
              </div>
              <div className={classes.kpiSub}>across {clusters.length || 1} cluster{clusters.length === 1 ? '' : 's'}</div>
            </div>
            <div className={classes.kpi} style={{ borderTopColor: degradedEnvs > 0 ? t.bad : t.good }}>
              <div className={classes.kpiLabel}>Environments degraded</div>
              <div className={classes.kpiValue} style={{ color: degradedEnvs > 0 ? t.bad : t.good }}>
                {degradedEnvs}
              </div>
              <div className={classes.kpiSub}>of {totalEnvs} total environments</div>
            </div>
            <div className={classes.kpi} style={{ borderTopColor: t.amber }}>
              <div className={classes.kpiLabel}>Active rollouts</div>
              <div className={classes.kpiValue} style={{ color: t.amber }}>
                {activeRollouts}
              </div>
              <div className={classes.kpiSub}>promoting right now</div>
            </div>
            <div className={classes.kpi} style={{ borderTopColor: t.good }}>
              <div className={classes.kpiLabel}>SLO compliance</div>
              <div className={classes.kpiValue} style={{ color: t.good }}>
                {sloSummary.total ? `${Math.round((sloSummary.meetingObjective / sloSummary.total) * 100)}%` : '—'}
              </div>
              <div className={classes.kpiSub}>
                {sloSummary.total
                  ? `${sloSummary.meetingObjective}/${sloSummary.total} SLOs${
                      sloSummary.errorBudgetRemainingPct !== undefined
                        ? ` · ${Math.round(sloSummary.errorBudgetRemainingPct)}% budget remaining`
                        : ''
                    }`
                  : 'no SLOs found'}
              </div>
            </div>
          </div>

          <div className={classes.table}>
            <div className={`${classes.row} ${classes.head}`}>
              <span>Service</span>
              <span>Status</span>
              <span>Tag</span>
              <span>Updated</span>
              <span style={{ textAlign: 'right' }}>Owner</span>
            </div>
            {rows.map(app => {
              const worst = worstStatus(app.environments.map(health));
              const latest = latestEnv(app);
              return (
                <div key={app.entityRef} className={classes.row}>
                  <Typography className={classes.appName}>{app.appName}</Typography>
                  <span className={classes.status}>
                    <span className={classes.statusDot} style={{ backgroundColor: healthColor(t, worst) }} />
                    {latest ? `${latest.env} ${healthLabel(worst)}` : 'not yet deployed'}
                  </span>
                  <span className={classes.mono}>{latest?.image ? imageTag(latest.image) : '—'}</span>
                  <span className={classes.mono}>{latest?.deployedAt ? relativeTime(latest.deployedAt) : '—'}</span>
                  <span className={classes.ownerCell}>{app.owner ? `@${app.owner}` : ''}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

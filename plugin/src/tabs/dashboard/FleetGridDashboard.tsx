import { useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import { relativeTime } from '../../../shared/format';
import { useFleetRoster } from '../../useFleetRoster';
import { useFleetEnvironments, fleetEnvColumns } from '../../useFleetEnvironments';
import { useFleetSlos } from '../../useFleetSlos';
import { health, imageTag, isRolloutActive } from '../../types';
import { healthColor, healthLabel, latestEnv, tileStatus, worstStatus } from './dashboardStyles';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  kpis: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    marginBottom: 22,
  },
  kpi: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    padding: '14px 18px',
    backgroundColor: ({ t }) => t.panel,
  },
  kpiLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    marginBottom: 6,
  },
  kpiValue: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 32, color: ({ t }) => t.textHi, lineHeight: 1 },
  kpiSub: { fontSize: 11.5, color: ({ t }) => t.textLo, marginTop: 4 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  },
  tile: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    padding: '16px 18px',
    backgroundColor: ({ t }) => t.panel,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  tileHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, minWidth: 0 },
  appName: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 16,
    color: ({ t }) => t.textHi,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  owner: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, flexShrink: 0 },
  stage: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  dot: { width: 12, height: 12, borderRadius: '50%' },
  stageLabel: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.textFaint, textTransform: 'uppercase' },
  statusLine: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: ({ t }) => t.textLo },
  statusDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  foot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`,
  },
  tag: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  empty: { padding: 48, textAlign: 'center', color: ({ t }) => t.textLo, fontSize: 13 },
}));

export function FleetGridDashboard() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const roster = useFleetRoster();
  const { apps, loading: appsLoading, probes } = useFleetEnvironments(roster.entities);
  const columns = useMemo(() => fleetEnvColumns(apps), [apps]);

  const allEnvs = useMemo(() => apps.flatMap(a => a.environments), [apps]);
  const totalEnvs = allEnvs.length;
  const healthyEnvs = allEnvs.filter(e => health(e) === 'healthy').length;
  const activeRollouts = allEnvs.filter(isRolloutActive).length;
  const clusters = useMemo(() => [...new Set(allEnvs.map(e => e.cluster))], [allEnvs]);
  const { summary: sloSummary, probes: sloProbes } = useFleetSlos(clusters);

  const loading = roster.loading || appsLoading;

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
            <div className={classes.kpi}>
              <div className={classes.kpiLabel}>Services monitored</div>
              <div className={classes.kpiValue}>{apps.length}</div>
            </div>
            <div className={classes.kpi}>
              <div className={classes.kpiLabel}>Environments healthy</div>
              <div className={classes.kpiValue} style={{ color: healthyEnvs === totalEnvs ? t.good : t.amber }}>
                {totalEnvs ? Math.round((healthyEnvs / totalEnvs) * 100) : 0}%
              </div>
              <div className={classes.kpiSub}>
                {healthyEnvs} / {totalEnvs} environments
              </div>
            </div>
            <div className={classes.kpi}>
              <div className={classes.kpiLabel}>Active rollouts</div>
              <div className={classes.kpiValue}>{activeRollouts}</div>
              <div className={classes.kpiSub}>promoting right now</div>
            </div>
            <div className={classes.kpi}>
              <div className={classes.kpiLabel}>SLO compliance</div>
              <div className={classes.kpiValue}>
                {sloSummary.total ? `${Math.round((sloSummary.meetingObjective / sloSummary.total) * 100)}%` : '—'}
              </div>
              <div className={classes.kpiSub}>
                {sloSummary.total
                  ? `${sloSummary.meetingObjective}/${sloSummary.total} SLOs meeting objective${
                      sloSummary.errorBudgetRemainingPct !== undefined
                        ? ` · ${Math.round(sloSummary.errorBudgetRemainingPct)}% error budget remaining`
                        : ''
                    }`
                  : 'no SLOs found'}
              </div>
            </div>
          </div>

          <div className={classes.grid}>
            {apps.map(app => {
              const statuses = columns.map(col => tileStatus(app, col));
              const worst = worstStatus(statuses);
              const latest = latestEnv(app);
              return (
                <div key={app.entityRef} className={classes.tile}>
                  <div className={classes.tileHead}>
                    <Typography className={classes.appName} title={app.appName}>
                      {app.appName}
                    </Typography>
                    {app.owner && <Typography className={classes.owner}>@{app.owner}</Typography>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length || 1}, 1fr)`, gap: 4 }}>
                    {columns.map(col => {
                      const status = tileStatus(app, col);
                      return (
                        <div key={col} className={classes.stage}>
                          <span
                            className={classes.dot}
                            style={{ backgroundColor: healthColor(t, status) }}
                            title={`${col}: ${healthLabel(status)}`}
                          />
                          <span className={classes.stageLabel}>{col}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className={classes.statusLine}>
                    <span className={classes.statusDot} style={{ backgroundColor: healthColor(t, worst) }} />
                    {worst === 'none'
                      ? 'not yet deployed'
                      : `${latest ? `${latest.env} ` : ''}${healthLabel(worst)}`}
                  </div>

                  <div className={classes.foot}>
                    <span className={classes.tag}>{latest?.image ? imageTag(latest.image) : '—'}</span>
                    <span className={classes.tag}>{latest?.deployedAt ? relativeTime(latest.deployedAt) : '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { useTektonPipelineRuns } from '../tekton/useTektonPipelineRuns';
import { summarizeCloudDeploys, type CloudDeploy } from '../cloudDeploy';
import { formatDateTime, relativeTime } from '../shared/format';
import { useCicdConfig } from '../useConfigData';
import { readEnvironments, type Deploy } from '../environments/stagedChanges';
import { FlightPins } from './cloud/FlightPins';
import { Chip, PageHeader, StatusChip, type StatusTone } from '../ui';

// The Deployments tab for a service that deploys to a cloud target (AWS ECS or Lambda, Azure
// Container Apps) instead of a Kubernetes Rollout. The Kubernetes tab reads Argo Rollouts; there
// is nothing like that here, and Tower holds no cloud credential, so this is built from the
// Tekton deploy runs Glidepath already produced (see cloudDeploy.ts). It shows what Glidepath
// deployed and whether that run worked, and says it does not read live health from the cloud.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { paddingBottom: 40 },
  resource: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.textLo },
  link: {
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.sky,
    textDecoration: 'none',
    '&:hover': { textDecoration: 'underline' },
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 22 },
  card: {
    background: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 8,
    padding: '14px 16px',
  },
  cardBad: { borderColor: ({ t }) => t.bad, background: ({ t }) => t.badSoft },
  cardRun: { borderColor: ({ t }) => t.amberLine, background: ({ t }) => t.amberSoft },
  label: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    marginBottom: 6,
  },
  big: { fontFamily: fontMono, fontSize: 15, color: ({ t }) => t.textHi, wordBreak: 'break-all' },
  sub: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 4, lineHeight: 1.5 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    padding: '6px 10px',
    borderBottom: ({ t }) => `1px solid ${t.line}`,
  },
  td: { padding: '9px 10px', borderBottom: ({ t }) => `1px solid ${t.lineSoft}`, color: ({ t }) => t.textHi },
  mono: { fontFamily: fontMono, fontSize: 12.5 },
  empty: { padding: '36px 8px', color: ({ t }) => t.textLo, fontSize: 14, lineHeight: 1.6 },
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.sky,
    '&:hover': { textDecoration: 'underline' },
  },
}));

const PHASE_LABEL: Record<string, string> = {
  succeeded: 'succeeded',
  failed: 'failed',
  running: 'deploying',
  pending: 'starting',
  cancelled: 'cancelled',
};

function duration(sec?: number): string {
  if (sec === undefined) return '—';
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function CloudDeploymentsTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { entity } = useEntity();
  const [, setSearchParams] = useSearchParams();
  const appName = entity.metadata.annotations?.['github.com/project-slug']?.split('/')[1] ?? entity.metadata.name;
  const owner = entity.metadata.annotations?.['github.com/project-slug']?.split('/')[0];
  // Flight environments (glidepath ADR-0020), each with the one before it in cicd.yaml order.
  const cicd = useCicdConfig(owner ? { owner, appName } : undefined);
  const flight = useMemo(() => {
    const { envs } = readEnvironments(cicd.data?.values?.deploy as Deploy | undefined);
    return envs.flatMap((e, i) => (e.tier === 'flight' ? [{ name: e.name, previous: envs[i - 1]?.name }] : []));
  }, [cicd.data]);
  const { loading, runs, error } = useTektonPipelineRuns(appName);
  const summary = useMemo(() => summarizeCloudDeploys(runs), [runs]);

  const openRun = (name: string) =>
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'pipelines');
      next.set('run', name);
      return next;
    });

  const pill = (d: CloudDeploy) => {
    let tone: StatusTone = 'neutral';
    if (d.phase === 'succeeded') tone = 'ok';
    else if (d.phase === 'failed') tone = 'bad';
    else if (d.phase === 'running' || d.phase === 'pending') tone = 'warn';
    return <StatusChip tone={tone}>{PHASE_LABEL[d.phase] ?? d.phase}</StatusChip>;
  };

  if (loading && runs.length === 0) return <Progress />;
  if (error && runs.length === 0) return <ResponseErrorPanel error={new Error(error)} />;

  const { current, inFlight, latestFailure, deploys, resource } = summary;
  const targetLabel = deploys[0]?.targetLabel;

  if (deploys.length === 0) {
    return (
      <div className={classes.wrap}>
        <PageHeader title="Deployments" subtitle="What Glidepath deployed, from its pipeline runs. Tower does not read live health from the cloud, so this cannot tell you the service is up, only that the deploy finished." />
        <div className={classes.empty}>
          No recent deploy runs. Deploys show up here while their pipeline runs are kept (Tekton cleans up older runs);
          a Flight environment&apos;s current release is its pin, below.
        </div>
        {owner && <FlightPins owner={owner} appName={appName} flight={flight} deploys={deploys} />}
      </div>
    );
  }

  return (
    <div className={classes.wrap}>
      <PageHeader
        title="Deployments"
        subtitle="What Glidepath deployed, from its pipeline runs. Tower does not read live health from the cloud, so this cannot tell you the service is up, only that the deploy finished."
        actions={
          <>
            {targetLabel && <Chip tone="ground">{targetLabel}</Chip>}
            {resource && (
              <span className={classes.resource}>
                {resource.kind} {resource.name}
                {resource.scope ? ` · ${resource.scope}` : ''}
                {resource.region ? ` · ${resource.region}` : ''}
              </span>
            )}
            {deploys.find(d => d.consoleUrl)?.consoleUrl && (
              <a
                className={classes.link}
                href={deploys.find(d => d.consoleUrl)!.consoleUrl}
                target="_blank"
                rel="noreferrer"
              >
                open in console ↗
              </a>
            )}
          </>
        }
      />

      <div className={classes.grid}>
        <div className={classes.card}>
          <div className={classes.label}>Last successful deploy</div>
          {current ? (
            <>
              <div className={classes.big}>{current.imageTag ?? current.imageRef ?? 'unknown image'}</div>
              <div className={classes.sub}>
                {current.flowSlug ? `${current.flowSlug} · ` : ''}
                {current.shortSha ? `commit ${current.shortSha} · ` : ''}
                {relativeTime(current.completionTime ?? current.startTime)} · took {duration(current.durationSec)}
              </div>
            </>
          ) : (
            <div className={classes.sub}>No deploy has succeeded yet.</div>
          )}
        </div>

        {inFlight && (
          <div className={`${classes.card} ${classes.cardRun}`}>
            <div className={classes.label}>Deploying now</div>
            <div className={classes.big}>{inFlight.imageTag ?? inFlight.imageRef ?? 'unknown image'}</div>
            <div className={classes.sub}>
              started {relativeTime(inFlight.startTime)} ·{' '}
              <button type="button" className={classes.linkBtn} onClick={() => openRun(inFlight.runName)}>
                watch the run
              </button>
            </div>
          </div>
        )}

        {latestFailure && (
          <div className={`${classes.card} ${classes.cardBad}`}>
            <div className={classes.label}>Latest deploy failed</div>
            <div className={classes.big}>{latestFailure.imageTag ?? latestFailure.imageRef ?? 'unknown image'}</div>
            <div className={classes.sub}>
              {latestFailure.failure?.task ? `${latestFailure.failure.task}: ` : ''}
              {latestFailure.failure?.message ?? 'see the run for details'}
            </div>
            <div className={classes.sub}>
              {current
                ? `The service may still be running ${current.imageTag ?? 'the previous image'}.`
                : 'Nothing has been deployed successfully.'}{' '}
              <button type="button" className={classes.linkBtn} onClick={() => openRun(latestFailure.runName)}>
                open the run and its logs
              </button>
            </div>
          </div>
        )}
      </div>

      <table className={classes.table}>
        <thead>
          <tr>
            <th className={classes.th}>Result</th>
            <th className={classes.th}>Image</th>
            <th className={classes.th}>Environment</th>
            <th className={classes.th}>Started</th>
            <th className={classes.th}>Took</th>
            <th className={classes.th} />
          </tr>
        </thead>
        <tbody>
          {deploys.map(d => (
            <tr key={d.runName}>
              <td className={classes.td}>{pill(d)}</td>
              <td className={`${classes.td} ${classes.mono}`}>
                {d.imageTag ?? d.imageRef ?? '—'}
                {d.flowSlug ? ` (${d.flowSlug})` : ''}
              </td>
              <td className={`${classes.td} ${classes.mono}`}>{d.env ?? '—'}</td>
              <td className={classes.td} title={formatDateTime(d.startTime)}>
                {relativeTime(d.startTime)}
              </td>
              <td className={classes.td}>{duration(d.durationSec)}</td>
              <td className={classes.td}>
                <button type="button" className={classes.linkBtn} onClick={() => openRun(d.runName)}>
                  open run
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {owner && <FlightPins owner={owner} appName={appName} flight={flight} deploys={deploys} />}
    </div>
  );
}

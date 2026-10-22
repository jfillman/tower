import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useEntity } from '@backstage/plugin-catalog-react';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { useTektonPipelineRuns } from '../tekton/useTektonPipelineRuns';
import { summarizeCloudDeploys, type CloudDeploy } from '../cloudDeploy';
import { formatDateTime, relativeTime } from '../shared/format';
import { useCicdConfig } from '../useConfigData';
import { readEnvironments, type Deploy } from '../environments/stagedChanges';
import { FlightPins } from './cloud/FlightPins';
import { Card, Chip, EmptyNote, PageHeader, Stat, StatusChip, type StatusTone, TabError, TabSkeleton, TextLink, useTableKit } from '../ui';

// The Deployments tab for a service that deploys to a cloud target (AWS ECS or Lambda, Azure
// Container Apps) instead of a Kubernetes Rollout. The Kubernetes tab reads Argo Rollouts; there
// is nothing like that here, and Tower holds no cloud credential, so this is built from the
// Tekton deploy runs Glidepath already produced (see cloudDeploy.ts). It shows what Glidepath
// deployed and whether that run worked, and says it does not read live health from the cloud.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { paddingBottom: 40 },
  resource: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 22 },
  cardBad: { borderColor: ({ t }) => t.bad, background: ({ t }) => t.badSoft },
  cardRun: { borderColor: ({ t }) => t.amberLine, background: ({ t }) => t.amberSoft },
  sub: { fontSize: 12, color: ({ t }) => t.textLo, marginTop: 4, lineHeight: 1.5 },
  mono: { fontFamily: fontMono, fontSize: 12 },
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
  const tc = useTableKit();
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

  if (loading && runs.length === 0) return <TabSkeleton />;
  if (error && runs.length === 0) return <TabError error={error} what="deployments" />;

  const { current, inFlight, latestFailure, deploys, resource } = summary;
  const targetLabel = deploys[0]?.targetLabel;

  if (deploys.length === 0) {
    return (
      <div className={classes.wrap}>
        <PageHeader title="Deployments" subtitle="What Glidepath deployed, from its pipeline runs. Tower does not read live health from the cloud, so this cannot tell you the service is up, only that the deploy finished." />
        <EmptyNote>
          No recent deploy runs. Deploys show up here while their pipeline runs are kept (Tekton cleans up older runs);
          a Flight environment&apos;s current release is its pin, below.
        </EmptyNote>
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
              <TextLink href={deploys.find(d => d.consoleUrl)!.consoleUrl}>
                open in console ↗
              </TextLink>
            )}
          </>
        }
      />

      <div className={classes.grid}>
        <Card>
          {current ? (
            <>
              <Stat label="Last successful deploy" value={current.imageTag ?? current.imageRef ?? 'unknown image'} />
              <div className={classes.sub}>
                {current.flowSlug ? `${current.flowSlug} · ` : ''}
                {current.shortSha ? `commit ${current.shortSha} · ` : ''}
                {relativeTime(current.completionTime ?? current.startTime)} · took {duration(current.durationSec)}
              </div>
            </>
          ) : (
            <Stat label="Last successful deploy" value="—" caption="No deploy has succeeded yet." />
          )}
        </Card>

        {inFlight && (
          <Card className={classes.cardRun}>
            <Stat label="Deploying now" value={inFlight.imageTag ?? inFlight.imageRef ?? 'unknown image'} />
            <div className={classes.sub}>
              started {relativeTime(inFlight.startTime)} ·{' '}
              <TextLink onClick={() => openRun(inFlight.runName)}>
                watch the run
              </TextLink>
            </div>
          </Card>
        )}

        {latestFailure && (
          <Card className={classes.cardBad}>
            <Stat label="Latest deploy failed" value={latestFailure.imageTag ?? latestFailure.imageRef ?? 'unknown image'} />
            <div className={classes.sub}>
              {latestFailure.failure?.task ? `${latestFailure.failure.task}: ` : ''}
              {latestFailure.failure?.message ?? 'see the run for details'}
            </div>
            <div className={classes.sub}>
              {current
                ? `The service may still be running ${current.imageTag ?? 'the previous image'}.`
                : 'Nothing has been deployed successfully.'}{' '}
              <TextLink onClick={() => openRun(latestFailure.runName)}>
                open the run and its logs
              </TextLink>
            </div>
          </Card>
        )}
      </div>

      <table className={tc.table}>
        <thead>
          <tr>
            <th className={tc.th}>Result</th>
            <th className={tc.th}>Image</th>
            <th className={tc.th}>Environment</th>
            <th className={tc.th}>Started</th>
            <th className={tc.th}>Took</th>
            <th className={tc.th} />
          </tr>
        </thead>
        <tbody>
          {deploys.map(d => (
            <tr key={d.runName}>
              <td className={tc.td}>{pill(d)}</td>
              <td className={`${tc.td} ${classes.mono}`}>
                {d.imageTag ?? d.imageRef ?? '—'}
                {d.flowSlug ? ` (${d.flowSlug})` : ''}
              </td>
              <td className={`${tc.td} ${classes.mono}`}>{d.env ?? '—'}</td>
              <td className={tc.td} title={formatDateTime(d.startTime)}>
                {relativeTime(d.startTime)}
              </td>
              <td className={tc.td}>{duration(d.durationSec)}</td>
              <td className={tc.td}>
                <TextLink onClick={() => openRun(d.runName)}>
                  open run
                </TextLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {owner && <FlightPins owner={owner} appName={appName} flight={flight} deploys={deploys} />}
    </div>
  );
}

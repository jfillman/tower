import { summarizeCloudDeploys, type CloudDeploy } from './cloudDeploy';
import type { PipelineRunSummary } from './tekton/types';
import type { DeployHistoryEntry, EnvironmentSummary } from './types';

// A function or cloud-hosted service has no Kubernetes workload to read an environment from, but
// it still has environments: every deploy run names the one it targeted (the `env` param of the
// deploy task). The environment's state is what Glidepath last put there, so it is built from the
// deploy runs. That one summary is what the Releases tab (matrix, log, record), provenance lookup
// and the Overview rail already consume for Kubernetes services.

const DEFAULT_ENV = 'dev';

const latestOf = (d: CloudDeploy) => {
  if (d.phase === 'succeeded' || d.phase === 'failed') return d.phase;
  if (d.phase === 'running' || d.phase === 'pending') return 'running';
  return 'none';
};

export interface CloudEnvironments {
  environments: EnvironmentSummary[];
  /** Same shape the gitops deploy-history endpoint returns, keyed by env, oldest first like the gitops endpoint. */
  history: Record<string, DeployHistoryEntry[]>;
  deploys: CloudDeploy[];
}

export function cloudEnvironmentsFromRuns(runs: PipelineRunSummary[]): CloudEnvironments {
  const { deploys } = summarizeCloudDeploys(runs);
  const byEnv = new Map<string, CloudDeploy[]>();
  deploys.forEach(d => {
    const env = d.env || DEFAULT_ENV;
    byEnv.set(env, [...(byEnv.get(env) ?? []), d]);
  });

  const environments: EnvironmentSummary[] = [];
  const history: Record<string, DeployHistoryEntry[]> = {};
  byEnv.forEach((list, env) => {
    const ok = list.filter(d => d.phase === 'succeeded' && d.imageRef);
    const current = ok[0];
    const head = list[0];
    history[env] = [...ok].reverse().map(d => ({
      sha: d.shortSha ?? '',
      date: d.completionTime ?? d.startTime ?? '',
      imageTag: d.imageRef!,
    }));
    environments.push({
      key: `cloud/${head.target}/${env}`,
      env,
      cluster: head.targetLabel,
      namespace: head.resource?.scope ?? head.resource?.name ?? '',
      deployed: Boolean(current),
      appName: head.resource?.name,
      image: current?.imageRef,
      deployedAt: current?.completionTime,
      drift: false,
      pods: [],
      services: [],
      resources: [],
      cloud: { target: head.target, targetLabel: head.targetLabel, resource: head.resource, consoleUrl: head.consoleUrl, latest: latestOf(head) },
    });
  });
  return { environments, history, deploys };
}

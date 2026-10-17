import { useCallback } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import { type RawPipelineRun, type RawTaskRun } from '../tekton/useTektonPipelineRuns';
import { NO_CONTROL_PLANE, usePlatformConfig } from '../platformConfig';
import { needsTaskRuns, toFleetRun, type FleetRun } from './fleetRuns';
import { usePolled, type Polled } from './usePolled';

const POLL_MS = 10_000;

// Every PipelineRun on the control-plane (Tekton) cluster, tower.controlPlaneCluster, in one list call (the read identity may list them
// cluster-wide; checked 2026-10-07). Tekton Results' watcher deletes completed runs about an hour
// after they finish, so this is "running now plus the last hour", and stays small. TaskRuns are read
// only for the runs that need them (live, failed, or a cloud deploy), by a set-based label selector:
// listing every TaskRun cluster-wide was ~1 MB per poll.
export function useFleetPipelineRuns(): Polled<FleetRun[]> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;

  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const prs = await k8sProxyGet<{ items: RawPipelineRun[] }>(
      discoveryApi,
      fetchApi,
      cluster,
      '/apis/tekton.dev/v1/pipelineruns',
    );
    const wanted = prs.items.filter(needsTaskRuns).map(p => p.metadata.name);
    const taskRunsByName = new Map<string, RawTaskRun>();
    if (wanted.length > 0) {
      const selector = encodeURIComponent(`tekton.dev/pipelineRun in (${[...new Set(wanted)].join(',')})`);
      const trs = await k8sProxyGet<{ items: RawTaskRun[] }>(
        discoveryApi,
        fetchApi,
        cluster,
        `/apis/tekton.dev/v1/taskruns?labelSelector=${selector}`,
      );
      trs.items.forEach(tr => taskRunsByName.set(tr.metadata.name, tr));
    }
    return prs.items
      .map(pr => toFleetRun(pr, taskRunsByName, cluster))
      .sort((a, b) => Date.parse(b.run.startTime ?? '') - Date.parse(a.run.startTime ?? ''));
  }, [discoveryApi, fetchApi, cluster]);

  return usePolled(`fleet-runs:${cluster ?? ''}`, fetcher, POLL_MS);
}

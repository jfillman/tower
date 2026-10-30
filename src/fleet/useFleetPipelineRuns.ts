import { useCallback } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { fetchFleetLiveRuns, fetchFleetLiveTaskRuns } from '../tekton/liveRuns';
import { type RawPipelineRun, type RawTaskRun } from '../tekton/useTektonPipelineRuns';
import { NO_CONTROL_PLANE, usePlatformConfig } from '../platformConfig';
import { needsTaskRuns, toFleetRun, type FleetRun } from './fleetRuns';
import { usePolled, type Polled } from './usePolled';

const POLL_MS = 10_000;

// Every PipelineRun on the control-plane (Tekton) cluster, tower.controlPlaneCluster, from glidepath-api
// (tekton/liveRuns.ts; P6b, 2026-10-30). Tekton Results' watcher deletes completed runs about an hour
// after they finish, so this is "running now plus the last hour", and stays small. TaskRuns are read
// only for the runs that need them (live, failed, or a cloud deploy), by name: listing every TaskRun
// cluster-wide was ~1 MB per poll.
export function useFleetPipelineRuns(): Polled<FleetRun[]> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;

  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const apis = { discoveryApi, fetchApi };
    const prs: RawPipelineRun[] = await fetchFleetLiveRuns(apis);
    const wanted = [...new Set(prs.filter(needsTaskRuns).map(p => p.metadata.name))];
    const taskRunsByName = new Map<string, RawTaskRun>();
    (await fetchFleetLiveTaskRuns(apis, wanted)).forEach(tr => taskRunsByName.set(tr.metadata.name, tr));
    return prs
      .map(pr => toFleetRun(pr, taskRunsByName, cluster))
      .sort((a, b) => Date.parse(b.run.startTime ?? '') - Date.parse(a.run.startTime ?? ''));
  }, [discoveryApi, fetchApi, cluster]);

  return usePolled(`fleet-runs:${cluster ?? ''}`, fetcher, POLL_MS);
}

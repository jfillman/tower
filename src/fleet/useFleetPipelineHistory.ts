import { useCallback } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { fetchFleetHistory, type FleetHistoryRow } from '../tekton/liveRuns';
import { NO_CONTROL_PLANE, usePlatformConfig } from '../platformConfig';
import { appOfNamespace, type HistoryRun } from './pipelineHistory';
import { usePolled, type Polled } from './usePolled';

// Finished runs for the whole fleet, from Tekton Results through glidepath-api (tekton/liveRuns.ts; P6b, 2026-10-30:
// Tower paged Results' `parents/-` itself until then). The API takes the window in whole hours and lists newest
// first; a week of the fleet was 559 runs.
const POLL_MS = 2 * 60_000;
const LIMIT = 1000; // the API's cap

/** A fleet history row as HistoryRun; a run Results has no outcome for (still running) is left out. */
export function toFleetHistoryRun(r: FleetHistoryRow): HistoryRun | undefined {
  if (r.status === 'unknown') return undefined;
  const start = r.startTime ? Date.parse(r.startTime) : NaN;
  const end = r.endTime ? Date.parse(r.endTime) : NaN;
  return {
    key: `${r.namespace}/${r.name}`,
    namespace: r.namespace,
    name: r.name,
    app: r.app ?? appOfNamespace(r.namespace),
    pipeline: r.pipeline,
    status: r.status,
    startTime: r.startTime,
    endTime: r.endTime,
    durationSec: Number.isNaN(start) || Number.isNaN(end) ? undefined : Math.max(0, Math.round((end - start) / 1000)),
    commit: r.commit,
    eventType: r.eventType,
    prNumber: r.prNumber,
  };
}

export function useFleetPipelineHistory(windowMs: number): Polled<HistoryRun[]> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;

  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const cutoff = Date.now() - windowMs;
    const rows = await fetchFleetHistory({ discoveryApi, fetchApi }, Math.max(1, Math.ceil(windowMs / 3_600_000)), LIMIT);
    // Whole hours round the window up: drop what started before it.
    return rows.flatMap(r => {
      const run = toFleetHistoryRun(r);
      return run && !(run.startTime && Date.parse(run.startTime) < cutoff) ? [run] : [];
    });
  }, [discoveryApi, fetchApi, windowMs, cluster]);

  return usePolled(`fleet-history:${windowMs}:${cluster ?? ''}`, fetcher, POLL_MS);
}

import { useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { fetchFleetHistory } from '../tekton/liveRuns.esm.js';
import { usePlatformConfig, NO_CONTROL_PLANE } from '../platformConfig.esm.js';
import { appOfNamespace } from './pipelineHistory.esm.js';
import { usePolled } from './usePolled.esm.js';

const POLL_MS = 2 * 6e4;
const LIMIT = 1e3;
function toFleetHistoryRun(r) {
  if (r.status === "unknown") return void 0;
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
    durationSec: Number.isNaN(start) || Number.isNaN(end) ? void 0 : Math.max(0, Math.round((end - start) / 1e3)),
    commit: r.commit,
    eventType: r.eventType,
    prNumber: r.prNumber
  };
}
function useFleetPipelineHistory(windowMs) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const cutoff = Date.now() - windowMs;
    const rows = await fetchFleetHistory({ discoveryApi, fetchApi }, Math.max(1, Math.ceil(windowMs / 36e5)), LIMIT);
    return rows.flatMap((r) => {
      const run = toFleetHistoryRun(r);
      return run && !(run.startTime && Date.parse(run.startTime) < cutoff) ? [run] : [];
    });
  }, [discoveryApi, fetchApi, windowMs, cluster]);
  return usePolled(`fleet-history:${windowMs}:${cluster ?? ""}`, fetcher, POLL_MS);
}

export { toFleetHistoryRun, useFleetPipelineHistory };
//# sourceMappingURL=useFleetPipelineHistory.esm.js.map

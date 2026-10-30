import { useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { fetchFleetLiveRuns, fetchFleetLiveTaskRuns } from '../tekton/liveRuns.esm.js';
import { usePlatformConfig, NO_CONTROL_PLANE } from '../platformConfig.esm.js';
import { needsTaskRuns, toFleetRun } from './fleetRuns.esm.js';
import { usePolled } from './usePolled.esm.js';

const POLL_MS = 1e4;
function useFleetPipelineRuns() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const cluster = usePlatformConfig().controlPlaneCluster;
  const fetcher = useCallback(async () => {
    if (!cluster) throw new Error(NO_CONTROL_PLANE);
    const apis = { discoveryApi, fetchApi };
    const prs = await fetchFleetLiveRuns(apis);
    const wanted = [...new Set(prs.filter(needsTaskRuns).map((p) => p.metadata.name))];
    const taskRunsByName = /* @__PURE__ */ new Map();
    (await fetchFleetLiveTaskRuns(apis, wanted)).forEach((tr) => taskRunsByName.set(tr.metadata.name, tr));
    return prs.map((pr) => toFleetRun(pr, taskRunsByName, cluster)).sort((a, b) => Date.parse(b.run.startTime ?? "") - Date.parse(a.run.startTime ?? ""));
  }, [discoveryApi, fetchApi, cluster]);
  return usePolled(`fleet-runs:${cluster ?? ""}`, fetcher, POLL_MS);
}

export { useFleetPipelineRuns };
//# sourceMappingURL=useFleetPipelineRuns.esm.js.map

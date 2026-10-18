import { useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
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
    const prs = await k8sProxyGet(
      discoveryApi,
      fetchApi,
      cluster,
      "/apis/tekton.dev/v1/pipelineruns"
    );
    const wanted = prs.items.filter(needsTaskRuns).map((p) => p.metadata.name);
    const taskRunsByName = /* @__PURE__ */ new Map();
    if (wanted.length > 0) {
      const selector = encodeURIComponent(`tekton.dev/pipelineRun in (${[...new Set(wanted)].join(",")})`);
      const trs = await k8sProxyGet(
        discoveryApi,
        fetchApi,
        cluster,
        `/apis/tekton.dev/v1/taskruns?labelSelector=${selector}`
      );
      trs.items.forEach((tr) => taskRunsByName.set(tr.metadata.name, tr));
    }
    return prs.items.map((pr) => toFleetRun(pr, taskRunsByName, cluster)).sort((a, b) => Date.parse(b.run.startTime ?? "") - Date.parse(a.run.startTime ?? ""));
  }, [discoveryApi, fetchApi, cluster]);
  return usePolled(`fleet-runs:${cluster ?? ""}`, fetcher, POLL_MS);
}

export { useFleetPipelineRuns };
//# sourceMappingURL=useFleetPipelineRuns.esm.js.map

import { useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { TEKTON_CLUSTER } from '../tekton/useTektonPipelineRuns.esm.js';
import { needsTaskRuns, toFleetRun } from './fleetRuns.esm.js';
import { usePolled } from './usePolled.esm.js';

const POLL_MS = 1e4;
function useFleetPipelineRuns() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const fetcher = useCallback(async () => {
    const prs = await k8sProxyGet(
      discoveryApi,
      fetchApi,
      TEKTON_CLUSTER,
      "/apis/tekton.dev/v1/pipelineruns"
    );
    const wanted = prs.items.filter(needsTaskRuns).map((p) => p.metadata.name);
    const taskRunsByName = /* @__PURE__ */ new Map();
    if (wanted.length > 0) {
      const selector = encodeURIComponent(`tekton.dev/pipelineRun in (${[...new Set(wanted)].join(",")})`);
      const trs = await k8sProxyGet(
        discoveryApi,
        fetchApi,
        TEKTON_CLUSTER,
        `/apis/tekton.dev/v1/taskruns?labelSelector=${selector}`
      );
      trs.items.forEach((tr) => taskRunsByName.set(tr.metadata.name, tr));
    }
    return prs.items.map((pr) => toFleetRun(pr, taskRunsByName)).sort((a, b) => Date.parse(b.run.startTime ?? "") - Date.parse(a.run.startTime ?? ""));
  }, [discoveryApi, fetchApi]);
  return usePolled("fleet-runs", fetcher, POLL_MS);
}

export { useFleetPipelineRuns };
//# sourceMappingURL=useFleetPipelineRuns.esm.js.map

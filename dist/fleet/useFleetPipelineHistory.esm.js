import { useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { TEKTON_CLUSTER } from '../tekton/useTektonPipelineRuns.esm.js';
import { toHistoryRun } from './pipelineHistory.esm.js';
import { usePolled } from './usePolled.esm.js';

const RELAY = "/api/v1/namespaces/platform-system/services/tekton-results-relay:8080/proxy";
const POLL_MS = 2 * 6e4;
const PAGE_SIZE = 200;
const MAX_PAGES = 10;
function useFleetPipelineHistory(windowMs) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const fetcher = useCallback(async () => {
    const cutoff = Date.now() - windowMs;
    const out = [];
    let pageToken;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        page_size: String(PAGE_SIZE),
        order_by: "create_time desc",
        filter: 'summary.type=="tekton.dev/v1.PipelineRun"'
      });
      if (pageToken) params.set("page_token", pageToken);
      const res = await k8sProxyGet(
        discoveryApi,
        fetchApi,
        TEKTON_CLUSTER,
        `${RELAY}/apis/results.tekton.dev/v1alpha2/parents/-/results?${params.toString()}`
      );
      const results = res.results ?? [];
      let older = false;
      for (const r of results) {
        if (r.create_time && Date.parse(r.create_time) < cutoff) {
          older = true;
          break;
        }
        const run = toHistoryRun(r);
        if (run) out.push(run);
      }
      pageToken = res.nextPageToken ?? res.next_page_token;
      if (older || !pageToken || results.length === 0) break;
    }
    return out;
  }, [discoveryApi, fetchApi, windowMs]);
  return usePolled(`fleet-history:${windowMs}`, fetcher, POLL_MS);
}

export { useFleetPipelineHistory };
//# sourceMappingURL=useFleetPipelineHistory.esm.js.map

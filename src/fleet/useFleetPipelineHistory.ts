import { useCallback } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import { TEKTON_CLUSTER } from '../tekton/useTektonPipelineRuns';
import { toHistoryRun, type HistoryRun, type RawResult } from './pipelineHistory';
import { usePolled, type Polled } from './usePolled';

// Finished runs for the whole fleet, from Tekton Results through the same relay the Release Record
// uses (useTektonResultsRuns.ts explains why the relay). `parents/-` lists every namespace at once
// (verified 2026-10-07), and the Result summaries are ~1 KB each: a week of the fleet was 559 runs,
// 0.5 MB, under a second. Results' list filter rejects create_time, so pages are read newest first
// until one is older than the window.
const RELAY = '/api/v1/namespaces/platform-system/services/tekton-results-relay:8080/proxy';
const POLL_MS = 2 * 60_000;
const PAGE_SIZE = 200;
const MAX_PAGES = 10;

export function useFleetPipelineHistory(windowMs: number): Polled<HistoryRun[]> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const fetcher = useCallback(async () => {
    const cutoff = Date.now() - windowMs;
    const out: HistoryRun[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        page_size: String(PAGE_SIZE),
        order_by: 'create_time desc',
        filter: 'summary.type=="tekton.dev/v1.PipelineRun"',
      });
      if (pageToken) params.set('page_token', pageToken);
      const res = await k8sProxyGet<{ results?: RawResult[]; nextPageToken?: string; next_page_token?: string }>(
        discoveryApi,
        fetchApi,
        TEKTON_CLUSTER,
        `${RELAY}/apis/results.tekton.dev/v1alpha2/parents/-/results?${params.toString()}`,
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

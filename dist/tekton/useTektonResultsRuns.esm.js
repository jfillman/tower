import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy.esm.js';
import { TEKTON_CLUSTER, toPipelineRunSummary } from './useTektonPipelineRuns.esm.js';

const TEKTON_RESULTS_RELAY_NAMESPACE = "platform-system";
const TEKTON_RESULTS_RELAY_SERVICE = "tekton-results-relay";
const TEKTON_RESULTS_RELAY_PORT = 8080;
function recordsProxyPath(parent, pageToken) {
  const base = `/api/v1/namespaces/${TEKTON_RESULTS_RELAY_NAMESPACE}/services/${TEKTON_RESULTS_RELAY_SERVICE}:${TEKTON_RESULTS_RELAY_PORT}/proxy/apis/results.tekton.dev/v1alpha2/parents/${encodeURIComponent(parent)}/results/-/records`;
  const params = new URLSearchParams({
    page_size: "200",
    filter: 'data_type in ["tekton.dev/v1.PipelineRun","tekton.dev/v1.TaskRun"]',
    order_by: "create_time desc"
  });
  if (pageToken) params.set("page_token", pageToken);
  return `${base}?${params.toString()}`;
}
function decodeRecordValue(record) {
  if (!record.data?.value) return void 0;
  try {
    const binary = atob(record.data.value);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return void 0;
  }
}
function classifyRecordType(record) {
  const type = record.data?.type ?? "";
  if (/pipelinerun/i.test(type)) return "pipelineRun";
  if (/taskrun/i.test(type)) return "taskRun";
  return void 0;
}
const MAX_PAGES = 12;
function useTektonResultsRuns(appName, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(appName), runs: [] });
  useEffect(() => {
    if (!appName) {
      setState({ loading: false, runs: [] });
      return void 0;
    }
    let cancelled = false;
    const parent = `app-${appName}-cicd`;
    (async () => {
      setState((prev) => ({ loading: true, runs: prev.runs }));
      try {
        const rawPipelineRuns = [];
        const rawTaskRuns = [];
        let pageToken;
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const res = await k8sProxyGet(
            discoveryApi,
            fetchApi,
            TEKTON_CLUSTER,
            recordsProxyPath(parent, pageToken)
          );
          for (const record of res.records ?? []) {
            const kind = classifyRecordType(record);
            if (kind === "pipelineRun") {
              const obj = decodeRecordValue(record);
              if (obj) rawPipelineRuns.push(obj);
            } else if (kind === "taskRun") {
              const obj = decodeRecordValue(record);
              if (obj) rawTaskRuns.push(obj);
            }
          }
          pageToken = res.nextPageToken ?? res.next_page_token;
          if (!pageToken) break;
        }
        if (cancelled) return;
        const taskRunsByName = new Map(rawTaskRuns.map((tr) => [tr.metadata.name, tr]));
        const runs = rawPipelineRuns.map((pr) => toPipelineRunSummary(pr, TEKTON_CLUSTER, taskRunsByName));
        setState({ loading: false, runs });
      } catch (e) {
        if (!cancelled) setState({ loading: false, runs: [], error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, discoveryApi, fetchApi, refreshNonce]);
  return state;
}

export { useTektonResultsRuns };
//# sourceMappingURL=useTektonResultsRuns.esm.js.map

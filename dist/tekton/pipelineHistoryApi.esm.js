import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { toPipelineRunSummary, TEKTON_CLUSTER } from './useTektonPipelineRuns.esm.js';

function archivedRunToSummary(app, dto) {
  const taskRunsByName = new Map(dto.taskRuns.map((tr) => [tr.metadata.name, tr]));
  return { ...toPipelineRunSummary(dto.pipelineRun, TEKTON_CLUSTER, taskRunsByName), archive: { app, result: dto.result } };
}
function useArchivedRuns(appName, sinceHours, limit, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: Boolean(appName), runs: [] });
  useEffect(() => {
    if (!appName) {
      setState({ loading: false, runs: [] });
      return void 0;
    }
    let cancelled = false;
    setState((prev) => ({ loading: true, runs: prev.runs }));
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const q = new URLSearchParams({ app: appName, sinceHours: String(sinceHours), limit: String(limit) });
        const res = await fetchApi.fetch(`${base}/pipeline-history/runs?${q}`);
        if (!res.ok) throw new Error(`pipeline history: ${res.status} ${(await res.text()).slice(0, 200)}`);
        const body = await res.json();
        if (!cancelled) setState({ loading: false, runs: body.runs.map((r) => archivedRunToSummary(appName, r)) });
      } catch (e) {
        if (!cancelled) setState({ loading: false, runs: [], error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, sinceHours, limit, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function parseArchivedLog(text, steps) {
  const byStep = /* @__PURE__ */ new Map();
  let current;
  for (const line of text.split("\n")) {
    const m = /^\[([^\]\s]+)\] ?(.*)$/.exec(line);
    if (m) {
      current = m[1];
      if (!byStep.has(current)) byStep.set(current, []);
      byStep.get(current).push(m[2]);
    } else if (current && line !== "") {
      byStep.get(current).push(line);
    }
  }
  return steps.map((s) => {
    const lines = byStep.get(s.name) ?? byStep.get(s.container.replace(/^step-/, "")) ?? [];
    return { step: s.name, container: s.container, state: s.state, lines: lines.map((t) => ({ text: t })) };
  });
}
function useArchivedTaskRunLogs(params) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(params),
    blocks: []
  });
  const key = params ? `${params.app}/${params.result}/${params.taskRun}` : "";
  const stepsKey = params?.steps.map((s) => s.container).join(",") ?? "";
  useEffect(() => {
    if (!params) {
      setState({ loading: false, blocks: [] });
      return void 0;
    }
    let cancelled = false;
    setState({ loading: true, blocks: [] });
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const q = new URLSearchParams({ app: params.app, result: params.result, taskRun: params.taskRun });
        const res = await fetchApi.fetch(`${base}/pipeline-history/log?${q}`);
        if (res.status === 404) {
          if (!cancelled) setState({ loading: false, blocks: [], error: "Tekton Results archived no logs for this task." });
          return;
        }
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
        const text = await res.text();
        if (!cancelled) setState({ loading: false, blocks: parseArchivedLog(text, params.steps) });
      } catch (e) {
        if (!cancelled) setState({ loading: false, blocks: [], error: `Couldn't load the archived logs: ${String(e)}` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, stepsKey, discoveryApi, fetchApi]);
  return state;
}

export { archivedRunToSummary, parseArchivedLog, useArchivedRuns, useArchivedTaskRunLogs };
//# sourceMappingURL=pipelineHistoryApi.esm.js.map

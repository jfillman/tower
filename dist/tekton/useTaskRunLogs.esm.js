import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { k8sProxyGetText } from '../k8sProxy.esm.js';

const POLL_MS = 3e3;
function parseTimestampedLine(line) {
  const spaceIndex = line.indexOf(" ");
  if (spaceIndex === -1) return { text: line };
  const at = line.slice(0, spaceIndex);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(at)) return { text: line };
  return { at, text: line.slice(spaceIndex + 1) };
}
function useTaskRunLogs(params) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(params),
    blocks: []
  });
  const stepsKey = params?.steps.map((s) => `${s.container}:${s.state}`).join(",") ?? "";
  const anyRunning = params?.steps.some((s) => s.state === "running") ?? false;
  useEffect(() => {
    if (!params) {
      setState({ loading: false, blocks: [] });
      return void 0;
    }
    let cancelled = false;
    let timer;
    async function tick() {
      const fetchable = params.steps.filter((s) => s.state !== "waiting");
      const waiting = params.steps.filter((s) => s.state === "waiting");
      const fetched = await Promise.all(
        fetchable.map(async (step) => {
          try {
            const text = await k8sProxyGetText(
              discoveryApi,
              fetchApi,
              params.cluster,
              `/api/v1/namespaces/${params.namespace}/pods/${params.podName}/log?container=${step.container}&timestamps=true`
            );
            const lines = text.split("\n").filter(Boolean).map(parseTimestampedLine);
            return { step: step.name, container: step.container, state: step.state, lines };
          } catch (e) {
            return { step: step.name, container: step.container, state: step.state, lines: [], error: String(e) };
          }
        })
      );
      if (cancelled) return;
      const queuedBlocks = waiting.map((s) => ({
        step: s.name,
        container: s.container,
        state: s.state,
        lines: []
      }));
      setState({ loading: false, blocks: [...fetched, ...queuedBlocks] });
      if (!cancelled && anyRunning) timer = setTimeout(tick, POLL_MS);
    }
    setState((prev) => ({ loading: prev.blocks.length === 0, blocks: prev.blocks }));
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [params?.cluster, params?.namespace, params?.podName, stepsKey, anyRunning, discoveryApi, fetchApi]);
  return state;
}

export { useTaskRunLogs };
//# sourceMappingURL=useTaskRunLogs.esm.js.map

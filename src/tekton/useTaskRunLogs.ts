import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGetText } from '../k8sProxy';
import type { TaskStepSummary } from './types';

const POLL_MS = 3000;

export interface TaskLogLine {
  at?: string;
  text: string;
}

export interface StepLogBlock {
  step: string;
  container: string;
  state: TaskStepSummary['state'];
  lines: TaskLogLine[];
  error?: string;
}

// Splits one k8s `?timestamps=true` log line into its real RFC3339 prefix
// and the actual log text - the format is always `<timestamp> <rest>`, one
// space-separated token then everything else.
function parseTimestampedLine(line: string): TaskLogLine {
  const spaceIndex = line.indexOf(' ');
  if (spaceIndex === -1) return { text: line };
  const at = line.slice(0, spaceIndex);
  // A real RFC3339 timestamp always starts with a 4-digit year - anything
  // else means this line didn't actually have one (e.g. a log line that
  // itself begins with a space-separated token that isn't a timestamp,
  // which the container runtime's timestamps=true contract shouldn't
  // produce, but this stays correct rather than mislabeling it).
  if (!/^\d{4}-\d{2}-\d{2}T/.test(at)) return { text: line };
  return { at, text: line.slice(spaceIndex + 1) };
}

// A step that hasn't started yet (`waiting`) has no container log to fetch -
// its container may not even exist on the pod yet, and querying it anyway
// produced exactly the "loading logs forever with no error" bug (2026-09-11)
// this hook exists to fix. Only terminated/running steps get fetched; a
// waiting step just renders as "queued" (see TaskRunLogConsole.tsx).
export function useTaskRunLogs(
  params:
    | { cluster: string; namespace: string; podName: string; steps: TaskStepSummary[] }
    | undefined,
): { loading: boolean; blocks: StepLogBlock[] } {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; blocks: StepLogBlock[] }>({
    loading: Boolean(params),
    blocks: [],
  });

  const stepsKey = params?.steps.map(s => `${s.container}:${s.state}`).join(',') ?? '';
  const anyRunning = params?.steps.some(s => s.state === 'running') ?? false;

  useEffect(() => {
    if (!params) {
      setState({ loading: false, blocks: [] });
      return undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      const fetchable = params!.steps.filter(s => s.state !== 'waiting');
      const waiting = params!.steps.filter(s => s.state === 'waiting');
      const fetched = await Promise.all(
        fetchable.map(async (step): Promise<StepLogBlock> => {
          try {
            const text = await k8sProxyGetText(
              discoveryApi,
              fetchApi,
              params!.cluster,
              `/api/v1/namespaces/${params!.namespace}/pods/${params!.podName}/log?container=${step.container}&timestamps=true`,
            );
            const lines = text
              .split('\n')
              .filter(Boolean)
              .map(parseTimestampedLine);
            return { step: step.name, container: step.container, state: step.state, lines };
          } catch (e) {
            return { step: step.name, container: step.container, state: step.state, lines: [], error: String(e) };
          }
        }),
      );
      if (cancelled) return;
      const queuedBlocks: StepLogBlock[] = waiting.map(s => ({
        step: s.name,
        container: s.container,
        state: s.state,
        lines: [],
      }));
      setState({ loading: false, blocks: [...fetched, ...queuedBlocks] });
      if (!cancelled && anyRunning) timer = setTimeout(tick, POLL_MS);
    }

    setState(prev => ({ loading: prev.blocks.length === 0, blocks: prev.blocks }));
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.cluster, params?.namespace, params?.podName, stepsKey, anyRunning, discoveryApi, fetchApi]);

  return state;
}

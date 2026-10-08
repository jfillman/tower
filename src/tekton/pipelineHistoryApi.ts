import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { TEKTON_CLUSTER, toPipelineRunSummary, type RawPipelineRun, type RawTaskRun } from './useTektonPipelineRuns';
import type { PipelineRunSummary, TaskStepSummary } from './types';
import type { StepLogBlock } from './useTaskRunLogs';

// Archived pipeline runs from the Backstage backend's /api/glidepath/pipeline-history endpoints, which read Tekton
// Results (30-day retention) server-side, trim each object to the fields Tower reads and cache it (backstage
// packages/backend/src/pipelineHistory.ts). Tekton deletes a finished run from the cluster about an hour after it
// completes, so anything older than that is only here.

interface ArchivedRunDto {
  result: string;
  pipelineRun: RawPipelineRun;
  taskRuns: RawTaskRun[];
}

/** An archived run as the same summary a live run produces (one parser for both), marked with where it came from. */
export function archivedRunToSummary(app: string, dto: ArchivedRunDto): PipelineRunSummary {
  const taskRunsByName = new Map(dto.taskRuns.map(tr => [tr.metadata.name, tr]));
  return { ...toPipelineRunSummary(dto.pipelineRun, TEKTON_CLUSTER, taskRunsByName), archive: { app, result: dto.result } };
}

export interface UseArchivedRunsResult {
  loading: boolean;
  error?: string;
  runs: PipelineRunSummary[];
}

/** Finished runs of an app from the last `sinceHours`, newest first, at most `limit`. Undefined app: nothing. */
export function useArchivedRuns(
  appName: string | undefined,
  sinceHours: number,
  limit: number,
  refreshNonce = 0,
): UseArchivedRunsResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<UseArchivedRunsResult>({ loading: Boolean(appName), runs: [] });

  useEffect(() => {
    if (!appName) {
      setState({ loading: false, runs: [] });
      return undefined;
    }
    let cancelled = false;
    setState(prev => ({ loading: true, runs: prev.runs }));
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const q = new URLSearchParams({ app: appName, sinceHours: String(sinceHours), limit: String(limit) });
        const res = await fetchApi.fetch(`${base}/pipeline-history/runs?${q}`);
        if (!res.ok) throw new Error(`pipeline history: ${res.status} ${(await res.text()).slice(0, 200)}`);
        const body = (await res.json()) as { runs: ArchivedRunDto[] };
        if (!cancelled) setState({ loading: false, runs: body.runs.map(r => archivedRunToSummary(appName, r)) });
      } catch (e) {
        // Degrades to "no archived runs": every caller still has the live runs.
        if (!cancelled) setState({ loading: false, runs: [], error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, sinceHours, limit, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

/**
 * Splits an archived TaskRun log into per-step blocks. Results stores one text stream per TaskRun with each line
 * prefixed by its container's short name (`[build] ...`, init containers included); lines without a prefix continue
 * the previous step. Only the TaskRun's own steps are kept, in step order.
 */
export function parseArchivedLog(text: string, steps: TaskStepSummary[]): StepLogBlock[] {
  const byStep = new Map<string, string[]>();
  let current: string | undefined;
  for (const line of text.split('\n')) {
    const m = /^\[([^\]\s]+)\] ?(.*)$/.exec(line);
    if (m) {
      current = m[1];
      if (!byStep.has(current)) byStep.set(current, []);
      byStep.get(current)!.push(m[2]);
    } else if (current && line !== '') {
      byStep.get(current)!.push(line);
    }
  }
  return steps.map(s => {
    const lines = byStep.get(s.name) ?? byStep.get(s.container.replace(/^step-/, '')) ?? [];
    return { step: s.name, container: s.container, state: s.state, lines: lines.map(t => ({ text: t })) };
  });
}

/** One archived TaskRun's step logs. Undefined params: nothing (the live log hook is in use instead). */
export function useArchivedTaskRunLogs(
  params: { app: string; result: string; taskRun: string; steps: TaskStepSummary[] } | undefined,
): { loading: boolean; blocks: StepLogBlock[]; error?: string } {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; blocks: StepLogBlock[]; error?: string }>({
    loading: Boolean(params),
    blocks: [],
  });
  const key = params ? `${params.app}/${params.result}/${params.taskRun}` : '';
  const stepsKey = params?.steps.map(s => s.container).join(',') ?? '';

  useEffect(() => {
    if (!params) {
      setState({ loading: false, blocks: [] });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, blocks: [] });
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const q = new URLSearchParams({ app: params.app, result: params.result, taskRun: params.taskRun });
        const res = await fetchApi.fetch(`${base}/pipeline-history/log?${q}`);
        if (res.status === 404) {
          if (!cancelled) setState({ loading: false, blocks: [], error: 'Tekton Results archived no logs for this task.' });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stepsKey, discoveryApi, fetchApi]);

  return state;
}

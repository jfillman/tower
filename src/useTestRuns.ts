import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

// The app's test runs as Testkube records them (Glidepath test framework, phase 4). The backend's /tests route
// reads Testkube's execution list for every run Glidepath tagged with this app, through the control plane's
// service proxy; the agent has no dashboard of its own in the free tier, so this is where a team sees its runs.

export interface TestRun {
  id: string;
  name: string;
  workflow: string;
  status: string;
  statusNote?: string;
  role?: string;
  env?: string;
  test?: string;
  image?: string;
  revision?: string;
  chain?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  steps: Array<{ name: string; status: string }>;
  hasReport: boolean;
}

export interface TestRunsState {
  loading: boolean;
  error?: string;
  runs: TestRun[];
}

export function useTestRuns(appName: string | undefined, refreshNonce = 0): TestRunsState {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<TestRunsState>({ loading: Boolean(appName), runs: [] });

  useEffect(() => {
    if (!appName) {
      setState({ loading: false, runs: [] });
      return undefined;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: undefined }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${baseUrl}/tests?app=${encodeURIComponent(appName)}&limit=100`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
        }
        const body = (await res.json()) as { runs: TestRun[] };
        if (!cancelled) setState({ loading: false, runs: body.runs ?? [] });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e), runs: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, refreshNonce, discoveryApi, fetchApi]);

  return state;
}

/** Fetches a run's JUnit report through the backend and hands it to the browser as a file. */
export async function downloadTestReport(
  fetchApi: { fetch: (url: string) => Promise<Response> },
  baseUrl: string,
  run: Pick<TestRun, 'id' | 'workflow'>,
): Promise<void> {
  const res = await fetchApi.fetch(`${baseUrl}/tests/report?id=${encodeURIComponent(run.id)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${run.workflow}-${run.id}-junit.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

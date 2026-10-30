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

/** A run's JUnit report through the backend, as text. The app lets the backend ask glidepath-api, which authorizes
 * per app; without it the backend can only read Testkube directly. */
export async function fetchTestReport(
  fetchApi: { fetch: (url: string) => Promise<Response> },
  baseUrl: string,
  appName: string | undefined,
  run: Pick<TestRun, 'id'>,
): Promise<string> {
  const res = await fetchApi.fetch(
    `${baseUrl}/tests/report?id=${encodeURIComponent(run.id)}${appName ? `&app=${encodeURIComponent(appName)}` : ''}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.text();
}

/** Fetches a run's JUnit report and hands it to the browser as a file. */
export async function downloadTestReport(
  fetchApi: { fetch: (url: string) => Promise<Response> },
  baseUrl: string,
  appName: string | undefined,
  run: Pick<TestRun, 'id' | 'workflow'>,
): Promise<void> {
  const xml = await fetchTestReport(fetchApi, baseUrl, appName, run);
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${run.workflow}-${run.id}-junit.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface TestFailure {
  name: string;
  classname?: string;
  /** The failure's message attribute, else the first line of its text. */
  message: string;
  /** The first stack line in the team's own code (file:line, not the runtime's or a dependency's). */
  location?: string;
  /** The failure's full text: the stack, the assertion's actual/expected. */
  detail: string;
}

// Frames the location skips: the runtime's own and installed dependencies'. Glidepath's run-testworkflow Task prints
// the same pick in the test stage's log.
const NOT_OURS = /node:internal|node_modules|site-packages|\/usr\/lib\//;

/** The failed (<failure>) and errored (<error>) test cases in a JUnit report, any nesting of <testsuite>s. Undefined
 * when the text is not a JUnit report at all. */
export function parseJUnitFailures(xml: string): { total: number; failures: TestFailure[] } | undefined {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return undefined;
  const root = doc.documentElement?.nodeName;
  if (root !== 'testsuites' && root !== 'testsuite') return undefined;
  const cases = Array.from(doc.getElementsByTagName('testcase'));
  const failures: TestFailure[] = [];
  for (const c of cases) {
    const f = Array.from(c.children).find(e => e.nodeName === 'failure' || e.nodeName === 'error');
    if (!f) continue;
    const detail = (f.textContent ?? '').trim();
    const lines = detail.split('\n').map(l => l.trim()).filter(Boolean);
    failures.push({
      name: c.getAttribute('name') ?? '?',
      classname: c.getAttribute('classname') || undefined,
      message: f.getAttribute('message') || lines[0] || f.nodeName,
      location: lines.find(l => /[^ ():]+:\d+/.test(l) && !NOT_OURS.test(l)),
      detail,
    });
  }
  return { total: cases.length, failures };
}

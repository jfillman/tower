import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestRunsPanel } from './TestRunsPanel';
import type { TestRun } from '../../useTestRuns';

const mockFetch = jest.fn();
// One object for every call, as Backstage's own APIs are: a new one per render would re-run every effect keyed on it.
const mockApi = { getBaseUrl: async () => 'http://backend/api/glidepath', fetch: (url: string) => mockFetch(url) };
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: () => mockApi,
}));

// node --test's JUnit for boarding-api's failed dev run, 2026-10-29 (trimmed).
const REPORT = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="healthz answers ok" time="0.04" classname="test"/>
	<testcase name="a scan returns the boarded count against the flight capacity" time="0.01" classname="test">
		<failure type="testCodeFailure" message="The expression evaluated to a falsy value:  assert.ok(body.capacity &gt;= body.boarded)">
[Error [ERR_TEST_FAILURE]: The expression evaluated to a falsy value:
  cause: AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
      at TestContext.&lt;anonymous> (/app/test/integration/boarding.test.js:76:10)
      at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
		</failure>
	</testcase>
</testsuites>`;

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async () => new Response(REPORT, { status: 200 }));
});

const run = (over: Partial<TestRun> = {}): TestRun => ({
  id: '6ad6',
  name: 'boarding-api-check-ride-3',
  workflow: 'boarding-api-check-ride',
  status: 'passed',
  role: 'check-ride',
  env: 'dev',
  image: 'ghcr.io/o/boarding-api:2.0.0-926d566@sha256:abc',
  revision: '926d566aaaaaaa',
  startedAt: '2026-10-19T17:30:00Z',
  durationMs: 72000,
  steps: [
    { name: 'reach the service', status: 'passed' },
    { name: 'report', status: 'passed' },
  ],
  hasReport: true,
  ...over,
});

const renderPanel = (runs: TestRun[], over: Partial<{ loading: boolean; error: string }> = {}) =>
  render(<TestRunsPanel appName="boarding-api" state={{ loading: false, runs, ...over }} />);

describe('TestRunsPanel', () => {
  it('lists each run with what ran, where, what each step did and the report to download', () => {
    renderPanel([run(), run({ id: 'x1', workflow: 'boarding-api-tests', role: 'test', status: 'failed', hasReport: false, steps: [{ name: 'unit', status: 'failed' }] })]);
    const rows = screen.getAllByTestId('test-run');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('boarding-api-check-ride');
    expect(rows[0].textContent).toContain('check ride');
    expect(rows[0].textContent).toContain('2.0.0-926d566');
    expect(rows[0].textContent).toContain('926d566');
    expect(rows[0].textContent).toContain('reach the service · passed');
    expect(rows[0].textContent).toContain('1m 12s');
    expect(rows[0].textContent).toContain('The run the qa release gate reads');
    expect(screen.getAllByText('⭳ Download JUnit report')).toHaveLength(1);
    expect(rows[1].textContent).toContain("team's test");
    expect(rows[1].textContent).toContain('unit · failed');
    expect(rows[1].textContent).toContain('not read by the release gate');
  });

  it('flags the aborted-but-passed race the backend corrected', () => {
    renderPanel([run({ statusNote: 'Testkube reported aborted although every step passed (known race)' })]);
    expect(screen.getByText('agent said aborted')).toBeTruthy();
  });

  it('explains an empty list and shows a read error', () => {
    renderPanel([]);
    expect(screen.getByText(/No test runs yet/)).toBeTruthy();
    renderPanel([], { error: '503 Service Unavailable' });
    expect(screen.getByText(/Couldn't read the test runs: 503/)).toBeTruthy();
  });

  it("opens the newest run's failed tests when it failed: the case, the assertion and where", async () => {
    renderPanel([run({ status: 'failed', role: 'test' }), run({ id: 'old', status: 'failed' })]);
    const list = await screen.findByTestId('test-failures');
    expect(list.textContent).toContain('✖ a scan returns the boarded count against the flight capacity');
    expect(list.textContent).toContain('assert.ok(body.capacity >= body.boarded)');
    expect(list.textContent).toContain('at TestContext.<anonymous> (/app/test/integration/boarding.test.js:76:10)');
    expect(list.textContent).not.toContain('node:internal');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('http://backend/api/glidepath/tests/report?id=6ad6&app=boarding-api');

    // An older failed run's on request.
    fireEvent.click(screen.getAllByText('failed tests')[1]);
    await waitFor(() => expect(screen.getAllByTestId('test-failures')).toHaveLength(2));
    expect(mockFetch).toHaveBeenLastCalledWith('http://backend/api/glidepath/tests/report?id=old&app=boarding-api');

    fireEvent.click(screen.getAllByText('full output')[0]);
    expect(screen.getByText(/ERR_TEST_FAILURE/)).toBeTruthy();
  });

  it('reads no report for a passed run, and says where to look when a failed run left none', () => {
    renderPanel([run(), run({ id: 'x', status: 'failed', hasReport: false })]);
    expect(screen.queryByText('failed tests')).toBeNull();
    expect(screen.getByText(/No JUnit report from this run/)).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('says so when the report has no failed case or cannot be read', async () => {
    mockFetch.mockImplementationOnce(async () => new Response('<testsuites><testcase name="a"/></testsuites>', { status: 200 }));
    renderPanel([run({ status: 'failed' })]);
    expect(await screen.findByText(/No failed test case in the report \(1 ran\)/)).toBeTruthy();

    mockFetch.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'no JUnit report for execution x' }), { status: 404 }));
    renderPanel([run({ id: 'x', status: 'failed' })]);
    expect(await screen.findByText(/Couldn't read the failed tests: no JUnit report/)).toBeTruthy();
  });
});

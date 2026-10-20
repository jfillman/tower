import { render, screen } from '@testing-library/react';
import { TestRunsPanel } from './TestRunsPanel';
import type { TestRun } from '../../useTestRuns';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: () => ({ getBaseUrl: async () => 'http://backend/api/glidepath', fetch: jest.fn() }),
}));

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
  render(<TestRunsPanel state={{ loading: false, runs, ...over }} />);

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
});

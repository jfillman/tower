import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiCompatSection } from './ApiCompatSection';
import { DeployedSpecsPanel } from './DeployedSpecsPanel';
import { API_SPEC_PREDICATE, findApiSpec } from './apiSpec';
import type { EnvSpec } from './useDeployedSpecs';

// Observed operations come from Prometheus; here, flight-api's route spans.
jest.mock('./useAirspace', () => ({
  useObservedOperations: () => ({
    loading: false,
    operations: [
      { name: 'GET /api/flights/{flightNumber}', rate: 0.5 },
      { name: 'GET', rate: 3 },
    ],
  }),
}));

const SPEC = (extra: Record<string, unknown> = {}) => ({
  openapi: '3.1.0',
  info: { title: 'flight-api', version: '1.0.0' },
  paths: {
    '/api/flights': { get: { summary: 'Every flight', responses: { '200': { description: 'ok' } } } },
    '/api/flights/{flightNumber}': { get: { summary: 'One flight', responses: { '200': { description: 'ok' } } } },
    ...extra,
  },
});

const envSpec = (env: string, spec: Record<string, unknown>, sha: string, verified = true): EnvSpec => ({
  app: 'flight-api',
  env,
  cluster: env === 'prod' ? 'hangar-prod' : 'hangar-dev',
  image: `ghcr.io/jfillman/flight-api:2.0.1-${sha}`,
  loading: false,
  digest: `sha256:${sha}000000`,
  spec: findApiSpec({
    digest: sha,
    attestations: [
      {
        predicateType: API_SPEC_PREDICATE,
        predicate: { apiType: 'openapi', path: 'openapi.yaml', sha256: sha, specVersion: '3.1.0', title: 'flight-api', version: '1.0.0', spec },
        verified,
        verificationCode: verified ? 'verified' : 'no-log-entry',
      },
    ],
  }),
});

describe('Deployed specs', () => {
  it('shows an environment’s signed spec, its operations and which were seen', () => {
    render(<DeployedSpecsPanel app="flight-api" envs={[envSpec('dev', SPEC(), 'aaa')]} win="1h" />);
    expect(screen.getByText('verified')).toBeTruthy();
    const rows = screen.getAllByRole('row').map(r => r.textContent ?? '');
    expect(rows.find(r => r.includes('/api/flights/{flightNumber}'))).toContain('/min');
    expect(rows.find(r => r.includes('Every flight'))).toContain('—');
    expect(screen.getByText(/nothing to compare yet/)).toBeTruthy();
  });

  it('never shows an unverified spec as verified', () => {
    render(<DeployedSpecsPanel app="flight-api" envs={[envSpec('dev', SPEC(), 'aaa', false)]} win="1h" />);
    expect(screen.queryByText('verified')).toBeNull();
    expect(screen.getByText('not logged')).toBeTruthy();
  });

  it('diffs dev against prod, breaking first, and opens on ?compare', () => {
    const prod = envSpec('prod', SPEC(), 'ppp');
    const devSpec = SPEC({ '/api/flights/{flightNumber}/delays': { get: { responses: { '200': { description: 'ok' } } } } });
    delete (devSpec.paths as Record<string, unknown>)['/api/flights'];
    render(<DeployedSpecsPanel app="flight-api" envs={[envSpec('dev', devSpec, 'ddd'), prod]} win="1h" compareTo="dev" />);
    expect(screen.getByRole('heading', { name: 'Diff prod → dev' })).toBeTruthy();
    const rows = screen.getAllByRole('row').map(r => r.textContent ?? '');
    const diffRows = rows.filter(r => /Removed|Added/.test(r));
    expect(diffRows[0]).toContain('Removed · breaking');
    expect(diffRows[0]).toContain('/api/flights');
    expect(diffRows[1]).toContain('Added');
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'hangar-prod/prod' } });
    expect(screen.getByText('Pick two different environments.')).toBeTruthy();
  });
});

describe('API compatibility on the Release Record', () => {
  const message = (json: unknown) => `<!-- glidepath:gate:api-compat -->\nreport\n<!-- glidepath:api-compat ${JSON.stringify(json)} -->`;
  const check = (json: unknown) => ({ name: 'Pipelines as Code CI / api-compat-', status: 'completed' as const, conclusion: 'neutral', message: message(json) });

  it('renders nothing when the release PR ran no api-compat check', () => {
    const { container } = render(<ApiCompatSection checks={[{ name: 'Pipelines as Code CI / provenance-', status: 'completed', conclusion: 'success' }]} />);
    expect(container.textContent).toBe('');
  });

  it('shows the verdict, each breaking change with its usage, and an accepted override', () => {
    render(
      <MemoryRouter>
        <ApiCompatSection
          appName="flight-api"
          checks={[
            check({
              version: 1,
              verdict: 'overridden',
              env: 'prod',
              baseline: { version: '1.0.0', specSha256: 'aaaa' },
              candidate: { version: '1.1.0', specSha256: 'bbbb' },
              breaking: [
                { id: 'x', level: 'error', text: 'removed the path', operation: { method: 'GET', path: '/api/whoami' }, inUse: true, rate: 0.5 },
                { id: 'y', level: 'error', text: 'removed a field', inUse: null, rate: null },
              ],
              nonBreakingCount: 1,
              usage: { source: 'prometheus', window: '7d', callers: ['boarding-api'] },
              override: { by: 'jfillman', reason: 'clients moved' },
            }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Breaking · accepted')).toBeTruthy();
    expect(screen.getByText(/accepted by jfillman: clients moved/)).toBeTruthy();
    const rows = screen.getAllByRole('row').map(r => r.textContent ?? '');
    expect(rows.find(r => r.includes('/api/whoami'))).toContain('/min');
    expect(rows.find(r => r.includes('removed a field'))).toContain('unknown');
    expect(screen.getByText('Spec diff in Contracts →')).toBeTruthy();
  });

  it('says so when the comment carries no readable report', () => {
    render(
      <MemoryRouter>
        <ApiCompatSection checks={[{ name: 'Pipelines as Code CI / api-compat-', status: 'in_progress' }]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/is running but its comment carries no report/)).toBeTruthy();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { ClusterCheckPicker } from './ClusterCheckPicker';
import { CATALOG_CHECKS, checkArgs } from './analysisCatalog';

const ctx = { app: 'boarding-api', namespace: 'app-boarding-api-staging' };

// What Prometheus answers, by the check whose data query it is.
let answer: Record<string, 'found' | 'none' | 'unreachable'> = {};
jest.mock('../usePrometheusQuery', () => ({
  usePrometheusInstantQuery: (_cluster: string | undefined, query: string | undefined) => {
    if (!query) return { loading: false, samples: [] };
    const check = CATALOG_CHECKS.find(c => query === c.dataQuery(ctx));
    const a = (check && answer[check.name]) ?? 'found';
    if (a === 'unreachable') return { loading: false, error: 'service not found', samples: [] };
    return { loading: false, samples: a === 'found' ? [{ metric: {}, time: 0, value: 3 }] : [] };
  },
}));

const add = (name: string) => screen.getByRole('button', { name: `Add cluster check ${name}` }) as HTMLButtonElement;

beforeEach(() => {
  answer = {};
});

describe('ClusterCheckPicker', () => {
  it('offers a catalog check only when its metric has data', () => {
    answer = { 'error-rate-check': 'none', 'latency-check': 'unreachable' };
    render(
      <ClusterCheckPicker
        templates={['pod-health-check', 'error-rate-check', 'latency-check']}
        ctx={ctx}
        cluster="kind-dev"
        inUse={[]}
        onAdd={() => {}}
      />,
    );
    expect(add('pod-health-check').disabled).toBe(false);
    expect(add('error-rate-check').disabled).toBe(true);
    expect(screen.getByText(/needs Traefik request metrics/)).toBeTruthy();
    expect(add('latency-check').disabled).toBe(true);
    expect(screen.getByText('cannot check')).toBeTruthy();
  });

  it('allows a template outside the catalog, marked not checked, and not one a step already uses', () => {
    const onAdd = jest.fn();
    render(
      <ClusterCheckPicker templates={['team-smoke', 'no-oom-check']} ctx={ctx} cluster="kind-dev" inUse={['no-oom-check']} onAdd={onAdd} />,
    );
    expect(screen.getByText('not checked')).toBeTruthy();
    fireEvent.click(add('team-smoke'));
    expect(onAdd).toHaveBeenCalledWith('team-smoke');
    expect(add('no-oom-check').disabled).toBe(true);
  });

  it('says so when the cluster list could not be read', () => {
    render(<ClusterCheckPicker templates={undefined} ctx={ctx} cluster="kind-prod" inUse={[]} onAdd={() => {}} />);
    expect(screen.getByText(/could not read this cluster/)).toBeTruthy();
  });

  it('passes the namespace and app every catalog template takes', () => {
    expect(checkArgs(ctx)).toEqual([
      { name: 'namespace', value: 'app-boarding-api-staging' },
      { name: 'app', value: 'boarding-api' },
    ]);
  });
});

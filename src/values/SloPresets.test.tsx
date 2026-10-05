import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SloPresets } from './SloPresets';
import { SLO_PRESETS } from './sloCatalog';

// What Prometheus answers, by the preset whose query it is: found, none (empty result) or unreachable (error).
let answer: Record<string, 'found' | 'none' | 'unreachable' | 'checking'> = {};
jest.mock('../usePrometheusQuery', () => ({
  usePrometheusInstantQuery: (_cluster: string, query: string) => {
    const preset = SLO_PRESETS.find(p => query === p.dataQuery({ app: 'boarding-api', namespace: 'app-boarding-api-staging' }));
    const a = (preset && answer[preset.id]) ?? 'found';
    if (a === 'checking') return { loading: true, samples: [] };
    if (a === 'unreachable') return { loading: false, error: 'service not found', samples: [] };
    return { loading: false, samples: a === 'found' ? [{ metric: {}, time: 0, value: 4 }] : [] };
  },
}));

const ctx = { app: 'boarding-api', namespace: 'app-boarding-api-staging' };

function Harness({ initial = '' }: { initial?: string }) {
  const [text, setText] = useState(initial);
  return (
    <>
      <SloPresets ctx={ctx} cluster="kind-dev" text={text} onChange={setText} />
      <pre data-testid="yaml">{text}</pre>
    </>
  );
}
const yaml = () => screen.getByTestId('yaml').textContent ?? '';
const sw = (title: string) => screen.getByRole('checkbox', { name: `SLO ${title}` }) as HTMLInputElement;

beforeEach(() => {
  answer = {};
});

describe('SloPresets', () => {
  it('lists the presets with their data state, and says why request SLOs are not offered', () => {
    render(<Harness />);
    for (const p of SLO_PRESETS) expect(screen.getByText(p.title)).toBeTruthy();
    expect(screen.getAllByText('data found')).toHaveLength(SLO_PRESETS.length);
    expect(screen.getByText(/Request success and latency SLOs need request metrics/)).toBeTruthy();
  });

  it('turning one on writes its entry to the YAML, and off removes only that entry', () => {
    render(<Harness />);
    fireEvent.click(sw('Readiness availability'));
    fireEvent.click(sw('Liveness availability'));
    expect(yaml()).toContain('name: boarding-api-readiness-availability');
    expect(yaml()).toContain('name: boarding-api-liveness-availability');
    expect(sw('Readiness availability').checked).toBe(true);
    fireEvent.click(sw('Readiness availability'));
    expect(yaml()).not.toContain('readiness-availability');
    expect(yaml()).toContain('liveness-availability');
  });

  it('shows one already in the file as on, and keeps the entries it did not write', () => {
    render(<Harness initial={'- name: custom\n  service: boarding-api\n  objective: 90\n- name: boarding-api-readiness-availability\n  service: boarding-api\n  objective: 99'} />);
    expect(sw('Readiness availability').checked).toBe(true);
    expect(sw('Liveness availability').checked).toBe(false);
    fireEvent.click(sw('Readiness availability'));
    expect(yaml()).toContain('name: custom');
  });

  it('will not turn one on when the metric has no data yet, and says so', () => {
    answer = { 'health-check-latency': 'none' };
    render(<Harness />);
    expect(sw('Health check latency').disabled).toBe(true);
    expect(sw('Readiness availability').disabled).toBe(false);
    expect(screen.getByText('no data yet')).toBeTruthy();
    expect(screen.getByText(/No data yet for this workload on kind-dev/)).toBeTruthy();
  });

  it('will not turn one on when Prometheus cannot be reached (kind-prod runs none), and says it cannot tell', () => {
    answer = { 'readiness-availability': 'unreachable', 'liveness-availability': 'unreachable', 'health-check-latency': 'unreachable' };
    render(<Harness />);
    for (const p of SLO_PRESETS) expect(sw(p.title).disabled).toBe(true);
    expect(screen.getAllByText('cannot check')).toHaveLength(SLO_PRESETS.length);
    expect(screen.getAllByText(/could not reach Prometheus on kind-dev/).length).toBeGreaterThan(0);
  });

  it('still lets one that is already on be turned off, whatever Prometheus says', () => {
    answer = { 'readiness-availability': 'unreachable' };
    render(<Harness initial={'- name: boarding-api-readiness-availability\n  service: boarding-api\n  objective: 99'} />);
    expect(sw('Readiness availability').disabled).toBe(false);
    fireEvent.click(sw('Readiness availability'));
    expect(yaml()).toBe('');
  });

  it('waits while checking, and refuses to edit YAML that is not a list', () => {
    answer = { 'readiness-availability': 'checking' };
    const { unmount } = render(<Harness />);
    expect(sw('Readiness availability').disabled).toBe(true);
    expect(within(screen.getByText('Readiness availability').parentElement as HTMLElement).getByText('checking')).toBeTruthy();
    unmount();
    answer = {};
    render(<Harness initial="not: a list" />);
    expect(sw('Liveness availability').disabled).toBe(true);
    expect(screen.getAllByText(/is not a list, so this cannot edit it/).length).toBeGreaterThan(0);
  });
});

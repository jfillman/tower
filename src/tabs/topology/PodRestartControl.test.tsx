import { act, fireEvent, render, screen } from '@testing-library/react';
import { PodRestartControl } from './PodRestartControl';
import type { EnvironmentSummary } from '../../types';

let mockCaps: { data?: Record<string, unknown> } = { data: { podRestart: true } };
jest.mock('../../useReleaseData', () => ({ ...jest.requireActual('../../useReleaseData'), useArgoCapabilities: () => mockCaps }));
let responses: Array<{ status: number; body: unknown }> = [];
const posts: unknown[] = [];
const mockFetch = jest.fn(async (_url: string, init?: RequestInit) => {
  posts.push(JSON.parse(String(init?.body)));
  const r = responses.shift() ?? { status: 200, body: { ok: true } };
  return { ok: r.status < 300, status: r.status, json: async () => r.body };
});
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) => (ref.id === 'core.discovery' ? { getBaseUrl: async () => 'http://be/api/glidepath' } : { fetch: mockFetch }),
}));

const env = { env: 'dev', cluster: 'kind-dev', namespace: 'app-sky-marshall-dev', argoAppName: 'sky-marshall-dev' } as EnvironmentSummary;
const renderIt = () => render(<PodRestartControl env={env} podName="sky-marshall-abc" buttonClass="b" noteClass="n" badClass="x" />);

beforeEach(() => {
  posts.length = 0;
  responses = [];
  mockCaps = { data: { podRestart: true } };
});

describe('PodRestartControl', () => {
  it('confirms, then asks Argo CD to restart the pod', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Restart pod' }));
    expect(screen.getByTestId('pod-restart-confirm').textContent).toContain('skips the PodDisruptionBudget');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart' })));
    expect(posts[0]).toEqual({ cluster: 'kind-dev', appName: 'sky-marshall-dev', namespace: 'app-sky-marshall-dev', podName: 'sky-marshall-abc' });
    expect(screen.getByText(/replacement will appear/)).toBeTruthy();
  });

  it('asks again, naming the downtime, for the last ready pod on Ground', async () => {
    responses = [{ status: 409, body: { error: 'sky-marshall-abc is the last ready pod of ReplicaSet/rs.', canAcceptDowntime: true } }];
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Restart pod' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart' })));
    expect(screen.getByTestId('pod-restart-confirm').textContent).toContain('last ready pod');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart anyway' })));
    expect(posts[1]).toMatchObject({ acceptDowntime: true });
  });

  it('shows the refusal for the last ready pod on Flight', async () => {
    responses = [{ status: 409, body: { error: 'On a Flight environment use Restart pods on the Rollout.', canAcceptDowntime: false } }];
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Restart pod' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restart' })));
    expect(screen.getByText(/use Restart pods on the Rollout/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restart anyway' })).toBeNull();
  });

  it('is disabled, with the reason, for someone who may not', () => {
    mockCaps = { data: { podRestart: false } };
    renderIt();
    const b = screen.getByRole('button', { name: 'Restart pod' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/owning team/);
  });
});

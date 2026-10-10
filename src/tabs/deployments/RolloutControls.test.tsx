import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RolloutControls } from './RolloutControls';

let mockList: unknown;
const calls: Array<{ url: string; init?: RequestInit }> = [];
const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  if (init?.method === 'POST') {
    const action = JSON.parse(String(init.body)).action;
    return { ok: true, json: async () => ({ ok: true, bypass: action === 'promote-full' }) };
  }
  return { ok: true, json: async () => mockList };
});
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) =>
    ref.id === 'core.discovery' ? { getBaseUrl: async () => 'http://be/api/glidepath' } : { fetch: mockFetch },
}));

const action = (name: string, over: Partial<{ disabled: boolean; allowed: boolean; bypass: boolean }> = {}) => ({
  name,
  disabled: false,
  allowed: true,
  bypass: false,
  ...over,
});

const renderControls = () =>
  render(<RolloutControls cluster="kind-prod" argoAppName="sky-marshall-staging" namespace="app-sky-marshall-staging" rolloutName="sky-marshall" />);

beforeEach(() => {
  calls.length = 0;
  mockFetch.mockClear();
});

describe('RolloutControls', () => {
  it('asks for the Rollout by Argo CD app, namespace and name, and shows the buttons in a fixed order', async () => {
    mockList = {
      tier: 'flight',
      actions: [action('restart'), action('abort'), action('resume', { disabled: true }), action('promote-full', { bypass: true })],
    };
    renderControls();
    await screen.findByText('Abort');
    expect(calls[0].url).toBe(
      'http://be/api/glidepath/argo/rollout-actions?cluster=kind-prod&appName=sky-marshall-staging&namespace=app-sky-marshall-staging&rolloutName=sky-marshall',
    );
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Resume', 'Promote full ⚠', 'Abort', 'Restart pods']);
    expect((screen.getByText('Resume').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables everything and says why when the user does not own the app', async () => {
    mockList = { tier: 'ground', actions: [action('restart', { allowed: false }), action('abort', { allowed: false })] };
    renderControls();
    await screen.findByText(/Only the app's owning team/);
    for (const b of screen.getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('confirms a bypass, naming it, before posting it', async () => {
    mockList = { tier: 'flight', actions: [action('promote-full', { bypass: true })] };
    renderControls();
    fireEvent.click(await screen.findByText('Promote full ⚠'));
    expect(screen.getByText(/recorded and announced to everyone, like a break-glass bypass/)).toBeTruthy();
    expect(calls.filter(c => c.init?.method === 'POST')).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getAllByText('Promote full').find(e => e.closest('button'))!);
    });
    const post = calls.find(c => c.init?.method === 'POST')!;
    expect(post.url).toBe('http://be/api/glidepath/argo/rollout-action');
    expect(JSON.parse(String(post.init!.body))).toEqual({
      cluster: 'kind-prod',
      appName: 'sky-marshall-staging',
      namespace: 'app-sky-marshall-staging',
      rolloutName: 'sky-marshall',
      action: 'promote-full',
    });
    await waitFor(() => expect(screen.getByText(/Recorded as a bypass and announced/)).toBeTruthy());
  });

  it('runs a non-destructive action straight away', async () => {
    mockList = { tier: 'ground', actions: [action('pause')] };
    renderControls();
    const pause = await screen.findByText('Pause');
    await act(async () => {
      fireEvent.click(pause);
    });
    expect(calls.some(c => c.init?.method === 'POST' && JSON.parse(String(c.init.body)).action === 'pause')).toBe(true);
  });
});

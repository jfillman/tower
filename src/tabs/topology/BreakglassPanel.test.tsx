import { act, fireEvent, render, screen } from '@testing-library/react';
import { BreakglassPanel } from './BreakglassPanel';
import type { EnvironmentSummary } from '../../types';

jest.mock('@xterm/xterm', () => ({
  Terminal: jest.fn().mockImplementation(() => ({
    loadAddon: jest.fn(),
    open: jest.fn(),
    focus: jest.fn(),
    write: jest.fn(),
    dispose: jest.fn(),
    onData: () => ({ dispose: jest.fn() }),
    onResize: () => ({ dispose: jest.fn() }),
    cols: 80,
    rows: 24,
  })),
}));
jest.mock('@xterm/addon-fit', () => ({ FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })) }));
jest.mock('@xterm/xterm/css/xterm.css', () => ({}), { virtual: true });

const calls: Array<{ url: string; init?: RequestInit }> = [];
let listBody: unknown = { sessions: [], user: 'user:development/skyport-dev', recordingsConfigured: true };
let postResponse: { status: number; body: unknown } = { status: 200, body: {} };
const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  const r = init?.method === 'POST' ? postResponse : { status: 200, body: listBody };
  return { ok: r.status < 300, status: r.status, json: async () => r.body };
});
// Stable objects, like the real useApi: the panel's load effect depends on them.
const mockApis: Record<string, unknown> = {
  'core.discovery': { getBaseUrl: async () => 'http://be/api/glidepath' },
  'core.identity': { getCredentials: async () => ({ token: 't' }) },
  'core.fetch': { fetch: (url: string, init?: RequestInit) => mockFetch(url, init) },
};
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) => mockApis[ref.id] ?? mockApis['core.fetch'],
}));
class FakeResizeObserver {
  observe() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
class FakeWebSocket {
  static OPEN = 1;
  readyState = 0;
  constructor(readonly url: string, readonly protocol: string) {
    sockets.push(this);
  }
  send() {}
  close() {}
}
const sockets: FakeWebSocket[] = [];
(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;

const env = { env: 'dev', cluster: 'kind-dev', namespace: 'app-sky-marshall-dev', appName: 'sky-marshall' } as EnvironmentSummary;
const renderIt = async (tier: 'lower' | 'upper' | 'preview' = 'lower') => {
  await act(async () => {
    render(<BreakglassPanel env={env} podName="sky-marshall-abc" containers={['sky-marshall']} tier={tier} />);
  });
};

beforeEach(() => {
  calls.length = 0;
  sockets.length = 0;
  listBody = { sessions: [], user: 'user:development/skyport-dev', recordingsConfigured: true };
  postResponse = { status: 200, body: {} };
});

describe('BreakglassPanel', () => {
  it('refuses Flight without offering a session', async () => {
    await renderIt('upper');
    expect(screen.getByText(/Ground environments only/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start recorded session/ })).toBeNull();
  });

  it('needs a reason, then opens a copy-mode session and attaches with the user token as the subprotocol', async () => {
    postResponse = {
      status: 200,
      body: { id: 'abc123def456', expiresAt: new Date(Date.now() + 900_000).toISOString(), session: { id: 'abc123def456', mode: 'copy', pod: 'sky-marshall-abc', expiresAt: new Date(Date.now() + 900_000).toISOString(), state: 'active', requester: 'user:development/skyport-dev', processAccess: false } },
    };
    await renderIt();
    const start = screen.getByRole('button', { name: /Start recorded session/ }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'DNS lookups time out' } });
    expect(start.disabled).toBe(false);
    await act(async () => fireEvent.click(start));
    const post = calls.find(c => c.init?.method === 'POST')!;
    expect(post.url).toBe('http://be/api/glidepath/breakglass/sessions');
    expect(JSON.parse(String(post.init!.body))).toMatchObject({
      appName: 'sky-marshall',
      env: 'dev',
      cluster: 'kind-dev',
      namespace: 'app-sky-marshall-dev',
      podName: 'sky-marshall-abc',
      mode: 'copy',
      processAccess: false,
      recycleLastPod: false,
      durationMinutes: 15,
      reason: 'DNS lookups time out',
    });
    expect(screen.getByText(/Recorded break-glass session/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'End session' })).toBeTruthy();
    expect(sockets[0].url).toBe('ws://be/api/glidepath/breakglass/sessions/abc123def456/attach');
    expect(sockets[0].protocol).toBe('t');
  });

  it('offers process access and the last-pod restart only in live mode, and warns the pod restarts', async () => {
    await renderIt();
    expect(screen.queryByText(/Process access to/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /^The live pod/ }));
    expect(screen.getByText(/Process access to/)).toBeTruthy();
    expect(screen.getByText(/even if it is the only ready one/)).toBeTruthy();
  });

  it('says so when recordings are not configured, and does not allow a start', async () => {
    listBody = { sessions: [], user: 'u', recordingsConfigured: false };
    await renderIt();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'x' } });
    expect(screen.getByText(/Recordings are not configured/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Start recorded session/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a backend refusal', async () => {
    postResponse = { status: 403, body: { error: 'Flight needs approval (not built yet)' } };
    await renderIt();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'x' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Start recorded session/ })));
    expect(screen.getByText('Flight needs approval (not built yet)')).toBeTruthy();
  });
});

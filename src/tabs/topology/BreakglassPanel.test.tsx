import { act, fireEvent, render, screen } from '@testing-library/react';
import { BreakglassPanel } from './BreakglassPanel';
import type { EnvironmentSummary } from '../../types';

const mockWrite = jest.fn();
jest.mock('@xterm/xterm', () => ({
  Terminal: jest.fn().mockImplementation(() => ({
    loadAddon: jest.fn(),
    open: jest.fn(),
    focus: jest.fn(),
    write: mockWrite,
    reset: jest.fn(),
    resize: jest.fn(),
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
let recording = '';
const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  if (url.includes('/recording')) {
    const bytes = Buffer.from(recording);
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }
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
  mockWrite.mockClear();
  listBody = { sessions: [], user: 'user:development/skyport-dev', recordingsConfigured: true };
  postResponse = { status: 200, body: {} };
});

const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const flightRow = (over: Record<string, unknown>) => ({
  id: 'f1', app: 'sky-marshall', env: 'dev', pod: 'sky-marshall-abc', container: 'sky-marshall', mode: 'live', processAccess: true,
  volumeAccess: false, reason: 'hung connection', requester: 'user:development/skyport-dev', createdAt: at(-1), expiresAt: at(29),
  state: 'requested', tier: 'flight', durationMinutes: 30, ...over,
});

describe('BreakglassPanel', () => {
  it('treats a preview environment like Ground: opens at once, no approval', async () => {
    await renderIt('preview');
    expect(screen.getByRole('button', { name: 'Start recorded session' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Request approval' })).toBeNull();
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
      volumeAccess: false,
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

  it('offers volume access in both modes, sends it, and lists the mounted volumes on the session', async () => {
    const expiresAt = new Date(Date.now() + 900_000).toISOString();
    postResponse = {
      status: 200,
      body: {
        id: 'v1',
        expiresAt,
        session: {
          id: 'v1', mode: 'copy', pod: 'sky-marshall-abc', container: 'sky-marshall', expiresAt, state: 'active', requester: 'u', processAccess: false,
          volumeAccess: true,
          volumes: [{ volume: 'config', kind: 'configMap', path: '/pod-volumes/config', appPaths: ['/etc/app'] }],
        },
      },
    };
    await renderIt();
    fireEvent.click(screen.getByRole('checkbox', { name: /Volume access/ }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'what config did it get' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Start recorded session/ })));
    expect(JSON.parse(String(calls.find(c => c.init?.method === 'POST')!.init!.body))).toMatchObject({ mode: 'copy', volumeAccess: true });
    expect(screen.getByText(/with volume access/)).toBeTruthy();
    expect(screen.getByTestId('breakglass-volumes').textContent).toContain('/pod-volumes/config');
    expect(screen.getByTestId('breakglass-volumes').textContent).toContain('in the app: /etc/app');
  });

  it('says file access through process access needs the same non-root user', async () => {
    await renderIt();
    fireEvent.click(screen.getByRole('radio', { name: /^The live pod/ }));
    expect(screen.getByText(/readable only when the app runs as the same non-root user/)).toBeTruthy();
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

describe('BreakglassPanel on Flight (phase 3)', () => {
  it('asks for approval instead of opening, and never offers the last-pod restart', async () => {
    postResponse = { status: 200, body: { id: 'f1', state: 'requested', session: flightRow({}) } };
    await renderIt('upper');
    fireEvent.click(screen.getByRole('radio', { name: /^The live pod/ }));
    expect(screen.queryByText(/even if it is the only ready one/)).toBeNull();
    expect(screen.getByText(/never restarted for you/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'hung connection' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Request approval' })));
    expect(JSON.parse(String(calls.find(c => c.init?.method === 'POST')!.init!.body))).toMatchObject({ mode: 'live', recycleLastPod: false });
    expect(screen.getByText(/Request sent/)).toBeTruthy();
    expect(screen.queryByText('Recorded break-glass session')).toBeNull();
    expect(sockets).toHaveLength(0);
  });

  it('shows the requester their pending request, with Withdraw', async () => {
    listBody = { sessions: [flightRow({})], user: 'user:development/skyport-dev', recordingsConfigured: true };
    await renderIt('upper');
    expect(screen.getByTestId('breakglass-awaiting').textContent).toContain('Waiting for approval');
    expect(screen.queryByTestId('breakglass-to-decide')).toBeNull(); // never asked to decide their own
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Withdraw' })));
    expect(calls.find(c => c.init?.method === 'POST')!.url).toBe('http://be/api/glidepath/breakglass/sessions/f1/end');
  });

  it('lets the requester start an approved session, which opens the terminal', async () => {
    listBody = { sessions: [flightRow({ state: 'approved', approver: 'user:default/jfillman', expiresAt: at(9) })], user: 'user:development/skyport-dev', recordingsConfigured: true };
    postResponse = { status: 200, body: { session: flightRow({ state: 'active', expiresAt: at(30) }) } };
    await renderIt('upper');
    expect(screen.getByTestId('breakglass-approved').textContent).toContain('Approved by jfillman');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start recorded session' })));
    expect(calls.find(c => c.init?.method === 'POST')!.url).toBe('http://be/api/glidepath/breakglass/sessions/f1/start');
    expect(screen.getByText(/Recorded break-glass session/)).toBeTruthy();
    expect(sockets[0].url).toContain('/breakglass/sessions/f1/attach');
  });

  it('asks a second person to decide, and sends their note', async () => {
    listBody = { sessions: [flightRow({})], user: 'user:default/jfillman', recordingsConfigured: true };
    await renderIt('upper');
    const box = screen.getByTestId('breakglass-to-decide');
    expect(box.textContent).toContain('skyport-dev asks for a 30-minute live session');
    expect(box.textContent).toContain('with process access');
    fireEvent.change(screen.getByLabelText('Note for f1'), { target: { value: 'ok, INC-42' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Approve' })));
    const post = calls.find(c => c.init?.method === 'POST')!;
    expect(post.url).toBe('http://be/api/glidepath/breakglass/sessions/f1/approve');
    expect(JSON.parse(String(post.init!.body))).toEqual({ note: 'ok, INC-42' });
  });
});

describe('the one free extension', () => {
  it('offers Extend +15 min once, and shows the session as extended', async () => {
    const start = { id: 'e1', mode: 'copy', pod: 'sky-marshall-abc', expiresAt: at(5), state: 'active', requester: 'u', processAccess: false };
    postResponse = { status: 200, body: { id: 'e1', session: start } };
    await renderIt();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'x' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Start recorded session/ })));
    postResponse = { status: 200, body: { session: { ...start, expiresAt: at(20), extendedAt: at(0) } } };
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Extend +15 min' })));
    expect(calls.filter(c => c.init?.method === 'POST').at(-1)!.url).toBe('http://be/api/glidepath/breakglass/sessions/e1/extend');
    expect(screen.getByText(/\(extended\)/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Extend +15 min' })).toBeNull();
  });
});

describe('glass broken and its review (phase 4)', () => {
  const ended = flightRow({
    id: 'g1', state: 'ended', requester: 'user:default/jfillman', glassBroken: true, reviewState: 'due', endedAt: at(-1),
    recordingKey: 'sky-marshall/dev/g1.cast', recordingSha256: 'abc', recordingExpiresAt: at(60 * 24 * 365),
  });

  it('offers breaking the glass on Flight only to someone who may, and sends it', async () => {
    listBody = { sessions: [], user: 'user:default/jfillman', recordingsConfigured: true, canBreakGlass: true, canReview: true };
    postResponse = { status: 200, body: { id: 'g2', session: { id: 'g2', mode: 'copy', pod: 'sky-marshall-abc', expiresAt: at(15), state: 'active', requester: 'u', processAccess: false, glassBroken: true } } };
    await renderIt('upper');
    expect(screen.getByRole('button', { name: 'Request approval' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Break glass/ }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'prod down, nobody reachable' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Break glass and start' })));
    expect(JSON.parse(String(calls.find(c => c.init?.method === 'POST')!.init!.body))).toMatchObject({ glassBroken: true });
    expect(screen.getByRole('status').textContent).toContain('Glass broken: no second person, review due');
  });

  it('does not offer it to an owner without the grant', async () => {
    listBody = { sessions: [], user: 'user:default/riley-roooo', recordingsConfigured: true, canBreakGlass: false, canReview: true };
    await renderIt('upper');
    expect(screen.queryByTestId('breakglass-glass-broken')).toBeNull();
  });

  it('never on Ground, where there is no second person to skip', async () => {
    listBody = { sessions: [], user: 'user:default/jfillman', recordingsConfigured: true, canBreakGlass: true };
    await renderIt('lower');
    expect(screen.queryByTestId('breakglass-glass-broken')).toBeNull();
  });

  it('asks someone else to review an ended glass-broken session, with a required note', async () => {
    listBody = { sessions: [ended], user: 'user:default/riley-roooo', recordingsConfigured: true, canReview: true };
    await renderIt('upper');
    expect(screen.getByText('glass broken')).toBeTruthy();
    expect(screen.getByText('review due')).toBeTruthy();
    const mark = screen.getByRole('button', { name: 'Mark reviewed' }) as HTMLButtonElement;
    expect(mark.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Review note for g1'), { target: { value: 'watched it; justified, INC-7' } });
    await act(async () => fireEvent.click(mark));
    const post = calls.find(c => c.init?.method === 'POST')!;
    expect(post.url).toBe('http://be/api/glidepath/breakglass/sessions/g1/review');
    expect(JSON.parse(String(post.init!.body))).toEqual({ note: 'watched it; justified, INC-7' });
  });

  it('never asks the person who broke the glass to review it', async () => {
    listBody = { sessions: [ended], user: 'user:default/jfillman', recordingsConfigured: true, canReview: true };
    await renderIt('upper');
    expect(screen.getByText('review due')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
  });

  it('shows who reviewed it', async () => {
    listBody = {
      sessions: [{ ...ended, reviewState: 'done', reviewedBy: 'user:default/riley-roooo', reviewNote: 'ok' }],
      user: 'user:default/riley-roooo', recordingsConfigured: true, canReview: true,
    };
    await renderIt('upper');
    expect(screen.getByText('reviewed by riley-roooo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
  });
});

describe('the recording player', () => {
  it('loads the recording as a play (audited), and replays the output to the end on a seek', async () => {
    recording = [
      JSON.stringify({ version: 2, width: 80, height: 24, timestamp: 1760000000 }),
      JSON.stringify([0.2, 'o', '$ ']),
      JSON.stringify([0.5, 'i', 'id\r']),
      JSON.stringify([0.6, 'o', 'uid=65532\r\n']),
    ].join('\n');
    listBody = {
      sessions: [flightRow({ id: 'r1', state: 'ended', recordingKey: 'k', recordingSha256: 'whatever', endedAt: at(-1) })],
      user: 'user:default/riley-roooo', recordingsConfigured: true,
    };
    await renderIt('upper');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'play' })));
    expect(calls.some(c => c.url === 'http://be/api/glidepath/breakglass/sessions/r1/recording?purpose=play')).toBe(true);
    const player = screen.getByTestId('breakglass-player');
    expect(player.textContent).toContain('1 keystroke events');
    // jsdom cannot hash (no crypto.subtle), and says so rather than claiming a match.
    expect(player.textContent).toContain('integrity not checked');
    await act(async () => fireEvent.change(screen.getByLabelText('Seek'), { target: { value: '99' } }));
    expect(mockWrite).toHaveBeenLastCalledWith('$ uid=65532\r\n');
  });
});

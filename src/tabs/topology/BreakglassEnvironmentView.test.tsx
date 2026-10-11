import { act, fireEvent, render, screen } from '@testing-library/react';
import { BreakglassEnvironmentCard } from './BreakglassEnvironmentView';
import { needsYou, type BreakglassSession } from './breakglassShared';
import type { EnvironmentSummary } from '../../types';

jest.mock('@xterm/xterm', () => ({
  Terminal: jest.fn().mockImplementation(() => ({
    loadAddon: jest.fn(),
    open: jest.fn(),
    focus: jest.fn(),
    write: jest.fn(),
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
let listBody: unknown = { sessions: [], user: 'user:default/riley-roooo', recordingsConfigured: true };
let byId: Record<string, unknown> = {};
let postResponse: { status: number; body: unknown } = { status: 200, body: {} };
const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  if (url.includes('/recording')) {
    const bytes = Buffer.from('{"version":2,"width":80,"height":24}\n[0.1,"o","hi"]\n');
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }
  const one = url.match(/\/sessions\/([a-z0-9]+)$/);
  if (one && !init?.method) {
    const session = byId[one[1]];
    return { ok: !!session, status: session ? 200 : 404, json: async () => (session ? { session } : { error: 'no such session' }) };
  }
  const r = init?.method === 'POST' ? postResponse : { status: 200, body: listBody };
  return { ok: r.status < 300, status: r.status, json: async () => r.body };
});
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
Element.prototype.scrollIntoView = jest.fn();

// The environment has moved on: its only pod is sky-marshall-new; the sessions below were on sky-marshall-old.
const env = { env: 'prod', cluster: 'kind-prod', namespace: 'app-sky-marshall-prod', appName: 'sky-marshall', pods: [{ name: 'sky-marshall-new' }] } as unknown as EnvironmentSummary;
const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const row = (over: Partial<BreakglassSession>): BreakglassSession => ({
  id: 'k3j9m2p7q1r5', app: 'sky-marshall', env: 'prod', pod: 'sky-marshall-old', container: 'sky-marshall', mode: 'live', processAccess: false,
  volumeAccess: false, reason: 'hung connection', requester: 'user:default/jfillman', createdAt: at(-30), expiresAt: at(30),
  state: 'ended', tier: 'flight', durationMinutes: 30, endedAt: at(-1), endReason: 'ended by user', recycled: true,
  recordingKey: 'sky-marshall/prod/k3j9m2p7q1r5.cast', recordingSha256: 'abc', ...over,
});
const renderCard = async (linkedSessionId?: string) => {
  await act(async () => {
    render(<BreakglassEnvironmentCard env={env} tier="upper" linkedSessionId={linkedSessionId} />);
  });
};

beforeEach(() => {
  calls.length = 0;
  sockets.length = 0;
  byId = {};
  listBody = { sessions: [], user: 'user:default/riley-roooo', recordingsConfigured: true };
  postResponse = { status: 200, body: {} };
});

describe('needsYou (the card badge)', () => {
  const me = { user: 'user:default/riley-roooo', canReview: true };
  it('counts a request to decide, my approved request, and a review I can do; nothing of my own to decide', () => {
    const rows = [
      row({ id: 'a', state: 'requested' }),
      row({ id: 'b', state: 'requested', requester: me.user }),
      row({ id: 'c', state: 'approved', requester: me.user }),
      row({ id: 'd', state: 'approved' }),
      row({ id: 'e', glassBroken: true, reviewState: 'due' }),
      row({ id: 'f', glassBroken: true, reviewState: 'due', requester: me.user }),
      row({ id: 'g', glassBroken: true, reviewState: 'done' }),
    ];
    expect(needsYou(rows, me)).toBe(3);
    expect(needsYou(rows, { ...me, canReview: false })).toBe(1);
    expect(needsYou(rows, {})).toBe(0);
  });
});

describe('BreakglassEnvironmentCard', () => {
  it('lists a session whose pod is gone (recycled), with its recording playable', async () => {
    listBody = { sessions: [row({})], user: 'user:default/riley-roooo', recordingsConfigured: true };
    await renderCard();
    const r = screen.getByTestId('breakglass-session-k3j9m2p7q1r5');
    expect(r.textContent).toContain('sky-marshall-old');
    expect(r.textContent).toContain('pod restarted');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'play' })));
    expect(screen.getByTestId('breakglass-player')).toBeTruthy();
    expect(calls.some(c => c.url.endsWith('/sessions/k3j9m2p7q1r5/recording?purpose=play'))).toBe(true);
  });

  it('shows the badge for a request to decide, and sends the decision', async () => {
    listBody = { sessions: [row({ state: 'requested', endedAt: undefined })], user: 'user:default/riley-roooo', recordingsConfigured: true, canReview: true };
    await renderCard();
    expect(screen.getByTestId('breakglass-needs-you').textContent).toBe('1');
    expect(screen.getByTestId('breakglass-to-decide').textContent).toContain('jfillman asks for a 30-minute live session');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Deny' })));
    expect(calls.find(c => c.init?.method === 'POST')!.url).toBe('http://be/api/glidepath/breakglass/sessions/k3j9m2p7q1r5/deny');
  });

  it('shows the badge for a review I can do, and none for one I cannot', async () => {
    listBody = { sessions: [row({ glassBroken: true, reviewState: 'due' })], user: 'user:default/riley-roooo', recordingsConfigured: true, canReview: true };
    await renderCard();
    expect(screen.getByTestId('breakglass-needs-you').textContent).toBe('1');
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeTruthy();
  });

  it('no badge when nothing needs me', async () => {
    listBody = { sessions: [row({})], user: 'user:default/riley-roooo', recordingsConfigured: true, canReview: true };
    await renderCard();
    expect(screen.queryByTestId('breakglass-needs-you')).toBeNull();
  });

  it('lets me start my approved request here, which opens the terminal', async () => {
    listBody = { sessions: [row({ state: 'approved', requester: 'user:default/riley-roooo', approver: 'user:default/jfillman', endedAt: undefined })], user: 'user:default/riley-roooo', recordingsConfigured: true };
    postResponse = { status: 200, body: { session: row({ state: 'active', requester: 'user:default/riley-roooo', endedAt: undefined }) } };
    await renderCard();
    expect(screen.getByTestId('breakglass-needs-you').textContent).toBe('1');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start recorded session' })));
    expect(calls.find(c => c.init?.method === 'POST')!.url).toBe('http://be/api/glidepath/breakglass/sessions/k3j9m2p7q1r5/start');
    expect(screen.getByRole('status').textContent).toContain('Recorded break-glass session');
    expect(sockets[0].url).toContain('/breakglass/sessions/k3j9m2p7q1r5/attach');
  });

  it('offers End on someone else`s active session to an admin, after a confirm naming them', async () => {
    listBody = { sessions: [row({ state: 'active', endedAt: undefined })], user: 'user:default/riley-roooo', recordingsConfigured: true, canTerminate: true };
    await renderCard();
    const active = screen.getByTestId('breakglass-active');
    expect(active.textContent).toContain('jfillman');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'End' })));
    expect(screen.getByTestId('breakglass-confirm-end-k3j9m2p7q1r5').textContent).toContain("End jfillman's session now?");
    expect(calls.some(c => c.init?.method === 'POST')).toBe(false);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' })));
    expect(calls.find(c => c.init?.method === 'POST')!.url).toBe('http://be/api/glidepath/breakglass/sessions/k3j9m2p7q1r5/end');
  });

  it('offers End to the approver, and not to a plain owner', async () => {
    listBody = { sessions: [row({ state: 'active', endedAt: undefined, approver: 'user:default/riley-roooo' })], user: 'user:default/riley-roooo', recordingsConfigured: true };
    await renderCard();
    expect(screen.getByRole('button', { name: 'End' })).toBeTruthy();
  });

  it('a plain owner sees no End on someone else`s session', async () => {
    listBody = { sessions: [row({ state: 'active', endedAt: undefined })], user: 'user:default/riley-roooo', recordingsConfigured: true };
    await renderCard();
    expect(screen.queryByRole('button', { name: 'End' })).toBeNull();
  });

  it('shows whether a recording is anchored in Rekor, and why not when it is not (phase B)', async () => {
    listBody = {
      sessions: [row({ recordingRekorIndex: 4242, recordingRekorUuid: 'u1' }), row({ id: 'bbbbbbbbbbbb', anchorError: 'Rekor: 503 down' })],
      user: 'user:default/riley-roooo', recordingsConfigured: true,
    };
    await renderCard();
    expect(screen.getByTestId('breakglass-session-k3j9m2p7q1r5').textContent).toContain('anchored #4242');
    const not = screen.getByTestId('breakglass-session-bbbbbbbbbbbb');
    expect(not.textContent).toContain('not anchored');
    expect(screen.getByTitle('Rekor: 503 down')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'play' })[0]));
    expect(screen.getByTestId('breakglass-player').textContent).toContain('anchored in Rekor #4242');
  });

  it('fetches a deep-linked session past the list window, lists it and highlights it', async () => {
    listBody = { sessions: [row({ id: 'aaaaaaaaaaaa' })], user: 'user:default/riley-roooo', recordingsConfigured: true };
    byId = { k3j9m2p7q1r5: row({}) };
    await renderCard('k3j9m2p7q1r5');
    expect(calls.some(c => c.url.endsWith('/sessions/k3j9m2p7q1r5'))).toBe(true);
    const linked = screen.getByTestId('breakglass-session-k3j9m2p7q1r5');
    expect(linked.className).toContain('rowLinked');
    expect(screen.getByTestId('breakglass-session-aaaaaaaaaaaa').className).not.toContain('rowLinked');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

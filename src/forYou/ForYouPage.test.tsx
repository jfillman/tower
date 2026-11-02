import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ForYouPage, REQUEST_MAX_AGE_MS, resolutionOf } from './ForYouPage';
import { AgentRequestsProvider } from '../agentRequests/useAgentRequests';
import { requestIdOf } from '../agentRequests/useAgentRequestStatuses';

const now = new Date();
const ago = (ms: number) => new Date(now.getTime() - ms);
const base = [
  { id: 'n1', user: 'user:default/jfillman', created: now, payload: { title: 'coding-agent asks: Roll back?', topic: 'agent-requests', severity: 'high', link: '/tower?view=agent-requests' } },
  { id: 'n2', user: null, created: now, payload: { title: 'Pipeline succeeded: gate-api', topic: 'glidepath' } },
  { id: 'n3', user: 'user:default/jfillman', created: ago(3 * 3600_000), payload: { title: 'Break-glass request to decide', severity: 'normal', link: 'https://example.test/x' } },
];
let notifications: any[] = base;
let agentItems: unknown[] = [];
let statusItems: Record<string, unknown> | undefined = {};
const updates: Array<{ ids: string[]; read: boolean }> = [];
const fetched: string[] = [];
const mockApis: Record<string, unknown> = {
  'plugin.notifications.service': {
    getNotifications: async () => ({ notifications, totalCount: notifications.length }),
    updateNotifications: async (o: { ids: string[]; read: boolean }) => { updates.push(o); return []; },
  },
  'core.discovery': { getBaseUrl: async () => 'http://be/api/agent-requests' },
  'core.fetch': {
    fetch: async (url: string) => {
      fetched.push(url);
      if (url.includes('/requests/status')) {
        return statusItems
          ? { ok: true, status: 200, json: async () => ({ items: statusItems }) }
          : { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
      }
      return { ok: true, status: 200, json: async () => ({ items: agentItems }) };
    },
  },
};
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) => mockApis[ref.id],
}));

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

const renderIt = async () => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/tower?view=for-you']}>
        <AgentRequestsProvider>
          <Routes>
            <Route path="*" element={<><ForYouPage onBack={() => {}} onOpenAgentRequests={() => {}} /><Where /></>} />
          </Routes>
        </AgentRequestsProvider>
      </MemoryRouter>,
    );
  });
};

const titles = () => screen.getAllByText(/asks:|Break-glass|Review due/, { selector: 'strong' }).map(e => e.textContent);
const showAll = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
  });
};

beforeEach(() => {
  notifications = base;
  agentItems = [];
  statusItems = {};
  updates.length = 0;
  fetched.length = 0;
});

it('lists only what was sent to you, newest marked new, with links', async () => {
  await renderIt();
  expect(screen.getByText('coding-agent asks: Roll back?')).toBeTruthy();
  expect(screen.getByText('Break-glass request to decide')).toBeTruthy();
  expect(screen.queryByText('Pipeline succeeded: gate-api')).toBeNull();
  expect(screen.getAllByText('new')).toHaveLength(1);
  expect(screen.getByText('Open →')).toBeTruthy();
  expect(screen.getByText('Open ↗').closest('a')?.getAttribute('href')).toBe('https://example.test/x');
  expect(screen.queryByText(/waiting on you/)).toBeNull();
});

it('leads with the agent questions still waiting', async () => {
  agentItems = [{ id: 'h-000000000001', agent: 'coding-agent', question: 'q', options: [], owner: 'user:jfillman', group: null }];
  await renderIt();
  expect(screen.getByText('1 agent question is waiting on you')).toBeTruthy();
});

it('shows unread by default; All lists read ones faded, after the unread', async () => {
  notifications = [
    { id: 'r1', user: 'user:default/jfillman', created: now, read: now, payload: { title: 'Review due: gate-api', link: '/tower?view=x' } },
    ...base,
  ];
  await renderIt();
  expect(screen.queryByText('Review due: gate-api')).toBeNull();
  expect(screen.getByRole('button', { name: /^Unread/ }).getAttribute('aria-pressed')).toBe('true');
  await showAll();
  expect(titles()).toEqual(['coding-agent asks: Roll back?', 'Break-glass request to decide', 'Review due: gate-api']);
  const read = screen.getByLabelText('Read: Review due: gate-api');
  expect(read.className).toMatch(/read/);
  // A read row is not "new", even when recent, and has nothing to mark.
  expect(read.textContent).not.toMatch(/\bnew\b|Mark read/);
});

it('Mark read tells the notifications backend and drops the row from Unread at once', async () => {
  await renderIt();
  const row = screen.getByLabelText('Unread: Break-glass request to decide');
  await act(async () => {
    fireEvent.click(within(row).getByText('Mark read'));
  });
  expect(updates).toEqual([{ ids: ['n3'], read: true }]);
  expect(screen.queryByText('Break-glass request to decide')).toBeNull();
  await showAll();
  expect(screen.getByLabelText('Read: Break-glass request to decide')).toBeTruthy();
});

it('Open marks the notification read and goes to its link', async () => {
  await renderIt();
  await act(async () => {
    fireEvent.click(screen.getByText('Open →'));
  });
  expect(updates).toEqual([{ ids: ['n1'], read: true }]);
  expect(screen.getByTestId('where').textContent).toBe('/tower?view=agent-requests');
});

it('an answered or expired question says so, has no Open, and is marked read', async () => {
  notifications = [
    { id: 'a1', user: 'user:default/jfillman', created: ago(600_000), payload: { title: 'researcher asks: Which env?', topic: 'agent-requests', severity: 'high', link: '/tower?view=agent-requests&id=h-00000000000a', scope: 'agent-request:h-00000000000a' } },
    { id: 'a2', user: 'user:default/jfillman', created: ago(900_000), payload: { title: 'coding-agent asks: Merge it?', topic: 'agent-requests', severity: 'high', link: '/tower?view=agent-requests&id=h-00000000000b', scope: 'agent-request:h-00000000000b' } },
    { id: 'a3', user: 'user:default/jfillman', created: ago(60_000), payload: { title: 'triage-agent asks: Page someone?', topic: 'agent-requests', severity: 'high', link: '/tower?view=agent-requests&id=h-00000000000c', scope: 'agent-request:h-00000000000c' } },
  ];
  agentItems = [{ id: 'h-00000000000c', agent: 'triage-agent', question: 'Page someone?', options: [], owner: 'user:jfillman', group: null }];
  statusItems = {
    'h-00000000000a': { status: 'answered', answered_by: 'user:riley', answered_at: ago(120_000).toISOString() },
    'h-00000000000b': { status: 'expired', expires_at: ago(300_000).toISOString() },
    'h-00000000000c': { status: 'pending' },
  };
  await renderIt();
  expect(fetched).toContain('http://be/api/agent-requests/requests/status?ids=h-00000000000a%2Ch-00000000000b%2Ch-00000000000c');
  // Only the pending one is unread, and it keeps its Open.
  expect(screen.getByLabelText('Unread: triage-agent asks: Page someone?').textContent).toMatch(/Open →/);
  await showAll();
  const answered = screen.getByLabelText('Read: researcher asks: Which env?');
  expect(answered.textContent).toMatch(/answered by riley · \S/);
  expect(answered.textContent).not.toMatch(/Open/);
  const expired = screen.getByLabelText('Read: coding-agent asks: Merge it?');
  expect(expired.textContent).toMatch(/expired/);
  expect(expired.textContent).not.toMatch(/Open/);
  expect(updates).toEqual([{ ids: ['a1', 'a2'], read: true }]);
});

it('resolves by the pending list when the backend has no status route, and an old id-less one by age', () => {
  const withId = { id: 'x', user: 'u', created: now, payload: { title: 't', topic: 'agent-requests', link: '/tower?view=agent-requests&id=h-00000000000a' } } as any;
  expect(resolutionOf(withId, [], undefined, now.getTime())).toEqual({ label: 'no longer open' });
  expect(resolutionOf(withId, [{ id: 'h-00000000000a' } as any], undefined, now.getTime())).toBeUndefined();
  expect(resolutionOf(withId, undefined, undefined, now.getTime())).toBeUndefined();
  const old = { id: 'y', user: 'u', created: ago(REQUEST_MAX_AGE_MS + 60_000), payload: { title: 't', topic: 'agent-requests', link: '/tower?view=agent-requests' } } as any;
  expect(resolutionOf(old, [], undefined, now.getTime())).toEqual({ label: 'no longer open' });
  expect(resolutionOf({ ...old, created: ago(3600_000) }, [], undefined, now.getTime())).toBeUndefined();
  // Not an agent question: never resolved.
  expect(resolutionOf({ ...old, payload: { title: 't', link: '/x' } }, [], undefined, now.getTime())).toBeUndefined();
});

it('falls back to the pending list when the status route is missing', async () => {
  statusItems = undefined;
  notifications = [
    { id: 'a1', user: 'user:default/jfillman', created: ago(600_000), payload: { title: 'researcher asks: Which env?', topic: 'agent-requests', severity: 'high', link: '/tower?view=agent-requests&id=h-00000000000a' } },
  ];
  await renderIt();
  await showAll();
  expect(screen.getByLabelText('Read: researcher asks: Which env?').textContent).toMatch(/no longer open/);
});

it('reads a question id from the scope or the link', () => {
  expect(requestIdOf({ payload: { title: 't', scope: 'agent-request:h-0123456789ab' } } as any)).toBe('h-0123456789ab');
  expect(requestIdOf({ payload: { title: 't', link: '/tower?view=agent-requests&id=h-0123456789ab' } } as any)).toBe('h-0123456789ab');
  expect(requestIdOf({ payload: { title: 't', link: '/tower?view=agent-requests' } } as any)).toBeUndefined();
  expect(requestIdOf({ payload: { title: 't', link: '/tower?id=nope' } } as any)).toBeUndefined();
});

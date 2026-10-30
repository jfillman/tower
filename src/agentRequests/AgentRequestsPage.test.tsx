import { act, fireEvent, render, screen } from '@testing-library/react';
import { AgentRequestsPage } from './AgentRequestsPage';
import { AgentRequestsProvider, shortRef } from './useAgentRequests';

const calls: Array<{ url: string; init?: RequestInit }> = [];
let listResponse: { status: number; body: unknown } = { status: 200, body: { items: [] } };
let postResponse: { status: number; body: unknown } = { status: 200, body: {} };
const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  const r = init?.method === 'POST' ? postResponse : listResponse;
  return { ok: r.status < 300, status: r.status, json: async () => r.body };
});
const mockApis: Record<string, unknown> = {
  'core.discovery': { getBaseUrl: async () => 'http://be/api/agent-requests' },
  'core.fetch': { fetch: (url: string, init?: RequestInit) => mockFetch(url, init) },
};
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) => mockApis[ref.id] ?? mockApis['core.fetch'],
}));

const req = (over: Record<string, unknown> = {}) => ({
  id: 'h-0123456789ab', task_id: 't-1', session: 's-1', agent: 'coding-agent', owner: 'user:jfillman',
  group: 'group:default/team-platform', question: 'Roll gate-api back?', options: ['yes', 'no'],
  created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600_000).toISOString(),
  status: 'pending', answer: null, answered_by: null, ...over,
});

const renderIt = async () => {
  await act(async () => {
    render(
      <AgentRequestsProvider>
        <AgentRequestsPage onBack={() => {}} />
      </AgentRequestsProvider>,
    );
  });
};

beforeEach(() => {
  calls.length = 0;
  listResponse = { status: 200, body: { items: [] } };
  postResponse = { status: 200, body: {} };
});

it('says when nothing is waiting', async () => {
  await renderIt();
  expect(screen.getByText('No agent is waiting on you.')).toBeTruthy();
  expect(calls[0].url).toBe('http://be/api/agent-requests/requests');
});

it('answers with an option button and shows the answer', async () => {
  listResponse = { status: 200, body: { items: [req()] } };
  postResponse = { status: 200, body: req({ status: 'answered', answer: 'yes', answered_by: 'user:jfillman' }) };
  await renderIt();
  expect(screen.getByText('Roll gate-api back?')).toBeTruthy();
  expect(screen.getByText('jfillman · team team-platform')).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'yes' }));
  });
  const post = calls.find(c => c.init?.method === 'POST')!;
  expect(post.url).toBe('http://be/api/agent-requests/requests/h-0123456789ab/answer');
  expect(JSON.parse(String(post.init!.body))).toEqual({ answer: 'yes' });
  expect(screen.getByText('Answered: yes')).toBeTruthy();
});

it('takes a written answer when there are no options, and shows a refusal with its hint', async () => {
  listResponse = { status: 200, body: { items: [req({ options: [], group: null })] } };
  postResponse = { status: 409, body: { error: 'already answered by user:bob', rule: 'HR-ANSWERED', hint: 'Each request takes one answer.' } };
  await renderIt();
  const send = screen.getByRole('button', { name: 'Send answer' });
  expect((send as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'go ahead' } });
  await act(async () => {
    fireEvent.click(send);
  });
  expect(screen.getByText(/already answered by user:bob/)).toBeTruthy();
  expect(screen.getByText(/Each request takes one answer/)).toBeTruthy();
});

it('says when the feature is not configured', async () => {
  listResponse = { status: 503, body: { error: 'agent requests are not configured (tower.clearance.baseUrl)' } };
  await renderIt();
  expect(screen.getByText('Agent requests are unavailable')).toBeTruthy();
});

it('shortens refs', () => {
  expect(shortRef('user:jfillman')).toBe('jfillman');
  expect(shortRef('group:default/team-platform')).toBe('team-platform');
  expect(shortRef(null)).toBe('');
});

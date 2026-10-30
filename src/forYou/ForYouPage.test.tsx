import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForYouPage } from './ForYouPage';
import { AgentRequestsProvider } from '../agentRequests/useAgentRequests';

const now = new Date();
const notifications = [
  { id: 'n1', user: 'user:default/jfillman', created: now, payload: { title: 'coding-agent asks: Roll back?', topic: 'agent-requests', severity: 'high', link: '/tower?view=agent-requests' } },
  { id: 'n2', user: null, created: now, payload: { title: 'Pipeline succeeded: gate-api', topic: 'glidepath' } },
  { id: 'n3', user: 'user:default/jfillman', created: new Date(now.getTime() - 3 * 3600_000), payload: { title: 'Break-glass request to decide', severity: 'normal', link: 'https://example.test/x' } },
];
let agentItems: unknown[] = [];
const mockApis: Record<string, unknown> = {
  'plugin.notifications.service': { getNotifications: async () => ({ notifications, totalCount: notifications.length }) },
  'core.discovery': { getBaseUrl: async () => 'http://be/api/agent-requests' },
  'core.fetch': { fetch: async () => ({ ok: true, status: 200, json: async () => ({ items: agentItems }) }) },
};
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) => mockApis[ref.id],
}));

const renderIt = async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <AgentRequestsProvider>
          <ForYouPage onBack={() => {}} onOpenAgentRequests={() => {}} />
        </AgentRequestsProvider>
      </MemoryRouter>,
    );
  });
};

it('lists only what was sent to you, newest marked new, with links', async () => {
  agentItems = [];
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

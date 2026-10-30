import { act, fireEvent, render, screen } from '@testing-library/react';
import { AgentRequestsChip } from './AgentRequestsChip';
import { AgentRequestsProvider } from './useAgentRequests';

let items: unknown[] = [];
const posted: Array<{ message: string }> = [];
const mockApis: Record<string, unknown> = {
  'core.discovery': { getBaseUrl: async () => 'http://be/api/agent-requests' },
  'core.fetch': { fetch: async () => ({ ok: true, status: 200, json: async () => ({ items }) }) },
  'core.alert': { post: (a: { message: string }) => posted.push(a) },
};
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) => mockApis[ref.id],
}));

const req = (id: string, question = 'Roll back?') => ({ id, agent: 'coding-agent', question, options: [], owner: 'user:jfillman', group: null });

beforeEach(() => {
  jest.useFakeTimers();
  posted.length = 0;
});
afterEach(() => jest.useRealTimers());

it('shows nothing when no question waits', async () => {
  items = [];
  await act(async () => {
    render(<AgentRequestsProvider><AgentRequestsChip onOpen={() => {}} /></AgentRequestsProvider>);
  });
  expect(screen.queryByText(/agent request/)).toBeNull();
});

it('counts what waits, opens the page, and toasts only questions that arrive while open', async () => {
  items = [req('h-000000000001')];
  const onOpen = jest.fn();
  await act(async () => {
    render(<AgentRequestsProvider><AgentRequestsChip onOpen={onOpen} /></AgentRequestsProvider>);
  });
  expect(screen.getByText('1 agent request')).toBeTruthy();
  expect(posted).toEqual([]);
  items = [req('h-000000000001'), req('h-000000000002', 'Promote gate-api?')];
  await act(async () => {
    jest.advanceTimersByTime(30_000);
  });
  expect(screen.getByText('2 agent requests')).toBeTruthy();
  expect(posted.map(p => p.message)).toEqual(['coding-agent asks: Promote gate-api?']);
  fireEvent.click(screen.getByText('2 agent requests'));
  expect(onOpen).toHaveBeenCalled();
});

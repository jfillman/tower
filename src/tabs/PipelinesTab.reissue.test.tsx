import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PipelinesTab } from './PipelinesTab';
import type { PipelineRunSummary } from '../tekton/types';

// The Pipelines tab wires two things the list component alone cannot prove: the Reissue release PR action on a release run
// (candidates from /release/reissuable, the confirm step in the page, the new run followed) and the ?flow= lineage filter.

const CHAIN = '11111111-2222-4333-8444-555555555555';
const ORIGIN = '94e8228a-5cdc-4350-914a-d73802e5b296';
const run = (over: Partial<PipelineRunSummary>): PipelineRunSummary => ({
  name: 'r',
  namespace: 'app-shop-cicd',
  cluster: 'hangar-dev',
  phase: 'succeeded',
  startTime: '2026-11-16T10:00:00Z',
  tasks: [],
  finallyTasks: [],
  taskRunsByPipelineTask: {},
  params: [],
  results: [],
  raw: {},
  ...over,
});
const release = run({ name: 'promote-prod-abc1234d-bd320d', pipelineName: 'release', flow: 'promote', flowSlug: 'brave-fox', origin: { chainId: ORIGIN, chainSlug: 'ornate-ram' },
  params: [{ name: 'env', value: 'prod' }, { name: 'chain-id', value: CHAIN }] });
const build = run({ name: 'build-ornate', pipelineName: 'build', flow: 'ci', flowSlug: 'ornate-ram', startTime: '2026-11-16T09:00:00Z' });
const other = run({ name: 'build-other', pipelineName: 'build', flow: 'ci', flowSlug: 'quiet-heron', startTime: '2026-11-16T08:00:00Z' });

const mockContext = { owner: 'o', appName: 'shop', environments: [], loading: false, error: undefined, refresh: jest.fn() };
jest.mock('../useReleaseContext', () => ({ useReleaseContext: () => mockContext }));
const mockLive = { runs: [release, build, other], loading: false, error: undefined };
const mockArchive = { runs: [] as PipelineRunSummary[], loading: false, error: undefined };
jest.mock('../tekton/useTektonPipelineRuns', () => ({
  ...jest.requireActual('../tekton/useTektonPipelineRuns'),
  useTektonPipelineRuns: () => mockLive,
}));
jest.mock('../tekton/useTektonResultsRuns', () => ({ useTektonResultsRuns: () => mockArchive }));
jest.mock('../useTestRuns', () => ({ useTestRuns: () => ({ runs: [], loading: false }) }));
jest.mock('../mounts', () => ({ useRepoMarks: () => [], useRunMarks: () => [] }));
jest.mock('../platformConfig', () => ({ usePlatformConfig: () => ({ controlPlaneCluster: 'hangar-dev' }) }));
jest.mock('../GlidepathSummaryPanel', () => ({ GlidepathSummaryPanel: () => null }));
jest.mock('../PipelineDag', () => ({ PipelineDag: () => null }));
jest.mock('../ReleaseRunTracker', () => ({
  ReleaseRunTracker: ({ release: r }: { release: { run: string } }) => <div data-testid="tracker">{r.run}</div>,
}));

let reissuable: { releases: unknown[]; allowed: boolean } = { releases: [], allowed: true };
const calls: Array<{ url: string; init?: RequestInit }> = [];
const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  if (init?.method === 'POST') return { ok: true, json: async () => ({ pipelineRun: 'promote-prod-abc1234d-111111', env: 'prod', image: 'ghcr.io/o/shop:1.2.3-abc1234' }) };
  return { ok: true, json: async () => reissuable };
});
// Stable objects, as the real useApi gives: a new one per render would re-run every effect that depends on it.
const mockDiscovery = { getBaseUrl: async () => 'http://be/api/glidepath' };
const mockFetcher = { fetch: mockFetch };
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) => (ref.id === 'core.discovery' ? mockDiscovery : mockFetcher),
}));

const entry = (over: Record<string, unknown> = {}) => ({
  chainId: CHAIN, env: 'prod', cluster: 'hangar-prod', image: 'ghcr.io/o/shop:1.2.3-abc1234', prUrl: 'https://github.com/o/gitops-shop/pull/7', state: 'proposed', eligible: true, ...over,
});
const renderTab = async (url = '/x/tower?tab=pipelines') => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[url]}>
        <PipelinesTab />
      </MemoryRouter>,
    );
  });
};

jest.setTimeout(30000); // the first render compiles the whole tab

beforeEach(() => {
  calls.length = 0;
  reissuable = { releases: [], allowed: true };
});

describe('Pipelines tab: Reissue release PR', () => {
  it('reads the candidates from the backend, as this app and owner', async () => {
    reissuable = { releases: [entry()], allowed: true };
    await renderTab();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe('http://be/api/glidepath/release/reissuable?appName=shop&owner=o');
  });

  it('offers the action on the release run of a closed release PR, and asks in the page before sending anything', async () => {
    reissuable = { releases: [entry()], allowed: true };
    await renderTab();
    const b = (await screen.findByText('Reissue release PR')).closest('button') as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    fireEvent.click(b);
    expect(screen.getByTestId('reissue-confirm')).toBeTruthy();
    expect(calls.filter(c => c.init?.method === 'POST')).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByText('Open fresh release PR'));
    });
    const post = calls.find(c => c.init?.method === 'POST')!;
    expect(post.url).toBe('http://be/api/glidepath/release/reissue');
    expect(JSON.parse(String(post.init!.body))).toEqual({ owner: 'o', appName: 'shop', chainId: CHAIN });
    expect((await screen.findByTestId('tracker')).textContent).toBe('promote-prod-abc1234d-111111'); // the new run is followed
    expect(screen.queryByTestId('reissue-confirm')).toBeNull();
  });

  it('shows no action when no release PR was closed unmerged', async () => {
    await renderTab();
    await waitFor(() => expect(calls).toHaveLength(1)); // asked, and nothing came back to act on
    expect(screen.queryByText('Reissue release PR')).toBeNull();
  });

  it('is disabled for a non-owner, with the reason on the page for the selected run', async () => {
    reissuable = { releases: [entry()], allowed: false };
    await renderTab();
    expect(((await screen.findByText('Reissue release PR')).closest('button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('releasing to prod'));
    expect(screen.getByText(/Reissue release PR is off for prod: Only the app's owning team/)).toBeTruthy();
  });

  it("is disabled with the API's reason when it would refuse", async () => {
    reissuable = { releases: [entry({ eligible: false, reason: 'a newer release of shop to prod on hangar-prod was opened since' })], allowed: true };
    await renderTab();
    const b = (await screen.findByText('Reissue release PR')).closest('button') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/a newer release/);
  });
});

describe('Pipelines tab: lineage', () => {
  it('links a promotion to the flow that built its image, and ?flow= narrows the list to that flow', async () => {
    await renderTab('/x/tower?tab=pipelines&flow=ornate-ram&history=30d');
    expect((screen.getByLabelText('Filter runs') as HTMLInputElement).value).toBe('ornate-ram');
    expect(screen.getByText('build-ornate')).toBeTruthy();
    expect(screen.queryByText('build-other')).toBeNull();
  });

  it('shows the lineage line with its link on the promotion', async () => {
    await renderTab();
    expect(screen.getByRole('link', { name: 'ornate-ram' }).getAttribute('href')).toBe('/x/tower?tab=pipelines&flow=ornate-ram&history=30d');
  });
});

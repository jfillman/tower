import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PipelineRunList, reissueEntryFor, type RunReissue } from './PipelineRunList';
import type { PipelineRunSummary } from './tekton/types';
import type { ReissuableRelease } from './reissue/reissue';

const CHAIN = '11111111-2222-4333-8444-555555555555';
const ORIGIN = '94e8228a-5cdc-4350-914a-d73802e5b296';
const run = (over: Partial<PipelineRunSummary> = {}): PipelineRunSummary => ({
  name: 'promote-prod-abc1234d-bd320d',
  namespace: 'app-shop-cicd',
  cluster: 'hangar-dev',
  pipelineName: 'release',
  flow: 'promote',
  phase: 'succeeded',
  startTime: '2026-11-16T10:00:00Z',
  tasks: [],
  finallyTasks: [],
  taskRunsByPipelineTask: {},
  params: [
    { name: 'env', value: 'prod' },
    { name: 'chain-id', value: CHAIN },
  ],
  results: [],
  raw: {},
  ...over,
});
const entry = (over: Partial<ReissuableRelease> = {}): ReissuableRelease => ({
  chainId: CHAIN,
  env: 'prod',
  cluster: 'hangar-prod',
  image: 'ghcr.io/o/shop:1.2.3-abc1234',
  prUrl: 'https://github.com/o/gitops-shop/pull/7',
  state: 'proposed',
  eligible: true,
  ...over,
});

describe('reissueEntryFor', () => {
  it("matches a succeeded release run by the chain id it minted, never by name", () => {
    expect(reissueEntryFor(run(), [entry()])?.chainId).toBe(CHAIN);
    expect(reissueEntryFor(run({ name: 'something-else' }), [entry()])?.chainId).toBe(CHAIN);
    expect(reissueEntryFor(run(), [entry({ chainId: '66666666-7777-4888-8999-aaaaaaaaaaaa' })])).toBeUndefined();
  });
  it('is not offered on a run that failed or is not a release', () => {
    expect(reissueEntryFor(run({ phase: 'failed' }), [entry()])).toBeUndefined();
    expect(reissueEntryFor(run({ phase: 'running' }), [entry()])).toBeUndefined();
    expect(reissueEntryFor(run({ pipelineName: 'build' }), [entry()])).toBeUndefined();
    expect(reissueEntryFor(run({ params: [] }), [entry()])).toBeUndefined();
  });
});

describe('PipelineRunList row actions and lineage', () => {
  const list = (runs: PipelineRunSummary[], reissue?: RunReissue, flowQuery?: string) =>
    render(
      <MemoryRouter initialEntries={['/x/tower?tab=pipelines']}>
        <PipelineRunList runs={runs} onSelect={() => undefined} reissue={reissue} flowQuery={flowQuery} />
      </MemoryRouter>,
    );

  it('offers Reissue release PR on the release run of a closed PR, and asks, without selecting the row', () => {
    const onAsk = jest.fn();
    const onSelect = jest.fn();
    render(
      <MemoryRouter>
        <PipelineRunList runs={[run()]} onSelect={onSelect} reissue={{ releases: [entry()], reasonFor: () => undefined, onAsk }} />
      </MemoryRouter>,
    );
    const b = screen.getByText('Reissue release PR').closest('button') as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    fireEvent.click(b);
    expect(onAsk).toHaveBeenCalledWith(entry());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows it disabled, with the reason, when it would be refused', () => {
    list([run()], { releases: [entry({ eligible: false })], reasonFor: () => 'a newer release was opened', onAsk: jest.fn() });
    const b = screen.getByText('Reissue release PR').closest('button') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('a newer release was opened');
  });

  it('shows no action on a run with no closed release PR', () => {
    list([run()], { releases: [], reasonFor: () => undefined, onAsk: jest.fn() });
    expect(screen.queryByText('Reissue release PR')).toBeNull();
    list([run({ name: 'build-1', pipelineName: 'build', params: [] })]);
    expect(screen.queryByText('Reissue release PR')).toBeNull();
  });

  it('shows the lineage line on a promotion, linking to the flow that built the image', () => {
    list([run({ flowSlug: 'brave-fox', origin: { chainId: ORIGIN, chainSlug: 'ornate-ram' } })]);
    expect(screen.getByTestId('lineage').textContent).toBe('brave-fox · fromornate-ram');
    expect(screen.getByRole('link', { name: 'ornate-ram' }).getAttribute('href')).toBe('/x/tower?tab=pipelines&flow=ornate-ram&history=30d');
  });

  it('shows nothing about lineage on a run with no origin', () => {
    list([run({ flowSlug: 'brave-fox' })]);
    expect(screen.queryByTestId('lineage')).toBeNull();
  });

  it("narrows the list to the linked flow (?flow=) and lets the person change it", () => {
    const other = run({ name: 'build-ornate', pipelineName: 'build', flowSlug: 'ornate-ram', params: [] });
    const mine = run({ name: 'promote-x', flowSlug: 'brave-fox' });
    list([other, mine], undefined, 'ornate-ram');
    expect((screen.getByLabelText('Filter runs') as HTMLInputElement).value).toBe('ornate-ram');
    expect(screen.getByText('build-ornate')).toBeTruthy();
    expect(screen.queryByText('promote-x')).toBeNull();
  });
});

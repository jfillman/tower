import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReissuePanel } from './ReissueRelease';
import type { ReissuableRelease } from './reissue';

const calls: Array<{ url: string; init?: RequestInit }> = [];
let mockPost: { ok: boolean; status?: number; body: unknown } = { ok: true, body: {} };
const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  return { ok: mockPost.ok, status: mockPost.status ?? 200, json: async () => mockPost.body };
});
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) =>
    ref.id === 'core.discovery' ? { getBaseUrl: async () => 'http://be/api/glidepath' } : { fetch: mockFetch },
}));

const CHAIN = '11111111-2222-4333-8444-555555555555';
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
const started = { pipelineRun: 'promote-prod-abc1234d-bd320d', reissues: CHAIN, env: 'prod', cluster: 'hangar-prod', image: 'ghcr.io/o/shop:1.2.3-abc1234', linked: true };

const renderIt = (releases: ReissuableRelease[], allowed = true, onStarted = jest.fn()) => {
  render(
    <MemoryRouter>
      <ReissuePanel owner="o" appName="shop" releases={releases} allowed={allowed} onStarted={onStarted} />
    </MemoryRouter>,
  );
  return onStarted;
};
const button = () => screen.getByText('Reissue release PR').closest('button') as HTMLButtonElement;

beforeEach(() => {
  calls.length = 0;
  mockPost = { ok: true, body: started };
});

describe('ReissuePanel (Reissue release PR)', () => {
  it('is not shown when no release PR was closed unmerged', () => {
    renderIt([]);
    expect(screen.queryByText('Reissue release PR')).toBeNull();
    expect(screen.queryByLabelText('Release PRs closed without merging')).toBeNull();
  });

  it('shows the closed PR and an enabled action for an owner', () => {
    renderIt([entry()]);
    expect(screen.getByText('PR closed, not merged')).toBeTruthy();
    expect(screen.getByText('1.2.3-abc1234')).toBeTruthy();
    expect(screen.getByText('prod')).toBeTruthy();
    expect(button().disabled).toBe(false);
    expect(screen.queryByText(/Only the app/)).toBeNull();
  });

  it('is disabled, with the reason on the page, for someone who is not an owner', () => {
    renderIt([entry()], false);
    expect(button().disabled).toBe(true);
    expect(screen.getByText(/Only the app's owning team/)).toBeTruthy();
    expect(button().getAttribute('aria-describedby')).toBe(`reissue-reason-${CHAIN}`);
    fireEvent.click(button());
    expect(screen.queryByTestId('reissue-confirm')).toBeNull();
  });

  it("is disabled with the API's own reason when it would refuse", () => {
    renderIt([entry({ eligible: false, reason: 'a release PR for prod is already open (https://github.com/o/gitops-shop/pull/9)' })]);
    expect(button().disabled).toBe(true);
    expect(screen.getByText(/already open \(https:\/\/github.com\/o\/gitops-shop\/pull\/9\)/)).toBeTruthy();
  });

  it('asks first, in the page, and posts only which release once confirmed', async () => {
    const onStarted = renderIt([entry()]);
    fireEvent.click(button());
    expect(screen.getByTestId('reissue-confirm')).toBeTruthy();
    expect(screen.getByText(/the closed PR is not reopened/)).toBeTruthy();
    expect(calls).toHaveLength(0); // nothing sent by the first click
    await act(async () => {
      fireEvent.click(screen.getByText('Open fresh release PR'));
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://be/api/glidepath/release/reissue');
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ owner: 'o', appName: 'shop', chainId: CHAIN });
    expect(onStarted).toHaveBeenCalledWith(entry(), started);
    expect(screen.queryByTestId('reissue-confirm')).toBeNull();
  });

  it('can be cancelled without sending anything', () => {
    renderIt([entry()]);
    fireEvent.click(button());
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('reissue-confirm')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('shows the refusal and stays open, starting nothing, when the API says no', async () => {
    mockPost = { ok: false, status: 502, body: { error: 'release PR #7 is still open: close it first, or merge it' } };
    const onStarted = renderIt([entry()]);
    fireEvent.click(button());
    await act(async () => {
      fireEvent.click(screen.getByText('Open fresh release PR'));
    });
    expect((await screen.findByRole('alert')).textContent).toContain('release PR #7 is still open');
    expect(onStarted).not.toHaveBeenCalled();
    expect(screen.getByTestId('reissue-confirm')).toBeTruthy();
  });
});

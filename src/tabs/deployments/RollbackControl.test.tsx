import { act, fireEvent, render, screen } from '@testing-library/react';
import { RollbackControl } from './RollbackControl';

let mockPlan: unknown;
const calls: Array<{ url: string; init?: RequestInit }> = [];
const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  if (init?.method === 'POST') return { ok: true, json: async () => ({ prUrl: 'https://github.com/o/gitops-sky-marshall/pull/9', alreadyOpen: false }) };
  return { ok: true, json: async () => mockPlan };
});
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) =>
    ref.id === 'core.discovery' ? { getBaseUrl: async () => 'http://be/api/glidepath' } : { fetch: mockFetch },
}));

const plan = {
  current: { releaseId: 'bad:kind-prod/staging', image: 'ghcr.io/o/sky-marshall:0.1.3-ccc', state: 'aborted' },
  targets: [
    { releaseId: 'good:kind-prod/staging', image: 'ghcr.io/o/sky-marshall:0.1.2-bbb', healthyAt: '2026-10-09T00:00:00Z', state: 'superseded' },
  ],
};
const renderIt = (allowed = true) =>
  render(<RollbackControl owner="jfillman" appName="sky-marshall" env="staging" cluster="kind-prod" allowed={allowed} />);

beforeEach(() => {
  calls.length = 0;
});

describe('RollbackControl', () => {
  it('shows what is running and the earlier images it can go back to', async () => {
    mockPlan = plan;
    renderIt();
    await screen.findByText('0.1.3-ccc');
    expect(calls[0].url).toBe('http://be/api/glidepath/release/rollback-plan?appName=sky-marshall&env=staging&cluster=kind-prod');
    expect(screen.getByRole('option').textContent).toMatch(/^0\.1\.2-bbb - healthy/);
  });

  it('needs a reason, then confirms, then posts the chosen release-id', async () => {
    mockPlan = plan;
    renderIt();
    const button = (await screen.findByText('Roll back')).closest('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'canary aborted on error rate' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(calls.filter(c => c.init?.method === 'POST')).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByText('Open rollback PR'));
    });
    const post = calls.find(c => c.init?.method === 'POST')!;
    expect(post.url).toBe('http://be/api/glidepath/release/rollback');
    expect(JSON.parse(String(post.init!.body))).toEqual({
      owner: 'jfillman',
      appName: 'sky-marshall',
      env: 'staging',
      cluster: 'kind-prod',
      targetReleaseId: 'good:kind-prod/staging',
      reason: 'canary aborted on error rate',
    });
    await screen.findByText(/Rollback PR opened/);
  });

  it('says so when there is nothing to go back to, and stays disabled for a non-owner', async () => {
    mockPlan = { current: plan.current, targets: [] };
    renderIt(false);
    await screen.findByText(/nothing to roll back to/);
    expect(screen.queryByText('Roll back')).toBeNull();
  });
});

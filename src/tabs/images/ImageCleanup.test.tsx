import { act, fireEvent, render, screen } from '@testing-library/react';
import { ImageCleanup, pruneBlocker, whatGoes, type PrunePlan } from './ImageCleanup';

let planBody: unknown;
let pruneResponse: { status: number; body: unknown } = { status: 202, body: { jobId: 'j1' } };
const doneJob = {
  state: 'done',
  releases: { done: 1, total: 1 },
  cacheLayers: { done: 7, total: 7 },
  deletedReleases: ['sky-marshall:0.1.0-old'],
  deletedVersions: 14,
  failed: [],
  remaining: { releases: 0, cacheLayers: 0 },
};
const calls: Array<{ url: string; init?: RequestInit }> = [];
const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  if (init?.method === 'POST') return { ok: pruneResponse.status < 300, status: pruneResponse.status, json: async () => pruneResponse.body };
  if (url.includes('/images/prune/jobs/')) return { ok: true, status: 200, json: async () => doneJob };
  return { ok: true, status: 200, json: async () => planBody };
});
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: (ref: { id: string }) =>
    ref.id === 'core.discovery' ? { getBaseUrl: async () => 'http://be/api/glidepath' } : { fetch: mockFetch },
}));

const plan = (over: Partial<PrunePlan> = {}): PrunePlan => ({
  app: 'sky-marshall',
  configured: true,
  allowed: true,
  hash: 'h1',
  deleteCount: 14,
  rules: { minAgeDays: 14, keepNewest: 10, keepNewestCache: 20 },
  packages: [
    {
      name: 'sky-marshall',
      kind: 'app',
      totalVersions: 21,
      unattributed: 0,
      deleteIds: [1, 2, 3, 4, 5, 6, 7],
      decisions: [
        { key: '0.1.6-new', createdAt: '2026-10-10T00:00:00Z', versions: 7, keep: true, reasons: ['younger than 14 days'] },
        { key: '0.1.3-live', createdAt: '2026-09-01T00:00:00Z', versions: 7, keep: true, reasons: ['running in app-sky-marshall-staging (kind-prod)'] },
        { key: '0.1.0-old', createdAt: '2026-08-01T00:00:00Z', versions: 7, keep: false, reasons: [] },
      ],
    },
    { name: 'sky-marshall/cache', kind: 'cache', totalVersions: 30, unattributed: 0, deleteIds: [8, 9, 10, 11, 12, 13, 14], decisions: [] },
  ],
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  pruneResponse = { status: 202, body: { jobId: 'j1' } };
});

describe('ImageCleanup', () => {
  it('loads the plan only on request, and shows what goes and why the rest stays', async () => {
    planBody = plan();
    render(<ImageCleanup owner="jfillman" appName="sky-marshall" />);
    expect(calls).toHaveLength(0);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show what would be deleted' })));
    expect(calls[0].url).toBe('http://be/api/glidepath/images/prune-plan?owner=jfillman&appName=sky-marshall');
    expect(screen.getByText('0.1.0-old')).toBeTruthy();
    expect(screen.queryByText('0.1.3-live')).toBeNull();
    fireEvent.click(screen.getByText('Why each kept release is kept'));
    expect(screen.getByText('running in app-sky-marshall-staging (kind-prod)')).toBeTruthy();
    expect(screen.getByText('sky-marshall/cache: delete 7 of 30 cache layers')).toBeTruthy();
    expect(screen.getByText('sky-marshall: delete 1 of 3 releases')).toBeTruthy();
  });

  it('confirms, then deletes exactly the plan it showed (by hash)', async () => {
    planBody = plan();
    render(<ImageCleanup owner="jfillman" appName="sky-marshall" />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show what would be deleted' })));
    fireEvent.click(screen.getByRole('button', { name: 'Delete 1 release and 7 cache layers' }));
    expect(screen.getByTestId('prune-confirm').textContent).toContain('14 registry versions in all');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    const post = calls.find(x => x.init?.method === 'POST')!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ owner: 'jfillman', appName: 'sky-marshall', planHash: 'h1' });
    expect(await screen.findByText(/Deleted 1 release and 7 cache layers/, undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText(/Releases deleted: 0.1.0-old/)).toBeTruthy();
    expect(calls.some(x => x.url.endsWith('/images/prune/jobs/j1'))).toBe(true);
  });

  it('shows the new plan when what would be deleted changed meanwhile', async () => {
    planBody = plan();
    const smaller = plan({ hash: 'h2', deleteCount: 7 });
    smaller.packages = smaller.packages.filter(p => p.kind === 'cache');
    pruneResponse = { status: 409, body: { error: 'What would be deleted has changed since the plan was shown. Review the new plan.', plan: smaller } };
    render(<ImageCleanup owner="jfillman" appName="sky-marshall" />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Show what would be deleted' })));
    fireEvent.click(screen.getByRole('button', { name: 'Delete 1 release and 7 cache layers' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    expect(screen.getByText(/has changed since the plan was shown/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete 7 cache layers' })).toBeTruthy();
  });

  it('says why Prune is unavailable', () => {
    expect(pruneBlocker(plan({ allowed: false }))).toMatch(/owning team/);
    expect(pruneBlocker(plan({ configured: false }))).toMatch(/GHCR_PRUNE_TOKEN/);
    expect(pruneBlocker(plan({ deleteCount: 0 }))).toBe('Nothing to delete.');
    expect(pruneBlocker(plan())).toBeUndefined();
  });
});

describe('whatGoes', () => {
  it('names releases and cache layers, leaving out a zero', () => {
    expect(whatGoes(9, 264)).toBe('9 releases and 264 cache layers');
    expect(whatGoes(1, 0)).toBe('1 release');
    expect(whatGoes(0, 1)).toBe('1 cache layer');
    expect(whatGoes(0, 0)).toBe('nothing');
  });
});

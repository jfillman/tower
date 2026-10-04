import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProvisioningView } from './ProvisioningView';
import { toItems } from './shared';
import type { ProvisioningInputs } from './deriveProvisioning';

// Shape and timings of the live sky-marshall provision (2026-10-01): XR created 17:46,
// cluster + CI/CD + repos done, both onboarding PRs open, Infisical project created.
const t = (iso: string) => Date.parse(iso);
const inputs: ProvisioningInputs = {
  created: [
    { kind: 'Repository', name: 'sky-marshall-src', ready: true },
    { kind: 'RepositoryFile', name: 'sky-marshall-src-index-js', ready: false },
    { kind: 'Mystery', name: 'x' },
  ],
  xr: {
    kind: 'NodeJSApplication',
    name: 'sky-marshall',
    namespace: 'app-sky-marshall-cicd',
    cluster: 'kind-dev',
    createdAt: t('2026-10-01T17:46:50Z'),
    conditions: [
      { type: 'DevClusterReady', status: 'True', lastTransitionTime: '2026-10-01T17:47:19Z' },
      { type: 'CicdOnboarded', status: 'True', lastTransitionTime: '2026-10-01T17:49:24Z' },
      { type: 'Synced', status: 'True', lastTransitionTime: '2026-10-01T17:47:19Z' },
      { type: 'Ready', status: 'True', lastTransitionTime: '2026-10-01T17:49:24Z' },
    ],
  },
  secrets: { found: true, ready: true, readyAt: t('2026-10-01T17:50:38Z') },
  links: {
    requestPr: { number: 16, url: 'https://github.com/jfillman/gitops-cluster-dev-tenants/pull/16', state: 'merged' },
    sourceRepoUrl: 'https://github.com/jfillman/sky-marshall',
    gitopsRepoUrl: 'https://github.com/jfillman/gitops-sky-marshall',
    infisicalProjectId: 'c6a39d3a-8aae-4630-b157-13c6cb4250b3',
    onboarding: {
      source: { number: 1, url: 'https://github.com/jfillman/sky-marshall/pull/1', state: 'open' },
      gitops: { number: 1, url: 'https://github.com/jfillman/gitops-sky-marshall/pull/1', state: 'merged' },
    },
  },
};

describe('ProvisioningView', () => {
  it('lists the ten steps in order with their links', () => {
    const items = toItems([inputs], t('2026-10-01T17:55:00Z'));
    render(<ProvisioningView items={items} onSelect={() => {}} loading={false} />);

    const steps = screen.getAllByRole('listitem');
    // The title is the first text node of the step's name row (a "parallel" tag may follow it).
    const titles = steps.map(li => li.children[1].firstElementChild?.firstChild?.textContent);
    expect(titles).toEqual([
      'Request PR merged',
      'Request applied',
      'Dev cluster chosen',
      'CI/CD onboarded',
      'Repositories and starter files',
      'Available in the Backstage catalog',
      'Application onboarding PRs',
      'Infisical secrets resources',
      'First build and checks',
      'Running healthy in dev',
    ]);

    const link = (name: RegExp) => screen.getByRole('link', { name });
    expect(link(/Request PR #16/).getAttribute('href')).toBe(
      'https://github.com/jfillman/gitops-cluster-dev-tenants/pull/16',
    );
    expect(link(/^Source repo/).getAttribute('href')).toBe('https://github.com/jfillman/sky-marshall');
    expect(link(/GitOps repo/).getAttribute('href')).toBe('https://github.com/jfillman/gitops-sky-marshall');
    expect(link(/Source PR #1/).textContent).toContain('open');
    expect(link(/GitOps PR #1/).textContent).toContain('merged');
    expect(link(/Infisical project/).getAttribute('href')).toBe(
      'http://infisical.dev.kiac.local/projects/secret-management/c6a39d3a-8aae-4630-b157-13c6cb4250b3/overview',
    );
    expect(screen.getByText(/Merge the two onboarding PRs to start the first build \(1 of 2 merged\)/)).toBeTruthy();
  });

  it('lists what gets created with readiness', () => {
    const items = toItems([inputs], t('2026-10-01T17:55:00Z'));
    render(<ProvisioningView items={items} onSelect={() => {}} loading={false} />);
    expect(screen.getByText('What gets created · 1 of 3 ready')).toBeTruthy();
    expect(screen.getByText('sky-marshall-src-index-js').closest('tr')?.textContent).toContain('waiting');
    expect(screen.getByText('x').closest('tr')?.textContent).toContain('not tracked');
  });

  it('lists a stalled service apart from the in-flight ones', () => {
    const late = t('2026-10-02T05:00:00Z');
    const built = {
      ...inputs,
      xr: { ...inputs.xr, name: 'old-app' },
      build: {
        name: 'b1',
        phase: 'succeeded' as const,
        startedAt: t('2026-10-01T18:00:00Z'),
        completedAt: t('2026-10-01T18:03:00Z'),
        tasksDone: 6,
        tasksTotal: 6,
      },
    };
    const items = toItems([{ ...inputs, xr: { ...inputs.xr, createdAt: late - 60000 } }, built], late);
    render(<ProvisioningView items={items} selected="sky-marshall" onSelect={() => {}} loading={false} />);
    expect(screen.getByText(/^Stalled/)).toBeTruthy();
    const pills = screen.getAllByRole('button');
    expect(pills.map(b => b.querySelector('b')?.textContent)).toEqual(['sky-marshall', 'old-app']);
  });

  describe('catalog refresh button', () => {
    const waiting = { ...inputs, catalog: { found: false } };
    const now = t('2026-10-01T17:55:00Z');
    it('shows while the catalog step waits and runs the handler when clicked', async () => {
      const onRefresh = jest.fn().mockResolvedValue(undefined);
      render(<ProvisioningView items={toItems([waiting], now)} onSelect={() => {}} loading={false} onRefreshCatalog={onRefresh} />);
      fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog now' }));
      await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
      expect(await screen.findByRole('button', { name: /Requested/ })).toBeTruthy();
    });
    it('says when the refresh could not be requested', async () => {
      const onRefresh = jest.fn().mockRejectedValue(new Error('403'));
      render(<ProvisioningView items={toItems([waiting], now)} onSelect={() => {}} loading={false} onRefreshCatalog={onRefresh} />);
      fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog now' }));
      expect(await screen.findByRole('button', { name: 'Could not refresh' })).toBeTruthy();
    });
    it('is absent once the service is in the catalog, and when no handler is given', () => {
      const found = { ...inputs, catalog: { found: true } };
      render(<ProvisioningView items={toItems([found], now)} onSelect={() => {}} loading={false} onRefreshCatalog={jest.fn()} />);
      expect(screen.queryByRole('button', { name: 'Refresh catalog now' })).toBeNull();
    });
  });
});

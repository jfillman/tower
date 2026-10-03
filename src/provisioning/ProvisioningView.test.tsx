import { render, screen } from '@testing-library/react';
import { ProvisioningView } from './ProvisioningView';
import { toItems } from './shared';
import type { ProvisioningInputs } from './deriveProvisioning';

// Shape and timings of the live sky-marshall provision (2026-10-01): XR created 17:46,
// cluster + CI/CD + repos done, both onboarding PRs open, Infisical project created.
const t = (iso: string) => Date.parse(iso);
const inputs: ProvisioningInputs = {
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
  it('lists the eight steps in order with their links', () => {
    const items = toItems([inputs], t('2026-10-01T17:55:00Z'));
    render(<ProvisioningView items={items} onSelect={() => {}} loading={false} />);

    const steps = screen.getAllByRole('listitem');
    // The title is the first text node of the step's name row (a "parallel" tag may follow it).
    const titles = steps.map(li => li.children[1].firstElementChild?.firstChild?.textContent);
    expect(titles).toEqual([
      'Request accepted',
      'Dev cluster chosen',
      'CI/CD onboarded',
      'Repositories and starter files',
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
});

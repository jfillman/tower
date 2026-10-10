import { fireEvent, render, screen } from '@testing-library/react';
import { ArgoCommandPanel, forceSyncTargets } from './ArgoCommandPanel';
import type { EnvironmentSummary } from '../../types';

let mockCaps: { data?: Record<string, unknown> } = {};
jest.mock('../../useReleaseData', () => ({
  ...jest.requireActual('../../useReleaseData'),
  useArgoCapabilities: () => mockCaps,
}));

const actions = () => ({
  pending: undefined,
  error: undefined,
  clearError: jest.fn(),
  refresh: jest.fn(),
  hardRefresh: jest.fn(),
  sync: jest.fn(),
  forceSync: jest.fn(),
  terminate: jest.fn(),
});

const env = (over: Partial<EnvironmentSummary> = {}): EnvironmentSummary => ({
  key: 'kind-dev/app-sky-marshall-dev',
  env: 'dev',
  cluster: 'kind-dev',
  namespace: 'app-sky-marshall-dev',
  deployed: true,
  drift: false,
  pods: [],
  services: [],
  resources: [],
  argoAppName: 'sky-marshall-dev',
  argoSyncStatus: 'OutOfSync',
  argoHealthStatus: 'Healthy',
  argoResources: [
    { kind: 'Service', name: 'sky-marshall', syncStatus: 'OutOfSync' },
    { kind: 'NetworkPolicy', name: 'sky-marshall', syncStatus: 'Synced' },
  ],
  ...over,
});

const caps = (over: Record<string, unknown> = {}) => ({ data: { tier: 'ground', autoPrune: true, refresh: true, sync: true, force: true, terminate: true, ...over } });
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('ArgoCommandPanel controls (2026-10-10)', () => {
  it('has no separate Sync with prune: Sync follows the Application', () => {
    mockCaps = caps();
    render(<ArgoCommandPanel env={env()} argoActions={actions() as never} />);
    expect(screen.queryByRole('button', { name: 'Sync with prune' })).toBeNull();
    expect(button('Sync').disabled).toBe(false);
  });

  it('confirms a force sync by naming what it replaces, then runs it', () => {
    mockCaps = caps();
    const a = actions();
    render(<ArgoCommandPanel env={env()} argoActions={a as never} />);
    fireEvent.click(button('Force sync'));
    expect(screen.getByTestId('force-sync-confirm').textContent).toContain('Service/sky-marshall');
    expect(screen.getByTestId('force-sync-confirm').textContent).not.toContain('NetworkPolicy');
    fireEvent.click(screen.getAllByRole('button', { name: 'Force sync' })[1]);
    expect(a.forceSync).toHaveBeenCalledWith('kind-dev', 'sky-marshall-dev');
  });

  it('disables Force sync where the user may not (a Flight environment for an owner)', () => {
    mockCaps = caps({ tier: 'flight', sync: false, force: false });
    render(<ArgoCommandPanel env={env()} argoActions={actions() as never} />);
    expect(button('Force sync').disabled).toBe(true);
    expect(button('Force sync').title).toMatch(/only an admin/);
    expect(button('Sync').disabled).toBe(true);
  });

  it('offers Terminate only while a sync is running', () => {
    mockCaps = caps();
    const a = actions();
    const { rerender } = render(<ArgoCommandPanel env={env()} argoActions={a as never} />);
    expect(screen.queryByRole('button', { name: 'Terminate sync' })).toBeNull();
    rerender(<ArgoCommandPanel env={env({ argoOperationPhase: 'Running' })} argoActions={a as never} />);
    fireEvent.click(button('Terminate sync'));
    expect(a.terminate).toHaveBeenCalledWith('kind-dev', 'sky-marshall-dev');
  });
});

describe('forceSyncTargets', () => {
  it('is the out-of-sync resources', () => {
    expect(forceSyncTargets([{ kind: 'Job', name: 'migrate', syncStatus: 'OutOfSync' }, { kind: 'Service', name: 's', syncStatus: 'Synced' }, { kind: 'X', name: 'y' }])).toEqual(['Job/migrate']);
  });
});

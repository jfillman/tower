import { render, screen } from '@testing-library/react';
import { ReleaseRunTracker } from './ReleaseRunTracker';

let mockStatus: Record<string, unknown> = {};
jest.mock('./useReleaseData', () => ({
  ...jest.requireActual('./useReleaseData'),
  useReleaseRunStatus: () => mockStatus,
}));

const release = { run: 'promote-prod-abcdef01-1a2b3c', env: 'prod', label: 'quiet-heron' };
const props = () => ({ appName: 'boarding-api', release, onPr: jest.fn(), onDismiss: jest.fn(), onOpenRun: jest.fn() });

describe('ReleaseRunTracker (2026-10-22: Promote no longer waits for the PR)', () => {
  it('follows a running release run with its steps', () => {
    mockStatus = { data: { state: 'running', tasks: [{ name: 'preflight', state: 'done' }, { name: 'open-release-pr', state: 'running' }] } };
    render(<ReleaseRunTracker {...props()} />);
    expect(screen.getByText('Release PR for quiet-heron → prod on its way')).toBeTruthy();
    expect(screen.getByTitle('open-release-pr: running')).toBeTruthy();
  });

  it('turns into the PR receipt once the PR exists, and tells the tab once', () => {
    mockStatus = { data: { state: 'pr', prUrl: 'https://github.com/jf/gitops-boarding-api/pull/482', tasks: [] } };
    const p = props();
    const { rerender } = render(<ReleaseRunTracker {...p} />);
    rerender(<ReleaseRunTracker {...p} />);
    expect(screen.getByTestId('pr-receipt').textContent).toContain('PR #482 opened');
    expect(p.onPr).toHaveBeenCalledTimes(1);
  });

  it('says why when the run ended without a PR', () => {
    mockStatus = { data: { state: 'failed', reason: 'release run finished without opening a PR: Failed', tasks: [] } };
    render(<ReleaseRunTracker {...props()} />);
    expect(screen.getByRole('alert').textContent).toContain('without opening a PR');
  });
});

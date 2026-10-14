import { render, screen } from '@testing-library/react';
import { ReleaseSignoffPanel } from './ReleaseSignoffPanel';

describe('the sign-off panel says why an approval does not count', () => {
  it('names an approval from outside the owning team (found in testing: riley-roooo on boarding-api)', () => {
    render(
      <ReleaseSignoffPanel
        loading={false}
        mode="hand-flown"
        signoffEnv="prod"
        signoff={{
          env: 'prod',
          prNumber: 48,
          prUrl: 'u',
          state: 'open',
          status: 'awaiting',
          approvals: [{ by: 'riley-roooo', at: '2026-10-14T10:00:00Z', beforeMerge: true, counts: false, notApprover: true }],
        }}
      />,
    );
    expect(screen.getByText(/not one of this app's owners or an admin/)).toBeTruthy();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { countedSignoffs, suggestNotes, type ReleaseModeInfo, type SignoffEvaluation } from './releaseFlow';
import { ReleaseDraftEditor } from './ReleaseDraftEditor';
import { ReleaseModeBar } from './ReleaseModeBar';
import { ReleaseSignoffPanel } from './ReleaseSignoffPanel';
import type { PullRequestSummary } from './pullRequests/usePullRequests';

const pr = (number: number, title: string, labels: string[] = []): PullRequestSummary => ({
  repo: 'source',
  number,
  title,
  url: `https://github.com/o/bags/pull/${number}`,
  draft: false,
  labels,
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
  state: 'merged',
});

describe('suggestNotes', () => {
  it('sorts scope PRs into Added, Fixed and Changed, without their Conventional Commits prefix', () => {
    expect(
      suggestNotes([pr(12, 'feat(api): bag-tag reprint'), pr(13, 'fix: cutoff timezone'), pr(14, 'Bump express', ['dependencies'])]),
    ).toEqual({
      added: ['Bag-tag reprint (#12)'],
      fixed: ['Cutoff timezone (#13)'],
      changed: ['Bump express (#14)'],
    });
  });
});

const signoff = (over: Partial<SignoffEvaluation>): SignoffEvaluation => ({
  env: 'prod',
  prNumber: 41,
  prUrl: 'https://github.com/o/gitops-bags/pull/41',
  state: 'merged',
  mergedBy: 'example-org',
  mergedAt: '2026-10-14T03:00:00Z',
  approvals: [],
  status: 'shipped-without',
  ...over,
});

describe('countedSignoffs', () => {
  it('counts only approvals that count', () => {
    expect(
      countedSignoffs(
        signoff({
          approvals: [
            { by: 'second', at: 't', beforeMerge: true, counts: true },
            { by: 'example-org', at: 't', beforeMerge: true, counts: false },
          ],
        }),
      ),
    ).toBe(1);
    expect(countedSignoffs(undefined)).toBe(0);
  });
});

describe('ReleaseDraftEditor', () => {
  it('fills empty sections from the merged PRs and saves the draft', () => {
    const onSave = jest.fn();
    render(
      <ReleaseDraftEditor
        saved={{ owner: 'example-org', notes: { fixed: ['Already written'] } }}
        suggested={{ added: ['Bag-tag reprint (#12)'], fixed: ['Cutoff timezone (#13)'] }}
        canEdit
        saving={false}
        onSave={onSave}
      />,
    );
    expect(screen.getByText(/1 note · owner example-org/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Notes and owner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fill empty sections from the merged PRs' }));
    fireEvent.change(screen.getByLabelText('Release owner'), { target: { value: 'second' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'second',
        notes: { added: ['Bag-tag reprint (#12)'], fixed: ['Already written'] },
      }),
    );
  });

  it("is read-only for someone who can't edit it", () => {
    render(<ReleaseDraftEditor suggested={{}} canEdit={false} saving={false} onSave={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notes and owner' }));
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.getByText(/Only the app's owners and admins/)).toBeTruthy();
  });
});

const modeInfo = (over: Partial<ReleaseModeInfo> = {}): ReleaseModeInfo => ({
  mode: 'assisted',
  source: 'built-in',
  file: { owner: 'o', repo: 'gitops-cluster-dev-tenants', path: 'release-modes.yaml' },
  signoffEnv: 'prod',
  settable: ['hand-flown', 'assisted'],
  canSetMode: true,
  canEditDraft: true,
  ...over,
});

describe('ReleaseModeBar', () => {
  it('lets an admin pick Hand-flown, and shows Autoland as not available yet', () => {
    const onChange = jest.fn();
    render(<ReleaseModeBar info={modeInfo()} submitting={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    const autoland = screen.getByRole('button', { name: 'Autoland (not available yet)' }) as HTMLButtonElement;
    expect(autoland.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Set Hand-flown' }));
    expect(onChange).toHaveBeenCalledWith('hand-flown');
  });

  it('offers no change to someone who is not an admin', () => {
    render(<ReleaseModeBar info={modeInfo({ canSetMode: false, mode: 'hand-flown', source: 'app' })} submitting={false} onChange={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.getByText(/Sign-off goes on the prod release PR/)).toBeTruthy();
  });
});

describe('ReleaseSignoffPanel', () => {
  it('says a Hand-flown release shipped without a sign-off', () => {
    render(<ReleaseSignoffPanel signoff={signoff({})} signoffEnv="prod" mode="hand-flown" loading={false} />);
    expect(screen.getByText('shipped without sign-off')).toBeTruthy();
    expect(screen.getByText(/reached prod without an approval from someone other than the person who merged it/)).toBeTruthy();
  });

  it('shows the notes the team wrote and who signed off', () => {
    render(
      <ReleaseSignoffPanel
        release={{ mode: 'hand-flown', owner: 'example-org', notes: { added: ['Bag-tag reprint (#12)'] } }}
        signoff={signoff({ status: 'signed', approvals: [{ by: 'second', at: '2026-10-14T02:00:00Z', beforeMerge: true, counts: true }] })}
        signoffEnv="prod"
        mode="hand-flown"
        loading={false}
      />,
    );
    expect(screen.getByText('Bag-tag reprint (#12)')).toBeTruthy();
    expect(screen.getByText('signed off')).toBeTruthy();
    expect(screen.getByText('second')).toBeTruthy();
  });

  it('explains a record written before release notes existed', () => {
    render(<ReleaseSignoffPanel signoffEnv="staging" loading={false} />);
    expect(screen.getByText('Written before release notes were part of the record.')).toBeTruthy();
    expect(screen.getByText('This image has no release PR to staging yet.')).toBeTruthy();
  });
});

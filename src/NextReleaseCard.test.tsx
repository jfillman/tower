import { fireEvent, render, screen } from '@testing-library/react';
import { NextReleaseCard } from './NextReleaseCard';
import type { NextRelease, NextReleaseCandidate } from './nextRelease';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import type { ReleaseRecord } from './useReleaseRecords';

const pr = (number: number, title: string, state: 'open' | 'merged' = 'merged'): PullRequestSummary => ({
  repo: 'source',
  number,
  title,
  url: `https://github.com/o/bags/pull/${number}`,
  draft: false,
  labels: [],
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
  state,
});

const leading: NextReleaseCandidate = {
  imageTag: '1.9.0-a41f9c2',
  image: 'ghcr.io/o/bags:1.9.0-a41f9c2',
  nickname: 'amber-finch',
  version: '1.9.0',
  liveOn: ['dev'],
  firstGroundAt: '2026-10-12T10:00:00Z',
  scans: [],
  prCount: 2,
};

const next: NextRelease = {
  previous: { imageTag: '1.8.2-6f1c0aa', version: '1.8.2' } as ReleaseRecord,
  scope: [pr(11, 'fix: weight rounding'), pr(12, 'feat: bag-tag reprint')],
  scopeMayBeIncomplete: false,
  incoming: [pr(221, 'feat: lost-bag claims', 'open')],
  issues: [
    { label: '#198', url: 'https://github.com/o/bags/issues/198', prNumber: 11, merged: true },
    { label: '#203', url: 'https://github.com/o/bags/issues/203', prNumber: 221, merged: false },
  ],
  changeCategories: { features: 1, fixes: 1, chores: 0 },
  breaking: false,
  candidates: [leading],
  leading,
  previousVersion: '1.8.2',
  suggestedVersion: '1.9.0',
  readiness: [
    { id: 'changes', label: 'Changes merged', state: 'ok', detail: '2 PRs on main since the last release' },
    { id: 'soak', label: 'Soaked 24h on Ground', state: 'todo', detail: 'On Ground for 3h' },
  ],
};

describe('NextReleaseCard', () => {
  it('shows the draft by name with its scope, incoming PRs, issues, candidates and readiness', () => {
    render(<NextReleaseCard next={next} name="CEDAR" previousName="BIRCH" />);
    expect(screen.getByText('CEDAR')).toBeTruthy();
    expect(screen.getByText('v1.9.0 suggested')).toBeTruthy();
    expect(screen.getByText('after BIRCH · 1.8.2')).toBeTruthy();
    expect(screen.getByText(/Scope · 2 PRs · 1 feat \/ 1 fix/)).toBeTruthy();
    expect(screen.getByText('feat: lost-bag claims')).toBeTruthy();
    expect(screen.getByText('#198').closest('a')?.getAttribute('href')).toBe('https://github.com/o/bags/issues/198');
    expect(screen.getByText('#203').closest('a')?.getAttribute('href')).toBe('https://github.com/o/bags/issues/203');
    expect(screen.getByText('amber-finch')).toBeTruthy();
    expect(screen.getByText('Readiness · 1 of 2')).toBeTruthy();
  });

  it('falls back to "Next release" until the release history names it', () => {
    render(<NextReleaseCard next={next} />);
    expect(screen.getByText('Next release')).toBeTruthy();
    expect(screen.getByText('after 1.8.2')).toBeTruthy();
  });

  it('promotes the leading candidate to the first Flight environment', () => {
    const onPromote = jest.fn();
    render(<NextReleaseCard next={next} name="CEDAR" promoteTo="staging" onPromote={onPromote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Promote amber-finch to staging' }));
    expect(onPromote).toHaveBeenCalledWith(leading);
  });

  it('offers no promote without a Flight environment to promote to', () => {
    render(<NextReleaseCard next={next} name="CEDAR" onPromote={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /Promote/ })).toBeNull();
  });
});

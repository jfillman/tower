import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommandDeck } from './CommandDeck';
import { CommitSignatureBlock } from './ReleaseRecordEvidence';
import { buildReleaseRecordHtml } from './ReleaseRecordExport';
import { ReleaseMatrix } from './ReleaseMatrix';
import { commitProofLine, commitProofOf, commitProofPoints, type SignatureEvidence } from './commitProof';
import { confidenceBreakdown, withPersistedGuardrails, type ReleaseRecord } from './useReleaseRecords';
import type { ReleaseRecordDoc } from './useReleaseRecordPersistence';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import type { EnvironmentSummary } from './types';

// Provenance phase 3 (glidepath ADR-0027): how a release's commit was proven, from the provenance gate's
// <!-- glidepath:signature --> evidence the backend puts on the check, live or sealed with the record.

const merge: SignatureEvidence = {
  v: 1, path: 'github-merge', repo: 'jfillman/backstage', commit: '61634fb4', pr: 173, mergedBy: 'jfillman', approvers: [], key: 'B5690EEEBB952194', mode: 'merger', requiredApprovals: 0,
};
const gitsign: SignatureEvidence = { v: 1, path: 'gitsign', repo: 'jfillman/gate-api', commit: '35185f91', signer: 'dev@example.com' };
const strict: SignatureEvidence = { ...merge, path: 'github-merge-strict', mode: 'strict', strictCommits: 3, approvers: ['riley'] };

const check = (signature?: SignatureEvidence, conclusion = 'success') => ({
  name: 'Pipelines as Code CI / provenance-',
  status: 'completed' as const,
  conclusion,
  ...(signature ? { signature } : {}),
});
const ci = (signature?: SignatureEvidence, conclusion = 'success') => ({
  state: 'success' as const,
  totalChecks: 1,
  passedChecks: conclusion === 'success' ? 1 : 0,
  checks: [check(signature, conclusion)],
});
const GITOPS = 'https://github.com/jfillman/gitops-backstage/pull/57';

describe('commitProofOf', () => {
  it('reads each path from the provenance check', () => {
    expect(commitProofOf({ guardrails: ci(gitsign), guardrailsPrUrl: GITOPS }).state).toBe('gitsign');
    expect(commitProofOf({ guardrails: ci(strict), guardrailsPrUrl: GITOPS }).state).toBe('github-merge-strict');
    expect(commitProofOf({ guardrails: ci(merge), guardrailsPrUrl: GITOPS }).state).toBe('github-merge');
  });
  it('says what is missing otherwise', () => {
    expect(commitProofOf({}).state).toBe('none');
    expect(commitProofOf({ guardrails: ci(), guardrailsPrUrl: GITOPS }).state).toBe('not-recorded');
    expect(commitProofOf({ guardrails: ci(undefined, 'failure'), guardrailsPrUrl: GITOPS }).state).toBe('failed');
    expect(commitProofOf({ guardrails: ci(), guardrailsPrUrl: 'https://github.com/jfillman/flight-api/pull/9' }).state).toBe('not-required');
    expect(commitProofOf({ guardrails: ci({ ...merge, v: 2 }), guardrailsPrUrl: GITOPS }).state).toBe('unknown');
  });
  it('weighs gitsign over a GitHub merge (decision 2): 6 / 4 / 2 / 0', () => {
    const pts = (s?: SignatureEvidence) => commitProofPoints(commitProofOf({ guardrails: ci(s), guardrailsPrUrl: GITOPS }));
    expect([pts(gitsign), pts(strict), pts(merge), pts()]).toEqual([6, 4, 2, 0]);
  });
  it('names who proved it', () => {
    expect(commitProofLine(commitProofOf({ guardrails: ci(merge), guardrailsPrUrl: GITOPS }))).toBe(
      "Merged by jfillman in jfillman/backstage#173 (GitHub's key B5690EEEBB952194)",
    );
    expect(commitProofLine(commitProofOf({ guardrails: ci(strict), guardrailsPrUrl: GITOPS }))).toBe(
      'Merged by jfillman in jfillman/backstage#173; all 3 commits gitsign-signed; approved by riley',
    );
    expect(commitProofLine(commitProofOf({ guardrails: ci(gitsign), guardrailsPrUrl: GITOPS }))).toBe('Signed by dev@example.com (Sigstore, logged in Rekor)');
  });
});

const record = (over: Partial<ReleaseRecord> = {}): ReleaseRecord =>
  ({
    id: 'backstage@1.0.2-61634fb',
    appName: 'backstage',
    imageTag: '1.0.2-61634fb',
    version: '1.0.2',
    createdAt: '2026-10-20T00:00:00Z',
    current: true,
    status: 'healthy',
    pullRequests: [],
    changeCategories: { features: 0, fixes: 0, chores: 0 },
    commits: [],
    pipelineRuns: [],
    testResults: [],
    securityScans: [],
    hasSbom: false,
    deployments: [],
    promotionChain: [],
    incidents: [],
    confidence: 50,
    ...over,
  }) as unknown as ReleaseRecord;

describe('the score', () => {
  it('adds the Commit proof line to sealed guardrails, and the breakdown says why', () => {
    const doc = (s?: SignatureEvidence) => ({ guardrails: { prNumber: 57, prUrl: GITOPS, ci: ci(s) } }) as ReleaseRecordDoc;
    expect(withPersistedGuardrails(record(), doc(gitsign)).confidence).toBe(50 + 30 + 6);
    expect(withPersistedGuardrails(record(), doc(merge)).confidence).toBe(50 + 30 + 2);
    expect(withPersistedGuardrails(record(), doc()).confidence).toBe(50 + 30);
    const line = confidenceBreakdown(withPersistedGuardrails(record(), doc(merge)), 0).find(l => l.label === 'Commit proof');
    expect(line).toMatchObject({ points: 2, max: 6 });
    expect(line?.note).toMatch(/not a personal key/);
  });
});

describe('where it shows', () => {
  const classes = { scanBlock: '', scanHead: '', scanName: '', scanFindings: '', kv: '' };
  it('the record: green with the merge hint and the PR link', () => {
    render(<CommitSignatureBlock record={{ guardrails: ci(merge), guardrailsPrUrl: GITOPS }} classes={classes} />);
    expect(screen.getByText('GitHub merge')).toBeTruthy();
    expect(screen.getByText(/Proven by GitHub's signature/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /PR #173/ }).getAttribute('href')).toBe('https://github.com/jfillman/backstage/pull/173');
  });
  it('the record: gitsign has no hint, a failed gate shows nothing', () => {
    const { container, rerender } = render(<CommitSignatureBlock record={{ guardrails: ci(gitsign), guardrailsPrUrl: GITOPS }} classes={classes} />);
    expect(screen.getByText('gitsign')).toBeTruthy();
    expect(screen.queryByText(/Proven by GitHub's signature/)).toBeNull();
    rerender(<CommitSignatureBlock record={{ guardrails: ci(undefined, 'failure'), guardrailsPrUrl: GITOPS }} classes={classes} />);
    expect(container.textContent).toBe('');
  });
  it('the export', () => {
    const html = buildReleaseRecordHtml(record({ guardrails: ci(merge), guardrailsPrUrl: GITOPS }));
    expect(html).toContain('Commit signature: GitHub merge');
    expect(html).toContain('Commit proof +2/6');
  });
  it('the Release matrix: a chip on the build, the line on hover', () => {
    const env = { key: 'prod', env: 'prod' } as unknown as EnvironmentSummary;
    render(
      <MemoryRouter>
        <ReleaseMatrix
          releases={[{ imageTag: '1.0.2-61634fb', cells: { prod: { status: 'deployed' } } } as never]}
          totalCount={1}
          environments={[env]}
          provenanceByImage={{}}
          onPromote={jest.fn()}
          proofs={new Map([['1.0.2-61634fb', commitProofOf({ guardrails: ci(merge), guardrailsPrUrl: GITOPS })]])}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('GitHub merge').getAttribute('title')).toMatch(/^Commit: Merged by jfillman/);
  });
  it('the Command Deck: a pending promotion says how its commit was proven', () => {
    const pr = {
      repo: 'gitops', number: 57, title: 'Release: backstage to prod @ 1.0.2-61634fb', url: GITOPS, draft: false, labels: [],
      createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', state: 'open', ci: ci(merge),
    } as unknown as PullRequestSummary;
    const prod = { key: 'prod', env: 'prod', availableReplicas: 1, desiredReplicas: 1 } as unknown as EnvironmentSummary;
    render(
      <MemoryRouter>
        <CommandDeck environments={[prod]} gitopsPrs={[pr]} sourcePrs={[]} onSelectTab={jest.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/commit: GitHub merge \(jfillman\)/)).toBeTruthy();
  });
});

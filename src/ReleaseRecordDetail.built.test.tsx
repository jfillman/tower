import { render, screen } from '@testing-library/react';
import { ReleaseRecordDetail } from './ReleaseRecordDetail';
import type { ReleaseRecord } from './useReleaseRecords';

jest.mock('./releaseFlow', () => ({
  ...jest.requireActual('./releaseFlow'),
  useReleaseSignoff: () => ({ loading: false, notFound: true }),
}));

jest.mock('./useReleaseRecordPersistence', () => ({
  useReleaseRecordDoc: () => ({ loading: false, notFound: true }),
  useSubmitHumanContext: () => ({ loading: false, submit: jest.fn(), reset: jest.fn() }),
}));

const gate = (name: string, conclusion = 'success', message = `Pipelines as Code CI/${name}- has successfully validated your commit.`) => ({
  name: `Pipelines as Code CI / ${name}-`,
  status: 'completed' as const,
  conclusion,
  message,
});

const record = (over: Partial<ReleaseRecord> = {}): ReleaseRecord =>
  ({
    id: 'gate-api@1.1.7-dd50863',
    appName: 'gate-api',
    imageTag: '1.1.7-dd50863',
    imageDigest: 'sha256:f0ae7ecf169c80881a2d00000000000000000000000000000000000000000000',
    createdAt: '2026-10-07T01:00:00Z',
    current: true,
    status: 'healthy',
    pullRequests: [],
    changeCategories: { feat: 0, fix: 0, chore: 0, other: 0 },
    commits: [],
    pipelineRuns: [],
    testResults: [],
    securityScans: [],
    hasSbom: true,
    guardrails: {
      state: 'success',
      totalChecks: 3,
      passedChecks: 2,
      checks: [gate('sast'), gate('provenance'), gate('image-scan', 'failure', 'Trivy found 2 CRITICAL vulnerabilities')],
    },
    guardrailsPrUrl: 'https://github.com/o/gitops-gate-api/pull/26',
    guardrailsPrNumber: 26,
    deployments: [],
    promotionChain: [],
    incidents: [],
    confidence: 80,
    ...over,
  }) as unknown as ReleaseRecord;

const renderDetail = (r: ReleaseRecord) =>
  render(<ReleaseRecordDetail record={r} appName="gate-api" otherRecords={[]} onCompare={jest.fn()} onBack={jest.fn()} />);

describe('What was built', () => {
  it('shows gates as tiles with the count, and only messages that say something', () => {
    renderDetail(record());
    expect(screen.getByText('Release gates')).toBeTruthy();
    expect(screen.getByText('2/3 passed')).toBeTruthy();
    expect(screen.queryByText(/has successfully validated your commit/)).toBeNull();
    expect(screen.getByText(/Trivy found 2 CRITICAL vulnerabilities/)).toBeTruthy();
    expect(screen.getByText('View gitops PR #26')).toBeTruthy();
  });
  it('has no Tests and security section when there are no scans, test results or check ride', () => {
    renderDetail(record());
    expect(screen.queryByText('Tests and security')).toBeNull();
    expect(screen.queryByTestId('record-check-ride')).toBeNull();
  });
  it('shows Tests and security when there are scans', () => {
    renderDetail(record({ securityScans: [{ scanner: 'image-scan', outcome: 'passed' }] as unknown as ReleaseRecord['securityScans'] }));
    expect(screen.getByText('Tests and security')).toBeTruthy();
  });
});

describe('Check ride and change request (Glidepath test framework, itsm wrapper)', () => {
  const frozen = {
    outcome: 'passed',
    role: 'check-ride',
    testsTotal: 8,
    testsPassed: 8,
    testsFailed: 0,
    testsSkipped: 0,
    workflowSource: 'argocd:check-rides',
    executionId: '6ad6',
    finishedOn: '2026-10-19T17:40:00Z',
    verified: true,
    attestedRuns: 3,
  };
  it('shows the check ride frozen into the sealed record, with its counts and source', () => {
    renderDetail(record({ testEvidence: frozen }));
    const block = screen.getByTestId('record-check-ride');
    expect(block.textContent).toContain('Check ride passed');
    expect(block.textContent).toContain('8 of 8 passed');
    expect(block.textContent).toContain('argocd:check-rides');
    expect(block.textContent).toContain('Testkube 6ad6');
    expect(block.textContent).toContain('3 attested runs');
    expect(screen.getByText('verified')).toBeTruthy();
  });
  it("says when the team's tests passed but no check ride ran, and when the ride failed", () => {
    renderDetail(record({ testEvidence: { ...frozen, role: 'test', workflowSource: 'repo:https://github.com/o/gate-api@abc' } }));
    expect(screen.getByTestId('record-check-ride').textContent).toContain("The team's tests passed; no check ride");
  });
  it('marks an unverified attestation', () => {
    renderDetail(record({ testEvidence: { ...frozen, verified: false, verificationError: 'no log entry' } }));
    expect(screen.getByTestId('record-check-ride').textContent).toContain('attestation not verified');
    expect(screen.getByText('no log entry')).toBeTruthy();
  });
  it('shows the change request with its state, linked to the ITSM record', () => {
    renderDetail(record({ changeRequest: { id: 'sys1', number: 'CHG0001', url: 'https://sn.example/CHG0001', state: 'closed-successful', env: 'prod' } }));
    const cr = screen.getByTestId('record-change-request');
    expect(cr.textContent).toContain('Change request');
    expect(cr.textContent).toContain('closed successful');
    expect(screen.getByText('CHG0001').closest('a')?.getAttribute('href')).toBe('https://sn.example/CHG0001');
  });
  it('has no change request block when the release was not tracked by one', () => {
    renderDetail(record());
    expect(screen.queryByTestId('record-change-request')).toBeNull();
  });
});

import { render, screen } from '@testing-library/react';
import { ReleaseRecordDetail } from './ReleaseRecordDetail';
import type { ReleaseRecord } from './useReleaseRecords';

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
  it('has no Security section when there are no scans or test results', () => {
    renderDetail(record());
    expect(screen.queryByText('Security')).toBeNull();
  });
  it('shows Security when there are scans', () => {
    renderDetail(record({ securityScans: [{ scanner: 'image-scan', outcome: 'passed' }] as unknown as ReleaseRecord['securityScans'] }));
    expect(screen.getByText('Security')).toBeTruthy();
  });
});

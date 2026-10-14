import { render, screen } from '@testing-library/react';
import { ReleaseRecordList } from './ReleaseRecordList';
import { applyApprovalBonus, displayScore, withPersistedGuardrails, withRecordedEvidence, type ReleaseRecord } from './useReleaseRecords';
import type { ReleaseRecordDoc } from './useReleaseRecordPersistence';

// The bug: a superseded record's row showed its live score (no gate data left: 55) while the opened record
// used the guardrails frozen in its committed file (80 since R3 dropped the constant +5). Both now start from the same recorded evidence.
const live = {
  id: 'bags@1.1.1-e9080a0',
  appName: 'bags',
  imageTag: '1.1.1-e9080a0',
  version: '1.1.1',
  createdAt: '2026-09-30T00:00:00Z',
  current: false,
  status: 'superseded',
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
  confidence: 55,
} as unknown as ReleaseRecord;
const guardrails = { prNumber: 19, prUrl: 'u19', ci: { state: 'success' as const, totalChecks: 9, passedChecks: 9 } };

describe('one score for a record everywhere', () => {
  it('scores the row from the same frozen guardrails the open record uses', () => {
    const row = withRecordedEvidence(live, { guardrails, signoffs: 1 });
    const opened = withPersistedGuardrails(row, { guardrails } as ReleaseRecordDoc);
    expect(row.confidence).toBe(80);
    expect(displayScore(row)).toBe(applyApprovalBonus(opened.confidence, 1));
    expect(displayScore(row)).toBe(85);
  });

  it('leaves a record with nothing recorded as it is', () => {
    expect(withRecordedEvidence(live, undefined)).toBe(live);
    expect(displayScore(live)).toBe(55);
  });

  it('shows the recorded score in the list row', () => {
    render(<ReleaseRecordList records={[withRecordedEvidence(live, { guardrails, signoffs: 1 })]} totalKnown={1} onOpen={jest.fn()} />);
    expect(screen.getByText('85')).toBeTruthy();
  });
});

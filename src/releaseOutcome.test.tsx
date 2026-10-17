import { render, screen } from '@testing-library/react';
import { autolandEligibility } from './AutolandEligibility';
import { ReleaseChangelog } from './ReleaseChangelog';
import { outcomeChip, ReleaseOutcomePanel } from './ReleaseOutcome';
import type { RecordOutcome } from './releaseFlow';
import { statusPill } from './ReleaseRecordList';
import { withRecordedEvidence, type ReleaseRecord } from './useReleaseRecords';
import { ReleaseCalendarPanel } from './tabs/dashboard/opswall/panels';

const D = (d: number) => new Date(Date.UTC(2026, 9, d)).toISOString();
const record = (over: Partial<ReleaseRecord> = {}): ReleaseRecord =>
  ({
    id: 'bags@1.1.0-aaaaaaa',
    appName: 'bags',
    imageTag: '1.1.0-aaaaaaa',
    createdAt: D(1),
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
    confidence: 80,
    ...over,
  }) as ReleaseRecord;
const outcome = (over: Partial<RecordOutcome>): RecordOutcome => ({ state: 'superseded', bakeDays: 7, sloMeasured: false, ...over });

describe('outcomes on records', () => {
  it('labels a final outcome, and a release still baking by its day', () => {
    expect(outcomeChip(outcome({ result: 'clean' }))).toEqual({ label: 'clean', tone: 'ok' });
    expect(outcomeChip(outcome({ result: 'rolled-back' }))).toEqual({ label: 'rolled back', tone: 'bad' });
    expect(outcomeChip(outcome({ state: 'healthy', healthyAt: D(10) }), Date.parse(D(12)) + 3600_000)).toEqual({
      label: 'baking · day 3 of 7',
      tone: 'info',
    });
    expect(outcomeChip(undefined)).toBeUndefined();
  });

  it('marks a record rolled back from its outcome', () => {
    const r = withRecordedEvidence(record(), { outcome: outcome({ result: 'rolled-back', rolledBackBy: '1.0.0-fffffff' }) });
    expect(r.status).toBe('rolled-back');
    expect(statusPill(r)).toEqual({ label: 'rolled back', tone: 'bad' });
  });

  it('says what happened, naming the release that replaced it', () => {
    render(
      <ReleaseOutcomePanel
        outcome={outcome({ result: 'clean', closedBy: 'superseded', supersededBy: '1.2.0-bbbbbbb', env: 'prod', closedAt: D(5) })}
        names={new Map([['1.2.0-bbbbbbb', 'CEDAR']])}
        githubRelease={{ tag: 'v1.1.0', url: 'https://github.com/o/bags/releases/tag/v1.1.0' }}
      />,
    );
    expect(screen.getByText('Replaced by CEDAR · 1.2.0-bbbbbbb')).toBeTruthy();
    expect(screen.getByText('v1.1.0 ↗').closest('a')?.getAttribute('href')).toBe('https://github.com/o/bags/releases/tag/v1.1.0');
    expect(screen.getByText(/the production cluster's Prometheus is off/)).toBeTruthy();
  });

  it('explains a record with no outcome', () => {
    render(<ReleaseOutcomePanel />);
    expect(screen.getByText(/No outcome recorded/)).toBeTruthy();
  });
});

describe('changelog', () => {
  it("lists every release's notes, newest first, by name", () => {
    render(
      <ReleaseChangelog
        onBack={jest.fn()}
        names={{
          byTag: new Map([
            ['1.0.0-aaaaaaa', 'ASPEN'],
            ['1.1.0-bbbbbbb', 'BIRCH'],
          ]),
          next: 'CEDAR',
          index: [
            { imageTag: '1.0.0-aaaaaaa', env: 'prod', generatedAt: D(1), store: 'gitops' },
            {
              imageTag: '1.1.0-bbbbbbb',
              env: 'prod',
              generatedAt: D(5),
              store: 'gitops',
              notes: { added: ['Bag-tag reprint (#12)'] },
              outcome: outcome({ result: 'clean' }),
            },
          ],
        }}
      />,
    );
    const names = screen.getAllByText(/^(ASPEN|BIRCH)$/).map(e => e.textContent);
    expect(names).toEqual(['BIRCH', 'ASPEN']);
    expect(screen.getByText('Bag-tag reprint (#12)')).toBeTruthy();
    expect(screen.getByText('No notes were written for this release.')).toBeTruthy();
  });
});

describe('autolandEligibility', () => {
  it('needs test results, a canary, production metrics, a clean history and high readiness', () => {
    const clean = Array.from({ length: 5 }, (_, i) =>
      record({
        imageTag: `1.${i}.0-aaaaaaa`,
        createdAt: D(i + 1),
        confidence: 85,
        testResults: [{ taskName: 't', resultName: 'passed', value: '12' }],
        deployments: [{ env: 'prod', cluster: 'example-prod', deployedAt: D(i + 1), isLive: false, rolloutStrategy: 'canary' }],
        outcome: outcome({ result: 'clean' }),
      }),
    );
    expect(autolandEligibility(clean, 'prod').map(i => [i.id, i.state])).toEqual([
      ['tests', 'ok'],
      ['canary', 'ok'],
      ['metrics', 'todo'],
      ['outcomes', 'ok'],
      ['readiness', 'ok'],
    ]);
    const today = autolandEligibility([record({ confidence: 60 })], 'prod');
    expect(today.filter(i => i.state === 'ok')).toEqual([]);
    expect(today.find(i => i.id === 'outcomes')?.detail).toBe('0 recorded outcomes; needs at least 5');
  });
});

describe('release calendar panel', () => {
  it("shows each app's next release, soonest first, with how late it is", () => {
    render(
      <ReleaseCalendarPanel
        now={Date.parse(D(14))}
        limit={10}
        towerHref={app => `/tower?app=${app}`}
        entries={[
          {
            appName: 'bags',
            owner: 'o',
            mode: 'hand-flown',
            signoffEnv: 'prod',
            next: { name: 'CEDAR', targetDate: '2026-10-12', releaseOwner: 'example-org', noteCount: 3 },
            inFlight: [{ env: 'staging', imageTag: '1.2.0-ccccccc', prUrl: 'u' }],
            last: { name: 'BIRCH', imageTag: '1.1.0-bbbbbbb', at: D(5), outcome: 'clean' },
          },
        ]}
      />,
    );
    expect(screen.getByText('bags · CEDAR · Hand-flown')).toBeTruthy();
    expect(screen.getByText('2d late')).toBeTruthy();
    expect(screen.getByText('owner example-org · 3 notes · → staging · last BIRCH (clean)')).toBeTruthy();
  });
});

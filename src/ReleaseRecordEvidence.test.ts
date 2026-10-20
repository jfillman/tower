import { changeRequestTone, checkRideHeadline, checkRideOf, checkRideTone } from './ReleaseRecordEvidence';
import type { TestRunEvidence } from './supplyChain';

const live = (over: Partial<TestRunEvidence> = {}): TestRunEvidence => ({
  attestation: { predicateType: 'https://slsa.dev/provenance/v0.2', verified: true, verificationCode: 'verified' },
  role: 'check-ride',
  outcome: 'passed',
  testsTotal: 8,
  testsPassed: 8,
  workflowSource: 'argocd:check-rides',
  executionId: 'e1',
  ...over,
});

describe('checkRideOf', () => {
  it('prefers the evidence frozen into the sealed record over the live provenance', () => {
    const r = checkRideOf({ checkRide: live({ outcome: 'failed' }), testEvidence: { outcome: 'passed', role: 'check-ride', workflowSource: 'argocd:check-rides', verified: true, attestedRuns: 2 } });
    expect(r).toMatchObject({ outcome: 'passed', frozen: true, shared: true, verified: true, verificationLabel: 'verified', attestedRuns: 2 });
    expect(checkRideTone(r)).toBe('ok');
    expect(checkRideHeadline(r)).toBe('Check ride passed');
  });
  it('reads the live ride with the attestation verdict in words', () => {
    const r = checkRideOf({ checkRide: live({ attestation: { predicateType: 'x', verified: false, verificationCode: 'no-log-entry' } }) });
    expect(r).toMatchObject({ frozen: false, verified: false, shared: true });
    expect(r?.verificationLabel).not.toBe('verified');
    expect(checkRideTone(r)).toBe('warn');
    expect(checkRideHeadline(r)).toBe('Check ride passed, attestation not verified');
  });
  it('grades a failure, a team-only run, an unshared ride and no run at all', () => {
    expect(checkRideTone(checkRideOf({ checkRide: live({ outcome: 'failed' }) }))).toBe('bad');
    expect(checkRideHeadline(checkRideOf({ checkRide: live({ outcome: 'failed' }) }))).toBe('Check ride failed');
    expect(checkRideHeadline(checkRideOf({ checkRide: live({ role: 'test', workflowSource: 'repo:x@y' }) }))).toBe("The team's tests passed; no check ride");
    expect(checkRideHeadline(checkRideOf({ checkRide: live({ workflowSource: 'repo:x@y' }) }))).toBe('Check ride passed, not from the shared repository');
    expect(checkRideOf({})).toBeUndefined();
    expect(checkRideTone(undefined)).toBe('neutral');
    expect(checkRideHeadline(undefined)).toBe('No test run attested on this image');
  });
});

describe('changeRequestTone', () => {
  it('follows the itsm lifecycle', () => {
    expect(changeRequestTone(undefined)).toBe('info');
    expect(changeRequestTone('created')).toBe('info');
    expect(changeRequestTone('implementing')).toBe('warn');
    expect(changeRequestTone('implementing-failed')).toBe('bad');
    expect(changeRequestTone('closed-successful')).toBe('ok');
    expect(changeRequestTone('closed-unsuccessful')).toBe('bad');
  });
});

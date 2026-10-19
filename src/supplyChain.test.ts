import { buildSupplyChainStages } from './PipelineFlow';
import { explain, findCheckRide, findSlsa, findTestRuns, isSignedAndAttested, verdictOf } from './supplyChain';
import type { Attestation, ProvenanceResponse } from './types';

const att = (predicateType: string, over: Partial<Attestation> = {}): Attestation => ({
  predicateType,
  verified: true,
  verificationCode: 'verified',
  transparencyLog: { logIndex: 1 },
  ...over,
});
const SLSA = 'https://slsa.dev/provenance/v0.2';
const SBOM = 'https://cyclonedx.org/bom';
const SIG = 'cosign.sigstore.dev/signature/simple-signing';
const prov = (...attestations: Attestation[]): ProvenanceResponse => ({ digest: 'sha256:x', attestations });
const statuses = (p: ProvenanceResponse) => Object.fromEntries(buildSupplyChainStages(p, false).map(s => [s.id, s.status]));

describe('supply-chain steps say what verified, not what exists', () => {
  it('is all green only when everything verified', () => {
    expect(statuses(prov(att(SLSA), att(SBOM), att(SIG)))).toEqual({
      build: 'done',
      'sast-sbom': 'done',
      signature: 'done',
      tests: 'pending',
      'sign-attest': 'done',
      rekor: 'done',
    });
  });

  it('turns amber, not green, when present but unverified (found live: boarding-api 1.1.3 in pre-prod)', () => {
    const stale = { verified: false, verificationCode: 'stale-receipt' as const, verificationError: 'inclusion promise could not be verified' };
    const p = prov(att(SLSA, stale), att(SBOM, stale), att(SIG, { verified: false, verificationCode: 'no-log-entry', transparencyLog: undefined }));
    expect(statuses(p)).toEqual({ build: 'warn', 'sast-sbom': 'warn', signature: 'warn', tests: 'pending', 'sign-attest': 'warn', rekor: 'warn' });
    expect(isSignedAndAttested(p)).toBe(false);
  });

  it('turns red when something contradicts the image, and one verified item no longer makes the roll-up green', () => {
    const p = prov(att(SLSA), att(SBOM, { verified: false, verificationCode: 'log-entry-mismatch' }));
    expect(statuses(p)['sign-attest']).toBe('fail');
    expect(statuses(p)['sast-sbom']).toBe('fail');
    expect(isSignedAndAttested(p)).toBe(false);
  });

  it('greys a missing item instead of failing it', () => {
    expect(statuses(prov(att(SLSA)))).toMatchObject({ build: 'done', 'sast-sbom': 'pending', signature: 'pending' });
  });

  it('reads an older backend that sends no code from its message', () => {
    expect(verdictOf(att(SLSA, { verified: false, verificationCode: undefined, verificationError: 'expected 1 timestamps, got 0' }))).toBe('unverified');
    expect(verdictOf(att(SLSA, { verified: false, verificationCode: undefined, verificationError: 'attestation subject digest does not match this image' }))).toBe('contradicted');
  });
});

describe('plain words', () => {
  it('explains a stale receipt as not tampering, with what to do', () => {
    const e = explain(att(SBOM, { verified: false, verificationCode: 'stale-receipt' }), 'SBOM');
    expect(e.tone).toBe('warn');
    expect(e.headline).toBe("Rekor's receipt for the SBOM couldn't be checked");
    expect(e.consequence).toMatch(/Not a sign of tampering/);
  });

  it("tells you not to promote an image whose log entry disagrees", () => {
    const e = explain(att(SLSA, { verified: false, verificationCode: 'log-entry-mismatch' }), 'build provenance');
    expect(e.tone).toBe('bad');
    expect(e.consequence).toMatch(/Don't promote it/);
  });
});

// Glidepath test framework (2026-10-19): Chains attaches every test PipelineRun's provenance to the tested image.
const task = (name: string, results: Record<string, string>) => ({ name, results: Object.entries(results).map(([n, v]) => ({ name: n, value: v })) });
const buildProv = (over: Partial<Attestation> = {}) =>
  att(SLSA, { predicate: { buildConfig: { tasks: [task('preflight', {}), task('build-image', { 'image-digest': 'sha256:x' })] } }, ...over });
const testProv = (results: Record<string, string>, finishedOn: string, over: Partial<Attestation> = {}) =>
  att(SLSA, {
    predicate: { metadata: { buildFinishedOn: finishedOn }, buildConfig: { tasks: [task('preflight', {}), task('run-testworkflow', results), task('debrief', {})] } },
    ...over,
  });
const passedRide = { outcome: 'passed', role: 'check-ride', 'tests-total': '8', 'tests-passed': '8', 'tests-failed': '0', 'tests-skipped': '0', 'workflow-source': 'argocd:check-rides', 'execution-id': 'e1' };
const passedTeam = { outcome: 'passed', role: 'test', 'tests-total': '8', 'tests-passed': '8', 'tests-failed': '0', 'tests-skipped': '0', 'workflow-source': 'repo:https://github.com/o/app@abc', 'execution-id': 'e0' };

describe('attested test runs', () => {
  it('still finds the build provenance when a test provenance comes first on the image', () => {
    const p = prov(testProv(passedTeam, '2026-10-19T17:30:00Z'), buildProv());
    expect(findSlsa(p)).toBe(p.attestations[1]);
    expect(statuses(p).build).toBe('done');
    expect(isSignedAndAttested(p)).toBe(true);
  });

  it('is green for a verified, passed check ride from the shared repository, and reads the counts', () => {
    const p = prov(buildProv(), testProv(passedTeam, '2026-10-19T17:30:00Z'), testProv(passedRide, '2026-10-19T17:40:00Z'));
    expect(statuses(p).tests).toBe('done');
    expect(findCheckRide(p)?.testsPassed).toBe(8);
    expect(findTestRuns(p).map(r => r.executionId)).toEqual(['e1', 'e0']);
  });

  it("is amber when only the team's own tests ran", () => {
    expect(statuses(prov(buildProv(), testProv(passedTeam, '2026-10-19T17:30:00Z'))).tests).toBe('warn');
  });

  it('is amber for a check ride that did not come from the shared repository', () => {
    const p = prov(buildProv(), testProv({ ...passedRide, 'workflow-source': 'repo:https://github.com/o/app@abc' }, '2026-10-19T17:40:00Z'));
    expect(statuses(p).tests).toBe('warn');
  });

  it('shows the newest verified pass over a later failure, so a flaky re-run does not hide the evidence', () => {
    const p = prov(buildProv(), testProv(passedRide, '2026-10-19T17:40:00Z'), testProv({ ...passedRide, outcome: 'failed', 'tests-failed': '2', 'execution-id': 'e2' }, '2026-10-19T18:00:00Z'));
    expect(findCheckRide(p)?.executionId).toBe('e1');
    expect(statuses(p).tests).toBe('done');
  });

  it('is red when no check ride on the image passed', () => {
    const p = prov(buildProv(), testProv({ ...passedRide, outcome: 'failed', 'tests-failed': '2' }, '2026-10-19T18:00:00Z'));
    expect(statuses(p).tests).toBe('fail');
  });

  it('is grey with no attested run at all', () => {
    expect(statuses(prov(buildProv())).tests).toBe('pending');
  });
});

import { buildSupplyChainStages } from './PipelineFlow';
import { explain, isSignedAndAttested, verdictOf } from './supplyChain';
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
      'sign-attest': 'done',
      rekor: 'done',
    });
  });

  it('turns amber, not green, when present but unverified (found live: boarding-api 1.1.3 in pre-prod)', () => {
    const stale = { verified: false, verificationCode: 'stale-receipt' as const, verificationError: 'inclusion promise could not be verified' };
    const p = prov(att(SLSA, stale), att(SBOM, stale), att(SIG, { verified: false, verificationCode: 'no-log-entry', transparencyLog: undefined }));
    expect(statuses(p)).toEqual({ build: 'warn', 'sast-sbom': 'warn', signature: 'warn', 'sign-attest': 'warn', rekor: 'warn' });
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

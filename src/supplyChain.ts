import type { Attestation, ProvenanceResponse } from './types';

// What an image's signatures and attestations mean, in one place (2026-10-14). Every view that says "signed",
// "verified" or colours a supply-chain step reads it from here, so the colour always means the same thing:
//   green  - checked and verified;
//   amber  - present but not verified, for a reason that is not evidence of tampering (no log entry, a receipt Tower
//            couldn't refresh, the trust root unreachable);
//   red    - something contradicts the image (a different log entry, another image's digest, a bad signature);
//   grey   - missing, or still loading.
// Found live: Build, SBOM, Signature and Rekor used to go green as soon as the item existed, and Sign + Attest went
// green when any one attestation verified, so a step could be green while its own detail said it did not verify.

export type VerificationCode = NonNullable<Attestation['verificationCode']>;
export type Verdict = 'verified' | 'unverified' | 'contradicted' | 'missing';

export const SLSA_PROVENANCE = 'https://slsa.dev/provenance/v0.2';
export const SIMPLE_SIGNING = 'cosign.sigstore.dev/signature/simple-signing';

const CONTRADICTED: VerificationCode[] = ['log-entry-mismatch', 'digest-mismatch', 'signature-invalid'];

/** An older backend sends no code: infer it from the message the same way it would. */
function codeOf(a: Attestation): VerificationCode {
  if (a.verificationCode) return a.verificationCode;
  if (a.verified) return 'verified';
  const e = (a.verificationError ?? '').toLowerCase();
  if (e.includes('trust root')) return 'trust-root-unavailable';
  if (e.includes('digest does not match')) return 'digest-mismatch';
  if (e.includes('timestamps')) return 'no-log-entry';
  if (e.includes('inclusion promise') || e.includes('checkpoint')) return 'stale-receipt';
  if (e.includes('missing its')) return 'incomplete';
  return 'signature-invalid';
}

export function verdictOf(a: Attestation | undefined): Verdict {
  if (!a) return 'missing';
  const code = codeOf(a);
  if (code === 'verified') return 'verified';
  return CONTRADICTED.includes(code) ? 'contradicted' : 'unverified';
}

/** The weakest of several: one contradiction makes the whole step red, one unverified item makes it amber. */
export function worstVerdict(atts: Attestation[]): Verdict {
  if (atts.length === 0) return 'missing';
  const vs = atts.map(verdictOf);
  if (vs.includes('contradicted')) return 'contradicted';
  if (vs.includes('unverified')) return 'unverified';
  return 'verified';
}

export function findSlsa(p?: ProvenanceResponse) {
  return p?.attestations.find(a => a.predicateType === SLSA_PROVENANCE);
}
export function findSbom(p?: ProvenanceResponse) {
  return p?.attestations.find(a => /cyclonedx|spdx/i.test(a.predicateType));
}
export function findSignature(p?: ProvenanceResponse) {
  return p?.attestations.find(a => a.predicateType === SIMPLE_SIGNING);
}

/**
 * "Signed and attested", as the readiness score, the record and the Command Deck count it: the build provenance (what
 * the release gate checks) verified, and nothing else on the image contradicting it.
 */
export function isSignedAndAttested(p?: ProvenanceResponse): boolean {
  if (!p) return false;
  return verdictOf(findSlsa(p)) === 'verified' && worstVerdict(p.attestations) !== 'contradicted';
}

export interface Explanation {
  /** One line: what Tower found. */
  headline: string;
  /** Why, in plain words. */
  body: string;
  /** What it means for the release, and what to do. */
  consequence?: string;
  tone: 'good' | 'warn' | 'bad';
  label: string;
}

/** Plain words for one signature or attestation; `what` names it ("build provenance", "SBOM", "image signature"). */
export function explain(a: Attestation, what: string): Explanation {
  const code = codeOf(a);
  const logged = a.transparencyLog ? `Rekor entry #${a.transparencyLog.logIndex}` : 'the transparency log';
  switch (code) {
    case 'verified':
      return {
        headline: `The ${what} is verified`,
        body: `Its signature checks out against this platform's signing root, and ${logged} shows it was signed while the short-lived signing certificate was valid.`,
        tone: 'good',
        label: 'verified',
      };
    case 'no-log-entry':
      return {
        headline: `The ${what} isn't in the transparency log`,
        body: `Tower found no Rekor entry for it. Without one, nothing shows the short-lived signing certificate was still valid when it was used, so the signature can't be relied on.`,
        consequence: 'Treat it as unsigned. It says nothing about tampering; the image may predate the transparency log.',
        tone: 'warn',
        label: 'not logged',
      };
    case 'stale-receipt':
      return {
        headline: `Rekor's receipt for the ${what} couldn't be checked`,
        body: `The receipt in the image was signed with a key Rekor no longer has (it got a new key when it restarted), and Tower couldn't get a fresh receipt from Rekor just now. The entry itself is still in the log.`,
        consequence: "Not a sign of tampering. It should verify once Rekor is reachable; the release gate reads Rekor directly.",
        tone: 'warn',
        label: 'unchecked',
      };
    case 'trust-root-unavailable':
      return {
        headline: `The ${what} couldn't be checked right now`,
        body: "Tower couldn't load this platform's signing root, so nothing on this image could be checked.",
        consequence: 'This says nothing about the image. Try again shortly.',
        tone: 'warn',
        label: 'unchecked',
      };
    case 'incomplete':
      return {
        headline: `The ${what} is incomplete`,
        body: 'Part of what is needed to check it (the certificate or the signature itself) is missing from the image.',
        consequence: "It can't be verified. Rebuilding the image signs it again.",
        tone: 'warn',
        label: 'incomplete',
      };
    case 'log-entry-mismatch':
      return {
        headline: `The transparency log disagrees with the ${what}`,
        body: `Rekor's entry at the position this ${what} names is a different record from the one it carries.`,
        consequence: "Treat this image as untrusted until someone has looked into it. Don't promote it.",
        tone: 'bad',
        label: 'contradicted',
      };
    case 'digest-mismatch':
      return {
        headline: `The ${what} belongs to a different image`,
        body: "It was signed for another image digest, not this one.",
        consequence: "Treat this image as untrusted until someone has looked into it. Don't promote it.",
        tone: 'bad',
        label: 'wrong image',
      };
    default:
      return {
        headline: `The ${what}'s signature doesn't check out`,
        body: `Checked against this platform's signing root, the signature failed${a.verificationError ? ` (${a.verificationError})` : ''}.`,
        consequence: "Treat this image as untrusted until someone has looked into it. Don't promote it.",
        tone: 'bad',
        label: 'failed',
      };
  }
}

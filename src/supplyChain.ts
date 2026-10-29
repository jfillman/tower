import type { Attestation, ProvenanceResponse, SlsaProvenanceV02Predicate } from './types';

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
/**
 * The Flight promotion attestation (glidepath ADR-0029): signed by the promoter workflow on public Sigstore, not by this
 * platform's signing root, so it is its own step (Promoted) and never part of the Sign + Attest or Rekor roll-ups.
 */
export const PROMOTION = 'https://hangar.io/attestations/promotion/v1';

export interface PromotionPredicate {
  source?: string;
  flightRef?: string;
  digest?: string;
  releaseId?: string;
  /** owner/repo#pr@headSha */
  pullRequest?: string;
  gates?: Record<string, string>;
  promotedAt?: string;
  runUrl?: string;
}

export const isPromotion = (a: Attestation) => a.predicateType === PROMOTION;

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

function tasksOf(a: Attestation | undefined) {
  if (!a || a.predicateType !== SLSA_PROVENANCE) return [];
  return ((a.predicate as SlsaProvenanceV02Predicate | undefined)?.buildConfig?.tasks ?? []).filter(Boolean);
}
function resultOf(a: Attestation, task: string, name: string): string | undefined {
  return tasksOf(a).find(t => t.name === task)?.results?.find(r => r.name === name)?.value;
}

/** The build's SLSA provenance: the one whose pipeline built the image (build-image). */
export function isBuildProvenance(a: Attestation): boolean {
  return a.predicateType === SLSA_PROVENANCE && tasksOf(a).some(t => t.name === 'build-image');
}
/**
 * A test stage's SLSA provenance (Glidepath test framework, 2026-10-19): Tekton Chains attaches every test
 * PipelineRun's provenance to the tested image, and its run-testworkflow entry carries the result.
 */
export function isTestProvenance(a: Attestation): boolean {
  return a.predicateType === SLSA_PROVENANCE && tasksOf(a).some(t => t.name === 'run-testworkflow');
}

/**
 * The build provenance. Since test runs are attested onto the same digest, "the first SLSA attestation" can be a test
 * run's: prefer the one that built the image, then any that isn't a test run, then whatever is there.
 */
export function findSlsa(p?: ProvenanceResponse) {
  const slsa = p?.attestations.filter(a => a.predicateType === SLSA_PROVENANCE) ?? [];
  return slsa.find(isBuildProvenance) ?? slsa.find(a => !isTestProvenance(a)) ?? slsa[0];
}

/** One attested test run, read out of its provenance's run-testworkflow results (glidepath docs/admin/testing.md). */
export interface TestRunEvidence {
  attestation: Attestation;
  /** test, execute or check-ride. */
  role: string;
  /** passed, failed, timeout or skipped; empty on a run that never wrote it. */
  outcome: string;
  testsTotal?: number;
  testsPassed?: number;
  testsFailed?: number;
  testsSkipped?: number;
  /** argocd:<application> for a synced check ride, repo:<url>@<rev> for the app's own workflow, script for integration-test.sh. */
  workflowSource?: string;
  workflowDigest?: string;
  executionId?: string;
  reportPath?: string;
  /** The provenance's buildFinishedOn: when the run ended. */
  finishedOn?: string;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function testRunOf(a: Attestation): TestRunEvidence | undefined {
  if (!isTestProvenance(a)) return undefined;
  const r = (name: string) => resultOf(a, 'run-testworkflow', name);
  return {
    attestation: a,
    role: r('role') ?? 'test',
    outcome: r('outcome') ?? '',
    testsTotal: num(r('tests-total')),
    testsPassed: num(r('tests-passed')),
    testsFailed: num(r('tests-failed')),
    testsSkipped: num(r('tests-skipped')),
    workflowSource: r('workflow-source') || undefined,
    workflowDigest: r('workflow-digest') || undefined,
    executionId: r('execution-id') || undefined,
    reportPath: r('report-path') || undefined,
    finishedOn: (a.predicate as SlsaProvenanceV02Predicate | undefined)?.metadata?.buildFinishedOn,
  };
}

/** Every attested test run on the image, newest first. */
export function findTestRuns(p?: ProvenanceResponse): TestRunEvidence[] {
  const runs = (p?.attestations ?? []).map(testRunOf).filter((r): r is TestRunEvidence => !!r);
  return runs.sort((x, y) => (y.finishedOn ?? '').localeCompare(x.finishedOn ?? ''));
}

/** A run is from the shared check-rides repository (synced by Argo CD), not a file in the app repo. */
export function isSharedCheckRide(r: TestRunEvidence): boolean {
  return r.role === 'check-ride' && (r.workflowSource?.startsWith('argocd:') ?? false);
}

/**
 * The check ride the release depends on: the newest verified, passed one; else the newest check ride at all, so a
 * failure is shown rather than hidden behind an older pass.
 */
export function findCheckRide(p?: ProvenanceResponse): TestRunEvidence | undefined {
  const rides = findTestRuns(p).filter(r => r.role === 'check-ride');
  return rides.find(r => r.outcome === 'passed' && verdictOf(r.attestation) === 'verified') ?? rides[0];
}
/**
 * The run a release is judged by: the check ride (findCheckRide), else the newest attested run of any role, so
 * "the team's tests ran but there is no check ride" reads differently from "nothing ran". Same selection as the
 * backend's checkRideEvidence, which freezes it into the Release Record.
 */
export function findReleaseTestRun(p?: ProvenanceResponse): TestRunEvidence | undefined {
  return findCheckRide(p) ?? findTestRuns(p)[0];
}
export function findSbom(p?: ProvenanceResponse) {
  return p?.attestations.find(a => /cyclonedx|spdx/i.test(a.predicateType));
}
export function findSignature(p?: ProvenanceResponse) {
  return p?.attestations.find(a => a.predicateType === SIMPLE_SIGNING);
}
/** The image's promotion to Flight: the newest verified one, else the newest (re-promotion adds one, PROM-07). */
export function findPromotion(p?: ProvenanceResponse): Attestation | undefined {
  const all = (p?.attestations ?? [])
    .filter(isPromotion)
    .sort((a, b) => (promotionOf(b).promotedAt ?? '').localeCompare(promotionOf(a).promotedAt ?? ''));
  return all.find(a => verdictOf(a) === 'verified') ?? all[0];
}
export function promotionOf(a: Attestation): PromotionPredicate {
  return (a.predicate ?? {}) as PromotionPredicate;
}
/** Everything this platform's own signing root signed: what Sign + Attest and Rekor stand for. */
export function platformSigned(p?: ProvenanceResponse): Attestation[] {
  return (p?.attestations ?? []).filter(a => !isPromotion(a));
}

/**
 * "Signed and attested", as the readiness score, the record and the Command Deck count it: the build provenance (what
 * the release gate checks) verified, and nothing else on the image contradicting it.
 */
export function isSignedAndAttested(p?: ProvenanceResponse): boolean {
  if (!p) return false;
  return verdictOf(findSlsa(p)) === 'verified' && worstVerdict(platformSigned(p)) !== 'contradicted';
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

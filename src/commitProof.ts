import type { PrCheckRun, PullRequestSummary } from './pullRequests/usePullRequests';

// How a release's commit was proven (glidepath ADR-0027, provenance phase 3). The provenance gate's PR comment carries
// `<!-- glidepath:signature {...} -->`; the backend turns it into the provenance check's `signature` (only from the
// platform App's comment) and the record seals it with its guardrails. One place reads it, so the record, the score,
// the export, the Release matrix and the Releases header agree.

/** Contract v1 (glidepath docs/admin/commit-signing.md, Evidence). Unknown fields are ignored. */
export interface SignatureEvidence {
  v: number;
  path: string;
  repo?: string;
  commit?: string;
  signer?: string;
  pr?: number;
  mergedBy?: string;
  approvers?: string[];
  key?: string;
  mode?: string;
  requiredApprovals?: number;
  strictCommits?: number;
}

export type CommitProofState =
  | 'gitsign'
  | 'github-merge-strict'
  | 'github-merge'
  /** A marker Tower doesn't understand (another contract version or path). */
  | 'unknown'
  /** The gate passed but left no marker: sealed before phase 3. */
  | 'not-recorded'
  /** A cloud target's release pin PR: commit signatures aren't checked (glidepath ADR-0020). */
  | 'not-required'
  | 'failed'
  /** No provenance check on record at all. */
  | 'none';

export interface CommitProof {
  state: CommitProofState;
  evidence?: SignatureEvidence;
}

const PATHS = new Set(['gitsign', 'github-merge-strict', 'github-merge']);

/** The provenance gate's check, whatever PaC prefixes its name with. */
export function provenanceCheck(checks: PrCheckRun[] | undefined): PrCheckRun | undefined {
  return checks?.find(c => c.name.replace(/^Pipelines as Code(?:\s+CI)?\s*\/\s*/i, '').replace(/-+\s*$/, '').toLowerCase() === 'provenance');
}

// A Kubernetes release's gates ran on its gitops-<app> release PR; anything else on record is a cloud target's release
// pin PR on the source repo (the backend's gitopsRepoFor naming), which skips the commit check.
function isPinPr(prUrl: string | undefined): boolean {
  return Boolean(prUrl) && !/\/gitops-[^/]+\/pull\//.test(prUrl!);
}

export function commitProofOf(r: { guardrails?: PullRequestSummary['ci']; guardrailsPrUrl?: string }): CommitProof {
  const check = provenanceCheck(r.guardrails?.checks);
  if (!check) return { state: 'none' };
  if (isPinPr(r.guardrailsPrUrl)) return { state: 'not-required' };
  const sig = check.signature;
  if (sig) {
    if (sig.v === 1 && PATHS.has(sig.path)) return { state: sig.path as CommitProofState, evidence: sig };
    return { state: 'unknown', evidence: sig };
  }
  if (check.status === 'completed' && check.conclusion && check.conclusion !== 'success') return { state: 'failed' };
  if (check.status !== 'completed') return { state: 'none' };
  return { state: 'not-recorded' };
}

/** The confidence score's Commit proof line (decision 2, 2026-10-20): gitsign weighs more than a GitHub merge. */
export const COMMIT_PROOF_MAX = 6;
const POINTS: Partial<Record<CommitProofState, number>> = { gitsign: 6, 'github-merge-strict': 4, 'github-merge': 2 };

export function commitProofPoints(p: CommitProof): number {
  return POINTS[p.state] ?? 0;
}

export function commitProofNote(p: CommitProof): string {
  switch (p.state) {
    case 'gitsign':
      return 'An allowed person signed the released commit with their own short-lived Sigstore certificate.';
    case 'github-merge-strict':
      return 'GitHub merged it for an allowed login, and every commit in the PR is gitsign-signed.';
    case 'github-merge':
      return "GitHub merged it for an allowed login; GitHub's key and record are the proof, not a personal key.";
    case 'not-required':
      return "Cloud targets don't check commit signatures (glidepath ADR-0020).";
    case 'failed':
      return "The provenance gate didn't pass, so the commit isn't proven.";
    case 'unknown':
      return 'The gate recorded a proof this version of Tower does not read.';
    default:
      return "How the commit was proven isn't on record.";
  }
}

/** Short words for a chip: what proved it. Undefined when there is nothing worth a chip. */
export function commitProofChip(p: CommitProof): string | undefined {
  switch (p.state) {
    case 'gitsign':
      return 'gitsign';
    case 'github-merge-strict':
      return 'GitHub merge, strict';
    case 'github-merge':
      return 'GitHub merge';
    case 'not-recorded':
      return 'not recorded';
    case 'not-required':
      return 'not required';
    case 'unknown':
      return 'unknown proof';
    default:
      return undefined;
  }
}

/** Green for every passing path (decision 1); neutral when nothing is known. */
export function commitProofTone(p: CommitProof): 'ok' | 'neutral' | 'bad' {
  if (p.state === 'gitsign' || p.state === 'github-merge-strict' || p.state === 'github-merge') return 'ok';
  if (p.state === 'failed') return 'bad';
  return 'neutral';
}

/** One line saying who proved what. */
export function commitProofLine(p: CommitProof): string {
  const e = p.evidence;
  let pr = 'its PR';
  if (e?.pr) pr = e.repo ? `${e.repo}#${e.pr}` : `#${e.pr}`;
  const approvers = e?.approvers?.length ? `; approved by ${e.approvers.join(', ')}` : '';
  switch (p.state) {
    case 'gitsign':
      return `Signed by ${e?.signer ?? 'an allowed signer'} (Sigstore, logged in Rekor)`;
    case 'github-merge-strict':
      return `Merged by ${e?.mergedBy ?? 'an allowed login'} in ${pr}; all${e?.strictCommits ? ` ${e.strictCommits}` : ''} commits gitsign-signed${approvers}`;
    case 'github-merge':
      return `Merged by ${e?.mergedBy ?? 'an allowed login'} in ${pr} (GitHub's key ${e?.key ?? 'web-flow'})${approvers}`;
    case 'not-recorded':
      return 'Recorded before the gate kept this';
    case 'not-required':
      return 'Cloud target: commit signing is not checked (ADR-0020)';
    case 'failed':
      return "The provenance gate failed; see the gates";
    case 'unknown':
      return `Proven by "${e?.path ?? '?'}" (a newer gate than this Tower knows)`;
    default:
      return 'No provenance gate result on record';
  }
}

export const MERGE_HINT =
  "Proven by GitHub's signature and its record of who merged, not by a personal key.";
export const COMMIT_SIGNING_DOC =
  'https://github.com/jfillman/glidepath/blob/main/docs/admin/commit-signing.md#what-a-web-flow-signature-does-and-doesnt-prove';

export function isMergePath(p: CommitProof): boolean {
  return p.state === 'github-merge' || p.state === 'github-merge-strict';
}

/** The app PR the commit came from, for a link. */
export function commitProofPrUrl(p: CommitProof): string | undefined {
  const e = p.evidence;
  return e?.repo && e.pr ? `https://github.com/${e.repo}/pull/${e.pr}` : undefined;
}

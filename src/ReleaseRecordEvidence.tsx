import Link from '@material-ui/core/Link';
import { formatDateTime } from './shared/format';
import { ColumnLabel, Hint, StatusChip, type StatusTone } from './ui';
import { PrRef } from './ui/PrRef';
import { explain, isSharedCheckRide, verdictOf, type TestRunEvidence } from './supplyChain';
import type { ReleaseRecord } from './useReleaseRecords';
import type { ChangeRequestRef, TestEvidence } from './useReleaseRecordPersistence';
import {
  COMMIT_SIGNING_DOC,
  MERGE_HINT,
  commitProofChip,
  commitProofLine,
  commitProofOf,
  commitProofPrUrl,
  commitProofTone,
  isMergePath,
} from './commitProof';

// The release's test evidence and its change request, on the Release Record (Glidepath test framework,
// phase 4; the itsm wrapper). Both come frozen in the committed record once it is sealed, and live before
// that: the check ride from the image's provenance (what the qa release gate verified), the change request
// from the release-tracking record.

type Classes = Record<string, string>;

/** One shape for the live check ride (provenance) and the frozen one (the record), the frozen one first. */
export function checkRideOf(record: Pick<ReleaseRecord, 'checkRide' | 'testEvidence'>): {
  outcome: string;
  role: string;
  testsTotal?: number;
  testsPassed?: number;
  testsFailed?: number;
  testsSkipped?: number;
  workflowSource?: string;
  executionId?: string;
  finishedOn?: string;
  verified: boolean;
  verificationLabel: string;
  shared: boolean;
  frozen: boolean;
  attestedRuns?: number;
} | undefined {
  const f: TestEvidence | undefined = record.testEvidence;
  if (f) {
    return {
      ...f,
      verificationLabel: f.verified ? 'verified' : f.verificationError ?? 'unverified',
      shared: f.role === 'check-ride' && (f.workflowSource?.startsWith('argocd:') ?? false),
      frozen: true,
    };
  }
  const l: TestRunEvidence | undefined = record.checkRide;
  if (!l) return undefined;
  const verdict = verdictOf(l.attestation);
  return {
    outcome: l.outcome,
    role: l.role,
    testsTotal: l.testsTotal,
    testsPassed: l.testsPassed,
    testsFailed: l.testsFailed,
    testsSkipped: l.testsSkipped,
    workflowSource: l.workflowSource,
    executionId: l.executionId,
    finishedOn: l.finishedOn,
    verified: verdict === 'verified',
    verificationLabel: verdict === 'verified' ? 'verified' : explain(l.attestation, 'test attestation').label,
    shared: isSharedCheckRide(l),
    frozen: false,
  };
}

export function checkRideTone(ride: ReturnType<typeof checkRideOf>): StatusTone {
  if (!ride) return 'neutral';
  if (ride.outcome !== 'passed') return 'bad';
  if (ride.role !== 'check-ride' || !ride.shared || !ride.verified) return 'warn';
  return 'ok';
}

export function checkRideHeadline(ride: ReturnType<typeof checkRideOf>): string {
  if (!ride) return 'No test run attested on this image';
  if (ride.outcome !== 'passed') return ride.role === 'check-ride' ? 'Check ride failed' : "The team's tests did not pass";
  if (ride.role !== 'check-ride') return "The team's tests passed; no check ride";
  if (!ride.shared) return 'Check ride passed, not from the shared repository';
  if (!ride.verified) return 'Check ride passed, attestation not verified';
  return 'Check ride passed';
}

export function CheckRideBlock({ record, classes }: { record: ReleaseRecord; classes: Classes }) {
  const ride = checkRideOf(record);
  const counts = ride?.testsTotal !== undefined ? `${ride.testsPassed ?? 0} of ${ride.testsTotal} passed${ride.testsFailed ? `, ${ride.testsFailed} failed` : ''}${ride.testsSkipped ? `, ${ride.testsSkipped} skipped` : ''}` : undefined;
  return (
    <div className={classes.scanBlock} data-testid="record-check-ride">
      <div className={classes.scanHead}>
        <span className={classes.scanName}>Check ride</span>
        <StatusChip tone={checkRideTone(ride)}>{ride ? ride.outcome || 'no outcome' : 'none'}</StatusChip>
        {ride && (
          <StatusChip tone={ride.verified ? 'ok' : 'warn'}>{ride.verificationLabel}</StatusChip>
        )}
      </div>
      <div className={classes.scanFindings}>
        {checkRideHeadline(ride)}
        {counts ? ` · ${counts}` : ''}
        {ride?.workflowSource ? ` · ${ride.workflowSource}` : ''}
        {ride?.executionId ? ` · Testkube ${ride.executionId}` : ''}
        {ride?.finishedOn ? ` · ${formatDateTime(ride.finishedOn)}` : ''}
      </div>
      {ride && (
        <Hint>
          {ride.frozen
            ? `Frozen into this record when it was sealed${ride.attestedRuns ? ` (${ride.attestedRuns} attested run${ride.attestedRuns === 1 ? '' : 's'} on the image then)` : ''}. The qa release gate read the same provenance.`
            : 'Read live from the image\'s provenance; the Images tab lists every attested run with a download.'}
        </Hint>
      )}
    </div>
  );
}

export function changeRequestTone(state: string | undefined): StatusTone {
  if (!state || state === 'created') return 'info';
  if (state === 'closed-successful') return 'ok';
  if (state === 'implementing-failed' || state === 'closed-unsuccessful') return 'bad';
  return 'warn';
}

const STATE_WORDS: Record<string, string> = {
  created: 'created, awaiting approval',
  implementing: 'implementing',
  'implementing-failed': 'implementing, the deploy failed',
  'closed-successful': 'closed successful',
  'closed-unsuccessful': 'closed unsuccessful',
};

export function ChangeRequestFact({ record, classes }: { record: Pick<ReleaseRecord, 'changeRequest'>; classes: Classes }) {
  const cr: ChangeRequestRef | undefined = record.changeRequest;
  if (!cr) return null;
  const label = cr.number ?? cr.id;
  return (
    <div className={classes.kv} style={{ marginBottom: 10 }} data-testid="record-change-request">
      <ColumnLabel>Change request</ColumnLabel>
      <div className={classes.scanHead}>
        {cr.url ? (
          <Link href={cr.url} target="_blank" rel="noopener noreferrer">
            {label}
          </Link>
        ) : (
          <span>{label}</span>
        )}
        <StatusChip tone={changeRequestTone(cr.state)}>{STATE_WORDS[cr.state ?? 'created'] ?? cr.state}</StatusChip>
        {cr.approval && cr.state === 'created' && <Hint>approval: {cr.approval}</Hint>}
        {cr.rolledBackByChange && <Hint>rolled back by {cr.rolledBackByChange}</Hint>}
      </div>
    </div>
  );
}

/**
 * How the released commit was proven (glidepath ADR-0027, provenance phase 3), from the provenance gate's evidence on
 * the record's guardrails - live, or sealed with the record. Green for every passing path; a GitHub merge says what
 * its proof rests on. Nothing when the record has no provenance gate result or the gate failed (the gate grid shows
 * that).
 */
export function CommitSignatureBlock({ record, classes }: { record: Pick<ReleaseRecord, 'guardrails' | 'guardrailsPrUrl'>; classes: Classes }) {
  const proof = commitProofOf(record);
  const chip = commitProofChip(proof);
  if (!chip) return null;
  const prUrl = commitProofPrUrl(proof);
  return (
    <div className={classes.scanBlock} data-testid="record-commit-signature">
      <div className={classes.scanHead}>
        <span className={classes.scanName}>Commit signature</span>
        <StatusChip tone={commitProofTone(proof)}>{chip}</StatusChip>
      </div>
      <div className={classes.scanFindings}>
        {commitProofLine(proof)}
        {prUrl && (
          <>
            {' · '}
            <PrRef pr={{ url: prUrl, number: proof.evidence?.pr }} size="inline" />
          </>
        )}
      </div>
      {isMergePath(proof) && (
        <Hint>
          {MERGE_HINT}{' '}
          <Link href={COMMIT_SIGNING_DOC} target="_blank" rel="noopener noreferrer">
            What that means
          </Link>
        </Hint>
      )}
    </div>
  );
}

/**
 * Whether the commit's proof alone is reason to show the Tests and security section: a recorded proof. "Not recorded"
 * and "not required" still show inside the block when the section is there for its scans, but don't open it on every
 * older record by themselves.
 */
export function hasCommitSignature(record: Pick<ReleaseRecord, 'guardrails' | 'guardrailsPrUrl'>): boolean {
  const { state } = commitProofOf(record);
  return state === 'gitsign' || state === 'github-merge-strict' || state === 'github-merge' || state === 'unknown';
}

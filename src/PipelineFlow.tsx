import { useState } from 'react';
import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import CheckIcon from '@material-ui/icons/Check';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import RemoveIcon from '@material-ui/icons/Remove';
import FiberManualRecordIcon from '@material-ui/icons/FiberManualRecord';
import BuildIcon from '@material-ui/icons/Build';
import ReceiptIcon from '@material-ui/icons/Receipt';
import VerifiedUserIcon from '@material-ui/icons/VerifiedUser';
import HistoryIcon from '@material-ui/icons/History';
import LockIcon from '@material-ui/icons/Lock';
import AssignmentTurnedInIcon from '@material-ui/icons/AssignmentTurnedIn';
import { formatDateTime } from './shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { JsonDocumentView } from './ResourceInspector';
import type { Attestation, ProvenanceResponse } from './types';
import {
  explain,
  findCheckRide,
  findSbom,
  findSignature,
  findSlsa,
  findTestRuns,
  isSharedCheckRide,
  SIMPLE_SIGNING,
  testRunOf,
  verdictOf,
  worstVerdict,
  type TestRunEvidence,
  type Verdict,
} from './supplyChain';

// The graphical, process-flowing supply-chain visualization the user asked
// for in place of the mockup's compact segmented progress bar (see
// HANDOFF-tower-module.md consultation, "Supply chain viz" decision,
// 2026-09-07): a real stage-by-stage pipeline - Build -> SAST/SBOM ->
// Sign+Attest -> Rekor -> one node per real environment tier - each node
// showing real pass/fail/verify state from the same /api/glidepath/
// provenance data GlidepathPage.tsx already fetches (see useReleaseData.ts),
// clickable to expand the exact certificate/transparency-log detail that
// used to live in GlidepathPage.tsx's SupplyChainPanel.

export type StageStatus = 'done' | 'current' | 'warn' | 'fail' | 'pending';

export interface SupplyChainStage {
  kind: 'supply-chain';
  id: string;
  label: string;
  status: StageStatus;
  attestation?: Attestation;
  /** Every signature and attestation on the image, for the roll-up steps' "n of m verified". */
  all?: Attestation[];
}

export interface EnvStage {
  kind: 'env';
  id: string;
  label: string;
  status: StageStatus;
}

export type Stage = SupplyChainStage | EnvStage;

// Derives the five fixed supply-chain stages from one image's real provenance response. A step is green only when
// what it stands for verified, amber when it is there but unverified for a reason that isn't evidence of tampering,
// red when something contradicts the image, grey when it is missing or loading (src/supplyChain.ts). Missing items
// stay grey, not red: those gates are informational on this platform, and an image may predate them.
export function buildSupplyChainStages(
  provenance: ProvenanceResponse | undefined,
  loading: boolean,
): SupplyChainStage[] {
  const slsa = findSlsa(provenance);
  const sbom = findSbom(provenance);
  // The classic `cosign sign` image signature: it signs the image manifest itself, not a statement about it.
  const signature = findSignature(provenance);
  const all = provenance?.attestations ?? [];
  const logged = all.filter(a => a.transparencyLog);
  // Attested test runs (Glidepath test framework, 2026-10-19): Chains attaches every test stage's provenance to the
  // tested image. The step stands for the check ride, the run a release depends on; the team's own runs are listed in
  // its detail. Green: a verified, passed check ride. Amber: tests ran and passed but no check ride, or the ride
  // passed but its signature didn't verify. Red: the latest check ride failed, or its provenance contradicts the
  // image. Grey: nothing attested.
  const testRuns = findTestRuns(provenance);
  const checkRide = findCheckRide(provenance);
  const primaryRun = checkRide ?? testRuns[0];

  function statusOf(verdict: Verdict): StageStatus {
    if (loading || !provenance) return 'pending';
    if (verdict === 'verified') return 'done';
    if (verdict === 'contradicted') return 'fail';
    if (verdict === 'unverified') return 'warn';
    return 'pending';
  }

  // The step's own detail shows the weakest item it stands for, so the colour and the words agree.
  const weakest = (atts: Attestation[]) =>
    atts.find(a => verdictOf(a) === 'contradicted') ?? atts.find(a => verdictOf(a) === 'unverified') ?? atts[0];

  function testsStatus(): StageStatus {
    if (loading || !provenance || !primaryRun) return 'pending';
    if (primaryRun.outcome !== 'passed') return 'fail';
    const s = statusOf(verdictOf(primaryRun.attestation));
    if (s === 'done' && !(checkRide && isSharedCheckRide(checkRide))) return 'warn';
    return s;
  }

  return [
    { kind: 'supply-chain', id: 'build', label: 'Build', status: statusOf(verdictOf(slsa)), attestation: slsa },
    { kind: 'supply-chain', id: 'sast-sbom', label: 'SAST / SBOM', status: statusOf(verdictOf(sbom)), attestation: sbom },
    { kind: 'supply-chain', id: 'signature', label: 'Signature', status: statusOf(verdictOf(signature)), attestation: signature },
    {
      kind: 'supply-chain',
      id: 'tests',
      label: 'Tests',
      status: testsStatus(),
      attestation: primaryRun?.attestation,
      all: testRuns.map(r => r.attestation),
    },
    {
      kind: 'supply-chain',
      id: 'sign-attest',
      label: 'Sign + Attest',
      status: statusOf(worstVerdict(all)),
      attestation: weakest(all),
      all,
    },
    {
      kind: 'supply-chain',
      id: 'rekor',
      label: 'Rekor',
      status: statusOf(worstVerdict(logged)),
      attestation: weakest(logged),
      all,
    },
  ];
}

const useMiniFlowStyles = makeStyles<import('@material-ui/core/styles').Theme, { t: HangarTokens }>(
  () => ({
    mini: { display: 'flex', alignItems: 'center', gap: 3 },
    dot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
    seg: { flex: '1 1 10px', height: 2, minWidth: 6 },
  }),
);

// Compact, non-interactive read of the same real supply-chain stage data
// PipelineFlow's full stage-by-stage view uses - just dots and connecting
// segments, no labels or click-to-expand. For contexts that want the fleet-
// view mockup's at-a-glance progress strip (Overview's per-env rail cards)
// without the full drawer interaction PipelineFlow's own nodes carry.
export function MiniFlow({ stages }: { stages: SupplyChainStage[] }) {
  const t = useHangarTokens();
  const classes = useMiniFlowStyles({ t });
  return (
    <div className={classes.mini}>
      {stages.map((stage, i) => (
        <div key={stage.id} style={{ display: 'contents' }}>
          <span className={classes.dot} style={{ backgroundColor: dotStyle(t, stage.status).borderColor }} />
          {i < stages.length - 1 && (
            <span
              className={classes.seg}
              style={{ backgroundColor: stage.status === 'done' ? t.good : t.line }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const useStyles = makeStyles<import('@material-ui/core/styles').Theme, { t: HangarTokens }>(
  () => ({
    flow: {
      display: 'flex',
      alignItems: 'stretch',
      gap: 2,
      padding: '14px 20px',
      borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
      overflowX: 'auto',
    },
    node: {
      flex: '1 1 0',
      minWidth: 84,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      cursor: 'pointer',
      padding: '4px 2px',
      borderRadius: 4,
      '&:hover $label': ({ t }) => ({ color: t.textHi }),
    },
    nodeSelected: {
      backgroundColor: ({ t }) => t.panelAlt,
    },
    connector: {
      flex: '0 0 20px',
      alignSelf: 'center',
      height: 2,
      marginTop: -20,
    },
    dot: {
      width: 26,
      height: 26,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid transparent',
      fontSize: 15,
    },
    label: {
      fontFamily: fontMono,
      fontSize: 11,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: ({ t }) => t.textFaint,
      textAlign: 'center',
      lineHeight: 1.3,
    },
    labelKind: {
      fontFamily: fontMono,
      fontSize: 11,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: ({ t }) => t.textFaint,
      opacity: 0.6,
    },
    drawer: {
      padding: '16px 20px',
      borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
      backgroundColor: ({ t }) => t.panelAlt,
    },
    drawerTitle: {
      fontFamily: fontDisplay,
      fontWeight: 700,
      fontSize: 13,
      color: ({ t }) => t.textHi,
      marginBottom: 10,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '10px 24px',
    },
    kv: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
    kvLabel: {
      fontFamily: fontMono,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: ({ t }) => t.textFaint,
    },
    kvValue: {
      fontFamily: fontMono,
      fontSize: 12,
      color: ({ t }) => t.textHi,
      wordBreak: 'break-word',
    },
    note: {
      fontSize: 12,
      fontStyle: 'italic',
      color: ({ t }) => t.textLo,
    },
    friendlyHeadline: {
      fontFamily: fontDisplay,
      fontWeight: 700,
      fontSize: 15,
      marginBottom: 4,
    },
    friendlyBody: {
      fontSize: 13,
      color: ({ t }) => t.textLo,
      marginBottom: 10,
    },
    pillRow: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginBottom: 10,
    },
    pill: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: fontMono,
      fontSize: 11,
      letterSpacing: '0.03em',
      padding: '3px 9px',
      borderRadius: 12,
      border: '1px solid',
    },
    detailsToggle: {
      fontFamily: fontMono,
      fontSize: 11,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: ({ t }) => t.sky,
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
    },
    detailsBody: {
      marginTop: 12,
      paddingTop: 12,
      borderTop: ({ t }) => `1px dashed ${t.lineSoft}`,
    },
    link: {
      color: ({ t }) => t.sky,
    },
  }),
);

function pillStyle(t: HangarTokens, tone: 'good' | 'warn' | 'bad' | 'neutral') {
  switch (tone) {
    case 'good':
      return { backgroundColor: t.goodSoft, borderColor: t.good, color: t.good };
    case 'warn':
      return { backgroundColor: t.amberSoft, borderColor: t.amberLine, color: t.amberInk };
    case 'bad':
      return { backgroundColor: t.badSoft, borderColor: t.bad, color: t.bad };
    case 'neutral':
    default:
      return { backgroundColor: t.panelAlt, borderColor: t.line, color: t.textFaint };
  }
}

function Pill({
  tone,
  children,
  classes,
  t,
}: {
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  children: ReactNode;
  classes: ReturnType<typeof useStyles>;
  t: HangarTokens;
}) {
  return (
    <span className={classes.pill} style={pillStyle(t, tone)}>
      {children}
    </span>
  );
}

function dotStyle(t: HangarTokens, status: StageStatus) {
  switch (status) {
    case 'done':
      return { backgroundColor: t.goodSoft, borderColor: t.good, color: t.good };
    case 'current':
      return { backgroundColor: t.skySoft, borderColor: t.sky, color: t.sky };
    case 'warn':
      return { backgroundColor: t.amberSoft, borderColor: t.amberLine, color: t.amberInk };
    case 'fail':
      return { backgroundColor: t.badSoft, borderColor: t.bad, color: t.bad };
    case 'pending':
    default:
      return { backgroundColor: t.panelAlt, borderColor: t.line, color: t.textFaint };
  }
}

// One glyph per real supply-chain stage (2026-09-16: "come up with unique
// icons for the 4 supply chain security items and apply them throughout")
// - a wrench for Build, a receipt for SAST/SBOM ("bill of materials" is
// literally what SBOM stands for), a lock for the classic cosign image
// signature, a verified-user shield for Sign+Attest, and a history/ledger
// icon for Rekor (an append-only transparency log). `fail` always wins
// regardless of stage - a broken gate matters more than which kind of gate
// it was, same posture as SignalRail's StepIcon.
const STAGE_ICON: Record<string, JSX.Element> = {
  build: <BuildIcon fontSize="inherit" />,
  'sast-sbom': <ReceiptIcon fontSize="inherit" />,
  signature: <LockIcon fontSize="inherit" />,
  'sign-attest': <VerifiedUserIcon fontSize="inherit" />,
  rekor: <HistoryIcon fontSize="inherit" />,
  tests: <AssignmentTurnedInIcon fontSize="inherit" />,
};

function StageIcon({ id, status }: { id: string; status: StageStatus }) {
  if (status === 'fail') return <ErrorOutlineIcon fontSize="inherit" />;
  if (STAGE_ICON[id]) return STAGE_ICON[id];
  if (status === 'done') return <CheckIcon fontSize="inherit" />;
  if (status === 'current') return <FiberManualRecordIcon style={{ fontSize: 10 }} />;
  if (status === 'warn') return <RemoveIcon fontSize="inherit" />;
  return null;
}

function CertificateFields({
  attestation,
  classes,
}: {
  attestation?: Attestation;
  classes: ReturnType<typeof useStyles>;
}) {
  const cert = attestation?.certificate;
  if (!cert) {
    return <Typography className={classes.note}>No signing certificate recorded.</Typography>;
  }
  const expired = new Date(cert.validTo).getTime() < Date.now();
  return (
    <div className={classes.grid}>
      <div className={classes.kv}>
        <span className={classes.kvLabel}>Signer identity</span>
        <span className={classes.kvValue}>{cert.identity ?? cert.subject}</span>
      </div>
      <div className={classes.kv}>
        <span className={classes.kvLabel}>Issued by</span>
        <span className={classes.kvValue}>{cert.issuer}</span>
      </div>
      <div className={classes.kv}>
        <span className={classes.kvLabel}>Cert validity</span>
        <span className={classes.kvValue}>
          {formatDateTime(cert.validFrom)} → {formatDateTime(cert.validTo)}
          {expired ? ' (expired)' : ''}
        </span>
      </div>
    </div>
  );
}

function envStageNote(status: StageStatus): string {
  if (status === 'current') return 'This release is currently deployed here.';
  if (status === 'done') return 'This release has already passed through this environment.';
  return 'Not reached by this release yet.';
}

// Friendly, plain-language framing per stage - grounded only in fields the
// backend actually returns (predicateType/verified/transparencyLog), never
// a claim we can't back with real data. Deliberately does NOT claim a SAST
// scan "passed": this platform's cicd.yaml has a real governance.sast gate,
// but no distinct SAST attestation predicateType is modeled by the backend
// today (glidepathProvenance.ts returns attestations generically, unlike
// SLSA/SBOM which it can name) - so the SAST/SBOM stage's friendly copy
// only asserts what's independently verifiable here: the SBOM.
const STAGE_WHAT: Record<string, string> = {
  build: 'build provenance',
  'sast-sbom': 'SBOM',
  signature: 'image signature',
  tests: 'test attestation',
};

function friendlySummary(
  stageId: string,
  att: Attestation | undefined,
  all: Attestation[],
): { headline: string; body: string; consequence?: string; pill?: { tone: 'good' | 'warn' | 'bad'; label: string } } {
  if (!att) {
    switch (stageId) {
      case 'build':
        return { headline: 'No build provenance', body: "This image has no SLSA provenance, so nothing records which pipeline built it." };
      case 'sast-sbom':
        return {
          headline: 'No SBOM attached',
          body: 'This image has no software bill of materials. It may predate this gate, or the gate is off for this app. SAST and policy checks run in the pipeline but aren’t shown here yet.',
        };
      case 'signature':
        return { headline: 'No image signature', body: 'This image has no `cosign sign` signature on its manifest. The attestations are separate.' };
      case 'rekor':
        return { headline: 'Not in the transparency log', body: 'Nothing on this image has a Rekor entry.' };
      case 'tests':
        return {
          headline: 'No test run attested',
          body: 'No test stage ran against this image, or it ran before test results were attached to images (2026-10-19). The qa release gate needs a passed check ride on the image.',
        };
      default:
        return { headline: 'Nothing signed', body: 'This image carries no signatures or attestations yet.' };
    }
  }
  if (stageId === 'sign-attest' || stageId === 'rekor') {
    // A roll-up: say how many verified, then explain the weakest one.
    const set = stageId === 'rekor' ? all.filter(a => a.transparencyLog) : all;
    const ok = set.filter(a => verdictOf(a) === 'verified').length;
    let what = 'build provenance';
    if (att.predicateType === SIMPLE_SIGNING) what = 'image signature';
    else if (/cyclonedx|spdx/i.test(att.predicateType)) what = 'SBOM';
    if (ok === set.length) {
      return {
        headline: stageId === 'rekor' ? `All ${set.length} log entries check out` : `All ${set.length} signatures verified`,
        body:
          stageId === 'rekor'
            ? "Each one is in this platform's own Rekor log, with a receipt signed by Rekor's current key."
            : "The build provenance, SBOM and image signature all check out against this platform's signing root.",
        pill: { tone: 'good', label: `${ok} of ${set.length} ✓` },
      };
    }
    const e = explain(att, what);
    return {
      headline: `${ok} of ${set.length} verified. ${e.headline}.`,
      body: e.body,
      consequence: e.consequence,
      pill: { tone: e.tone, label: `${ok} of ${set.length}` },
    };
  }
  if (stageId === 'tests') return testsSummary(att, all);
  const e = explain(att, STAGE_WHAT[stageId] ?? 'attestation');
  return { headline: e.headline, body: e.body, consequence: e.consequence, pill: { tone: e.tone, label: e.label } };
}

function countsOf(r: TestRunEvidence): string {
  if (r.testsTotal === undefined) return 'no test counts recorded';
  const parts = [`${r.testsPassed ?? 0} of ${r.testsTotal} passed`];
  if (r.testsFailed) parts.push(`${r.testsFailed} failed`);
  if (r.testsSkipped) parts.push(`${r.testsSkipped} skipped`);
  return parts.join(', ');
}

function roleLabel(r: TestRunEvidence): string {
  if (r.role === 'check-ride') return isSharedCheckRide(r) ? 'check ride' : 'check ride (not from the shared repo)';
  if (r.role === 'execute') return 'action';
  return "the team's test";
}

// The Tests step: the check ride first (the run the qa release gate reads), the team's own runs beside it.
function testsSummary(att: Attestation, all: Attestation[]): ReturnType<typeof friendlySummary> {
  const run = testRunOf(att);
  const runs = all.map(testRunOf).filter((r): r is TestRunEvidence => !!r);
  const others = runs.length - 1;
  const alsoRan = others > 0 ? ` ${others} other attested run${others === 1 ? '' : 's'} on this image ${others === 1 ? 'is' : 'are'} listed below.` : '';
  if (!run) return { headline: 'Test attestation', body: 'This attestation carries no run-testworkflow result.' };
  const sig = explain(att, 'test attestation');
  if (run.outcome !== 'passed') {
    return {
      headline: run.role === 'check-ride' ? 'The latest check ride failed' : `The latest attested test run ${run.outcome || 'did not pass'}`,
      body: `${roleLabel(run)[0].toUpperCase()}${roleLabel(run).slice(1)}: ${countsOf(run)}${run.executionId ? ` (Testkube execution ${run.executionId})` : ''}.${alsoRan}`,
      consequence: 'The qa release gate reads the outcome, so this image will not pass it until a check ride passes.',
      pill: { tone: 'bad', label: run.outcome || 'failed' },
    };
  }
  if (run.role !== 'check-ride') {
    return {
      headline: "The team's tests passed; no check ride on this image",
      body: `${countsOf(run)} in ${run.workflowSource?.startsWith('repo:') ? "the app repo's own workflow" : 'the workflow'}${run.executionId ? ` (Testkube execution ${run.executionId})` : ''}.${alsoRan}`,
      consequence: 'The qa release gate needs the check ride from the shared check-rides repository, which has not run for this image.',
      pill: { tone: 'warn', label: 'no check ride' },
    };
  }
  if (!isSharedCheckRide(run)) {
    return {
      headline: 'A check ride passed, but not from the shared repository',
      body: `${countsOf(run)}; the workflow came from ${run.workflowSource ?? 'an unknown source'}, not the check-rides Application.${alsoRan}`,
      consequence: 'The qa release gate only counts a check ride synced from the shared repository.',
      pill: { tone: 'warn', label: 'unshared' },
    };
  }
  if (sig.tone !== 'good') {
    return {
      headline: `The check ride passed, but ${sig.headline.replace(/^The test attestation /, 'its attestation ')}`,
      body: `${countsOf(run)}. ${sig.body}`,
      consequence: sig.consequence,
      pill: { tone: sig.tone, label: sig.label },
    };
  }
  return {
    headline: 'The check ride passed',
    body: `${countsOf(run)} in the shared check ride (${run.workflowSource}), run against this exact image${run.executionId ? `; Testkube execution ${run.executionId}` : ''}. Its attestation is verified and in the transparency log.${alsoRan}`,
    pill: { tone: 'good', label: `${run.testsPassed ?? '?'} of ${run.testsTotal ?? '?'} ✓` },
  };
}

// The three stages whose attestation.predicate is a real document someone
// might want to read in full, not just a pass/fail summary of - the SLSA
// provenance statement itself (build), the CycloneDX SBOM (sast-sbom), and
// the classic cosign "simple signing" payload (signature). 'sign-attest'
// and 'rekor' reuse one of these same attestations (buildSupplyChainStages'
// own fallback logic), so a second raw-document toggle there would just
// duplicate this one rather than show anything new.
const RAW_DOCUMENT_LABEL: Partial<Record<string, string>> = {
  build: 'SLSA provenance document',
  'sast-sbom': 'SBOM file',
  signature: 'cosign image signature',
  tests: 'test attestation',
};

// A real filename, not a generic "document.json" - once someone's
// downloaded a few of these (different images, different environments),
// a bare predicate-kind label is indistinguishable on disk. Every real
// InTotoStatement's own `subject` names the exact artifact it's about
// (per the in-toto spec - fetchImageSignature backfills the same field
// from the "simple signing" payload's own claimed digest, so this works
// for the classic image signature too), so this is real data, not
// guessed - falls back to just the kind if a subject is somehow missing
// rather than fabricating one.
type DocumentKind = 'provenance' | 'sbom' | 'signature' | 'tests';

function documentKindForStage(stageId: string): DocumentKind {
  if (stageId === 'build') return 'provenance';
  if (stageId === 'sast-sbom') return 'sbom';
  if (stageId === 'tests') return 'tests';
  return 'signature';
}

function attestationFilename(att: Attestation, kind: DocumentKind, suffix?: string): string {
  const subject = att.subject?.[0];
  const repo = subject?.name?.split('/').pop();
  const shortDigest = subject?.digest?.sha256?.slice(0, 12);
  const base = [repo, shortDigest].filter(Boolean).join('-');
  return `${base ? `${base}-` : ''}${kind}${suffix ? `-${suffix}` : ''}.json`;
}

// Plain client-side Blob download - no backend round-trip, the document is
// already sitting in this attestation's own `predicate` field.
function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Every attested test run on the image, newest first, each with its own download: the provenance document whose
// run-testworkflow results are the evidence (the same document the qa release gate verifies).
function TestRunsList({ attestations, classes }: { attestations: Attestation[]; classes: ReturnType<typeof useStyles> }) {
  const runs = attestations.map(testRunOf).filter((r): r is TestRunEvidence => !!r);
  if (runs.length === 0) return null;
  return (
    <div className={classes.detailsBody}>
      <Typography className={classes.note} style={{ marginBottom: 6 }}>
        Attested test runs on this image
      </Typography>
      {runs.map((r, i) => {
        const verdict = verdictOf(r.attestation);
        let tone: 'good' | 'warn' | 'bad' = 'warn';
        if (r.outcome !== 'passed' || verdict === 'contradicted') tone = 'bad';
        else if (verdict === 'verified') tone = 'good';
        return (
          <div key={`${r.executionId ?? 'run'}-${i}`} className={classes.grid} style={{ marginBottom: 10 }}>
            <div className={classes.kv}>
              <span className={classes.kvLabel}>Run</span>
              <span className={classes.kvValue}>
                {roleLabel(r)} · {r.outcome || 'no outcome'} · {countsOf(r)}
                {r.finishedOn ? ` · ${formatDateTime(r.finishedOn)}` : ''}
              </span>
            </div>
            <div className={classes.kv}>
              <span className={classes.kvLabel}>Workflow</span>
              <span className={classes.kvValue}>
                {r.workflowSource ?? 'unknown source'}
                {r.workflowDigest ? ` · ${r.workflowDigest.replace('sha256:', '').slice(0, 12)}` : ''}
                {r.executionId ? ` · Testkube ${r.executionId}` : ''}
              </span>
            </div>
            <div className={classes.kv}>
              <span className={classes.kvLabel}>Attestation</span>
              <span className={classes.kvValue}>
                {verdict === 'verified' ? 'verified ✓' : explain(r.attestation, 'test attestation').label}
                {' · '}
                <button
                  type="button"
                  className={classes.detailsToggle}
                  data-tone={tone}
                  onClick={() =>
                    r.attestation.predicate &&
                    downloadJson(
                      r.attestation.predicate,
                      attestationFilename(r.attestation, 'tests', [r.role, r.executionId].filter(Boolean).join('-')),
                    )
                  }
                >
                  ⭳ Download
                </button>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageDrawer({
  stage,
  classes,
  t,
}: {
  stage: Stage;
  classes: ReturnType<typeof useStyles>;
  t: HangarTokens;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  if (stage.kind === 'env') {
    return (
      <div className={classes.drawer}>
        <Typography className={classes.drawerTitle}>{stage.label}</Typography>
        <Typography className={classes.note}>{envStageNote(stage.status)}</Typography>
      </div>
    );
  }

  const att = stage.attestation;
  const summary = friendlySummary(stage.id, att, stage.all ?? []);

  return (
    <div className={classes.drawer}>
      <Typography className={classes.drawerTitle}>{stage.label}</Typography>
      <Typography className={classes.friendlyHeadline}>{summary.headline}</Typography>
      {summary.pill && (
        <div className={classes.pillRow}>
          <Pill tone={summary.pill.tone} classes={classes} t={t}>
            {summary.pill.label}
          </Pill>
        </div>
      )}
      <Typography className={classes.friendlyBody}>{summary.body}</Typography>
      {summary.consequence && <Typography className={classes.friendlyBody}>{summary.consequence}</Typography>}
      {stage.id === 'tests' && (stage.all?.length ?? 0) > 0 && (
        <TestRunsList attestations={stage.all ?? []} classes={classes} />
      )}
      {att && (
        <>
          {/* Both toggles sit side by side, independently of each other -
              "view the raw document" used to only appear after opening
              technical details first, which buried it two clicks deep for
              no real reason (2026-09-17: "make both links appear"). Either
              can be opened on its own, or both at once. */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={classes.detailsToggle}
              onClick={() => setShowDetails(v => !v)}
            >
              {showDetails ? '▾ Hide technical details' : '▸ Show technical details'}
            </button>
            {RAW_DOCUMENT_LABEL[stage.id] && att.predicate && (
              <>
                <button
                  type="button"
                  className={classes.detailsToggle}
                  onClick={() => setShowRaw(v => !v)}
                >
                  {showRaw ? `▾ Hide ${RAW_DOCUMENT_LABEL[stage.id]}` : `▸ View ${RAW_DOCUMENT_LABEL[stage.id]}`}
                </button>
                <button
                  type="button"
                  className={classes.detailsToggle}
                  onClick={() =>
                    downloadJson(
                      att.predicate,
                      attestationFilename(att, documentKindForStage(stage.id)),
                    )
                  }
                >
                  ⭳ Download {RAW_DOCUMENT_LABEL[stage.id]}
                </button>
              </>
            )}
          </div>
          {showDetails && (
            <div className={classes.detailsBody}>
              <div className={classes.grid} style={{ marginBottom: 10 }}>
                <div className={classes.kv}>
                  <span className={classes.kvLabel}>Predicate</span>
                  <span className={classes.kvValue}>{att.predicateType}</span>
                </div>
                <div className={classes.kv}>
                  <span className={classes.kvLabel}>Verified</span>
                  <span className={classes.kvValue}>
                    {att.verified ? 'signature verified ✓' : (att.verificationError ?? 'unverified')}
                    {att.logSource === 'rekor' ? ' · log entry read from Rekor' : ''}
                    {att.logSource === 'embedded' ? " · log entry from the image's own copy" : ''}
                  </span>
                </div>
                {att.transparencyLog && (
                  <div className={classes.kv}>
                    <span className={classes.kvLabel}>Rekor entry</span>
                    <span className={classes.kvValue}>
                      index {att.transparencyLog.logIndex}
                      {att.transparencyLog.logId ? ` · ${att.transparencyLog.logId}` : ''}
                    </span>
                  </div>
                )}
              </div>
              <CertificateFields attestation={att} classes={classes} />
            </div>
          )}
          {showRaw && RAW_DOCUMENT_LABEL[stage.id] && att.predicate && (
            <div style={{ marginTop: 12 }}>
              <JsonDocumentView value={att.predicate} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function PipelineFlow({ stages }: { stages: Stage[] }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [openId, setOpenId] = useState<string | null>(null);
  const openStage = stages.find(s => s.id === openId);

  return (
    <>
      <div className={classes.flow}>
        {stages.map((stage, i) => (
          <div key={stage.id} style={{ display: 'contents' }}>
            <div
              role="button"
              tabIndex={0}
              className={`${classes.node} ${openId === stage.id ? classes.nodeSelected : ''}`}
              onClick={() => setOpenId(openId === stage.id ? null : stage.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenId(openId === stage.id ? null : stage.id);
                }
              }}
            >
              <span className={classes.dot} style={dotStyle(t, stage.status)}>
                <StageIcon id={stage.id} status={stage.status} />
              </span>
              <span className={classes.label}>{stage.label}</span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={classes.connector}
                style={{
                  backgroundColor: stage.status === 'done' ? t.good : t.line,
                }}
              />
            )}
          </div>
        ))}
      </div>
      <Collapse in={Boolean(openStage)} unmountOnExit>
        {openStage && <StageDrawer stage={openStage} classes={classes} t={t} />}
      </Collapse>
    </>
  );
}

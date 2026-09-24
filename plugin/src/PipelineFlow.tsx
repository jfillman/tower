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
import { formatDateTime } from '../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { JsonDocumentView } from './ResourceInspector';
import type { Attestation, ProvenanceResponse } from './types';

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
}

export interface EnvStage {
  kind: 'env';
  id: string;
  label: string;
  status: StageStatus;
}

export type Stage = SupplyChainStage | EnvStage;

// Derives the five fixed supply-chain stages from one image's real
// provenance response. 'warn' (not 'fail') for a missing SBOM/signature/
// transparency-log entry - those gates are informational on this platform,
// not blocking (see GlidepathPage.tsx's SupplyChainPanel: "may predate the
// provenance/sbom gates, or those gates are disabled for this app").
export function buildSupplyChainStages(
  provenance: ProvenanceResponse | undefined,
  loading: boolean,
): SupplyChainStage[] {
  const slsa = provenance?.attestations.find(
    a => a.predicateType === 'https://slsa.dev/provenance/v0.2',
  );
  const sbom = provenance?.attestations.find(a =>
    a.predicateType.toLowerCase().includes('cyclonedx'),
  );
  // The classic `cosign sign` image signature (glidepathProvenance.ts's
  // fetchImageSignature) - a distinct artifact from the SLSA/SBOM
  // attestations above (it signs the image manifest itself, not a
  // statement about it), so it gets its own stage rather than being folded
  // into 'sign-attest' (which stays the general "anything on this image
  // verified" overview - this attestation still counts toward that via
  // anyVerified below, same as any other).
  const signature = provenance?.attestations.find(
    a => a.predicateType === 'cosign.sigstore.dev/signature/simple-signing',
  );
  const anyVerified = provenance?.attestations.some(a => a.verified) ?? false;
  const anyTlog = provenance?.attestations.some(a => a.transparencyLog) ?? false;

  // foundOrPending: 'done' if the gate's own evidence is present, 'warn' if
  // provenance loaded but that evidence is absent (informational, not
  // blocking - see this function's own top comment), 'pending' while still
  // loading. Written as explicit if/else rather than a nested ternary chain
  // (lint: no-nested-ternary) - same three-way logic, just spelled out.
  function foundOrPending(found: boolean): StageStatus {
    if (loading) return 'pending';
    if (found) return 'done';
    return provenance ? 'warn' : 'pending';
  }

  function verifiedOrFailed(): StageStatus {
    if (loading) return 'pending';
    if (anyVerified) return 'done';
    return (provenance?.attestations.length ?? 0) > 0 ? 'fail' : 'pending';
  }

  return [
    {
      kind: 'supply-chain',
      id: 'build',
      label: 'Build',
      status: foundOrPending(Boolean(slsa)),
      attestation: slsa,
    },
    {
      kind: 'supply-chain',
      id: 'sast-sbom',
      label: 'SAST / SBOM',
      status: foundOrPending(Boolean(sbom)),
      attestation: sbom,
    },
    {
      kind: 'supply-chain',
      id: 'signature',
      label: 'Signature',
      status: foundOrPending(Boolean(signature)),
      attestation: signature,
    },
    {
      kind: 'supply-chain',
      id: 'sign-attest',
      label: 'Sign + Attest',
      status: verifiedOrFailed(),
      attestation: slsa ?? signature ?? provenance?.attestations[0],
    },
    {
      kind: 'supply-chain',
      id: 'rekor',
      label: 'Rekor',
      status: foundOrPending(anyTlog),
      attestation: (slsa?.transparencyLog ? slsa : provenance?.attestations.find(a => a.transparencyLog)),
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
      fontSize: 9.5,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: ({ t }) => t.textFaint,
      textAlign: 'center',
      lineHeight: 1.3,
    },
    labelKind: {
      fontFamily: fontMono,
      fontSize: 8,
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
      fontSize: 14,
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
      fontSize: 10,
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
      fontSize: 12.5,
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
      fontSize: 10.5,
      letterSpacing: '0.03em',
      padding: '3px 9px',
      borderRadius: 12,
      border: '1px solid',
    },
    detailsToggle: {
      fontFamily: fontMono,
      fontSize: 10.5,
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
      return { backgroundColor: t.amberSoft, borderColor: t.amber, color: t.amberInk };
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
function friendlySummary(
  stageId: string,
  att: Attestation | undefined,
): { headline: string; body: string; pill?: { tone: 'good' | 'warn' | 'bad'; label: string } } {
  switch (stageId) {
    case 'build':
      if (!att) {
        return {
          headline: 'Not built through the verified pipeline yet',
          body: 'No SLSA build provenance found for this image.',
        };
      }
      return {
        headline: 'Build complete',
        body: 'This image was built and published from a real pipeline run, with recorded provenance of exactly where it came from.',
        pill: { tone: 'good', label: 'provenance ✓' },
      };
    case 'sast-sbom':
      if (!att) {
        return {
          headline: 'No SBOM attached yet',
          body: 'This image has no software bill of materials recorded - it may predate this gate, or the gate is disabled for this app. Other CI gates (SAST, policy checks) run as part of this platform’s pipeline but aren’t independently surfaced here yet.',
        };
      }
      return {
        headline: att.verified ? 'SBOM produced, signed, and verified' : 'SBOM produced',
        body: att.verified
          ? 'Every dependency in this image is catalogued, and the catalogue itself is signed and independently verified.'
          : 'A software bill of materials was found for this image, but its signature could not be independently verified.',
        pill: att.verified
          ? { tone: 'good', label: 'SBOM ✓' }
          : { tone: 'warn', label: 'unverified' },
      };
    case 'signature':
      if (!att) {
        return {
          headline: 'No image signature found',
          body: 'This image has no classic cosign image-signing artifact (`cosign sign`) recorded - distinct from the SLSA/SBOM attestations above, which cover `cosign attest`. It may never have been directly signed, or that step is disabled for this app.',
        };
      }
      return {
        headline: att.verified ? 'Image signature verified' : 'Signature did not verify',
        body: att.verified
          ? 'The image manifest itself was signed with cosign, and that signature has been independently re-verified against this platform’s own root of trust.'
          : (att.verificationError ?? 'This signature exists but could not be independently verified.'),
        pill: att.verified ? { tone: 'good', label: 'signed ✓' } : { tone: 'bad', label: 'unverified' },
      };
    case 'sign-attest':
      if (!att) {
        return {
          headline: 'No signature found',
          body: 'This image carries no cosign attestations yet.',
        };
      }
      return {
        headline: att.verified ? 'Image signature verified' : 'Signature did not verify',
        body: att.verified
          ? 'This image was signed with cosign and that signature has been independently re-verified against this platform’s own root of trust.'
          : (att.verificationError ?? 'This attestation exists but its signature failed verification.'),
        pill: att.verified ? { tone: 'good', label: 'cosign ✓' } : { tone: 'bad', label: 'unverified' },
      };
    case 'rekor':
      if (!att?.transparencyLog) {
        return {
          headline: 'Not logged to Rekor',
          body: 'No public transparency-log entry recorded for this attestation yet.',
        };
      }
      return {
        headline: 'Logged to the transparency log',
        body: `Recorded in this platform's own internal Rekor transparency log at entry #${att.transparencyLog.logIndex} - a permanent, tamper-evident record this platform can independently re-verify.`,
        pill: { tone: 'good', label: `Rekor #${att.transparencyLog.logIndex}` },
      };
    default:
      return { headline: '', body: '' };
  }
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
function documentKindForStage(stageId: string): 'provenance' | 'sbom' | 'signature' {
  if (stageId === 'build') return 'provenance';
  if (stageId === 'sast-sbom') return 'sbom';
  return 'signature';
}

function attestationFilename(att: Attestation, kind: 'provenance' | 'sbom' | 'signature'): string {
  const subject = att.subject?.[0];
  const repo = subject?.name?.split('/').pop();
  const shortDigest = subject?.digest?.sha256?.slice(0, 12);
  const base = [repo, shortDigest].filter(Boolean).join('-');
  return `${base ? `${base}-` : ''}${kind}.json`;
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
  const summary = friendlySummary(stage.id, att);

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

import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { formatDateTime, relativeTime } from './shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import { HangarMark } from './brand/HangarMark';
import { SupplyChainChips } from './SupplyChainChips';
import { formatGateName, gateCheckTone, stripLightMarkdown } from './SignalRail';
import type { PrCheckRun } from './pullRequests/usePullRequests';
import { phaseTone } from './PipelineRunList';
import { downloadReleaseRecordHtml, printReleaseRecordPdf } from './ReleaseRecordExport';
import { confidenceColor } from './ReleaseRecordList';
import { NicknameChip } from './tabs/deployments/ImageTagPill';
import { applyApprovalBonus, confidenceBreakdown, dedupeCommits, withPersistedGuardrails, type ReleaseRecord } from './useReleaseRecords';
import { BreakglassReleaseSessions } from './breakglass/BreakglassReleaseSessions';
import { useReleaseRecordDoc, useSubmitHumanContext, type ReleaseRecordHumanContext } from './useReleaseRecordPersistence';
import { countedSignoffs, useReleaseSignoff } from './releaseFlow';
import { ReleaseSignoffPanel } from './ReleaseSignoffPanel';
import { ReleaseOutcomePanel } from './ReleaseOutcome';
import { ActionSelect, Button, Callout, ColumnLabel, EmptyNote, Fact, Hint, StatusChip, TextLink, Tooltip } from './ui';
import { OPENING_PR, PrReceipt, PrRef, prFromSummary } from './ui/PrRef';
import { isSignedAndAttested } from './supplyChain';
import { CheckRideBlock, ChangeRequestFact, CommitSignatureBlock, hasCommitSignature } from './ReleaseRecordEvidence';

// Board 2 of the mockup - "the record itself." Three automated columns
// (What changed / What was built / What happened), a Human Context band and
// a certificate strip of only the facts Tower can actually back today.
//
// Human Context is Phase 2 (HANDOFF-tower-release-record.md): the record
// itself is generated automatically by a backend poller (releaseRecordPoll.ts)
// once this release reaches a Flight env and goes Healthy, NOT by this
// component - so this band has three real states, not two: still nothing
// committed yet (poller hasn't run, or this release never reached a Flight
// env - the placeholder case), a record exists with no human context added
// yet (empty form), and a record exists with prior human context (prefilled
// form). Submitting opens a real PR against gitops-<appName> and shows the
// link - same "no merge-polling" UX contract ConfigTab.tsx's own PR forms
// use, deliberately not a different one for this fourth form.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 20,
    flexWrap: 'wrap',
    paddingBottom: 20,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
    marginBottom: 22,
  },
  headLeft: { display: 'flex', gap: 16, alignItems: 'center' },
  // The Hangar instrument-dial mark itself (2026-09-23: "change the release record logo to match the Hangar logo") - no wrapper ring, the mark carries its own.
  mark: { flex: 'none', display: 'flex' },
  kicker: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: ({ t }) => t.amberText,
    marginBottom: 4,
  },
  h3: { fontSize: 22, fontWeight: 700, fontFamily: fontDisplay, color: ({ t }) => t.textHi },
  facts: { display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: ({ t }) => t.textLo },
  factsB: { color: ({ t }) => t.textHi, fontWeight: 600 },
  imageRef: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi, wordBreak: 'break-all' },
  scoreBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    borderRadius: 4,
    padding: '8px 14px',
  },
  scoreNum: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 22 },
  scoreLbl: { fontSize: 11, color: ({ t }) => t.textFaint, lineHeight: 1.3 },
  explainer: { border: ({ t }) => `1px solid ${t.line}`, backgroundColor: ({ t }) => t.panelAlt, borderRadius: 4, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: ({ t }) => t.textLo },
  explainRow: { display: 'grid', gridTemplateColumns: '150px 60px 1fr', gap: 12, padding: '5px 0', borderBottom: ({ t }) => `1px dashed ${t.lineSoft}`, alignItems: 'baseline' },
  explainPts: { fontFamily: fontMono, color: ({ t }) => t.textHi },
  actionsBar: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  // alignItems: 'start' is the actual fix for the "huge empty space" complaint -
  // grid's default 'stretch' forces every column's box to the row's tallest
  // column (built, by far the densest), so a short column (changed/happened)
  // rendered a big blank area below its own content rather than just being
  // short. Column ratio skews toward "built" (still the densest column even
  // after the content trims below) rather than a flat 1/1/1 split.
  pair: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    // Both boxes as tall as the taller one (owner, 2026-10-07); content stays at the top.
    alignItems: 'stretch',
    gap: 16,
    marginBottom: 16,
    '@media (max-width: 860px)': { gridTemplateColumns: '1fr' },
  },
  builtBody: { padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 16 },
  builtSummary: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontFamily: fontMono, fontSize: 12 },
  summaryItem: { color: ({ t }) => t.textHi, marginRight: 4 },
  builtGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)',
    gap: 24,
    alignItems: 'start',
    '@media (max-width: 960px)': { gridTemplateColumns: '1fr' },
  },
  builtGrid3: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1.4fr)',
    gap: 24,
    alignItems: 'start',
    '@media (max-width: 1100px)': { gridTemplateColumns: '1fr' },
  },
  builtSection: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  builtSectionTitle: { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: ({ t }) => t.textLo },
  gatesHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  gatesCount: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi },
  gateGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 },
  gateTile: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '6px 9px',
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.textHi,
    minWidth: 0,
  },
  gateTileName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  gateDot: { width: 7, height: 7, borderRadius: '50%', flex: 'none' },
  gateNote: { fontSize: 12, color: ({ t }) => t.textLo, lineHeight: 1.4 },
  col: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, backgroundColor: ({ t }) => t.panel, overflow: 'hidden' },
  colHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', borderBottom: ({ t }) => `1px solid ${t.line}` },
  colHeadChanged: { borderTop: ({ t }) => `3px solid ${t.sky}` },
  colHeadBuilt: { borderTop: ({ t }) => `3px solid ${t.amber}` },
  colHeadHappened: { borderTop: ({ t }) => `3px solid ${t.good}` },
  // The break-glass panel (phase C, G12): its own strip in the break-glass red, and the same gap the Human context
  // panel keeps from the columns above (2026-10-12 bug: it hugged them, with no strip).
  colHeadBreakglass: { borderTop: ({ t }) => `3px solid ${t.bad}` },
  colBreakglass: { marginTop: 18 },
  colTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: ({ t }) => t.textHi },
  colBody: { padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 14 },
  prItem: { display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' },
  prNum: { color: ({ t }) => t.sky, fontFamily: fontMono, fontSize: 11, flex: 'none' },
  prTitle: { color: ({ t }) => t.textHi, flex: 1 },
  prWho: { color: ({ t }) => t.textFaint, fontSize: 11, flex: 'none' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: '4px 8px',
    borderRadius: 5,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo,
    backgroundColor: ({ t }) => t.panelAlt,
  },
  kv: { display: 'flex', flexDirection: 'column', gap: 6 },
  promoChain: { display: 'flex', flexDirection: 'column', gap: 8 },
  promo: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 },
  promoEnv: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: '3px 7px',
    borderRadius: 4,
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo,
  },
  promoArrow: { color: ({ t }) => t.textFaint },
  promoWhen: { marginLeft: 'auto', color: ({ t }) => t.textFaint, fontSize: 11, fontFamily: fontMono },
  runList: { display: 'flex', flexDirection: 'column', gap: 6 },
  runRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 },
  runName: { color: ({ t }) => t.textHi, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  runStage: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, flex: 'none' },
  testRow: { display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' },
  testTask: { color: ({ t }) => t.textFaint, fontFamily: fontMono, fontSize: 11, flex: 'none' },
  testResult: { color: ({ t }) => t.textHi, flex: 1, overflowWrap: 'anywhere' },
  scanBlock: { display: 'flex', flexDirection: 'column', gap: 4 },
  scanHead: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 },
  scanName: { color: ({ t }) => t.textHi, fontWeight: 600, textTransform: 'capitalize' },
  scanFindings: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textLo,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    padding: '6px 9px',
  },
  human: {
    marginTop: 18,
    border: ({ t }) => `1px dashed ${t.amberLine}`,
    borderRadius: 8,
    backgroundColor: ({ t }) => t.amberSoft,
    padding: '16px 20px 18px',
  },
  humanHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  humanTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, letterSpacing: '0.07em', textTransform: 'uppercase', color: ({ t }) => t.amberInk },
  humanNote: { fontSize: 12, color: ({ t }) => t.amberInk, lineHeight: 1.55 },
  humanForm: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 },
  humanRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  humanField: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 },
  humanLabel: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: ({ t }) => t.amberInk },
  humanInput: {
    fontFamily: 'inherit',
    fontSize: 12,
    padding: '7px 10px',
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
  },
  humanTextarea: {
    fontFamily: 'inherit',
    fontSize: 12,
    padding: '8px 10px',
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
    resize: 'vertical',
    minHeight: 56,
  },
  humanActions: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 },
  approvalList: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 },
  approvalRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    padding: '4px 8px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.bg,
  },
  approvalWho: { color: ({ t }) => t.amberInk, fontWeight: 600, flex: 1 },
  approvalWhen: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.amberInk, opacity: 0.75 },
  approvalRemove: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: 1,
    color: ({ t }) => t.amberInk,
    padding: '0 2px',
  },
  cert: {
    marginTop: 18,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 4,
    backgroundColor: ({ t }) => t.panelAlt,
    padding: '12px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: 22,
    flexWrap: 'wrap',
  },
  certItem: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: ({ t }) => t.textLo },
  certB: { color: ({ t }) => t.textHi, fontWeight: 600 },
  certStamp: { marginLeft: 'auto', fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
}));

export function ReleaseRecordDetail({
  record: liveRecord,
  appName,
  owner,
  gitopsPrs,
  otherRecords,
  onCompare,
  onBack,
  name,
  signoffEnv,
  allNames,
}: {
  record: ReleaseRecord;
  /** Every release's name by image tag, to name the release that replaced or rolled back this one (R3). */
  allNames?: Map<string, string>;
  /** The release's name (ASPEN, BIRCH...), once the app's release history has loaded. */
  name?: string;
  /** The environment whose release PR carries the sign-off (R2). */
  signoffEnv?: string;
  appName?: string;
  owner?: string;
  gitopsPrs?: PullRequestSummary[];
  otherRecords: ReleaseRecord[];
  onCompare: (id: string) => void;
  onBack: () => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });

  const persistTarget = owner && appName ? { owner, appName, imageTag: liveRecord.imageTag } : undefined;
  const persisted = useReleaseRecordDoc(persistTarget);
  // Guardrails frozen into the committed record win over nothing, never over live data - see withPersistedGuardrails.
  const record = withPersistedGuardrails(liveRecord, persisted.data);
  const verified = isSignedAndAttested(record.provenance);
  const rekor = record.provenance?.attestations.find(a => a.transparencyLog)?.transparencyLog;
  const hasSecurity =
    record.securityScans.length > 0 || record.testResults.length > 0 || !!record.checkRide || !!record.testEvidence || hasCommitSignature(record);
  const liveDeployment = record.deployments.find(d => d.isLive);
  const categoryChips = Object.entries(record.changeCategories).filter(([, count]) => count > 0);

  // R2: the sign-off is the approving reviews on the release PR to the sign-off environment. The
  // record's own copy (sealed after that PR merged) wins; otherwise it is read live and shown, but
  // only recorded sign-offs move the score, so this record scores the same here as in the list and
  // in Compare. Approvals added to the human context after release are acknowledgements.
  const sealedRelease = persisted.data?.release;
  const liveSignoff = useReleaseSignoff(
    persistTarget && signoffEnv && !sealedRelease?.signoff ? persistTarget : undefined,
  );
  const signoff = sealedRelease?.signoff ?? liveSignoff.data;
  const signoffCount = persisted.data ? countedSignoffs(sealedRelease?.signoff) : record.signoffs ?? 0;
  const displayConfidence = applyApprovalBonus(record.confidence, signoffCount);
  const [showScoreExplainer, setShowScoreExplainer] = useState(false);
  const scoreLines = confidenceBreakdown(record, signoffCount);
  // The auto-generated record's own PR (releaseRecordPoll -> generateReleaseRecord,
  // title `Release Record: <app> @ <tag>`, NOT the `... - human context` edit PRs)
  // - shown in the Human context panel while it's open or just merged (2026-09-24:
  // "when an initial PR is created for the release record, the 'Human Context'
  // panel should show a link to the PR").
  const recordPr = (gitopsPrs ?? [])
    .filter(pr => {
      const m = pr.title.match(/^Release Record: (\S+) @ (\S+)$/);
      return m && m[2].toLowerCase() === record.imageTag.toLowerCase();
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  let recordNote =
    'No Release Record has been committed yet for this image - Tower writes one automatically once a release like this is healthy in its first Flight environment (within the hour). After-release notes can be added once that record exists.';
  if (recordPr?.state === 'open') {
    recordNote = "Tower has opened this release's Release Record PR. After-release notes can be added once it's merged.";
  } else if (recordPr) {
    recordNote = 'The Release Record PR has merged - refresh in a moment for the committed record.';
  }
  const submitContext = useSubmitHumanContext();
  const [form, setForm] = useState<ReleaseRecordHumanContext>({ approvals: [] });
  const [approvalRole, setApprovalRole] = useState('');
  useEffect(() => {
    if (persisted.data) setForm(persisted.data.humanContext);
  }, [persisted.data]);
  const approvalsChanged = persisted.data && JSON.stringify(form.approvals) !== JSON.stringify(persisted.data.humanContext.approvals);
  const dirty =
    persisted.data &&
    (form.summary !== (persisted.data.humanContext.summary ?? '') ||
      form.risk !== persisted.data.humanContext.risk ||
      form.riskNotes !== (persisted.data.humanContext.riskNotes ?? '') ||
      form.verificationNotes !== (persisted.data.humanContext.verificationNotes ?? '') ||
      (form.followUps ?? '') !== (persisted.data.humanContext.followUps ?? '') ||
      approvalsChanged);
  // A pending "add my approval" click appends a `by: ''` placeholder (see the
  // Approvals block below) - the backend (glidepathReleaseRecord.ts's
  // submitHumanContext) stamps it with the real authenticated identity and a
  // server timestamp before it's ever committed, the same reason `initiator`
  // itself is never taken from the request body. Never fabricate that stamp
  // here even for the PR-body summary line below.
  const addMyApproval = () => {
    setForm(f => ({ ...f, approvals: [...f.approvals, { by: '', at: '', role: approvalRole || undefined }] }));
    setApprovalRole('');
  };
  const removeApproval = (index: number) => setForm(f => ({ ...f, approvals: f.approvals.filter((_, i) => i !== index) }));
  const onSubmitContext = () => {
    if (!owner || !appName) return;
    const summary: string[] = [];
    if (form.summary !== (persisted.data?.humanContext.summary ?? '')) summary.push('updated developer summary');
    if (form.risk !== persisted.data?.humanContext.risk) summary.push(`set risk to ${form.risk ?? '(cleared)'}`);
    if (form.riskNotes !== (persisted.data?.humanContext.riskNotes ?? '')) summary.push('updated risk notes');
    if (form.verificationNotes !== (persisted.data?.humanContext.verificationNotes ?? '')) summary.push('updated verification notes');
    if ((form.followUps ?? '') !== (persisted.data?.humanContext.followUps ?? '')) summary.push('updated follow-ups');
    if (approvalsChanged) {
      const before = persisted.data?.humanContext.approvals.length ?? 0;
      const after = form.approvals.length;
      if (after > before) summary.push('added an approval');
      else if (after < before) summary.push('removed an approval');
      else summary.push('updated approvals');
    }
    submitContext.submit({
      owner,
      appName,
      imageTag: record.imageTag,
      patch: {
        summary: form.summary,
        risk: form.risk,
        riskNotes: form.riskNotes,
        verificationNotes: form.verificationNotes,
        followUps: form.followUps,
        approvals: form.approvals,
      },
      summary,
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <TextLink onClick={onBack}>← Back to records</TextLink>
      </div>

      <div className={classes.head}>
        <div className={classes.headLeft}>
          <div className={classes.mark}>
            <HangarMark glyph="hangar" size={52} />
          </div>
          <div>
            <div className={classes.kicker}>Release Record{appName ? ` · ${appName}` : ''}</div>
            <Typography className={classes.h3}>
              {name && <span style={{ letterSpacing: '0.06em', marginRight: 10 }}>{name}</span>}
              {record.version ?? record.imageTag}
              {record.nickname && (
                <span style={{ marginLeft: 8 }}>
                  <NicknameChip nickname={record.nickname} />
                </span>
              )}
            </Typography>
            <div className={classes.facts}>
              <span>
                Status <span className={classes.factsB}>{record.current ? record.status : 'superseded'}</span>
              </span>
              <span>
                Deployed <span className={classes.factsB}>{formatDateTime(record.createdAt)}</span> ({relativeTime(record.createdAt)})
              </span>
              {record.pipelineRun && (
                <span>
                  Build <span className={classes.factsB}>{record.nickname ?? record.pipelineRun.name}</span>
                </span>
              )}
            </div>
            <div className={classes.facts} style={{ marginTop: 4 }}>
              <span>
                Image{' '}
                <span className={classes.imageRef}>
                  {record.image ?? (persisted.data?.imageRepo ? `${persisted.data.imageRepo}:${record.imageTag}` : record.imageTag)}
                </span>
              </span>
              {record.imageDigest && (
                <Tooltip title={record.imageDigest}>
                  <span>
                    Digest <span className={classes.imageRef}>{`${record.imageDigest.slice(0, 19)}…`}</span>
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className={classes.scoreBox}>
            <span className={classes.scoreNum} style={{ color: confidenceColor(t, displayConfidence) }}>
              {displayConfidence}
            </span>
            <span className={classes.scoreLbl}>
              readiness
              <br />
              score
              <br />
              <TextLink expanded={showScoreExplainer} onClick={() => setShowScoreExplainer(v => !v)}>
                how?
              </TextLink>
            </span>
          </div>
          <div className={classes.actionsBar}>
            <Button small onClick={() => printReleaseRecordPdf(record, persisted.data?.humanContext, { release: sealedRelease, signoff, signoffs: signoffCount })}>
              ⤓ PDF
            </Button>
            <Button small onClick={() => downloadReleaseRecordHtml(record, persisted.data?.humanContext, { release: sealedRelease, signoff, signoffs: signoffCount })}>
              ⤓ HTML
            </Button>
            {otherRecords.length > 0 && (
              <ActionSelect
                label="Compare"
                onSelect={onCompare}
                options={otherRecords.map(r => ({
                  value: r.id,
                  label: `${r.version ?? r.imageTag}${r.nickname ? ` · ${r.nickname}` : ''} — ${formatDateTime(r.createdAt)}`,
                }))}
              />
            )}
          </div>
        </div>
      </div>

      {showScoreExplainer && (
        <div className={classes.explainer}>
          <Typography style={{ fontWeight: 700, color: t.textHi, marginBottom: 6 }}>How the readiness score works</Typography>
          <Typography style={{ fontSize: 12, marginBottom: 8 }}>
            A 0-100 heuristic built only from evidence Tower can see - not a prediction. It says how ready the release was when it shipped: a technical score plus a small bonus for sign-offs on the production release PR before it merged. What happened after it shipped is its outcome, shown separately.
          </Typography>
          {scoreLines.map(line => (
            <div key={line.label} className={classes.explainRow}>
              <span style={{ color: t.textHi }}>{line.label}</span>
              <span className={classes.explainPts}>
                +{line.points} / {line.max}
              </span>
              <span>{line.note}</span>
            </div>
          ))}
          <Typography style={{ fontSize: 12, marginTop: 8, color: t.textHi }}>Total: {displayConfidence} / 100 (80+ green, 50-79 amber, below 50 red)</Typography>
        </div>
      )}

      {/* What changed and What happened side by side (both short), What was built full width below (2026-10-07). */}
      <div className={classes.pair}>
        <div className={classes.col}>
          <div className={`${classes.colHead} ${classes.colHeadChanged}`}>
            <span className={classes.colTitle}>What changed</span>
            <span className={classes.chip}>
              {record.pullRequests.length} PR{record.pullRequests.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className={classes.colBody}>
            {record.pullRequests.length === 0 && record.commits.length === 0 && (
              <EmptyNote>No merged source PRs found in the window Tower has fetched.</EmptyNote>
            )}
            {record.pullRequests.length === 0 && record.commits.length > 0 && (
              <div className={classes.kv}>
                <Hint>No merged source PRs found in the window Tower has fetched. Commits by environment:</Hint>
                {dedupeCommits(record.commits).map(c => (
                  <Fact inline key={`${c.env}-${c.sha}`} label={c.env}>
                    {c.sha.slice(0, 7)}
                  </Fact>
                ))}
              </div>
            )}
            {record.pullRequests.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {record.pullRequests.slice(0, 8).map(pr => (
                  <div key={pr.number} className={classes.prItem}>
                    <span className={classes.prNum}>#{pr.number}</span>
                    <span className={classes.prTitle}>{pr.title}</span>
                    {pr.author && <span className={classes.prWho}>{pr.author}</span>}
                  </div>
                ))}
                {record.pullRequests.length > 8 && (
                  <Hint>+{record.pullRequests.length - 8} more</Hint>
                )}
              </div>
            )}
            {categoryChips.length > 0 && (
              <div className={classes.chipRow}>
                {categoryChips.map(([label, count]) => (
                  <span key={label} className={classes.chip}>
                    {label} · {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={classes.col}>
          <div className={`${classes.colHead} ${classes.colHeadHappened}`}>
            <span className={classes.colTitle}>What happened</span>
            <StatusChip tone={record.incidents.length === 0 ? 'ok' : 'bad'}>
              {record.incidents.length === 0 ? 'no incidents' : `${record.incidents.length} incidents`}
            </StatusChip>
          </div>
          <div className={classes.colBody}>
            <ChangeRequestFact record={record} classes={classes} />
            {record.promotionChain.length === 0 ? (
              <EmptyNote>No recorded promotions between tracked environments.</EmptyNote>
            ) : (
              <div className={classes.promoChain}>
                {record.promotionChain.map(p => (
                  <div key={`${p.fromEnv}-${p.toEnv}`} className={classes.promo}>
                    <span className={classes.promoEnv}>{p.fromEnv}</span>
                    <span className={classes.promoArrow}>→</span>
                    <span className={classes.promoEnv}>{p.toEnv}</span>
                    <span className={classes.promoWhen}>{formatDateTime(p.at)}</span>
                  </div>
                ))}
              </div>
            )}
            {liveDeployment && (
              <div className={classes.kv}>
                {liveDeployment.rolloutStrategy && (
                  <Fact inline label="Rollout strategy">{liveDeployment.rolloutStrategy}</Fact>
                )}
                {liveDeployment.argoRevision && (
                  <Fact inline label="Argo CD revision">{liveDeployment.argoRevision.slice(0, 10)}</Fact>
                )}
                {liveDeployment.rolloutStrategy === 'canary' && liveDeployment.canarySteps && liveDeployment.canarySteps.length > 0 && (
                  <Fact inline label="Canary steps">{liveDeployment.canarySteps.length}</Fact>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
        <div className={classes.col}>
          <div className={`${classes.colHead} ${classes.colHeadBuilt}`}>
            <span className={classes.colTitle}>What was built</span>
            <StatusChip tone={verified ? 'ok' : 'neutral'}>{verified ? 'verified' : 'unverified'}</StatusChip>
          </div>
          {/* Full width (2026-10-07): one summary line, then pipeline runs and the release gates side by side at their
              own heights; security only when there are scans or tests. */}
          <div className={classes.builtBody}>
            <div className={classes.builtSummary}>
              {record.imageDigest && (
                <Tooltip title={record.imageDigest}>
                  <span className={classes.summaryItem}>
                    <ColumnLabel>digest</ColumnLabel> {record.imageDigest.replace(/^sha256:/, '').slice(0, 12)}…
                  </span>
                </Tooltip>
              )}
              {record.hasSbom && <span className={classes.chip}>SBOM attached</span>}
              <SupplyChainChips provenance={record.provenance} />
            </div>
            <div className={hasSecurity ? classes.builtGrid3 : classes.builtGrid}>
              {record.pipelineRuns.length > 0 && (
                <div className={classes.builtSection}>
                  <span className={classes.builtSectionTitle}>Pipeline runs</span>
                  <div className={classes.runList}>
                    {record.pipelineRuns.map(run => {
                      const tone = phaseTone(t, run.phase);
                      return (
                        <div key={run.name} className={classes.runRow}>
                          {run.pipelineName && <span className={classes.runStage}>{run.pipelineName}</span>}
                          <span className={classes.runName}>{run.name}</span>
                          <StatusChip tone={tone.status} dot>
                            {tone.label}
                          </StatusChip>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {hasSecurity && (
                <div className={classes.builtSection}>
                  <span className={classes.builtSectionTitle}>Tests and security</span>
                  <CommitSignatureBlock record={record} classes={classes} />
                  <CheckRideBlock record={record} classes={classes} />
                  {record.securityScans.map(scan => (
                    <div key={scan.scanner} className={classes.scanBlock}>
                      <div className={classes.scanHead}>
                        <span className={classes.scanName}>{scan.scanner.replace('-', ' ')}</span>
                        {scan.outcome && (
                          <StatusChip tone={scan.outcome === 'passed' ? 'ok' : 'bad'}>{scan.outcome}</StatusChip>
                        )}
                      </div>
                      {scan.findingsSummary && <div className={classes.scanFindings}>{scan.findingsSummary}</div>}
                    </div>
                  ))}
                  {record.testResults.length > 0 && !record.checkRide && !record.testEvidence && (
                    <div className={classes.kv}>
                      <ColumnLabel>
                        Test results {record.testResults.length > 1 && `(${record.testResults.length})`}
                      </ColumnLabel>
                      {record.testResults.slice(0, 8).map((tr, i) => (
                        <div key={`${tr.taskName}-${tr.resultName}-${i}`} className={classes.testRow}>
                          <span className={classes.testTask}>
                            {tr.taskName}/{tr.resultName}
                          </span>
                          <span className={classes.testResult}>{tr.value}</span>
                        </div>
                      ))}
                      {record.testResults.length > 8 && (
                        <Hint>+{record.testResults.length - 8} more</Hint>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className={classes.builtSection}>
                <div className={classes.gatesHead}>
                  <span className={classes.builtSectionTitle}>Release gates</span>
                  {record.guardrails && (
                    <span className={classes.gatesCount}>
                      {record.guardrails.passedChecks}/{record.guardrails.totalChecks} passed
                    </span>
                  )}
                </div>
                {record.guardrails ? (
                  <>
                    <GateGrid checks={record.guardrails.checks ?? []} classes={classes} t={t} />
                    {record.guardrailsPrUrl && (
                      <PrRef
                        pr={{ url: record.guardrailsPrUrl, number: record.guardrailsPrNumber }}
                        size="inline"
                        label={record.guardrailsPrUrl.includes('/gitops-') ? 'gitops' : 'release pin'}
                      />
                    )}
                  </>
                ) : (
                  <EmptyNote>No release-guardrail check data found for this release's release PR.</EmptyNote>
                )}
              </div>
            </div>
          </div>
        </div>

      {/* Break-glass sessions while this release ran (gaps phase C, G12): part of the release's history, read live. */}
      <div className={`${classes.col} ${classes.colBreakglass}`} data-testid="release-breakglass">
        <div className={`${classes.colHead} ${classes.colHeadBreakglass}`}>
          <span className={classes.colTitle}>Break-glass sessions during this release</span>
        </div>
        <div className={classes.colBody}>
          <BreakglassReleaseSessions
            appName={appName}
            record={record}
            others={otherRecords}
            onOpen={s => window.open(`${window.location.pathname}?${new URLSearchParams({ entity: new URLSearchParams(window.location.search).get('entity') ?? '', tab: 'topology', env: s.env, breakglass: s.id })}`, '_blank')}
          />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <ReleaseOutcomePanel
          outcome={record.outcome ?? persisted.data?.outcome}
          names={allNames}
          githubRelease={persisted.data?.release?.githubRelease}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <ReleaseSignoffPanel
          release={sealedRelease}
          signoff={signoff}
          signoffEnv={signoff?.env ?? signoffEnv}
          mode={sealedRelease?.mode}
          loading={liveSignoff.loading}
          live={!sealedRelease?.signoff}
          addedAfter={
            sealedRelease
              ? {
                  summary: persisted.data?.humanContext.summary,
                  risk: persisted.data?.humanContext.risk,
                  riskNotes: persisted.data?.humanContext.riskNotes,
                }
              : undefined
          }
        />
      </div>

      <div className={classes.human}>
        <div className={classes.humanHead}>
          <span className={classes.humanTitle}>After release</span>
        </div>
        {!persistTarget && (
          <Typography className={classes.humanNote}>
            Notes can't be added without knowing this app's GitHub owner. Reopen this record from the Releases tab
            rather than a direct link.
          </Typography>
        )}
        {persistTarget && persisted.loading && <Typography className={classes.humanNote}>Checking for a committed Release Record…</Typography>}
        {persistTarget && persisted.notFound && (
          <>
            <Typography className={classes.humanNote}>
              {recordNote}
            </Typography>
            {recordPr && (
              <Typography className={classes.humanNote}>
                <PrRef pr={prFromSummary(recordPr)} size="inline" label="Release Record" />
              </Typography>
            )}
          </>
        )}
        {persistTarget && persisted.error && (
          <Typography className={classes.humanNote}>Couldn't check for a committed record: {persisted.error}</Typography>
        )}
        {persistTarget && persisted.data && (
          <div className={classes.humanForm}>
            {/* Summary and risk are written in the draft now, before the release ships, and shown in Release notes.
                Records written before the draft carried them can still be given them here. */}
            {!sealedRelease && (
              <>
              <div className={classes.humanField}>
                <label className={classes.humanLabel} htmlFor="rr-summary">
                  Summary (this record predates release notes)
                </label>
                <textarea
                  id="rr-summary"
                  className={classes.humanTextarea}
                  placeholder="What does this release actually change, in plain language?"
                  value={form.summary ?? ''}
                  onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                />
              </div>
              <div className={classes.humanRow}>
                <div className={classes.humanField} style={{ maxWidth: 160 }}>
                  <label className={classes.humanLabel} htmlFor="rr-risk">
                    Risk
                  </label>
                  <select
                    id="rr-risk"
                    className={classes.humanInput}
                    value={form.risk ?? ''}
                    onChange={e => setForm(f => ({ ...f, risk: (e.target.value || undefined) as ReleaseRecordHumanContext['risk'] }))}
                  >
                    <option value="">— not set —</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className={classes.humanField}>
                  <label className={classes.humanLabel} htmlFor="rr-risk-notes">
                    Risk notes
                  </label>
                  <input
                    id="rr-risk-notes"
                    className={classes.humanInput}
                    placeholder="Why that risk level?"
                    value={form.riskNotes ?? ''}
                    onChange={e => setForm(f => ({ ...f, riskNotes: e.target.value }))}
                  />
                </div>
              </div>
              </>
            )}
            <div className={classes.humanField}>
              <label className={classes.humanLabel} htmlFor="rr-verification">
                How it was checked in production
              </label>
              <textarea
                id="rr-verification"
                className={classes.humanTextarea}
                placeholder="What did you check once it was live?"
                value={form.verificationNotes ?? ''}
                onChange={e => setForm(f => ({ ...f, verificationNotes: e.target.value }))}
              />
            </div>
            <div className={classes.humanField}>
              <label className={classes.humanLabel} htmlFor="rr-follow-ups">
                Follow-ups
              </label>
              <textarea
                id="rr-follow-ups"
                className={classes.humanTextarea}
                placeholder="Incidents, fixes owed, anything you learned."
                value={form.followUps ?? ''}
                onChange={e => setForm(f => ({ ...f, followUps: e.target.value }))}
              />
            </div>
            <div className={classes.humanField}>
              {/* A section heading for the group below, not a control's label - a
                  plain span avoids jsx-a11y's label/control-association rule, which
                  doesn't apply here (nothing single here for it to label). */}
              <Tooltip title="Added after release. They don't change the score: sign-off happens on the release PR before it merges.">
                <span className={classes.humanLabel}>
                  Acknowledgements
                </span>
              </Tooltip>
              {form.approvals.length === 0 && <Typography className={classes.humanNote}>No acknowledgements yet.</Typography>}
              {form.approvals.length > 0 && (
                <div className={classes.approvalList}>
                  {form.approvals.map((a, i) => (
                    <div key={`${a.by || 'pending'}-${i}`} className={classes.approvalRow}>
                      <span className={classes.approvalWho}>
                        {a.by || 'you (pending submit)'}
                        {a.role ? ` · ${a.role}` : ''}
                      </span>
                      <span className={classes.approvalWhen}>{a.at ? relativeTime(a.at) : ''}</span>
                      <button type="button" className={classes.approvalRemove} onClick={() => removeApproval(i)} aria-label="Remove approval">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className={classes.humanRow}>
                <input
                  className={classes.humanInput}
                  style={{ flex: 1 }}
                  placeholder="Role (optional) — e.g. tech lead, on-call"
                  value={approvalRole}
                  onChange={e => setApprovalRole(e.target.value)}
                />
                <Button small onClick={addMyApproval}>
                  + Acknowledge
                </Button>
              </div>
            </div>
            <div className={classes.humanActions}>
              {submitContext.result ? (
                <Button small onClick={() => submitContext.reset()}>
                  Close
                </Button>
              ) : (
                <Button small variant="primary" disabled={!dirty || submitContext.loading} onClick={onSubmitContext}>
                  {submitContext.loading ? OPENING_PR : 'Open notes PR'}
                </Button>
              )}
              {persisted.data.humanContext.authoredBy && (
                <Typography className={classes.humanNote} style={{ marginBottom: 0 }}>
                  last authored by {persisted.data.humanContext.authoredBy}
                </Typography>
              )}
            </div>
            {submitContext.result && (
              <PrReceipt
                prUrl={submitContext.result.prUrl}
                alreadyOpen={submitContext.result.alreadyOpen}
                next="merge it; the notes show on this record once it lands."
              />
            )}
            {submitContext.error && <Callout tone="bad">Couldn't open the PR: {submitContext.error}</Callout>}
          </div>
        )}
      </div>

      <div className={classes.cert}>
        {verified && (
          <span className={classes.certItem}>
            <span className={classes.certB}>Signed &amp; attested</span> — cosign
            {record.provenance?.attestations.some(a => a.predicateType === 'https://slsa.dev/provenance/v0.2') ? ' + SLSA v0.2' : ''}
          </span>
        )}
        {rekor && (
          <span className={classes.certItem}>
            <span className={classes.certB}>Logged</span> — Rekor #{rekor.logIndex}
          </span>
        )}
        <span className={classes.certItem}>
          <span className={classes.certB}>{signoffCount}</span> sign-off{signoffCount === 1 ? '' : 's'} before merge
        </span>
        <span className={classes.certItem}>
          <span className={classes.certB}>{record.incidents.length}</span> incidents since deploy
        </span>
        <span className={classes.certStamp}>generated {formatDateTime(new Date().toISOString())} · tower/release-record@1</span>
      </div>
    </div>
  );
}

// The PR check that every passing gate reports ("Pipelines as Code CI/<gate>- has successfully validated your
// commit.") says nothing a green dot does not; a gate's message is shown only when it adds something.
const BOILERPLATE = /has successfully validated your commit\.?$/i;

function GateGrid({ checks, classes, t }: { checks: PrCheckRun[]; classes: ReturnType<typeof useStyles>; t: HangarTokens }) {
  const notes = checks
    .map(check => ({ check, tone: gateCheckTone(t, check) }))
    .filter(({ check, tone }) => check.message && (tone.label !== 'passed' || !BOILERPLATE.test(stripLightMarkdown(check.message).trim())));
  return (
    <>
      <div className={classes.gateGrid}>
        {checks.map(check => {
          const tone = gateCheckTone(t, check);
          return (
            <Tooltip key={check.name} title={`${formatGateName(check.name)}: ${tone.label}`}>
              <div className={classes.gateTile}>
                <span className={classes.gateDot} style={{ backgroundColor: tone.color }} />
                <span className={classes.gateTileName}>{formatGateName(check.name)}</span>
                {tone.label !== 'passed' && <span style={{ color: tone.color }}>{tone.label}</span>}
              </div>
            </Tooltip>
          );
        })}
      </div>
      {notes.map(({ check, tone }) => (
        <div key={check.name} className={classes.gateNote}>
          <span style={{ color: tone.color }}>{formatGateName(check.name)}:</span> {stripLightMarkdown(check.message!)}
          {check.commentUrl && (
            <>
              {' '}
              <a href={check.commentUrl} target="_blank" rel="noopener noreferrer">
                PR comment →
              </a>
            </>
          )}
        </div>
      ))}
    </>
  );
}

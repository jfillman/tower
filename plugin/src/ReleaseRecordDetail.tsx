import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Link from '@material-ui/core/Link';
import { formatDateTime, relativeTime } from '../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { preventFocusScroll } from './preventFocusScroll';
import { HangarMark } from '../brand/HangarMark';
import { SupplyChainChips } from './SupplyChainChips';
import { GateLedger, useSignalRailStyles } from './SignalRail';
import { phaseTone } from './PipelineRunList';
import { downloadReleaseRecordHtml, printReleaseRecordPdf } from './ReleaseRecordExport';
import { confidenceColor } from './ReleaseRecordList';
import { NicknameChip } from './tabs/deployments/ImageTagPill';
import { applyApprovalBonus, confidenceBreakdown, dedupeCommits, withPersistedGuardrails, type ReleaseRecord } from './useReleaseRecords';
import { useReleaseRecordDoc, useSubmitHumanContext, type ReleaseRecordHumanContext } from './useReleaseRecordPersistence';

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
  backBtn: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 12,
    color: ({ t }) => t.textLo,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 0 14px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
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
    color: ({ t }) => t.amber,
    marginBottom: 4,
  },
  h3: { fontSize: 24, fontWeight: 700, fontFamily: fontDisplay, color: ({ t }) => t.textHi },
  app: { color: ({ t }) => t.textFaint, fontWeight: 500, fontSize: 16, marginLeft: 8 },
  facts: { display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5, color: ({ t }) => t.textLo },
  factsB: { color: ({ t }) => t.textHi, fontWeight: 600 },
  scoreBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    borderRadius: 8,
    padding: '8px 14px',
  },
  scoreNum: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 22 },
  scoreLbl: { fontSize: 11, color: ({ t }) => t.textFaint, lineHeight: 1.3 },
  scoreLink: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.sky, '&:hover': { textDecoration: 'underline' } },
  explainer: { border: ({ t }) => `1px solid ${t.line}`, backgroundColor: ({ t }) => t.panelAlt, borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: ({ t }) => t.textLo },
  explainRow: { display: 'grid', gridTemplateColumns: '150px 60px 1fr', gap: 12, padding: '5px 0', borderBottom: ({ t }) => `1px dashed ${t.lineSoft}`, alignItems: 'baseline' },
  explainPts: { fontFamily: fontMono, color: ({ t }) => t.textHi },
  actionsBar: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 11.5,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textLo,
    padding: '7px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnPrimary: { backgroundColor: ({ t }) => t.amber, borderColor: ({ t }) => t.amber, color: '#241a05' },
  // alignItems: 'start' is the actual fix for the "huge empty space" complaint -
  // grid's default 'stretch' forces every column's box to the row's tallest
  // column (built, by far the densest), so a short column (changed/happened)
  // rendered a big blank area below its own content rather than just being
  // short. Column ratio skews toward "built" (still the densest column even
  // after the content trims below) rather than a flat 1/1/1 split.
  triad: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.3fr 1fr',
    alignItems: 'start',
    gap: 16,
    '@media (max-width: 860px)': { gridTemplateColumns: '1fr' },
  },
  col: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8, backgroundColor: ({ t }) => t.panel, overflow: 'hidden' },
  colHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', borderBottom: ({ t }) => `1px solid ${t.line}` },
  colHeadChanged: { borderTop: ({ t }) => `3px solid ${t.sky}` },
  colHeadBuilt: { borderTop: ({ t }) => `3px solid ${t.amber}` },
  colHeadHappened: { borderTop: ({ t }) => `3px solid ${t.good}` },
  colTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: ({ t }) => t.textHi },
  colBody: { padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 14 },
  prItem: { display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'baseline' },
  prNum: { color: ({ t }) => t.sky, fontFamily: fontMono, fontSize: 11, flex: 'none' },
  prTitle: { color: ({ t }) => t.textHi, flex: 1 },
  prWho: { color: ({ t }) => t.textFaint, fontSize: 11, flex: 'none' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '4px 8px',
    borderRadius: 5,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo,
    backgroundColor: ({ t }) => t.panelAlt,
  },
  kv: { display: 'flex', flexDirection: 'column', gap: 6 },
  kvRow: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 },
  kvK: { color: ({ t }) => t.textFaint },
  kvV: { color: ({ t }) => t.textHi, fontFamily: fontMono, fontSize: 11.5 },
  promoChain: { display: 'flex', flexDirection: 'column', gap: 8 },
  promo: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 },
  promoEnv: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '3px 7px',
    borderRadius: 4,
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo,
  },
  promoArrow: { color: ({ t }) => t.textFaint },
  promoWhen: { marginLeft: 'auto', color: ({ t }) => t.textFaint, fontSize: 11, fontFamily: fontMono },
  empty: { fontSize: 12, color: ({ t }) => t.textFaint, fontStyle: 'italic' },
  runList: { display: 'flex', flexDirection: 'column', gap: 6 },
  runRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 },
  runName: { color: ({ t }) => t.textHi, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  runStage: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint, flex: 'none' },
  runPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: '0.02em',
    padding: '2px 7px',
    borderRadius: 99,
    flex: 'none',
  },
  runPillDot: { width: 5, height: 5, borderRadius: '50%' },
  testRow: { display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' },
  testTask: { color: ({ t }) => t.textFaint, fontFamily: fontMono, fontSize: 10.5, flex: 'none' },
  testResult: { color: ({ t }) => t.textHi, flex: 1, overflowWrap: 'anywhere' },
  scanBlock: { display: 'flex', flexDirection: 'column', gap: 4 },
  scanHead: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 },
  scanName: { color: ({ t }) => t.textHi, fontWeight: 600, textTransform: 'capitalize' },
  scanFindings: {
    fontFamily: fontMono,
    fontSize: 10.5,
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
  humanNote: { fontSize: 12.5, color: ({ t }) => t.amberInk, lineHeight: 1.55 },
  humanForm: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 },
  humanRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  humanField: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 },
  humanLabel: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: ({ t }) => t.amberInk },
  humanInput: {
    fontFamily: 'inherit',
    fontSize: 12.5,
    padding: '7px 10px',
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
  },
  humanTextarea: {
    fontFamily: 'inherit',
    fontSize: 12.5,
    padding: '8px 10px',
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
    resize: 'vertical',
    minHeight: 56,
  },
  humanActions: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 },
  humanResultLink: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.sky },
  approvalList: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 },
  approvalRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    padding: '4px 8px',
    borderRadius: 5,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.bg,
  },
  approvalWho: { color: ({ t }) => t.amberInk, fontWeight: 600, flex: 1 },
  approvalWhen: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.amberInk, opacity: 0.75 },
  approvalRemove: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    color: ({ t }) => t.amberInk,
    padding: '0 2px',
  },
  humanError: { fontSize: 12, color: ({ t }) => t.bad },
  cert: {
    marginTop: 18,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 8,
    backgroundColor: ({ t }) => t.panelAlt,
    padding: '12px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: 22,
    flexWrap: 'wrap',
  },
  certItem: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: ({ t }) => t.textLo },
  certB: { color: ({ t }) => t.textHi, fontWeight: 600 },
  certStamp: { marginLeft: 'auto', fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
}));

export function ReleaseRecordDetail({
  record: liveRecord,
  appName,
  owner,
  otherRecords,
  onCompare,
  onBack,
}: {
  record: ReleaseRecord;
  appName?: string;
  owner?: string;
  otherRecords: ReleaseRecord[];
  onCompare: (id: string) => void;
  onBack: () => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const railClasses = useSignalRailStyles({ t });

  const persistTarget = owner && appName ? { owner, appName, imageTag: liveRecord.imageTag } : undefined;
  const persisted = useReleaseRecordDoc(persistTarget);
  // Guardrails frozen into the committed record win over nothing, never over live data - see withPersistedGuardrails.
  const record = withPersistedGuardrails(liveRecord, persisted.data);
  const verified = record.provenance?.attestations.some(a => a.verified) ?? false;
  const rekor = record.provenance?.attestations.find(a => a.transparencyLog)?.transparencyLog;
  const liveDeployment = record.deployments.find(d => d.isLive);
  const categoryChips = Object.entries(record.changeCategories).filter(([, count]) => count > 0);

  // Committed approvals only, never the pending/unsaved form state below -
  // same reasoning as the cert strip's own "N approvals on record" count.
  const displayConfidence = applyApprovalBonus(record.confidence, persisted.data?.humanContext.approvals.length ?? 0);
  const [showScoreExplainer, setShowScoreExplainer] = useState(false);
  const scoreLines = confidenceBreakdown(record, persisted.data?.humanContext.approvals.length ?? 0);
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
        approvals: form.approvals,
      },
      summary,
    });
  };

  return (
    <div>
      <button type="button" className={classes.backBtn} onClick={onBack}>
        ← Back to records
      </button>

      <div className={classes.head}>
        <div className={classes.headLeft}>
          <div className={classes.mark}>
            <HangarMark glyph="hangar" size={52} />
          </div>
          <div>
            <div className={classes.kicker}>Release Record</div>
            <Typography className={classes.h3}>
              {record.version ?? record.imageTag}
              {record.nickname && (
                <span style={{ marginLeft: 8 }}>
                  <NicknameChip nickname={record.nickname} />
                </span>
              )}
              {appName && <span className={classes.app}>— {appName}</span>}
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
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className={classes.scoreBox}>
            <span className={classes.scoreNum} style={{ color: confidenceColor(t, displayConfidence) }}>
              {displayConfidence}
            </span>
            <span className={classes.scoreLbl}>
              confidence
              <br />
              score
              <br />
              <button type="button" className={classes.scoreLink} onMouseDown={preventFocusScroll} onClick={() => setShowScoreExplainer(v => !v)}>
                {showScoreExplainer ? 'hide how ▴' : 'how? ▾'}
              </button>
            </span>
          </div>
          <div className={classes.actionsBar}>
            <button
              type="button"
              className={`${classes.btn} ${classes.btnPrimary}`}
              onClick={() => printReleaseRecordPdf(record, persisted.data?.humanContext)}
            >
              ⤓ PDF
            </button>
            <button type="button" className={classes.btn} onClick={() => downloadReleaseRecordHtml(record, persisted.data?.humanContext)}>
              ⤓ HTML
            </button>
            {otherRecords.length > 0 && (
              <select
                className={classes.btn}
                value=""
                onChange={e => {
                  if (e.target.value) onCompare(e.target.value);
                }}
              >
                <option value="" disabled>
                  Compare ▾
                </option>
                {otherRecords.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.version ?? r.imageTag}
                    {r.nickname ? ` · ${r.nickname}` : ''} — {formatDateTime(r.createdAt)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {showScoreExplainer && (
        <div className={classes.explainer}>
          <Typography style={{ fontWeight: 700, color: t.textHi, marginBottom: 6 }}>How the confidence score works</Typography>
          <Typography style={{ fontSize: 12, marginBottom: 8 }}>
            A 0-100 heuristic built only from evidence Tower can see - not a prediction. It's a technical score plus a small bonus for recorded human approvals; it moves if any of that evidence changes.
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

      <div className={classes.triad}>
        <div className={classes.col}>
          <div className={`${classes.colHead} ${classes.colHeadChanged}`}>
            <span className={classes.colTitle}>What changed</span>
            <span className={classes.chip}>
              {record.pullRequests.length} PR{record.pullRequests.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className={classes.colBody}>
            {record.pullRequests.length === 0 && record.commits.length === 0 && (
              <Typography className={classes.empty}>No merged source PRs found in the window Tower has fetched.</Typography>
            )}
            {record.pullRequests.length === 0 && record.commits.length > 0 && (
              <div className={classes.kv}>
                <span className={classes.kvK}>No merged source PRs found in the window Tower has fetched — commits by environment:</span>
                {dedupeCommits(record.commits).map(c => (
                  <div key={`${c.env}-${c.sha}`} className={classes.kvRow}>
                    <span className={classes.kvK}>{c.env}</span>
                    <span className={classes.kvV}>{c.sha.slice(0, 7)}</span>
                  </div>
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
                  <Typography className={classes.empty}>+{record.pullRequests.length - 8} more</Typography>
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
          <div className={`${classes.colHead} ${classes.colHeadBuilt}`}>
            <span className={classes.colTitle}>What was built</span>
            <span
              className={classes.chip}
              style={verified ? { color: t.good, borderColor: t.good, backgroundColor: t.goodSoft } : undefined}
            >
              {verified ? 'verified' : 'unverified'}
            </span>
          </div>
          <div className={classes.colBody}>
            <div className={classes.kv}>
              {record.imageDigest && (
                <div className={classes.kvRow}>
                  <span className={classes.kvK}>Digest</span>
                  <span className={classes.kvV}>{record.imageDigest.replace(/^sha256:/, '').slice(0, 20)}…</span>
                </div>
              )}
              {record.hasSbom && (
                <div className={classes.kvRow}>
                  <span className={classes.kvK}>SBOM</span>
                  <span className={classes.kvV}>attached</span>
                </div>
              )}
            </div>
            {record.pipelineRuns.length > 0 && (
              <div className={classes.runList}>
                {record.pipelineRuns.map(run => {
                  const tone = phaseTone(t, run.phase);
                  return (
                    <div key={run.name} className={classes.runRow}>
                      {run.pipelineName && <span className={classes.runStage}>{run.pipelineName}</span>}
                      <span className={classes.runName}>{run.name}</span>
                      <span className={classes.runPill} style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.fg, border: '1px solid' }}>
                        <span className={classes.runPillDot} style={{ backgroundColor: tone.fg }} />
                        {tone.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {record.securityScans.length > 0 && (
              <div className={classes.kv}>
                <span className={classes.kvK}>Security scans</span>
                {record.securityScans.map(scan => (
                  <div key={scan.scanner} className={classes.scanBlock}>
                    <div className={classes.scanHead}>
                      <span className={classes.scanName}>{scan.scanner.replace('-', ' ')}</span>
                      {scan.outcome && (
                        <span
                          className={classes.chip}
                          style={
                            scan.outcome === 'passed'
                              ? { color: t.good, borderColor: t.good, backgroundColor: t.goodSoft }
                              : { color: t.bad, borderColor: t.bad, backgroundColor: t.badSoft }
                          }
                        >
                          {scan.outcome}
                        </span>
                      )}
                    </div>
                    {scan.findingsSummary && <div className={classes.scanFindings}>{scan.findingsSummary}</div>}
                  </div>
                ))}
              </div>
            )}
            {record.testResults.length > 0 && (
              <div className={classes.kv}>
                <span className={classes.kvK}>
                  Test results {record.testResults.length > 1 && `(${record.testResults.length})`}
                </span>
                {record.testResults.slice(0, 8).map((tr, i) => (
                  <div key={`${tr.taskName}-${tr.resultName}-${i}`} className={classes.testRow}>
                    <span className={classes.testTask}>
                      {tr.taskName}/{tr.resultName}
                    </span>
                    <span className={classes.testResult}>{tr.value}</span>
                  </div>
                ))}
                {record.testResults.length > 8 && (
                  <Typography className={classes.empty}>+{record.testResults.length - 8} more</Typography>
                )}
              </div>
            )}
            <SupplyChainChips provenance={record.provenance} />
            {rekor && (
              <div className={classes.chipRow}>
                <span className={classes.chip}>Rekor #{rekor.logIndex}</span>
              </div>
            )}
            {record.guardrails ? (
              <>
                <GateLedger ci={record.guardrails} classes={railClasses} t={t} />
                {record.guardrailsPrUrl && (
                  <Link className={classes.humanResultLink} href={record.guardrailsPrUrl} target="_blank" rel="noopener noreferrer">
                    {record.guardrailsPrNumber ? `View gitops PR #${record.guardrailsPrNumber}` : 'View gitops PR'}
                  </Link>
                )}
              </>
            ) : (
              <Typography className={classes.empty}>No release-guardrail check data found for this release's gitops PR.</Typography>
            )}
          </div>
        </div>

        <div className={classes.col}>
          <div className={`${classes.colHead} ${classes.colHeadHappened}`}>
            <span className={classes.colTitle}>What happened</span>
            <span
              className={classes.chip}
              style={record.incidents.length === 0 ? { color: t.good, borderColor: t.good, backgroundColor: t.goodSoft } : undefined}
            >
              {record.incidents.length === 0 ? 'no incidents' : `${record.incidents.length} incidents`}
            </span>
          </div>
          <div className={classes.colBody}>
            {record.promotionChain.length === 0 ? (
              <Typography className={classes.empty}>No recorded promotions between tracked environments.</Typography>
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
                  <div className={classes.kvRow}>
                    <span className={classes.kvK}>Rollout strategy</span>
                    <span className={classes.kvV}>{liveDeployment.rolloutStrategy}</span>
                  </div>
                )}
                {liveDeployment.argoRevision && (
                  <div className={classes.kvRow}>
                    <span className={classes.kvK}>Argo CD revision</span>
                    <span className={classes.kvV}>{liveDeployment.argoRevision.slice(0, 10)}</span>
                  </div>
                )}
                {liveDeployment.rolloutStrategy === 'canary' && liveDeployment.canarySteps && liveDeployment.canarySteps.length > 0 && (
                  <div className={classes.kvRow}>
                    <span className={classes.kvK}>Canary steps</span>
                    <span className={classes.kvV}>{liveDeployment.canarySteps.length}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={classes.human}>
        <div className={classes.humanHead}>
          <span className={classes.humanTitle}>Human context</span>
        </div>
        {!persistTarget && (
          <Typography className={classes.humanNote}>
            Human context can't be added without knowing this app's GitHub owner - reopen this record from the
            Releases tab rather than a direct link.
          </Typography>
        )}
        {persistTarget && persisted.loading && <Typography className={classes.humanNote}>Checking for a committed Release Record…</Typography>}
        {persistTarget && persisted.notFound && (
          <Typography className={classes.humanNote}>
            No Release Record has been committed yet for this image - Tower generates one automatically once a
            release like this reaches a Flight-tier environment and goes Healthy (usually within a few minutes).
            Human context can be added once that record exists.
          </Typography>
        )}
        {persistTarget && persisted.error && (
          <Typography className={classes.humanNote}>Couldn't check for a committed record: {persisted.error}</Typography>
        )}
        {persistTarget && persisted.data && (
          <div className={classes.humanForm}>
            <div className={classes.humanField}>
              <label className={classes.humanLabel} htmlFor="rr-summary">
                Developer summary
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
            <div className={classes.humanField}>
              <label className={classes.humanLabel} htmlFor="rr-verification">
                Verification notes
              </label>
              <textarea
                id="rr-verification"
                className={classes.humanTextarea}
                placeholder="What did you check before/after this went out?"
                value={form.verificationNotes ?? ''}
                onChange={e => setForm(f => ({ ...f, verificationNotes: e.target.value }))}
              />
            </div>
            <div className={classes.humanField}>
              {/* A section heading for the group below, not a control's label - a
                  plain span avoids jsx-a11y's label/control-association rule, which
                  doesn't apply here (nothing single here for it to label). */}
              <span className={classes.humanLabel}>Approvals</span>
              {form.approvals.length === 0 && <Typography className={classes.humanNote}>No approvals on record yet.</Typography>}
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
                <button type="button" className={classes.btn} onClick={addMyApproval}>
                  + Add my approval
                </button>
              </div>
            </div>
            <div className={classes.humanActions}>
              {submitContext.result ? (
                <button type="button" className={classes.btn} onClick={() => submitContext.reset()}>
                  Close
                </button>
              ) : (
                <button
                  type="button"
                  className={`${classes.btn} ${classes.btnPrimary}`}
                  disabled={!dirty || submitContext.loading}
                  onClick={onSubmitContext}
                >
                  {submitContext.loading ? 'Opening PR…' : 'Open PR for human context'}
                </button>
              )}
              {persisted.data.humanContext.authoredBy && (
                <Typography className={classes.humanNote} style={{ marginBottom: 0 }}>
                  last authored by {persisted.data.humanContext.authoredBy}
                </Typography>
              )}
            </div>
            {submitContext.result && (
              <Typography className={classes.humanNote}>
                {submitContext.result.alreadyOpen ? 'A PR for this exact change is already open: ' : 'PR opened: '}
                <Link className={classes.humanResultLink} href={submitContext.result.prUrl} target="_blank" rel="noopener noreferrer">
                  {submitContext.result.prUrl}
                </Link>
              </Typography>
            )}
            {submitContext.error && <Typography className={classes.humanError}>Couldn't open PR: {submitContext.error}</Typography>}
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
          <span className={classes.certB}>{persisted.data?.humanContext.approvals.length ?? 0}</span> approvals on record
        </span>
        <span className={classes.certItem}>
          <span className={classes.certB}>{record.incidents.length}</span> incidents since deploy
        </span>
        <span className={classes.certStamp}>generated {formatDateTime(new Date().toISOString())} · tower/release-record@1</span>
      </div>
    </div>
  );
}

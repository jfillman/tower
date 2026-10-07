import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Link from '@material-ui/core/Link';
import { formatDateTime, relativeTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { preventFocusScroll } from './preventFocusScroll.esm.js';
import { HangarMark } from './brand/HangarMark.esm.js';
import { SupplyChainChips } from './SupplyChainChips.esm.js';
import { gateCheckTone, stripLightMarkdown, formatGateName } from './SignalRail.esm.js';
import { phaseTone } from './PipelineRunList.esm.js';
import { printReleaseRecordPdf, downloadReleaseRecordHtml } from './ReleaseRecordExport.esm.js';
import { confidenceColor } from './ReleaseRecordList.esm.js';
import { NicknameChip } from './tabs/deployments/ImageTagPill.esm.js';
import { withPersistedGuardrails, applyApprovalBonus, confidenceBreakdown, dedupeCommits } from './useReleaseRecords.esm.js';
import { useReleaseRecordDoc, useSubmitHumanContext } from './useReleaseRecordPersistence.esm.js';

const useStyles = makeStyles(() => ({
  backBtn: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 12,
    color: ({ t }) => t.textLo,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px 0 14px",
    display: "inline-flex",
    alignItems: "center",
    gap: 6
  },
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    flexWrap: "wrap",
    paddingBottom: 20,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
    marginBottom: 22
  },
  headLeft: { display: "flex", gap: 16, alignItems: "center" },
  // The Hangar instrument-dial mark itself (2026-09-23: "change the release record logo to match the Hangar logo") - no wrapper ring, the mark carries its own.
  mark: { flex: "none", display: "flex" },
  kicker: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: ({ t }) => t.amber,
    marginBottom: 4
  },
  h3: { fontSize: 24, fontWeight: 700, fontFamily: fontDisplay, color: ({ t }) => t.textHi },
  app: { color: ({ t }) => t.textFaint, fontWeight: 500, fontSize: 16, marginLeft: 8 },
  facts: { display: "flex", gap: 22, flexWrap: "wrap", marginTop: 10, fontSize: 12.5, color: ({ t }) => t.textLo },
  factsB: { color: ({ t }) => t.textHi, fontWeight: 600 },
  scoreBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    borderRadius: 8,
    padding: "8px 14px"
  },
  scoreNum: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 22 },
  scoreLbl: { fontSize: 11, color: ({ t }) => t.textFaint, lineHeight: 1.3 },
  scoreLink: { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.sky, "&:hover": { textDecoration: "underline" } },
  explainer: { border: ({ t }) => `1px solid ${t.line}`, backgroundColor: ({ t }) => t.panelAlt, borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 12.5, color: ({ t }) => t.textLo },
  explainRow: { display: "grid", gridTemplateColumns: "150px 60px 1fr", gap: 12, padding: "5px 0", borderBottom: ({ t }) => `1px dashed ${t.lineSoft}`, alignItems: "baseline" },
  explainPts: { fontFamily: fontMono, color: ({ t }) => t.textHi },
  actionsBar: { display: "flex", gap: 8, flexWrap: "wrap" },
  btn: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 11.5,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textLo,
    padding: "7px 12px",
    borderRadius: 6,
    cursor: "pointer",
    whiteSpace: "nowrap"
  },
  btnPrimary: { backgroundColor: ({ t }) => t.amber, borderColor: ({ t }) => t.amber, color: "#241a05" },
  // alignItems: 'start' is the actual fix for the "huge empty space" complaint -
  // grid's default 'stretch' forces every column's box to the row's tallest
  // column (built, by far the densest), so a short column (changed/happened)
  // rendered a big blank area below its own content rather than just being
  // short. Column ratio skews toward "built" (still the densest column even
  // after the content trims below) rather than a flat 1/1/1 split.
  pair: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    // Both boxes as tall as the taller one (owner, 2026-10-07); content stays at the top.
    alignItems: "stretch",
    gap: 16,
    marginBottom: 16,
    "@media (max-width: 860px)": { gridTemplateColumns: "1fr" }
  },
  builtBody: { padding: "14px 15px", display: "flex", flexDirection: "column", gap: 16 },
  builtSummary: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontFamily: fontMono, fontSize: 12 },
  summaryItem: { color: ({ t }) => t.textHi, marginRight: 4 },
  builtGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)",
    gap: 24,
    alignItems: "start",
    "@media (max-width: 960px)": { gridTemplateColumns: "1fr" }
  },
  builtGrid3: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1.4fr)",
    gap: 24,
    alignItems: "start",
    "@media (max-width: 1100px)": { gridTemplateColumns: "1fr" }
  },
  builtSection: { display: "flex", flexDirection: "column", gap: 10, minWidth: 0 },
  builtSectionTitle: { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: ({ t }) => t.textLo },
  gatesHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  gatesCount: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi },
  gateGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 },
  gateTile: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "6px 9px",
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.textHi,
    minWidth: 0
  },
  gateTileName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  gateDot: { width: 7, height: 7, borderRadius: "50%", flex: "none" },
  gateNote: { fontSize: 12, color: ({ t }) => t.textLo, lineHeight: 1.4 },
  col: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8, backgroundColor: ({ t }) => t.panel, overflow: "hidden" },
  colHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 15px", borderBottom: ({ t }) => `1px solid ${t.line}` },
  colHeadChanged: { borderTop: ({ t }) => `3px solid ${t.sky}` },
  colHeadBuilt: { borderTop: ({ t }) => `3px solid ${t.amber}` },
  colHeadHappened: { borderTop: ({ t }) => `3px solid ${t.good}` },
  colTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: ({ t }) => t.textHi },
  colBody: { padding: "14px 15px", display: "flex", flexDirection: "column", gap: 14 },
  prItem: { display: "flex", gap: 8, fontSize: 12.5, alignItems: "baseline" },
  prNum: { color: ({ t }) => t.sky, fontFamily: fontMono, fontSize: 11, flex: "none" },
  prTitle: { color: ({ t }) => t.textHi, flex: 1 },
  prWho: { color: ({ t }) => t.textFaint, fontSize: 11, flex: "none" },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "4px 8px",
    borderRadius: 5,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo,
    backgroundColor: ({ t }) => t.panelAlt
  },
  kv: { display: "flex", flexDirection: "column", gap: 6 },
  kvRow: { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 },
  kvK: { color: ({ t }) => t.textFaint },
  kvV: { color: ({ t }) => t.textHi, fontFamily: fontMono, fontSize: 11.5 },
  promoChain: { display: "flex", flexDirection: "column", gap: 8 },
  promo: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 },
  promoEnv: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "3px 7px",
    borderRadius: 4,
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo
  },
  promoArrow: { color: ({ t }) => t.textFaint },
  promoWhen: { marginLeft: "auto", color: ({ t }) => t.textFaint, fontSize: 11, fontFamily: fontMono },
  empty: { fontSize: 12, color: ({ t }) => t.textFaint, fontStyle: "italic" },
  runList: { display: "flex", flexDirection: "column", gap: 6 },
  runRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 },
  runName: { color: ({ t }) => t.textHi, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  runStage: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint, flex: "none" },
  runPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: "0.02em",
    padding: "2px 7px",
    borderRadius: 99,
    flex: "none"
  },
  runPillDot: { width: 5, height: 5, borderRadius: "50%" },
  testRow: { display: "flex", gap: 8, fontSize: 12, alignItems: "baseline" },
  testTask: { color: ({ t }) => t.textFaint, fontFamily: fontMono, fontSize: 10.5, flex: "none" },
  testResult: { color: ({ t }) => t.textHi, flex: 1, overflowWrap: "anywhere" },
  scanBlock: { display: "flex", flexDirection: "column", gap: 4 },
  scanHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 },
  scanName: { color: ({ t }) => t.textHi, fontWeight: 600, textTransform: "capitalize" },
  scanFindings: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textLo,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    padding: "6px 9px"
  },
  human: {
    marginTop: 18,
    border: ({ t }) => `1px dashed ${t.amberLine}`,
    borderRadius: 8,
    backgroundColor: ({ t }) => t.amberSoft,
    padding: "16px 20px 18px"
  },
  humanHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  humanTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, letterSpacing: "0.07em", textTransform: "uppercase", color: ({ t }) => t.amberInk },
  humanNote: { fontSize: 12.5, color: ({ t }) => t.amberInk, lineHeight: 1.55 },
  humanForm: { display: "flex", flexDirection: "column", gap: 10, marginTop: 8 },
  humanRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  humanField: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 },
  humanLabel: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", color: ({ t }) => t.amberInk },
  humanInput: {
    fontFamily: "inherit",
    fontSize: 12.5,
    padding: "7px 10px",
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi
  },
  humanTextarea: {
    fontFamily: "inherit",
    fontSize: 12.5,
    padding: "8px 10px",
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
    resize: "vertical",
    minHeight: 56
  },
  humanActions: { display: "flex", alignItems: "center", gap: 10, marginTop: 2 },
  humanResultLink: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.sky },
  approvalList: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 },
  approvalRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 5,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.bg
  },
  approvalWho: { color: ({ t }) => t.amberInk, fontWeight: 600, flex: 1 },
  approvalWhen: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.amberInk, opacity: 0.75 },
  approvalRemove: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    color: ({ t }) => t.amberInk,
    padding: "0 2px"
  },
  humanError: { fontSize: 12, color: ({ t }) => t.bad },
  cert: {
    marginTop: 18,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 8,
    backgroundColor: ({ t }) => t.panelAlt,
    padding: "12px 18px",
    display: "flex",
    alignItems: "center",
    gap: 22,
    flexWrap: "wrap"
  },
  certItem: { display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: ({ t }) => t.textLo },
  certB: { color: ({ t }) => t.textHi, fontWeight: 600 },
  certStamp: { marginLeft: "auto", fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint }
}));
function ReleaseRecordDetail({
  record: liveRecord,
  appName,
  owner,
  gitopsPrs,
  otherRecords,
  onCompare,
  onBack
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const persistTarget = owner && appName ? { owner, appName, imageTag: liveRecord.imageTag } : void 0;
  const persisted = useReleaseRecordDoc(persistTarget);
  const record = withPersistedGuardrails(liveRecord, persisted.data);
  const verified = record.provenance?.attestations.some((a) => a.verified) ?? false;
  const rekor = record.provenance?.attestations.find((a) => a.transparencyLog)?.transparencyLog;
  const hasSecurity = record.securityScans.length > 0 || record.testResults.length > 0;
  const liveDeployment = record.deployments.find((d) => d.isLive);
  const categoryChips = Object.entries(record.changeCategories).filter(([, count]) => count > 0);
  const displayConfidence = applyApprovalBonus(record.confidence, persisted.data?.humanContext.approvals.length ?? 0);
  const [showScoreExplainer, setShowScoreExplainer] = useState(false);
  const scoreLines = confidenceBreakdown(record, persisted.data?.humanContext.approvals.length ?? 0);
  const recordPr = (gitopsPrs ?? []).filter((pr) => {
    const m = pr.title.match(/^Release Record: (\S+) @ (\S+)$/);
    return m && m[2].toLowerCase() === record.imageTag.toLowerCase();
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  let recordNote = "No Release Record has been committed yet for this image - Tower generates one automatically once a release like this reaches a Flight-tier environment and goes Healthy (usually within a few minutes). Human context can be added once that record exists.";
  if (recordPr?.state === "open") {
    recordNote = "Tower has opened this release's Release Record PR - human context can be added once it's merged.";
  } else if (recordPr) {
    recordNote = "The Release Record PR has merged - refresh in a moment for the committed record.";
  }
  const submitContext = useSubmitHumanContext();
  const [form, setForm] = useState({ approvals: [] });
  const [approvalRole, setApprovalRole] = useState("");
  useEffect(() => {
    if (persisted.data) setForm(persisted.data.humanContext);
  }, [persisted.data]);
  const approvalsChanged = persisted.data && JSON.stringify(form.approvals) !== JSON.stringify(persisted.data.humanContext.approvals);
  const dirty = persisted.data && (form.summary !== (persisted.data.humanContext.summary ?? "") || form.risk !== persisted.data.humanContext.risk || form.riskNotes !== (persisted.data.humanContext.riskNotes ?? "") || form.verificationNotes !== (persisted.data.humanContext.verificationNotes ?? "") || approvalsChanged);
  const addMyApproval = () => {
    setForm((f) => ({ ...f, approvals: [...f.approvals, { by: "", at: "", role: approvalRole || void 0 }] }));
    setApprovalRole("");
  };
  const removeApproval = (index) => setForm((f) => ({ ...f, approvals: f.approvals.filter((_, i) => i !== index) }));
  const onSubmitContext = () => {
    if (!owner || !appName) return;
    const summary = [];
    if (form.summary !== (persisted.data?.humanContext.summary ?? "")) summary.push("updated developer summary");
    if (form.risk !== persisted.data?.humanContext.risk) summary.push(`set risk to ${form.risk ?? "(cleared)"}`);
    if (form.riskNotes !== (persisted.data?.humanContext.riskNotes ?? "")) summary.push("updated risk notes");
    if (form.verificationNotes !== (persisted.data?.humanContext.verificationNotes ?? "")) summary.push("updated verification notes");
    if (approvalsChanged) {
      const before = persisted.data?.humanContext.approvals.length ?? 0;
      const after = form.approvals.length;
      if (after > before) summary.push("added an approval");
      else if (after < before) summary.push("removed an approval");
      else summary.push("updated approvals");
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
        approvals: form.approvals
      },
      summary
    });
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("button", { type: "button", className: classes.backBtn, onClick: onBack, children: "\u2190 Back to records" }),
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.headLeft, children: [
        /* @__PURE__ */ jsx("div", { className: classes.mark, children: /* @__PURE__ */ jsx(HangarMark, { glyph: "hangar", size: 52 }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: classes.kicker, children: "Release Record" }),
          /* @__PURE__ */ jsxs(Typography, { className: classes.h3, children: [
            record.version ?? record.imageTag,
            record.nickname && /* @__PURE__ */ jsx("span", { style: { marginLeft: 8 }, children: /* @__PURE__ */ jsx(NicknameChip, { nickname: record.nickname }) }),
            appName && /* @__PURE__ */ jsxs("span", { className: classes.app, children: [
              "\u2014 ",
              appName
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: classes.facts, children: [
            /* @__PURE__ */ jsxs("span", { children: [
              "Status ",
              /* @__PURE__ */ jsx("span", { className: classes.factsB, children: record.current ? record.status : "superseded" })
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              "Deployed ",
              /* @__PURE__ */ jsx("span", { className: classes.factsB, children: formatDateTime(record.createdAt) }),
              " (",
              relativeTime(record.createdAt),
              ")"
            ] }),
            record.pipelineRun && /* @__PURE__ */ jsxs("span", { children: [
              "Build ",
              /* @__PURE__ */ jsx("span", { className: classes.factsB, children: record.nickname ?? record.pipelineRun.name })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 14 }, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.scoreBox, children: [
          /* @__PURE__ */ jsx("span", { className: classes.scoreNum, style: { color: confidenceColor(t, displayConfidence) }, children: displayConfidence }),
          /* @__PURE__ */ jsxs("span", { className: classes.scoreLbl, children: [
            "confidence",
            /* @__PURE__ */ jsx("br", {}),
            "score",
            /* @__PURE__ */ jsx("br", {}),
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.scoreLink, onMouseDown: preventFocusScroll, onClick: () => setShowScoreExplainer((v) => !v), children: showScoreExplainer ? "hide how \u25B4" : "how? \u25BE" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.actionsBar, children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: `${classes.btn} ${classes.btnPrimary}`,
              onClick: () => printReleaseRecordPdf(record, persisted.data?.humanContext),
              children: "\u2913 PDF"
            }
          ),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.btn, onClick: () => downloadReleaseRecordHtml(record, persisted.data?.humanContext), children: "\u2913 HTML" }),
          otherRecords.length > 0 && /* @__PURE__ */ jsxs(
            "select",
            {
              className: classes.btn,
              value: "",
              onChange: (e) => {
                if (e.target.value) onCompare(e.target.value);
              },
              children: [
                /* @__PURE__ */ jsx("option", { value: "", disabled: true, children: "Compare \u25BE" }),
                otherRecords.map((r) => /* @__PURE__ */ jsxs("option", { value: r.id, children: [
                  r.version ?? r.imageTag,
                  r.nickname ? ` \xB7 ${r.nickname}` : "",
                  " \u2014 ",
                  formatDateTime(r.createdAt)
                ] }, r.id))
              ]
            }
          )
        ] })
      ] })
    ] }),
    showScoreExplainer && /* @__PURE__ */ jsxs("div", { className: classes.explainer, children: [
      /* @__PURE__ */ jsx(Typography, { style: { fontWeight: 700, color: t.textHi, marginBottom: 6 }, children: "How the confidence score works" }),
      /* @__PURE__ */ jsx(Typography, { style: { fontSize: 12, marginBottom: 8 }, children: "A 0-100 heuristic built only from evidence Tower can see - not a prediction. It's a technical score plus a small bonus for recorded human approvals; it moves if any of that evidence changes." }),
      scoreLines.map((line) => /* @__PURE__ */ jsxs("div", { className: classes.explainRow, children: [
        /* @__PURE__ */ jsx("span", { style: { color: t.textHi }, children: line.label }),
        /* @__PURE__ */ jsxs("span", { className: classes.explainPts, children: [
          "+",
          line.points,
          " / ",
          line.max
        ] }),
        /* @__PURE__ */ jsx("span", { children: line.note })
      ] }, line.label)),
      /* @__PURE__ */ jsxs(Typography, { style: { fontSize: 12, marginTop: 8, color: t.textHi }, children: [
        "Total: ",
        displayConfidence,
        " / 100 (80+ green, 50-79 amber, below 50 red)"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.pair, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.col, children: [
        /* @__PURE__ */ jsxs("div", { className: `${classes.colHead} ${classes.colHeadChanged}`, children: [
          /* @__PURE__ */ jsx("span", { className: classes.colTitle, children: "What changed" }),
          /* @__PURE__ */ jsxs("span", { className: classes.chip, children: [
            record.pullRequests.length,
            " PR",
            record.pullRequests.length === 1 ? "" : "s"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.colBody, children: [
          record.pullRequests.length === 0 && record.commits.length === 0 && /* @__PURE__ */ jsx(Typography, { className: classes.empty, children: "No merged source PRs found in the window Tower has fetched." }),
          record.pullRequests.length === 0 && record.commits.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
            /* @__PURE__ */ jsx("span", { className: classes.kvK, children: "No merged source PRs found in the window Tower has fetched \u2014 commits by environment:" }),
            dedupeCommits(record.commits).map((c) => /* @__PURE__ */ jsxs("div", { className: classes.kvRow, children: [
              /* @__PURE__ */ jsx("span", { className: classes.kvK, children: c.env }),
              /* @__PURE__ */ jsx("span", { className: classes.kvV, children: c.sha.slice(0, 7) })
            ] }, `${c.env}-${c.sha}`))
          ] }),
          record.pullRequests.length > 0 && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 7 }, children: [
            record.pullRequests.slice(0, 8).map((pr) => /* @__PURE__ */ jsxs("div", { className: classes.prItem, children: [
              /* @__PURE__ */ jsxs("span", { className: classes.prNum, children: [
                "#",
                pr.number
              ] }),
              /* @__PURE__ */ jsx("span", { className: classes.prTitle, children: pr.title }),
              pr.author && /* @__PURE__ */ jsx("span", { className: classes.prWho, children: pr.author })
            ] }, pr.number)),
            record.pullRequests.length > 8 && /* @__PURE__ */ jsxs(Typography, { className: classes.empty, children: [
              "+",
              record.pullRequests.length - 8,
              " more"
            ] })
          ] }),
          categoryChips.length > 0 && /* @__PURE__ */ jsx("div", { className: classes.chipRow, children: categoryChips.map(([label, count]) => /* @__PURE__ */ jsxs("span", { className: classes.chip, children: [
            label,
            " \xB7 ",
            count
          ] }, label)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.col, children: [
        /* @__PURE__ */ jsxs("div", { className: `${classes.colHead} ${classes.colHeadHappened}`, children: [
          /* @__PURE__ */ jsx("span", { className: classes.colTitle, children: "What happened" }),
          /* @__PURE__ */ jsx(
            "span",
            {
              className: classes.chip,
              style: record.incidents.length === 0 ? { color: t.good, borderColor: t.good, backgroundColor: t.goodSoft } : void 0,
              children: record.incidents.length === 0 ? "no incidents" : `${record.incidents.length} incidents`
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.colBody, children: [
          record.promotionChain.length === 0 ? /* @__PURE__ */ jsx(Typography, { className: classes.empty, children: "No recorded promotions between tracked environments." }) : /* @__PURE__ */ jsx("div", { className: classes.promoChain, children: record.promotionChain.map((p) => /* @__PURE__ */ jsxs("div", { className: classes.promo, children: [
            /* @__PURE__ */ jsx("span", { className: classes.promoEnv, children: p.fromEnv }),
            /* @__PURE__ */ jsx("span", { className: classes.promoArrow, children: "\u2192" }),
            /* @__PURE__ */ jsx("span", { className: classes.promoEnv, children: p.toEnv }),
            /* @__PURE__ */ jsx("span", { className: classes.promoWhen, children: formatDateTime(p.at) })
          ] }, `${p.fromEnv}-${p.toEnv}`)) }),
          liveDeployment && /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
            liveDeployment.rolloutStrategy && /* @__PURE__ */ jsxs("div", { className: classes.kvRow, children: [
              /* @__PURE__ */ jsx("span", { className: classes.kvK, children: "Rollout strategy" }),
              /* @__PURE__ */ jsx("span", { className: classes.kvV, children: liveDeployment.rolloutStrategy })
            ] }),
            liveDeployment.argoRevision && /* @__PURE__ */ jsxs("div", { className: classes.kvRow, children: [
              /* @__PURE__ */ jsx("span", { className: classes.kvK, children: "Argo CD revision" }),
              /* @__PURE__ */ jsx("span", { className: classes.kvV, children: liveDeployment.argoRevision.slice(0, 10) })
            ] }),
            liveDeployment.rolloutStrategy === "canary" && liveDeployment.canarySteps && liveDeployment.canarySteps.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.kvRow, children: [
              /* @__PURE__ */ jsx("span", { className: classes.kvK, children: "Canary steps" }),
              /* @__PURE__ */ jsx("span", { className: classes.kvV, children: liveDeployment.canarySteps.length })
            ] })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.col, children: [
      /* @__PURE__ */ jsxs("div", { className: `${classes.colHead} ${classes.colHeadBuilt}`, children: [
        /* @__PURE__ */ jsx("span", { className: classes.colTitle, children: "What was built" }),
        /* @__PURE__ */ jsx(
          "span",
          {
            className: classes.chip,
            style: verified ? { color: t.good, borderColor: t.good, backgroundColor: t.goodSoft } : void 0,
            children: verified ? "verified" : "unverified"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.builtBody, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.builtSummary, children: [
          record.imageDigest && /* @__PURE__ */ jsxs("span", { className: classes.summaryItem, title: record.imageDigest, children: [
            /* @__PURE__ */ jsx("span", { className: classes.kvK, children: "digest" }),
            " ",
            record.imageDigest.replace(/^sha256:/, "").slice(0, 12),
            "\u2026"
          ] }),
          record.hasSbom && /* @__PURE__ */ jsx("span", { className: classes.chip, children: "SBOM attached" }),
          /* @__PURE__ */ jsx(SupplyChainChips, { provenance: record.provenance })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: hasSecurity ? classes.builtGrid3 : classes.builtGrid, children: [
          record.pipelineRuns.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.builtSection, children: [
            /* @__PURE__ */ jsx("span", { className: classes.builtSectionTitle, children: "Pipeline runs" }),
            /* @__PURE__ */ jsx("div", { className: classes.runList, children: record.pipelineRuns.map((run) => {
              const tone = phaseTone(t, run.phase);
              return /* @__PURE__ */ jsxs("div", { className: classes.runRow, children: [
                run.pipelineName && /* @__PURE__ */ jsx("span", { className: classes.runStage, children: run.pipelineName }),
                /* @__PURE__ */ jsx("span", { className: classes.runName, children: run.name }),
                /* @__PURE__ */ jsxs("span", { className: classes.runPill, style: { backgroundColor: tone.bg, borderColor: tone.border, color: tone.fg, border: "1px solid" }, children: [
                  /* @__PURE__ */ jsx("span", { className: classes.runPillDot, style: { backgroundColor: tone.fg } }),
                  tone.label
                ] })
              ] }, run.name);
            }) })
          ] }),
          hasSecurity && /* @__PURE__ */ jsxs("div", { className: classes.builtSection, children: [
            /* @__PURE__ */ jsx("span", { className: classes.builtSectionTitle, children: "Security" }),
            record.securityScans.map((scan) => /* @__PURE__ */ jsxs("div", { className: classes.scanBlock, children: [
              /* @__PURE__ */ jsxs("div", { className: classes.scanHead, children: [
                /* @__PURE__ */ jsx("span", { className: classes.scanName, children: scan.scanner.replace("-", " ") }),
                scan.outcome && /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: classes.chip,
                    style: scan.outcome === "passed" ? { color: t.good, borderColor: t.good, backgroundColor: t.goodSoft } : { color: t.bad, borderColor: t.bad, backgroundColor: t.badSoft },
                    children: scan.outcome
                  }
                )
              ] }),
              scan.findingsSummary && /* @__PURE__ */ jsx("div", { className: classes.scanFindings, children: scan.findingsSummary })
            ] }, scan.scanner)),
            record.testResults.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
              /* @__PURE__ */ jsxs("span", { className: classes.kvK, children: [
                "Test results ",
                record.testResults.length > 1 && `(${record.testResults.length})`
              ] }),
              record.testResults.slice(0, 8).map((tr, i) => /* @__PURE__ */ jsxs("div", { className: classes.testRow, children: [
                /* @__PURE__ */ jsxs("span", { className: classes.testTask, children: [
                  tr.taskName,
                  "/",
                  tr.resultName
                ] }),
                /* @__PURE__ */ jsx("span", { className: classes.testResult, children: tr.value })
              ] }, `${tr.taskName}-${tr.resultName}-${i}`)),
              record.testResults.length > 8 && /* @__PURE__ */ jsxs(Typography, { className: classes.empty, children: [
                "+",
                record.testResults.length - 8,
                " more"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: classes.builtSection, children: [
            /* @__PURE__ */ jsxs("div", { className: classes.gatesHead, children: [
              /* @__PURE__ */ jsx("span", { className: classes.builtSectionTitle, children: "Release gates" }),
              record.guardrails && /* @__PURE__ */ jsxs("span", { className: classes.gatesCount, children: [
                record.guardrails.passedChecks,
                "/",
                record.guardrails.totalChecks,
                " passed"
              ] })
            ] }),
            record.guardrails ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(GateGrid, { checks: record.guardrails.checks ?? [], classes, t }),
              record.guardrailsPrUrl && /* @__PURE__ */ jsx(Link, { className: classes.humanResultLink, href: record.guardrailsPrUrl, target: "_blank", rel: "noopener noreferrer", children: `View ${record.guardrailsPrUrl.includes("/gitops-") ? "gitops" : "release pin"} PR${record.guardrailsPrNumber ? ` #${record.guardrailsPrNumber}` : ""}` })
            ] }) : /* @__PURE__ */ jsx(Typography, { className: classes.empty, children: "No release-guardrail check data found for this release's release PR." })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.human, children: [
      /* @__PURE__ */ jsx("div", { className: classes.humanHead, children: /* @__PURE__ */ jsx("span", { className: classes.humanTitle, children: "Human context" }) }),
      !persistTarget && /* @__PURE__ */ jsx(Typography, { className: classes.humanNote, children: "Human context can't be added without knowing this app's GitHub owner - reopen this record from the Releases tab rather than a direct link." }),
      persistTarget && persisted.loading && /* @__PURE__ */ jsx(Typography, { className: classes.humanNote, children: "Checking for a committed Release Record\u2026" }),
      persistTarget && persisted.notFound && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.humanNote, children: recordNote }),
        recordPr && /* @__PURE__ */ jsx(Typography, { className: classes.humanNote, children: /* @__PURE__ */ jsxs(Link, { className: classes.humanResultLink, href: recordPr.url, target: "_blank", rel: "noopener noreferrer", children: [
          "Release Record PR #",
          recordPr.number,
          " (",
          recordPr.state,
          ") \u2197"
        ] }) })
      ] }),
      persistTarget && persisted.error && /* @__PURE__ */ jsxs(Typography, { className: classes.humanNote, children: [
        "Couldn't check for a committed record: ",
        persisted.error
      ] }),
      persistTarget && persisted.data && /* @__PURE__ */ jsxs("div", { className: classes.humanForm, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.humanField, children: [
          /* @__PURE__ */ jsx("label", { className: classes.humanLabel, htmlFor: "rr-summary", children: "Developer summary" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              id: "rr-summary",
              className: classes.humanTextarea,
              placeholder: "What does this release actually change, in plain language?",
              value: form.summary ?? "",
              onChange: (e) => setForm((f) => ({ ...f, summary: e.target.value }))
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.humanRow, children: [
          /* @__PURE__ */ jsxs("div", { className: classes.humanField, style: { maxWidth: 160 }, children: [
            /* @__PURE__ */ jsx("label", { className: classes.humanLabel, htmlFor: "rr-risk", children: "Risk" }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                id: "rr-risk",
                className: classes.humanInput,
                value: form.risk ?? "",
                onChange: (e) => setForm((f) => ({ ...f, risk: e.target.value || void 0 })),
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 not set \u2014" }),
                  /* @__PURE__ */ jsx("option", { value: "low", children: "Low" }),
                  /* @__PURE__ */ jsx("option", { value: "medium", children: "Medium" }),
                  /* @__PURE__ */ jsx("option", { value: "high", children: "High" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: classes.humanField, children: [
            /* @__PURE__ */ jsx("label", { className: classes.humanLabel, htmlFor: "rr-risk-notes", children: "Risk notes" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "rr-risk-notes",
                className: classes.humanInput,
                placeholder: "Why that risk level?",
                value: form.riskNotes ?? "",
                onChange: (e) => setForm((f) => ({ ...f, riskNotes: e.target.value }))
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.humanField, children: [
          /* @__PURE__ */ jsx("label", { className: classes.humanLabel, htmlFor: "rr-verification", children: "Verification notes" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              id: "rr-verification",
              className: classes.humanTextarea,
              placeholder: "What did you check before/after this went out?",
              value: form.verificationNotes ?? "",
              onChange: (e) => setForm((f) => ({ ...f, verificationNotes: e.target.value }))
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.humanField, children: [
          /* @__PURE__ */ jsx("span", { className: classes.humanLabel, children: "Approvals" }),
          form.approvals.length === 0 && /* @__PURE__ */ jsx(Typography, { className: classes.humanNote, children: "No approvals on record yet." }),
          form.approvals.length > 0 && /* @__PURE__ */ jsx("div", { className: classes.approvalList, children: form.approvals.map((a, i) => /* @__PURE__ */ jsxs("div", { className: classes.approvalRow, children: [
            /* @__PURE__ */ jsxs("span", { className: classes.approvalWho, children: [
              a.by || "you (pending submit)",
              a.role ? ` \xB7 ${a.role}` : ""
            ] }),
            /* @__PURE__ */ jsx("span", { className: classes.approvalWhen, children: a.at ? relativeTime(a.at) : "" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.approvalRemove, onClick: () => removeApproval(i), "aria-label": "Remove approval", children: "\xD7" })
          ] }, `${a.by || "pending"}-${i}`)) }),
          /* @__PURE__ */ jsxs("div", { className: classes.humanRow, children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                className: classes.humanInput,
                style: { flex: 1 },
                placeholder: "Role (optional) \u2014 e.g. tech lead, on-call",
                value: approvalRole,
                onChange: (e) => setApprovalRole(e.target.value)
              }
            ),
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.btn, onClick: addMyApproval, children: "+ Add my approval" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.humanActions, children: [
          submitContext.result ? /* @__PURE__ */ jsx("button", { type: "button", className: classes.btn, onClick: () => submitContext.reset(), children: "Close" }) : /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: `${classes.btn} ${classes.btnPrimary}`,
              disabled: !dirty || submitContext.loading,
              onClick: onSubmitContext,
              children: submitContext.loading ? "Opening PR\u2026" : "Open PR for human context"
            }
          ),
          persisted.data.humanContext.authoredBy && /* @__PURE__ */ jsxs(Typography, { className: classes.humanNote, style: { marginBottom: 0 }, children: [
            "last authored by ",
            persisted.data.humanContext.authoredBy
          ] })
        ] }),
        submitContext.result && /* @__PURE__ */ jsxs(Typography, { className: classes.humanNote, children: [
          submitContext.result.alreadyOpen ? "A PR for this exact change is already open: " : "PR opened: ",
          /* @__PURE__ */ jsx(Link, { className: classes.humanResultLink, href: submitContext.result.prUrl, target: "_blank", rel: "noopener noreferrer", children: submitContext.result.prUrl })
        ] }),
        submitContext.error && /* @__PURE__ */ jsxs(Typography, { className: classes.humanError, children: [
          "Couldn't open PR: ",
          submitContext.error
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.cert, children: [
      verified && /* @__PURE__ */ jsxs("span", { className: classes.certItem, children: [
        /* @__PURE__ */ jsx("span", { className: classes.certB, children: "Signed & attested" }),
        " \u2014 cosign",
        record.provenance?.attestations.some((a) => a.predicateType === "https://slsa.dev/provenance/v0.2") ? " + SLSA v0.2" : ""
      ] }),
      rekor && /* @__PURE__ */ jsxs("span", { className: classes.certItem, children: [
        /* @__PURE__ */ jsx("span", { className: classes.certB, children: "Logged" }),
        " \u2014 Rekor #",
        rekor.logIndex
      ] }),
      /* @__PURE__ */ jsxs("span", { className: classes.certItem, children: [
        /* @__PURE__ */ jsx("span", { className: classes.certB, children: persisted.data?.humanContext.approvals.length ?? 0 }),
        " approvals on record"
      ] }),
      /* @__PURE__ */ jsxs("span", { className: classes.certItem, children: [
        /* @__PURE__ */ jsx("span", { className: classes.certB, children: record.incidents.length }),
        " incidents since deploy"
      ] }),
      /* @__PURE__ */ jsxs("span", { className: classes.certStamp, children: [
        "generated ",
        formatDateTime((/* @__PURE__ */ new Date()).toISOString()),
        " \xB7 tower/release-record@1"
      ] })
    ] })
  ] });
}
const BOILERPLATE = /has successfully validated your commit\.?$/i;
function GateGrid({ checks, classes, t }) {
  const notes = checks.map((check) => ({ check, tone: gateCheckTone(t, check) })).filter(({ check, tone }) => check.message && (tone.label !== "passed" || !BOILERPLATE.test(stripLightMarkdown(check.message).trim())));
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: classes.gateGrid, children: checks.map((check) => {
      const tone = gateCheckTone(t, check);
      return /* @__PURE__ */ jsxs("div", { className: classes.gateTile, title: `${formatGateName(check.name)}: ${tone.label}`, children: [
        /* @__PURE__ */ jsx("span", { className: classes.gateDot, style: { backgroundColor: tone.color } }),
        /* @__PURE__ */ jsx("span", { className: classes.gateTileName, children: formatGateName(check.name) }),
        tone.label !== "passed" && /* @__PURE__ */ jsx("span", { style: { color: tone.color }, children: tone.label })
      ] }, check.name);
    }) }),
    notes.map(({ check, tone }) => /* @__PURE__ */ jsxs("div", { className: classes.gateNote, children: [
      /* @__PURE__ */ jsxs("span", { style: { color: tone.color }, children: [
        formatGateName(check.name),
        ":"
      ] }),
      " ",
      stripLightMarkdown(check.message),
      check.commentUrl && /* @__PURE__ */ jsxs(Fragment, { children: [
        " ",
        /* @__PURE__ */ jsx("a", { href: check.commentUrl, target: "_blank", rel: "noopener noreferrer", children: "PR comment \u2192" })
      ] })
    ] }, check.name))
  ] });
}

export { ReleaseRecordDetail };
//# sourceMappingURL=ReleaseRecordDetail.esm.js.map

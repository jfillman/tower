import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState } from 'react';
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
import { formatDateTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { JsonDocumentView } from './ResourceInspector.esm.js';
import { findSlsa, findSbom, findSignature, findTestRuns, findCheckRide, verdictOf, worstVerdict, isSharedCheckRide, SIMPLE_SIGNING, explain, testRunOf } from './supplyChain.esm.js';

function buildSupplyChainStages(provenance, loading) {
  const slsa = findSlsa(provenance);
  const sbom = findSbom(provenance);
  const signature = findSignature(provenance);
  const all = provenance?.attestations ?? [];
  const logged = all.filter((a) => a.transparencyLog);
  const testRuns = findTestRuns(provenance);
  const checkRide = findCheckRide(provenance);
  const primaryRun = checkRide ?? testRuns[0];
  function statusOf(verdict) {
    if (loading || !provenance) return "pending";
    if (verdict === "verified") return "done";
    if (verdict === "contradicted") return "fail";
    if (verdict === "unverified") return "warn";
    return "pending";
  }
  const weakest = (atts) => atts.find((a) => verdictOf(a) === "contradicted") ?? atts.find((a) => verdictOf(a) === "unverified") ?? atts[0];
  function testsStatus() {
    if (loading || !provenance || !primaryRun) return "pending";
    if (primaryRun.outcome !== "passed") return "fail";
    const s = statusOf(verdictOf(primaryRun.attestation));
    if (s === "done" && !(checkRide && isSharedCheckRide(checkRide))) return "warn";
    return s;
  }
  return [
    { kind: "supply-chain", id: "build", label: "Build", status: statusOf(verdictOf(slsa)), attestation: slsa },
    { kind: "supply-chain", id: "sast-sbom", label: "SAST / SBOM", status: statusOf(verdictOf(sbom)), attestation: sbom },
    { kind: "supply-chain", id: "signature", label: "Signature", status: statusOf(verdictOf(signature)), attestation: signature },
    {
      kind: "supply-chain",
      id: "tests",
      label: "Tests",
      status: testsStatus(),
      attestation: primaryRun?.attestation,
      all: testRuns.map((r) => r.attestation)
    },
    {
      kind: "supply-chain",
      id: "sign-attest",
      label: "Sign + Attest",
      status: statusOf(worstVerdict(all)),
      attestation: weakest(all),
      all
    },
    {
      kind: "supply-chain",
      id: "rekor",
      label: "Rekor",
      status: statusOf(worstVerdict(logged)),
      attestation: weakest(logged),
      all
    }
  ];
}
const useMiniFlowStyles = makeStyles(
  () => ({
    mini: { display: "flex", alignItems: "center", gap: 3 },
    dot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
    seg: { flex: "1 1 10px", height: 2, minWidth: 6 }
  })
);
function MiniFlow({ stages }) {
  const t = useHangarTokens();
  const classes = useMiniFlowStyles({ t });
  return /* @__PURE__ */ jsx("div", { className: classes.mini, children: stages.map((stage, i) => /* @__PURE__ */ jsxs("div", { style: { display: "contents" }, children: [
    /* @__PURE__ */ jsx("span", { className: classes.dot, style: { backgroundColor: dotStyle(t, stage.status).borderColor } }),
    i < stages.length - 1 && /* @__PURE__ */ jsx(
      "span",
      {
        className: classes.seg,
        style: { backgroundColor: stage.status === "done" ? t.good : t.line }
      }
    )
  ] }, stage.id)) });
}
const useStyles = makeStyles(
  () => ({
    flow: {
      display: "flex",
      alignItems: "stretch",
      gap: 2,
      padding: "14px 20px",
      borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
      overflowX: "auto"
    },
    node: {
      flex: "1 1 0",
      minWidth: 84,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      cursor: "pointer",
      padding: "4px 2px",
      borderRadius: 4,
      "&:hover $label": ({ t }) => ({ color: t.textHi })
    },
    nodeSelected: {
      backgroundColor: ({ t }) => t.panelAlt
    },
    connector: {
      flex: "0 0 20px",
      alignSelf: "center",
      height: 2,
      marginTop: -20
    },
    dot: {
      width: 26,
      height: 26,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "2px solid transparent",
      fontSize: 15
    },
    label: {
      fontFamily: fontMono,
      fontSize: 9.5,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: ({ t }) => t.textFaint,
      textAlign: "center",
      lineHeight: 1.3
    },
    labelKind: {
      fontFamily: fontMono,
      fontSize: 8,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: ({ t }) => t.textFaint,
      opacity: 0.6
    },
    drawer: {
      padding: "16px 20px",
      borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
      backgroundColor: ({ t }) => t.panelAlt
    },
    drawerTitle: {
      fontFamily: fontDisplay,
      fontWeight: 700,
      fontSize: 14,
      color: ({ t }) => t.textHi,
      marginBottom: 10
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px 24px"
    },
    kv: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
    kvLabel: {
      fontFamily: fontMono,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: ({ t }) => t.textFaint
    },
    kvValue: {
      fontFamily: fontMono,
      fontSize: 12,
      color: ({ t }) => t.textHi,
      wordBreak: "break-word"
    },
    note: {
      fontSize: 12.5,
      fontStyle: "italic",
      color: ({ t }) => t.textLo
    },
    friendlyHeadline: {
      fontFamily: fontDisplay,
      fontWeight: 700,
      fontSize: 15,
      marginBottom: 4
    },
    friendlyBody: {
      fontSize: 13,
      color: ({ t }) => t.textLo,
      marginBottom: 10
    },
    pillRow: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 10
    },
    pill: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontFamily: fontMono,
      fontSize: 10.5,
      letterSpacing: "0.03em",
      padding: "3px 9px",
      borderRadius: 12,
      border: "1px solid"
    },
    detailsToggle: {
      fontFamily: fontMono,
      fontSize: 10.5,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: ({ t }) => t.sky,
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer"
    },
    detailsBody: {
      marginTop: 12,
      paddingTop: 12,
      borderTop: ({ t }) => `1px dashed ${t.lineSoft}`
    },
    link: {
      color: ({ t }) => t.sky
    }
  })
);
function pillStyle(t, tone) {
  switch (tone) {
    case "good":
      return { backgroundColor: t.goodSoft, borderColor: t.good, color: t.good };
    case "warn":
      return { backgroundColor: t.amberSoft, borderColor: t.amberLine, color: t.amberInk };
    case "bad":
      return { backgroundColor: t.badSoft, borderColor: t.bad, color: t.bad };
    case "neutral":
    default:
      return { backgroundColor: t.panelAlt, borderColor: t.line, color: t.textFaint };
  }
}
function Pill({
  tone,
  children,
  classes,
  t
}) {
  return /* @__PURE__ */ jsx("span", { className: classes.pill, style: pillStyle(t, tone), children });
}
function dotStyle(t, status) {
  switch (status) {
    case "done":
      return { backgroundColor: t.goodSoft, borderColor: t.good, color: t.good };
    case "current":
      return { backgroundColor: t.amberSoft, borderColor: t.amber, color: t.amberInk };
    case "warn":
      return { backgroundColor: t.amberSoft, borderColor: t.amberLine, color: t.amberInk };
    case "fail":
      return { backgroundColor: t.badSoft, borderColor: t.bad, color: t.bad };
    case "pending":
    default:
      return { backgroundColor: t.panelAlt, borderColor: t.line, color: t.textFaint };
  }
}
const STAGE_ICON = {
  build: /* @__PURE__ */ jsx(BuildIcon, { fontSize: "inherit" }),
  "sast-sbom": /* @__PURE__ */ jsx(ReceiptIcon, { fontSize: "inherit" }),
  signature: /* @__PURE__ */ jsx(LockIcon, { fontSize: "inherit" }),
  "sign-attest": /* @__PURE__ */ jsx(VerifiedUserIcon, { fontSize: "inherit" }),
  rekor: /* @__PURE__ */ jsx(HistoryIcon, { fontSize: "inherit" }),
  tests: /* @__PURE__ */ jsx(AssignmentTurnedInIcon, { fontSize: "inherit" })
};
function StageIcon({ id, status }) {
  if (status === "fail") return /* @__PURE__ */ jsx(ErrorOutlineIcon, { fontSize: "inherit" });
  if (STAGE_ICON[id]) return STAGE_ICON[id];
  if (status === "done") return /* @__PURE__ */ jsx(CheckIcon, { fontSize: "inherit" });
  if (status === "current") return /* @__PURE__ */ jsx(FiberManualRecordIcon, { style: { fontSize: 10 } });
  if (status === "warn") return /* @__PURE__ */ jsx(RemoveIcon, { fontSize: "inherit" });
  return null;
}
function CertificateFields({
  attestation,
  classes
}) {
  const cert = attestation?.certificate;
  if (!cert) {
    return /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No signing certificate recorded." });
  }
  const expired = new Date(cert.validTo).getTime() < Date.now();
  return /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
      /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Signer identity" }),
      /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: cert.identity ?? cert.subject })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
      /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Issued by" }),
      /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: cert.issuer })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
      /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Cert validity" }),
      /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
        formatDateTime(cert.validFrom),
        " \u2192 ",
        formatDateTime(cert.validTo),
        expired ? " (expired)" : ""
      ] })
    ] })
  ] });
}
function envStageNote(status) {
  if (status === "current") return "This release is currently deployed here.";
  if (status === "done") return "This release has already passed through this environment.";
  return "Not reached by this release yet.";
}
const STAGE_WHAT = {
  build: "build provenance",
  "sast-sbom": "SBOM",
  signature: "image signature",
  tests: "test attestation"
};
function friendlySummary(stageId, att, all) {
  if (!att) {
    switch (stageId) {
      case "build":
        return { headline: "No build provenance", body: "This image has no SLSA provenance, so nothing records which pipeline built it." };
      case "sast-sbom":
        return {
          headline: "No SBOM attached",
          body: "This image has no software bill of materials. It may predate this gate, or the gate is off for this app. SAST and policy checks run in the pipeline but aren\u2019t shown here yet."
        };
      case "signature":
        return { headline: "No image signature", body: "This image has no `cosign sign` signature on its manifest. The attestations are separate." };
      case "rekor":
        return { headline: "Not in the transparency log", body: "Nothing on this image has a Rekor entry." };
      case "tests":
        return {
          headline: "No test run attested",
          body: "No test stage ran against this image, or it ran before test results were attached to images (2026-10-19). The qa release gate needs a passed check ride on the image."
        };
      default:
        return { headline: "Nothing signed", body: "This image carries no signatures or attestations yet." };
    }
  }
  if (stageId === "sign-attest" || stageId === "rekor") {
    const set = stageId === "rekor" ? all.filter((a) => a.transparencyLog) : all;
    const ok = set.filter((a) => verdictOf(a) === "verified").length;
    let what = "build provenance";
    if (att.predicateType === SIMPLE_SIGNING) what = "image signature";
    else if (/cyclonedx|spdx/i.test(att.predicateType)) what = "SBOM";
    if (ok === set.length) {
      return {
        headline: stageId === "rekor" ? `All ${set.length} log entries check out` : `All ${set.length} signatures verified`,
        body: stageId === "rekor" ? "Each one is in this platform's own Rekor log, with a receipt signed by Rekor's current key." : "The build provenance, SBOM and image signature all check out against this platform's signing root.",
        pill: { tone: "good", label: `${ok} of ${set.length} \u2713` }
      };
    }
    const e2 = explain(att, what);
    return {
      headline: `${ok} of ${set.length} verified. ${e2.headline}.`,
      body: e2.body,
      consequence: e2.consequence,
      pill: { tone: e2.tone, label: `${ok} of ${set.length}` }
    };
  }
  if (stageId === "tests") return testsSummary(att, all);
  const e = explain(att, STAGE_WHAT[stageId] ?? "attestation");
  return { headline: e.headline, body: e.body, consequence: e.consequence, pill: { tone: e.tone, label: e.label } };
}
function countsOf(r) {
  if (r.testsTotal === void 0) return "no test counts recorded";
  const parts = [`${r.testsPassed ?? 0} of ${r.testsTotal} passed`];
  if (r.testsFailed) parts.push(`${r.testsFailed} failed`);
  if (r.testsSkipped) parts.push(`${r.testsSkipped} skipped`);
  return parts.join(", ");
}
function roleLabel(r) {
  if (r.role === "check-ride") return isSharedCheckRide(r) ? "check ride" : "check ride (not from the shared repo)";
  if (r.role === "execute") return "action";
  return "the team's test";
}
function testsSummary(att, all) {
  const run = testRunOf(att);
  const runs = all.map(testRunOf).filter((r) => !!r);
  const others = runs.length - 1;
  const alsoRan = others > 0 ? ` ${others} other attested run${others === 1 ? "" : "s"} on this image ${others === 1 ? "is" : "are"} listed below.` : "";
  if (!run) return { headline: "Test attestation", body: "This attestation carries no run-testworkflow result." };
  const sig = explain(att, "test attestation");
  if (run.outcome !== "passed") {
    return {
      headline: run.role === "check-ride" ? "The latest check ride failed" : `The latest attested test run ${run.outcome || "did not pass"}`,
      body: `${roleLabel(run)[0].toUpperCase()}${roleLabel(run).slice(1)}: ${countsOf(run)}${run.executionId ? ` (Testkube execution ${run.executionId})` : ""}.${alsoRan}`,
      consequence: "The qa release gate reads the outcome, so this image will not pass it until a check ride passes.",
      pill: { tone: "bad", label: run.outcome || "failed" }
    };
  }
  if (run.role !== "check-ride") {
    return {
      headline: "The team's tests passed; no check ride on this image",
      body: `${countsOf(run)} in ${run.workflowSource?.startsWith("repo:") ? "the app repo's own workflow" : "the workflow"}${run.executionId ? ` (Testkube execution ${run.executionId})` : ""}.${alsoRan}`,
      consequence: "The qa release gate needs the check ride from the shared check-rides repository, which has not run for this image.",
      pill: { tone: "warn", label: "no check ride" }
    };
  }
  if (!isSharedCheckRide(run)) {
    return {
      headline: "A check ride passed, but not from the shared repository",
      body: `${countsOf(run)}; the workflow came from ${run.workflowSource ?? "an unknown source"}, not the check-rides Application.${alsoRan}`,
      consequence: "The qa release gate only counts a check ride synced from the shared repository.",
      pill: { tone: "warn", label: "unshared" }
    };
  }
  if (sig.tone !== "good") {
    return {
      headline: `The check ride passed, but ${sig.headline.replace(/^The test attestation /, "its attestation ")}`,
      body: `${countsOf(run)}. ${sig.body}`,
      consequence: sig.consequence,
      pill: { tone: sig.tone, label: sig.label }
    };
  }
  return {
    headline: "The check ride passed",
    body: `${countsOf(run)} in the shared check ride (${run.workflowSource}), run against this exact image${run.executionId ? `; Testkube execution ${run.executionId}` : ""}. Its attestation is verified and in the transparency log.${alsoRan}`,
    pill: { tone: "good", label: `${run.testsPassed ?? "?"} of ${run.testsTotal ?? "?"} \u2713` }
  };
}
const RAW_DOCUMENT_LABEL = {
  build: "SLSA provenance document",
  "sast-sbom": "SBOM file",
  signature: "cosign image signature",
  tests: "test attestation"
};
function documentKindForStage(stageId) {
  if (stageId === "build") return "provenance";
  if (stageId === "sast-sbom") return "sbom";
  if (stageId === "tests") return "tests";
  return "signature";
}
function attestationFilename(att, kind, suffix) {
  const subject = att.subject?.[0];
  const repo = subject?.name?.split("/").pop();
  const shortDigest = subject?.digest?.sha256?.slice(0, 12);
  const base = [repo, shortDigest].filter(Boolean).join("-");
  return `${base ? `${base}-` : ""}${kind}${suffix ? `-${suffix}` : ""}.json`;
}
function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
function TestRunsList({ attestations, classes }) {
  const runs = attestations.map(testRunOf).filter((r) => !!r);
  if (runs.length === 0) return null;
  return /* @__PURE__ */ jsxs("div", { className: classes.detailsBody, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.note, style: { marginBottom: 6 }, children: "Attested test runs on this image" }),
    runs.map((r, i) => {
      const verdict = verdictOf(r.attestation);
      let tone = "warn";
      if (r.outcome !== "passed" || verdict === "contradicted") tone = "bad";
      else if (verdict === "verified") tone = "good";
      return /* @__PURE__ */ jsxs("div", { className: classes.grid, style: { marginBottom: 10 }, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Run" }),
          /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
            roleLabel(r),
            " \xB7 ",
            r.outcome || "no outcome",
            " \xB7 ",
            countsOf(r),
            r.finishedOn ? ` \xB7 ${formatDateTime(r.finishedOn)}` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Workflow" }),
          /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
            r.workflowSource ?? "unknown source",
            r.workflowDigest ? ` \xB7 ${r.workflowDigest.replace("sha256:", "").slice(0, 12)}` : "",
            r.executionId ? ` \xB7 Testkube ${r.executionId}` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Attestation" }),
          /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
            verdict === "verified" ? "verified \u2713" : explain(r.attestation, "test attestation").label,
            " \xB7 ",
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                className: classes.detailsToggle,
                "data-tone": tone,
                onClick: () => r.attestation.predicate && downloadJson(
                  r.attestation.predicate,
                  attestationFilename(r.attestation, "tests", [r.role, r.executionId].filter(Boolean).join("-"))
                ),
                children: "\u2B73 Download"
              }
            )
          ] })
        ] })
      ] }, `${r.executionId ?? "run"}-${i}`);
    })
  ] });
}
function StageDrawer({
  stage,
  classes,
  t
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  if (stage.kind === "env") {
    return /* @__PURE__ */ jsxs("div", { className: classes.drawer, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.drawerTitle, children: stage.label }),
      /* @__PURE__ */ jsx(Typography, { className: classes.note, children: envStageNote(stage.status) })
    ] });
  }
  const att = stage.attestation;
  const summary = friendlySummary(stage.id, att, stage.all ?? []);
  return /* @__PURE__ */ jsxs("div", { className: classes.drawer, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.drawerTitle, children: stage.label }),
    /* @__PURE__ */ jsx(Typography, { className: classes.friendlyHeadline, children: summary.headline }),
    summary.pill && /* @__PURE__ */ jsx("div", { className: classes.pillRow, children: /* @__PURE__ */ jsx(Pill, { tone: summary.pill.tone, classes, t, children: summary.pill.label }) }),
    /* @__PURE__ */ jsx(Typography, { className: classes.friendlyBody, children: summary.body }),
    summary.consequence && /* @__PURE__ */ jsx(Typography, { className: classes.friendlyBody, children: summary.consequence }),
    stage.id === "tests" && (stage.all?.length ?? 0) > 0 && /* @__PURE__ */ jsx(TestRunsList, { attestations: stage.all ?? [], classes }),
    att && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 16, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: classes.detailsToggle,
            onClick: () => setShowDetails((v) => !v),
            children: showDetails ? "\u25BE Hide technical details" : "\u25B8 Show technical details"
          }
        ),
        RAW_DOCUMENT_LABEL[stage.id] && att.predicate && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: classes.detailsToggle,
              onClick: () => setShowRaw((v) => !v),
              children: showRaw ? `\u25BE Hide ${RAW_DOCUMENT_LABEL[stage.id]}` : `\u25B8 View ${RAW_DOCUMENT_LABEL[stage.id]}`
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              className: classes.detailsToggle,
              onClick: () => downloadJson(
                att.predicate,
                attestationFilename(att, documentKindForStage(stage.id))
              ),
              children: [
                "\u2B73 Download ",
                RAW_DOCUMENT_LABEL[stage.id]
              ]
            }
          )
        ] })
      ] }),
      showDetails && /* @__PURE__ */ jsxs("div", { className: classes.detailsBody, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.grid, style: { marginBottom: 10 }, children: [
          /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
            /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Predicate" }),
            /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: att.predicateType })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
            /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Verified" }),
            /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
              att.verified ? "signature verified \u2713" : att.verificationError ?? "unverified",
              att.logSource === "rekor" ? " \xB7 log entry read from Rekor" : "",
              att.logSource === "embedded" ? " \xB7 log entry from the image's own copy" : ""
            ] })
          ] }),
          att.transparencyLog && /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
            /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Rekor entry" }),
            /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
              "index ",
              att.transparencyLog.logIndex,
              att.transparencyLog.logId ? ` \xB7 ${att.transparencyLog.logId}` : ""
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx(CertificateFields, { attestation: att, classes })
      ] }),
      showRaw && RAW_DOCUMENT_LABEL[stage.id] && att.predicate && /* @__PURE__ */ jsx("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ jsx(JsonDocumentView, { value: att.predicate }) })
    ] })
  ] });
}
function PipelineFlow({ stages }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [openId, setOpenId] = useState(null);
  const openStage = stages.find((s) => s.id === openId);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: classes.flow, children: stages.map((stage, i) => /* @__PURE__ */ jsxs("div", { style: { display: "contents" }, children: [
      /* @__PURE__ */ jsxs(
        "div",
        {
          role: "button",
          tabIndex: 0,
          className: `${classes.node} ${openId === stage.id ? classes.nodeSelected : ""}`,
          onClick: () => setOpenId(openId === stage.id ? null : stage.id),
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpenId(openId === stage.id ? null : stage.id);
            }
          },
          children: [
            /* @__PURE__ */ jsx("span", { className: classes.dot, style: dotStyle(t, stage.status), children: /* @__PURE__ */ jsx(StageIcon, { id: stage.id, status: stage.status }) }),
            /* @__PURE__ */ jsx("span", { className: classes.label, children: stage.label })
          ]
        }
      ),
      i < stages.length - 1 && /* @__PURE__ */ jsx(
        "div",
        {
          className: classes.connector,
          style: {
            backgroundColor: stage.status === "done" ? t.good : t.line
          }
        }
      )
    ] }, stage.id)) }),
    /* @__PURE__ */ jsx(Collapse, { in: Boolean(openStage), unmountOnExit: true, children: openStage && /* @__PURE__ */ jsx(StageDrawer, { stage: openStage, classes, t }) })
  ] });
}

export { MiniFlow, PipelineFlow, buildSupplyChainStages };
//# sourceMappingURL=PipelineFlow.esm.js.map

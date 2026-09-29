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
import { formatDateTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { JsonDocumentView } from './ResourceInspector.esm.js';

function buildSupplyChainStages(provenance, loading) {
  const slsa = provenance?.attestations.find(
    (a) => a.predicateType === "https://slsa.dev/provenance/v0.2"
  );
  const sbom = provenance?.attestations.find(
    (a) => a.predicateType.toLowerCase().includes("cyclonedx")
  );
  const signature = provenance?.attestations.find(
    (a) => a.predicateType === "cosign.sigstore.dev/signature/simple-signing"
  );
  const anyVerified = provenance?.attestations.some((a) => a.verified) ?? false;
  const anyTlog = provenance?.attestations.some((a) => a.transparencyLog) ?? false;
  function foundOrPending(found) {
    if (loading) return "pending";
    if (found) return "done";
    return provenance ? "warn" : "pending";
  }
  function verifiedOrFailed() {
    if (loading) return "pending";
    if (anyVerified) return "done";
    return (provenance?.attestations.length ?? 0) > 0 ? "fail" : "pending";
  }
  return [
    {
      kind: "supply-chain",
      id: "build",
      label: "Build",
      status: foundOrPending(Boolean(slsa)),
      attestation: slsa
    },
    {
      kind: "supply-chain",
      id: "sast-sbom",
      label: "SAST / SBOM",
      status: foundOrPending(Boolean(sbom)),
      attestation: sbom
    },
    {
      kind: "supply-chain",
      id: "signature",
      label: "Signature",
      status: foundOrPending(Boolean(signature)),
      attestation: signature
    },
    {
      kind: "supply-chain",
      id: "sign-attest",
      label: "Sign + Attest",
      status: verifiedOrFailed(),
      attestation: slsa ?? signature ?? provenance?.attestations[0]
    },
    {
      kind: "supply-chain",
      id: "rekor",
      label: "Rekor",
      status: foundOrPending(anyTlog),
      attestation: slsa?.transparencyLog ? slsa : provenance?.attestations.find((a) => a.transparencyLog)
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
  rekor: /* @__PURE__ */ jsx(HistoryIcon, { fontSize: "inherit" })
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
function friendlySummary(stageId, att) {
  switch (stageId) {
    case "build":
      if (!att) {
        return {
          headline: "Not built through the verified pipeline yet",
          body: "No SLSA build provenance found for this image."
        };
      }
      return {
        headline: "Build complete",
        body: "This image was built and published from a real pipeline run, with recorded provenance of exactly where it came from.",
        pill: { tone: "good", label: "provenance \u2713" }
      };
    case "sast-sbom":
      if (!att) {
        return {
          headline: "No SBOM attached yet",
          body: "This image has no software bill of materials recorded - it may predate this gate, or the gate is disabled for this app. Other CI gates (SAST, policy checks) run as part of this platform\u2019s pipeline but aren\u2019t independently surfaced here yet."
        };
      }
      return {
        headline: att.verified ? "SBOM produced, signed, and verified" : "SBOM produced",
        body: att.verified ? "Every dependency in this image is catalogued, and the catalogue itself is signed and independently verified." : "A software bill of materials was found for this image, but its signature could not be independently verified.",
        pill: att.verified ? { tone: "good", label: "SBOM \u2713" } : { tone: "warn", label: "unverified" }
      };
    case "signature":
      if (!att) {
        return {
          headline: "No image signature found",
          body: "This image has no classic cosign image-signing artifact (`cosign sign`) recorded - distinct from the SLSA/SBOM attestations above, which cover `cosign attest`. It may never have been directly signed, or that step is disabled for this app."
        };
      }
      return {
        headline: att.verified ? "Image signature verified" : "Signature did not verify",
        body: att.verified ? "The image manifest itself was signed with cosign, and that signature has been independently re-verified against this platform\u2019s own root of trust." : att.verificationError ?? "This signature exists but could not be independently verified.",
        pill: att.verified ? { tone: "good", label: "signed \u2713" } : { tone: "bad", label: "unverified" }
      };
    case "sign-attest":
      if (!att) {
        return {
          headline: "No signature found",
          body: "This image carries no cosign attestations yet."
        };
      }
      return {
        headline: att.verified ? "Image signature verified" : "Signature did not verify",
        body: att.verified ? "This image was signed with cosign and that signature has been independently re-verified against this platform\u2019s own root of trust." : att.verificationError ?? "This attestation exists but its signature failed verification.",
        pill: att.verified ? { tone: "good", label: "cosign \u2713" } : { tone: "bad", label: "unverified" }
      };
    case "rekor":
      if (!att?.transparencyLog) {
        return {
          headline: "Not logged to Rekor",
          body: "No public transparency-log entry recorded for this attestation yet."
        };
      }
      return {
        headline: "Logged to the transparency log",
        body: `Recorded in this platform's own internal Rekor transparency log at entry #${att.transparencyLog.logIndex} - a permanent, tamper-evident record this platform can independently re-verify.`,
        pill: { tone: "good", label: `Rekor #${att.transparencyLog.logIndex}` }
      };
    default:
      return { headline: "", body: "" };
  }
}
const RAW_DOCUMENT_LABEL = {
  build: "SLSA provenance document",
  "sast-sbom": "SBOM file",
  signature: "cosign image signature"
};
function documentKindForStage(stageId) {
  if (stageId === "build") return "provenance";
  if (stageId === "sast-sbom") return "sbom";
  return "signature";
}
function attestationFilename(att, kind) {
  const subject = att.subject?.[0];
  const repo = subject?.name?.split("/").pop();
  const shortDigest = subject?.digest?.sha256?.slice(0, 12);
  const base = [repo, shortDigest].filter(Boolean).join("-");
  return `${base ? `${base}-` : ""}${kind}.json`;
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
  const summary = friendlySummary(stage.id, att);
  return /* @__PURE__ */ jsxs("div", { className: classes.drawer, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.drawerTitle, children: stage.label }),
    /* @__PURE__ */ jsx(Typography, { className: classes.friendlyHeadline, children: summary.headline }),
    summary.pill && /* @__PURE__ */ jsx("div", { className: classes.pillRow, children: /* @__PURE__ */ jsx(Pill, { tone: summary.pill.tone, classes, t, children: summary.pill.label }) }),
    /* @__PURE__ */ jsx(Typography, { className: classes.friendlyBody, children: summary.body }),
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
            /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: att.verified ? "signature verified \u2713" : att.verificationError ?? "unverified" })
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

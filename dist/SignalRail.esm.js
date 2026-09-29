import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import CheckIcon from '@material-ui/icons/Check';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import SecurityIcon from '@material-ui/icons/Security';
import SyncIcon from '@material-ui/icons/Sync';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { formatDateTime, relativeTime } from './shared/format.esm.js';
import { fontMono } from './brand/tokens.esm.js';
import { keepScrollPosition } from './preventFocusScroll.esm.js';
import './PrButton.esm.js';
import { parseGitopsPrTitle } from './useReleaseContext.esm.js';
import { imageTag } from './types.esm.js';

const useSignalRailStyles = makeStyles(() => ({
  "@keyframes pulse": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0.5 }
  },
  rail: { display: "flex", alignItems: "stretch", gap: 2, padding: "6px 4px 18px" },
  node: {
    flex: "1 1 0",
    minWidth: 96,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 7,
    position: "relative",
    borderRadius: 10,
    padding: "4px 2px"
  },
  nodeClickable: {
    cursor: "pointer",
    background: "none",
    border: "none",
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  nodeSelected: {
    backgroundColor: ({ t }) => t.skySoft,
    boxShadow: ({ t }) => `0 0 0 1px ${t.skyLine}`
  },
  dot: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px solid transparent",
    fontSize: 15
  },
  // A real arrow between DAG nodes (2026-09-16: "put arrows between the
  // stages", later "make them tall and skinny and perhaps our amber
  // colour") - just lays out the TallArrow glyph now; this used to also
  // paint a colored progress bar as its own background, but that bar sat
  // behind the glyph and stayed visible around its edges once the glyph
  // was made narrower than the connector's own width (2026-09-16 bug:
  // "the old green arrows are still visible underneath the new amber
  // chevrons"). The dot/icon colors at each node already carry the same
  // progress signal the bar duplicated.
  connector: {
    flex: "0 0 22px",
    // Centered on the whole stage NODE (icon + label + meta), the same panel
    // that shows the selected-state highlight (2026-09-24: "should they be
    // aligned with the DAG item's panel that includes the text below?"). The
    // first fix (2026-09-24 earlier) centered on the dots alone (alignSelf
    // flex-start + marginTop 18); switch back to `flex-start`/18 to revert.
    // Nodes stretch to equal height in the rail, so this midpoint is the same
    // for every connector.
    alignSelf: "center",
    height: 2,
    marginTop: 0,
    position: "relative"
  },
  connectorArrow: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex"
  },
  dotCurrent: { animation: "$pulse 1.6s ease-in-out infinite" },
  label: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: ({ t }) => t.textFaint,
    textAlign: "center"
  },
  meta: { fontFamily: fontMono, fontSize: 9.5, color: ({ t }) => t.textFaint, textAlign: "center" },
  gatesTogglePulse: { animation: "$pulse 1.6s ease-in-out infinite" },
  // Real GitHub Check Runs on the release PR's head commit - this
  // platform's release guardrails (sast/image-scan/provenance/sbom/itsm/qa/
  // policy-validation/image-promotion, see glidepath-catalog's docs/admin/
  // release-guardrails.md) each post exactly one of these. `gatesTogglePulse`
  // above is this ledger's per-check pulsing dot while a check is still
  // running - `gateAggregateTone`'s own PR-title header treatment.
  gateLedger: {
    margin: "0 20px 14px",
    padding: "12px 14px",
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 8
  },
  ledgerHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  ledgerTitle: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: ({ t }) => t.textFaint
  },
  ledgerCount: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textHi },
  gateRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "6px 0",
    borderBottom: ({ t }) => `1px dashed ${t.lineSoft}`
  },
  gateRowLast: { borderBottom: "none" },
  gateRowTop: { display: "flex", alignItems: "center", gap: 10 },
  gateRowDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  gateName: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi, flex: 1 },
  gateStatusText: { fontFamily: fontMono, fontSize: 10.5, whiteSpace: "nowrap" },
  gateLink: {
    fontFamily: fontMono,
    fontSize: 10,
    color: ({ t }) => t.sky,
    textDecoration: "none",
    marginLeft: 8,
    "&:hover": { textDecoration: "underline" }
  },
  // The gate's own real output.summary/title (2026-09-12: "I'd also like to
  // see any message output of each gate") - indented under the dot to line
  // up with the name, not the dot itself.
  gateMessage: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    paddingLeft: 18,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  commitRow: {
    display: "inline-flex",
    fontFamily: fontMono,
    fontSize: 12,
    padding: "7px 12px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textFaint
  }
}));
function dotStyle(t, status) {
  switch (status) {
    case "good":
      return { backgroundColor: t.goodSoft, borderColor: t.good, color: t.good };
    case "current":
      return { backgroundColor: t.amberSoft, borderColor: t.amber, color: t.amberInk };
    case "bad":
      return { backgroundColor: t.badSoft, borderColor: t.bad, color: t.bad };
    case "pending":
    default:
      return { backgroundColor: t.panelAlt, borderColor: t.line, color: t.textFaint };
  }
}
function GitPrIcon({ fontSize = 16 }) {
  return /* @__PURE__ */ jsx("svg", { viewBox: "0 0 16 16", width: fontSize, height: fontSize, fill: "currentColor", children: /* @__PURE__ */ jsx("path", { d: "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" }) });
}
function TallArrow({ size = 20, rotate = 0 }) {
  return /* @__PURE__ */ jsx(
    "svg",
    {
      viewBox: "0 0 8 20",
      width: size * 0.4,
      height: size,
      fill: "none",
      style: rotate ? { transform: `rotate(${rotate}deg)` } : void 0,
      children: /* @__PURE__ */ jsx("path", { d: "M1 2 L7 10 L1 18", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" })
    }
  );
}
function StepIcon({ stepKey, status }) {
  if (status === "bad") return /* @__PURE__ */ jsx(ErrorOutlineIcon, { fontSize: "inherit" });
  if (stepKey === "created") return /* @__PURE__ */ jsx(GitPrIcon, {});
  if (stepKey === "guardrails") return /* @__PURE__ */ jsx(SecurityIcon, { fontSize: "inherit" });
  if (stepKey === "merged") return /* @__PURE__ */ jsx(GitPrIcon, {});
  if (stepKey === "synced") return /* @__PURE__ */ jsx(SyncIcon, { fontSize: "inherit" });
  if (stepKey === "progressing") return /* @__PURE__ */ jsx(TrendingUpIcon, { fontSize: "inherit" });
  if (stepKey === "healthy") return status === "good" ? /* @__PURE__ */ jsx(CheckCircleIcon, { fontSize: "inherit" }) : null;
  if (status === "good") return /* @__PURE__ */ jsx(CheckIcon, { fontSize: "inherit" });
  return null;
}
function stepMetaText(step, metaOverride) {
  if (step.key === metaOverride?.key) return metaOverride.text;
  if (step.at) return `${relativeTime(step.at)} \xB7 ${formatDateTime(step.at)}`;
  return "\u2014";
}
function Rail({
  steps,
  classes,
  t,
  belowKey,
  below,
  metaOverride,
  labelOverride,
  selectedKey,
  onSelectKey
}) {
  return /* @__PURE__ */ jsx("div", { className: classes.rail, children: steps.map((step, i) => /* @__PURE__ */ jsxs("div", { style: { display: "contents" }, children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: `${classes.node} ${onSelectKey ? classes.nodeClickable : ""} ${step.key === selectedKey ? classes.nodeSelected : ""}`,
        ...onSelectKey ? {
          role: "button",
          tabIndex: 0,
          onClick: (e) => keepScrollPosition(e.currentTarget, () => onSelectKey(step.key)),
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") keepScrollPosition(e.currentTarget, () => onSelectKey(step.key));
          },
          // Suppresses the browser's default click-to-focus scroll
          // (2026-09-16 bug: "when you click on a deployment stage,
          // the page scrolls up to the top... it should stay
          // focused on the DAG and details panel") - a focusable
          // div's native click-focus can trigger scrollIntoView
          // against the wrong ancestor in a nested-scroll layout
          // like this page's. preventDefault on mousedown (which
          // fires before focus is applied) stops that focus/scroll
          // entirely without affecting the click handler above or
          // keyboard activation (Tab+Enter never goes through
          // mousedown).
          onMouseDown: (e) => e.preventDefault()
        } : {},
        children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: `${classes.dot} ${step.status === "current" ? classes.dotCurrent : ""}`,
              style: dotStyle(t, step.status),
              children: /* @__PURE__ */ jsx(StepIcon, { stepKey: step.key, status: step.status })
            }
          ),
          /* @__PURE__ */ jsx("span", { className: classes.label, children: step.key === labelOverride?.key ? labelOverride.text : step.label }),
          /* @__PURE__ */ jsx("span", { className: classes.meta, title: step.at ? formatDateTime(step.at) : void 0, children: stepMetaText(step, metaOverride) }),
          step.key === belowKey && below
        ]
      }
    ),
    i < steps.length - 1 && /* @__PURE__ */ jsx("div", { className: classes.connector, children: /* @__PURE__ */ jsx("span", { className: classes.connectorArrow, style: { color: t.amber }, children: /* @__PURE__ */ jsx(TallArrow, { size: 18 }) }) })
  ] }, step.key)) });
}
function deliveryTag(delivery) {
  if (delivery.pr) return parseGitopsPrTitle(delivery.pr.title)?.imageTag;
  if (delivery.commit) return imageTag(delivery.commit.imageTag);
  return void 0;
}
function gateCheckTone(t, check) {
  if (check.status !== "completed") return { label: "running", color: t.amberInk, pulse: true };
  if (check.conclusion === "success") return { label: "passed", color: t.good, pulse: false };
  if (check.conclusion === "skipped" || check.conclusion === "neutral" || check.conclusion === "cancelled") {
    return { label: check.conclusion, color: t.textFaint, pulse: false };
  }
  return { label: check.conclusion ?? "failed", color: t.bad, pulse: false };
}
function formatGateName(name) {
  return name.replace(/^Pipelines as Code(?:\s+CI)?\s*\/\s*/i, "").replace(/-+\s*$/, "");
}
function stripLightMarkdown(s) {
  return s.replace(/^#{1,6}\s+/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/```[a-z]*\n?/gi, "").replace(/`([^`]+)`/g, "$1");
}
function GateLedger({
  ci,
  classes,
  t
}) {
  const checks = ci.checks ?? [];
  return /* @__PURE__ */ jsxs("div", { className: classes.gateLedger, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.ledgerHead, children: [
      /* @__PURE__ */ jsx("span", { className: classes.ledgerTitle, children: "Required checks on this PR" }),
      /* @__PURE__ */ jsxs("span", { className: classes.ledgerCount, children: [
        ci.passedChecks,
        "/",
        ci.totalChecks,
        " passed"
      ] })
    ] }),
    checks.map((check, i) => {
      const tone = gateCheckTone(t, check);
      return /* @__PURE__ */ jsxs("div", { className: `${classes.gateRow} ${i === checks.length - 1 ? classes.gateRowLast : ""}`, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.gateRowTop, children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: `${classes.gateRowDot} ${tone.pulse ? classes.gatesTogglePulse : ""}`,
              style: { backgroundColor: tone.color }
            }
          ),
          /* @__PURE__ */ jsx("span", { className: classes.gateName, children: formatGateName(check.name) }),
          /* @__PURE__ */ jsx("span", { className: classes.gateStatusText, style: { color: tone.color }, children: tone.label }),
          check.commentUrl && /* @__PURE__ */ jsx("a", { className: classes.gateLink, href: check.commentUrl, target: "_blank", rel: "noopener noreferrer", children: "PR comment \u2192" })
        ] }),
        check.message && /* @__PURE__ */ jsx("div", { className: classes.gateMessage, children: stripLightMarkdown(check.message) })
      ] }, check.name);
    })
  ] });
}

export { GateLedger, GitPrIcon, Rail, TallArrow, deliveryTag, formatGateName, gateCheckTone, useSignalRailStyles };
//# sourceMappingURL=SignalRail.esm.js.map

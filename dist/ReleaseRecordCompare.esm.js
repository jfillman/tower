import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { formatDateTime } from './shared/format.esm.js';
import { formatDuration } from './TimelinePanel.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { statusPill, confidenceColor } from './ReleaseRecordList.esm.js';
import { NicknameChip } from './tabs/deployments/ImageTagPill.esm.js';
import { TextLink } from './ui/index.esm.js';

function leadTimeMs(record) {
  const promo = [...record.promotionChain].reverse().find((p) => p.mergedAt);
  if (!promo?.mergedAt) return void 0;
  return new Date(promo.at).getTime() - new Date(promo.mergedAt).getTime();
}
function guardrailPassRatio(record) {
  if (!record.guardrails || record.guardrails.totalChecks === 0) return void 0;
  return record.guardrails.passedChecks / record.guardrails.totalChecks;
}
function formatSignedDuration(deltaMs) {
  if (deltaMs === 0) return "\xB10m";
  return deltaMs < 0 ? `\u2212${formatDuration(-deltaMs)}` : `+${formatDuration(deltaMs)}`;
}
function formatSignedInt(n) {
  if (n === 0) return "\xB10";
  return n > 0 ? `+${n}` : `\u2212${Math.abs(n)}`;
}
function formatSignedPercentPoints(delta) {
  const pts = Math.round(delta * 100);
  if (pts === 0) return "\xB10%";
  return pts > 0 ? `+${pts}%` : `\u2212${Math.abs(pts)}%`;
}
const useStyles = makeStyles(() => ({
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi, marginBottom: 14 },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 8,
    overflow: "hidden",
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" }
  },
  col: { padding: "18px 20px", backgroundColor: ({ t }) => t.panel },
  colLeft: { borderRight: ({ t }) => `1px solid ${t.line}`, "@media (max-width: 760px)": { borderRight: "none", borderBottom: ({ t }) => `1px solid ${t.line}` } },
  colHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 14 },
  ver: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 16, color: ({ t }) => t.textHi },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: "0.03em",
    padding: "4px 10px",
    borderRadius: 99,
    whiteSpace: "nowrap"
  },
  pillDot: { width: 6, height: 6, borderRadius: "50%" },
  kv: { display: "flex", flexDirection: "column", gap: 8 },
  kvRow: { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 },
  kvK: { color: ({ t }) => t.textFaint },
  kvV: { color: ({ t }) => t.textHi, fontFamily: fontMono, fontSize: 11.5 },
  mid: {
    width: 150,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: "18px 10px",
    alignItems: "center",
    backgroundColor: ({ t }) => t.panelAlt,
    "@media (max-width: 760px)": { flexDirection: "row", flexWrap: "wrap", width: "100%", justifyContent: "space-around" }
  },
  metric: { width: "100%", textAlign: "center" },
  metricLbl: { fontSize: 9.5, color: ({ t }) => t.textFaint, textTransform: "uppercase", letterSpacing: "0.06em" },
  metricDelta: { fontFamily: fontMono, fontSize: 13, fontWeight: 600, marginTop: 2 }
}));
function toneColor(t, tone) {
  if (tone === "good") return t.good;
  if (tone === "bad") return t.bad;
  return t.textLo;
}
function toneForLowerIsBetter(delta) {
  if (delta === void 0) return void 0;
  return delta <= 0 ? "good" : "bad";
}
function toneForHigherIsBetter(delta) {
  if (delta === void 0 || delta === 0) return void 0;
  return delta > 0 ? "good" : "bad";
}
function Metric({
  label,
  value,
  tone,
  t,
  classes
}) {
  const color = toneColor(t, tone);
  return /* @__PURE__ */ jsxs("div", { className: classes.metric, children: [
    /* @__PURE__ */ jsx("div", { className: classes.metricLbl, children: label }),
    /* @__PURE__ */ jsx("div", { className: classes.metricDelta, style: { color }, children: value })
  ] });
}
function RecordColumn({
  record,
  pill,
  side,
  t,
  classes
}) {
  const lead = leadTimeMs(record);
  return /* @__PURE__ */ jsxs("div", { className: `${classes.col} ${side === "left" ? classes.colLeft : ""}`, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.colHead, children: [
      /* @__PURE__ */ jsxs("span", { className: classes.ver, children: [
        record.version ?? record.imageTag,
        record.nickname && /* @__PURE__ */ jsx("span", { style: { marginLeft: 8 }, children: /* @__PURE__ */ jsx(NicknameChip, { nickname: record.nickname }) })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: classes.pill, style: { backgroundColor: pill.bg, borderColor: pill.border, color: pill.fg }, children: [
        /* @__PURE__ */ jsx("span", { className: classes.pillDot, style: { backgroundColor: pill.fg } }),
        pill.label
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.kvRow, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvK, children: "Deployed" }),
        /* @__PURE__ */ jsx("span", { className: classes.kvV, children: formatDateTime(record.createdAt) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.kvRow, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvK, children: "PRs" }),
        /* @__PURE__ */ jsx("span", { className: classes.kvV, children: record.pullRequests.length })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.kvRow, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvK, children: "Lead time (merge\u2192prod)" }),
        /* @__PURE__ */ jsx("span", { className: classes.kvV, children: lead === void 0 ? "\u2014" : formatDuration(lead) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.kvRow, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvK, children: "Guardrail checks" }),
        /* @__PURE__ */ jsx("span", { className: classes.kvV, children: record.guardrails ? `${record.guardrails.passedChecks}/${record.guardrails.totalChecks}` : "\u2014" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.kvRow, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvK, children: "Confidence" }),
        /* @__PURE__ */ jsx("span", { className: classes.kvV, style: { color: confidenceColor(t, record.confidence) }, children: record.confidence })
      ] })
    ] })
  ] });
}
function ReleaseRecordCompare({
  left,
  right,
  onBack
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const leftLead = leadTimeMs(left);
  const rightLead = leadTimeMs(right);
  const leftRatio = guardrailPassRatio(left);
  const rightRatio = guardrailPassRatio(right);
  const prDelta = right.pullRequests.length - left.pullRequests.length;
  const leadDelta = leftLead !== void 0 && rightLead !== void 0 ? rightLead - leftLead : void 0;
  const ratioDelta = leftRatio !== void 0 && rightRatio !== void 0 ? rightRatio - leftRatio : void 0;
  const confidenceDelta = right.confidence - left.confidence;
  const leftPill = { label: "BASELINE", bg: t.panelAlt, border: t.line, fg: t.textLo };
  const rightPill = statusPill(t, right);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(TextLink, { onClick: onBack, children: "\u2190 Back to record" }),
    /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Compare releases" }),
    /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
      /* @__PURE__ */ jsx(RecordColumn, { record: left, pill: leftPill, side: "left", t, classes }),
      /* @__PURE__ */ jsxs("div", { className: classes.mid, children: [
        /* @__PURE__ */ jsx(Metric, { label: "PRs", value: formatSignedInt(prDelta), t, classes }),
        /* @__PURE__ */ jsx(
          Metric,
          {
            label: "Lead time",
            value: leadDelta === void 0 ? "\u2014" : formatSignedDuration(leadDelta),
            tone: toneForLowerIsBetter(leadDelta),
            t,
            classes
          }
        ),
        /* @__PURE__ */ jsx(
          Metric,
          {
            label: "Guardrail pass rate",
            value: ratioDelta === void 0 ? "\u2014" : formatSignedPercentPoints(ratioDelta),
            tone: toneForHigherIsBetter(ratioDelta),
            t,
            classes
          }
        ),
        /* @__PURE__ */ jsx(
          Metric,
          {
            label: "Confidence",
            value: formatSignedInt(confidenceDelta),
            tone: toneForHigherIsBetter(confidenceDelta),
            t,
            classes
          }
        )
      ] }),
      /* @__PURE__ */ jsx(RecordColumn, { record: right, pill: rightPill, side: "right", t, classes })
    ] })
  ] });
}

export { ReleaseRecordCompare };
//# sourceMappingURL=ReleaseRecordCompare.esm.js.map

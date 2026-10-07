import { makeStyles } from '@material-ui/core/styles';
import { fontBody, fontMono, fontDisplay } from '../../../brand/tokens.esm.js';

const useOpsStyles = makeStyles(() => ({
  root: { display: "flex", flexDirection: "column", gap: 14 },
  // ---- fit mode (fullscreen): the columns take the height left and each panel scrolls inside itself
  rootFit: { flex: 1, minHeight: 0 },
  columnsFit: { flex: 1, minHeight: 0, gridTemplateRows: "minmax(0, 1fr)", alignItems: "stretch" },
  columnFit: { minHeight: 0, overflow: "hidden" },
  panelFit: { display: "flex", flexDirection: "column", minHeight: 0, flexBasis: "auto", flexGrow: 0 },
  panelBodyFit: { flex: 1, minHeight: 0, overflowY: "auto" },
  toolbar: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  toolGroup: { display: "flex", alignItems: "center", gap: 8 },
  toolLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint
  },
  select: {
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: "5px 8px"
  },
  // ---- sources strip
  sources: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px 18px",
    padding: "8px 14px",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    backgroundColor: ({ t }) => t.panel,
    marginLeft: "auto"
  },
  source: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.textLo
  },
  sourceAge: { color: ({ t }) => t.textFaint },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  // ---- KPI band
  kpis: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12
  },
  kpi: {
    textAlign: "left",
    border: ({ t }) => `1px solid ${t.line}`,
    borderTop: "3px solid",
    borderRadius: 6,
    padding: "12px 16px",
    backgroundColor: ({ t }) => t.panel,
    cursor: "pointer",
    font: "inherit",
    color: "inherit",
    "&:hover": { borderColor: ({ t }) => t.textFaint }
  },
  kpiLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    marginBottom: 6
  },
  kpiValue: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 40, lineHeight: 1 },
  kpiSub: { fontSize: 12, color: ({ t }) => t.textLo, marginTop: 6, minHeight: 16 },
  column: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 },
  // ---- panels
  panel: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    backgroundColor: ({ t }) => t.panel,
    minWidth: 0,
    scrollMarginTop: 16
  },
  panelHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 14px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`
  },
  panelTitle: {
    margin: 0,
    fontFamily: fontMono,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: ({ t }) => t.textLo,
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  count: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: "1px 7px",
    borderRadius: 10,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi
  },
  panelMeta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  stale: { opacity: 0.55 },
  staleNote: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.amber },
  empty: { padding: "18px 14px", fontSize: 13, color: ({ t }) => t.textFaint },
  more: {
    padding: "8px 14px",
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.textFaint,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`
  },
  subhead: {
    padding: "8px 14px 4px",
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`
  },
  // ---- rows
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "center",
    padding: "9px 14px 9px 12px",
    borderLeft: "3px solid transparent",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    "&:last-child": { borderBottom: "none" }
  },
  rowMain: { minWidth: 0 },
  rowTop: { display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, flexWrap: "wrap" },
  app: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 14.5, color: ({ t }) => t.textHi },
  envTag: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: "0 6px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo
  },
  rowTitle: { fontFamily: fontBody, fontSize: 13, color: ({ t }) => t.textHi },
  rowDetail: {
    fontFamily: fontBody,
    fontSize: 12,
    color: ({ t }) => t.textLo,
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  rowSide: { display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" },
  age: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textFaint, whiteSpace: "nowrap" },
  links: { display: "flex", gap: 6 },
  link: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: "2px 7px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo,
    textDecoration: "none",
    whiteSpace: "nowrap",
    "&:hover": { color: ({ t }) => t.textHi, borderColor: ({ t }) => t.textFaint }
  },
  stateChip: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: "1px 7px",
    borderRadius: 4,
    whiteSpace: "nowrap"
  },
  bar: {
    position: "relative",
    height: 5,
    width: 110,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: ({ t }) => t.panelAlt,
    flexShrink: 0
  },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 3 },
  mono: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  // ---- DORA
  doraGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" },
  doraTile: { padding: "12px 14px", boxShadow: ({ t }) => `inset -1px -1px 0 ${t.lineSoft}` },
  doraValue: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 30, lineHeight: 1.1, color: ({ t }) => t.textHi },
  doraUnit: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, marginLeft: 4, fontWeight: 400 },
  doraFoot: { display: "flex", alignItems: "center", gap: 8, marginTop: 6, minHeight: 18 },
  doraNote: {
    padding: "8px 14px",
    fontSize: 11.5,
    color: ({ t }) => t.textFaint,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  th: {
    textAlign: "right",
    padding: "6px 14px",
    fontFamily: fontMono,
    fontWeight: 500,
    fontSize: 10.5,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`,
    "&:first-child": { textAlign: "left" }
  },
  td: {
    textAlign: "right",
    padding: "6px 14px",
    fontFamily: fontMono,
    color: ({ t }) => t.textLo,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`,
    "&:first-child": { textAlign: "left", fontFamily: fontDisplay, fontWeight: 600, color: ({ t }) => t.textHi }
  },
  toggle: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    background: "none",
    color: ({ t }) => t.textLo,
    cursor: "pointer",
    "&:hover": { color: ({ t }) => t.textHi }
  },
  toggleOn: { color: ({ t }) => t.textHi, borderColor: ({ t }) => t.amberLine },
  toggleCount: { color: ({ t }) => t.textFaint, marginLeft: 2 },
  filterRow: { display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 14px" },
  historyNote: { padding: "0 14px 6px", fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.amber },
  runStrip: { display: "flex", gap: 2, padding: "6px 14px 12px", alignItems: "stretch", height: 34 },
  runCell: {
    flex: "1 1 0",
    maxWidth: 14,
    minWidth: 3,
    borderRadius: 2,
    opacity: 0.85,
    "&:hover": { opacity: 1, outline: ({ t }) => `1px solid ${t.textHi}` }
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap"
  },
  // ---- columns (the page picks 1, 2 or 3 from its own width)
  columns: { display: "grid", gap: 14, alignItems: "start" },
  tip: { fontFamily: fontBody, fontSize: 12, lineHeight: 1.45, maxWidth: 320 },
  tipTitle: { fontWeight: 600, marginBottom: 2 },
  tipError: { color: ({ t }) => t.bad, marginTop: 4 }
}));
function severityColor(t, s) {
  switch (s) {
    case "critical":
      return t.bad;
    case "high":
      return t.amber;
    case "warn":
      return t.amberLine;
    default:
      return t.line;
  }
}
function bandColor(t, b) {
  switch (b) {
    case "good":
      return t.good;
    case "fair":
      return t.amber;
    case "poor":
      return t.bad;
    default:
      return t.textLo;
  }
}
const BAND_LABEL = { good: "good", fair: "fair", poor: "poor", neutral: "" };
function fmtSeconds(sec) {
  if (sec === void 0) return "\u2014";
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 90 * 60) return `${Math.round(sec / 60)}m`;
  if (sec < 36 * 3600) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}
function fmtAge(now, iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, (now - t) / 1e3);
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 72 * 3600) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export { BAND_LABEL, bandColor, fmtAge, fmtSeconds, severityColor, useOpsStyles };
//# sourceMappingURL=styles.esm.js.map

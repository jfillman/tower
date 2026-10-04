import { makeStyles } from '@material-ui/core/styles';
import { fontMono, fontBody, fontDisplay } from '../brand/tokens.esm.js';

const useUi = makeStyles(() => ({
  // ---- page chrome
  pageHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 14 },
  pageTitle: { margin: 0, fontFamily: fontDisplay, fontWeight: 700, fontSize: 26, lineHeight: 1.1, color: ({ t }) => t.textHi },
  pageSub: { margin: "4px 0 0", fontFamily: fontBody, fontSize: 13, color: ({ t }) => t.textLo },
  pageActions: { display: "flex", gap: 8, alignItems: "center" },
  // ---- surfaces
  panel: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6 },
  panelAccent: { borderColor: ({ t }) => t.amberLine },
  sectionLabel: {
    margin: 0,
    fontFamily: fontMono,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: ({ t }) => t.textLo
  },
  columnLabel: {
    fontFamily: fontMono,
    fontWeight: 500,
    fontSize: 10.5,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: ({ t }) => t.textLo
  },
  // ---- controls
  button: {
    fontFamily: fontBody,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.2,
    padding: "7px 13px",
    borderRadius: 5,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    cursor: "pointer",
    "&:hover:not(:disabled)": { borderColor: ({ t }) => t.textFaint },
    "&:disabled": { opacity: 0.45, cursor: "default" },
    "&:focus-visible": { outline: ({ t }) => `2px solid ${t.amber}`, outlineOffset: 1 }
  },
  buttonPrimary: {
    backgroundColor: ({ t }) => t.amber,
    borderColor: ({ t }) => t.amber,
    color: ({ t }) => t.onAmber,
    fontWeight: 600,
    "&:hover:not(:disabled)": { borderColor: ({ t }) => t.amber, filter: "brightness(1.08)" }
  },
  buttonDanger: { backgroundColor: "transparent", borderColor: ({ t }) => t.bad, color: ({ t }) => t.bad, "&:hover:not(:disabled)": { borderColor: ({ t }) => t.bad } },
  buttonSmall: { padding: "4px 9px", fontSize: 12 },
  iconButton: {
    width: 28,
    height: 28,
    display: "inline-grid",
    placeItems: "center",
    padding: 0,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 4,
    backgroundColor: "transparent",
    color: ({ t }) => t.textLo,
    fontFamily: fontMono,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    "&:hover:not(:disabled)": { color: ({ t }) => t.textHi, borderColor: ({ t }) => t.textFaint },
    "&:disabled": { opacity: 0.35, cursor: "default" },
    "&:focus-visible": { outline: ({ t }) => `2px solid ${t.amber}`, outlineOffset: 1 }
  },
  // ---- chips
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontFamily: fontMono,
    fontWeight: 500,
    fontSize: 11,
    lineHeight: 1,
    padding: "4px 7px",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 4,
    color: ({ t }) => t.textLo,
    whiteSpace: "nowrap"
  },
  chipGround: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine },
  chipFlight: { color: ({ t }) => t.amber, borderColor: ({ t }) => t.amberLine },
  chipOk: { color: ({ t }) => t.good, borderColor: ({ t }) => t.good },
  chipBad: { color: ({ t }) => t.bad, borderColor: ({ t }) => t.bad },
  // ---- segmented filter
  segmented: { display: "inline-flex", border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, overflow: "hidden" },
  segment: {
    fontFamily: fontMono,
    fontWeight: 500,
    fontSize: 11,
    padding: "6px 10px",
    border: 0,
    borderLeft: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: "transparent",
    color: ({ t }) => t.textLo,
    cursor: "pointer",
    "&:first-child": { borderLeft: 0 },
    "&:focus-visible": { outline: ({ t }) => `2px solid ${t.amber}`, outlineOffset: -2 }
  },
  segmentOn: { backgroundColor: ({ t }) => t.panelAlt, color: ({ t }) => t.textHi },
  // ---- sub-tabs inside a panel
  subtabs: { display: "flex", gap: 2, borderBottom: ({ t }) => `1px solid ${t.line}` },
  subtab: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 13,
    padding: "9px 14px",
    marginBottom: -1,
    border: 0,
    borderBottom: "2px solid transparent",
    backgroundColor: "transparent",
    color: ({ t }) => t.textLo,
    cursor: "pointer",
    "&:focus-visible": { outline: ({ t }) => `2px solid ${t.amber}`, outlineOffset: -2 }
  },
  subtabOn: { color: ({ t }) => t.textHi, borderBottomColor: ({ t }) => t.amber },
  // ---- status
  dot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  // ---- form fields
  field: { display: "flex", flexDirection: "column", gap: 5, minWidth: 0 },
  fieldLabel: { display: "flex", justifyContent: "space-between", gap: 8, fontFamily: fontBody, fontSize: 12, fontWeight: 500, color: ({ t }) => t.textLo },
  fieldSource: { fontFamily: fontMono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: ({ t }) => t.textLo },
  fieldSourceSet: { color: ({ t }) => t.sky },
  input: {
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: ({ t }) => t.bg,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 4,
    color: ({ t }) => t.textHi,
    padding: "8px 10px",
    fontFamily: fontMono,
    fontSize: 13,
    "&::placeholder": { color: ({ t }) => t.textFaint },
    "&:focus": { outline: "none", borderColor: ({ t }) => t.amber }
  },
  note: { fontSize: 12.5, color: ({ t }) => t.textLo },
  problem: { fontSize: 12.5, color: ({ t }) => t.bad }
}));

export { useUi };
//# sourceMappingURL=styles.esm.js.map

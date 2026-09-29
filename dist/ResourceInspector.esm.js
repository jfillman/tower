import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import '@material-ui/core/Typography';
import '@material-ui/core/Collapse';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';

makeStyles(() => ({
  head: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  kind: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "2px 8px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky
  },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  sectionLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: ({ t }) => t.textFaint,
    marginBottom: 6,
    marginTop: 14
  },
  secretNote: { fontSize: 11.5, fontStyle: "italic", color: ({ t }) => t.textFaint, marginBottom: 10, marginTop: 0 },
  // One row per label/annotation, key and value in the same line of text
  // (not stacked on separate lines - too much wasted vertical space for the
  // common case of a short value, 2026-09-09 feedback) - a short value sits
  // right after its key like "app: backstage"; a long one (e.g. kubectl.
  // kubernetes.io/last-applied-configuration's full JSON blob) just wraps
  // onto following lines the way a paragraph would, still full-width rather
  // than squeezed into a grid column.
  kvList: { display: "flex", flexDirection: "column", gap: 5 },
  kv: { minWidth: 0, fontSize: 11.5, lineHeight: 1.5, overflowWrap: "anywhere" },
  kvKey: { fontFamily: fontMono, color: ({ t }) => t.textFaint },
  kvVal: { fontFamily: fontMono, color: ({ t }) => t.textHi, whiteSpace: "pre-wrap" },
  none: { fontSize: 12, fontStyle: "italic", color: ({ t }) => t.textFaint },
  tree: {
    padding: "10px 12px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6,
    maxHeight: 460,
    overflow: "auto"
  }
}));
const useTreeStyles = makeStyles(() => ({
  row: { display: "flex", alignItems: "flex-start", gap: 4 },
  toggle: {
    width: 14,
    flexShrink: 0,
    color: ({ t }) => t.textFaint,
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: fontMono,
    fontSize: 10,
    padding: "2px 0 0",
    textAlign: "left"
  },
  toggleSpacer: { width: 14, flexShrink: 0 },
  key: { color: ({ t }) => t.sky, flexShrink: 0 },
  punct: { color: ({ t }) => t.textFaint },
  scalar: { color: ({ t }) => t.textHi, overflowWrap: "anywhere" },
  placeholder: {
    color: ({ t }) => t.textFaint,
    fontStyle: "italic",
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit"
  },
  children: { marginLeft: 16 }
}));
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function scalarText(v) {
  if (v === null) return "null";
  if (v === void 0) return "\u2014";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}
function JsonNode({
  label,
  value,
  depth,
  defaultExpanded
}) {
  const t = useHangarTokens();
  const classes = useTreeStyles({ t });
  const [open, setOpen] = useState(defaultExpanded ?? depth < 2);
  if (isPlainObject(value) || Array.isArray(value)) {
    const isArray = Array.isArray(value);
    const entries = isArray ? value.map((v, i) => [String(i), v]) : Object.entries(value);
    if (entries.length === 0) {
      return /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsx("span", { className: classes.toggleSpacer }),
        label !== void 0 && /* @__PURE__ */ jsxs("span", { className: classes.key, children: [
          label,
          ":"
        ] }),
        /* @__PURE__ */ jsx("span", { className: classes.punct, children: isArray ? "[]" : "{}" })
      ] });
    }
    return /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.toggle, onClick: () => setOpen((o) => !o), children: open ? "\u25BE" : "\u25B8" }),
        label !== void 0 && /* @__PURE__ */ jsxs("span", { className: classes.key, children: [
          label,
          ":"
        ] }),
        !open && /* @__PURE__ */ jsx("button", { type: "button", className: classes.placeholder, onClick: () => setOpen(true), children: isArray ? `[${entries.length} items]` : `{${entries.length} keys}` })
      ] }),
      open && /* @__PURE__ */ jsx("div", { className: classes.children, children: entries.map(([k, v]) => /* @__PURE__ */ jsx(JsonNode, { label: k, value: v, depth: depth + 1, defaultExpanded }, k)) })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
    /* @__PURE__ */ jsx("span", { className: classes.toggleSpacer }),
    label !== void 0 && /* @__PURE__ */ jsxs("span", { className: classes.key, children: [
      label,
      ":"
    ] }),
    /* @__PURE__ */ jsx("span", { className: classes.scalar, children: scalarText(value) })
  ] });
}
const useDocStyles = makeStyles(() => ({
  box: {
    padding: "10px 12px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6,
    maxHeight: 420,
    overflow: "auto"
  }
}));
function JsonDocumentView({ value, defaultExpanded = true }) {
  const t = useHangarTokens();
  const classes = useDocStyles({ t });
  return /* @__PURE__ */ jsx("div", { className: classes.box, children: /* @__PURE__ */ jsx(JsonNode, { value, depth: 0, defaultExpanded }) });
}
makeStyles(() => ({
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: ({ t }) => t.textFaint,
    padding: "4px 10px 6px 0"
  },
  // A visible row separator - without it, nothing signaled these rows were
  // clickable at all (2026-09-09 feedback) beyond a hover color that only
  // shows up once the pointer is already there.
  row: {
    cursor: "pointer",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  rowSelected: { backgroundColor: ({ t }) => t.panelAlt },
  td: { padding: "7px 10px 7px 0", fontSize: 12, fontFamily: fontMono, color: ({ t }) => t.textHi },
  kindTd: { color: ({ t }) => t.textFaint },
  detail: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: ({ t }) => `1px dashed ${t.line}`
  },
  detailHead: { display: "flex", justifyContent: "flex-end", marginBottom: -4 },
  close: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    background: "none",
    border: "none",
    cursor: "pointer"
  }
}));
function resourceKey(r) {
  return `${r.kind}/${r.namespace}/${r.name}`;
}

export { JsonDocumentView, JsonNode, resourceKey };
//# sourceMappingURL=ResourceInspector.esm.js.map

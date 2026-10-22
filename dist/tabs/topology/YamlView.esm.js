import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useRef, useLayoutEffect, useMemo } from 'react';
import { dump } from 'js-yaml';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { JsonNode } from '../../ResourceInspector.esm.js';
import { preventFocusScroll, keepAnchored } from '../../preventFocusScroll.esm.js';
import '../../ui/index.esm.js';
import { CopyButton, YamlBlock } from '../../ui/YamlBlock.esm.js';

function redactIfSecret(ref) {
  if (ref.kind !== "Secret" || !ref.raw || typeof ref.raw !== "object") return ref.raw;
  const secret = ref.raw;
  const redact = (rec) => rec ? Object.fromEntries(Object.keys(rec).map((k) => [k, "<redacted>"])) : void 0;
  return { ...secret, data: redact(secret.data), stringData: redact(secret.stringData) };
}
function withTypeMeta(ref, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const obj = value;
  const kind = typeof obj.kind === "string" && obj.kind || ref.kind;
  const apiVersion = typeof obj.apiVersion === "string" && obj.apiVersion || ref.apiVersion;
  const { apiVersion: _apiVersion, kind: _kind, ...rest } = obj;
  return apiVersion ? { apiVersion, kind, ...rest } : { kind, ...rest };
}
const useStyles = makeStyles(() => ({
  wrap: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  kind: {
    fontFamily: fontMono,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "2px 8px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky
  },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  spacer: { flex: 1 },
  modeBtn: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: "3px 9px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    background: "none",
    color: ({ t }) => t.textFaint,
    cursor: "pointer"
  },
  modeBtnActive: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  secretNote: { fontSize: 11, fontStyle: "italic", color: ({ t }) => t.textFaint },
  treeBox: {
    padding: "10px 12px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    fontFamily: fontMono,
    fontSize: 11,
    lineHeight: 1.6,
    maxHeight: 460,
    overflow: "auto"
  }
}));
function YamlView({ resource }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [mode, setMode] = useState("yaml");
  const boxRef = useRef(null);
  const pendingScrollRatio = useRef(null);
  const switchMode = (next) => {
    if (next === mode) return;
    const el = boxRef.current;
    const scrollable = el ? el.scrollHeight - el.clientHeight : 0;
    pendingScrollRatio.current = el && scrollable > 0 ? el.scrollTop / scrollable : 0;
    setMode(next);
  };
  useLayoutEffect(() => {
    if (pendingScrollRatio.current === null) return;
    const el = boxRef.current;
    if (el) {
      const scrollable = el.scrollHeight - el.clientHeight;
      el.scrollTop = pendingScrollRatio.current * scrollable;
    }
    pendingScrollRatio.current = null;
  }, [mode]);
  const value = withTypeMeta(resource, redactIfSecret(resource));
  const yamlText = useMemo(() => {
    try {
      return dump(value, { lineWidth: 100, noRefs: true });
    } catch (e) {
      return `# couldn't render as YAML: ${String(e)}`;
    }
  }, [value]);
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx("span", { className: classes.kind, children: resource.kind }),
      /* @__PURE__ */ jsx("span", { className: classes.name, children: resource.name }),
      /* @__PURE__ */ jsx("span", { className: classes.spacer }),
      /* @__PURE__ */ jsx("button", { type: "button", className: `${classes.modeBtn} ${mode === "yaml" ? classes.modeBtnActive : ""}`, onMouseDown: preventFocusScroll, onClick: (e) => keepAnchored(e.currentTarget, () => switchMode("yaml")), children: "YAML" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: `${classes.modeBtn} ${mode === "tree" ? classes.modeBtnActive : ""}`, onMouseDown: preventFocusScroll, onClick: (e) => keepAnchored(e.currentTarget, () => switchMode("tree")), children: "Structured" }),
      /* @__PURE__ */ jsx(CopyButton, { text: yamlText })
    ] }),
    resource.kind === "Secret" && /* @__PURE__ */ jsx(Typography, { className: classes.secretNote, children: "Values redacted below - this is a real Secret, not a preview of one." }),
    mode === "yaml" ? /* @__PURE__ */ jsx(YamlBlock, { text: yamlText, copy: false, filter: true, boxRef }) : /* @__PURE__ */ jsx("div", { className: classes.treeBox, ref: boxRef, children: /* @__PURE__ */ jsx(JsonNode, { value, depth: 0 }) })
  ] });
}

export { YamlView };
//# sourceMappingURL=YamlView.esm.js.map

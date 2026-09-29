import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useRef, useLayoutEffect, useMemo } from 'react';
import { dump } from 'js-yaml';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { JsonNode } from '../../ResourceInspector.esm.js';
import { preventFocusScroll } from '../../preventFocusScroll.esm.js';

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
const KEY_RE = /^(\s*(?:- )?)([A-Za-z0-9_.\-/]+)(:)(\s.*)?$/;
const LIST_DASH_RE = /^(\s*)(- )(.*)$/;
function colorForScalar(text, t) {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "{}" || trimmed === "[]" || trimmed === "|" || trimmed === ">") return t.textFaint;
  if (trimmed === "null" || trimmed === "~") return t.textFaint;
  if (trimmed === "true" || trimmed === "false") return t.amberInk;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return t.amberInk;
  return t.textHi;
}
function YamlLine({ text, t }) {
  const keyMatch = text.match(KEY_RE);
  if (keyMatch) {
    const [, prefix, key, colon, rest] = keyMatch;
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      prefix,
      /* @__PURE__ */ jsx("span", { style: { color: t.sky }, children: key }),
      colon,
      rest && /* @__PURE__ */ jsx("span", { style: { color: colorForScalar(rest, t) }, children: rest })
    ] });
  }
  const dashMatch = text.match(LIST_DASH_RE);
  if (dashMatch) {
    const [, prefix, dash, rest] = dashMatch;
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      prefix,
      /* @__PURE__ */ jsx("span", { style: { color: t.textFaint }, children: dash }),
      /* @__PURE__ */ jsx("span", { style: { color: colorForScalar(rest, t) }, children: rest })
    ] });
  }
  if (/^\s*#/.test(text)) return /* @__PURE__ */ jsx("span", { style: { color: t.textFaint, fontStyle: "italic" }, children: text });
  return /* @__PURE__ */ jsx("span", { style: { color: colorForScalar(text, t) }, children: text });
}
const useStyles = makeStyles(() => ({
  wrap: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
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
  spacer: { flex: 1 },
  modeBtn: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "3px 9px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    background: "none",
    color: ({ t }) => t.textFaint,
    cursor: "pointer"
  },
  modeBtnActive: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  copyBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "3px 9px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    background: "none",
    color: ({ t }) => t.textFaint,
    cursor: "pointer",
    "&:hover": { color: ({ t }) => t.sky }
  },
  secretNote: { fontSize: 11.5, fontStyle: "italic", color: ({ t }) => t.textFaint },
  search: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: "5px 9px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    width: "100%",
    maxWidth: 260
  },
  codeBox: {
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    maxHeight: 460,
    overflow: "auto",
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6
  },
  codeLine: { display: "flex" },
  codeLineMatch: { backgroundColor: ({ t }) => t.amberSoft },
  lineNo: {
    flexShrink: 0,
    width: 40,
    textAlign: "right",
    paddingRight: 10,
    color: ({ t }) => t.textFaint,
    opacity: 0.6,
    userSelect: "none"
  },
  lineText: { whiteSpace: "pre", paddingRight: 12, minWidth: 0 },
  treeBox: {
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
function YamlView({ resource }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [mode, setMode] = useState("yaml");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
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
  const lines = useMemo(() => yamlText.split("\n"), [yamlText]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(yamlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx("span", { className: classes.kind, children: resource.kind }),
      /* @__PURE__ */ jsx("span", { className: classes.name, children: resource.name }),
      /* @__PURE__ */ jsx("span", { className: classes.spacer }),
      /* @__PURE__ */ jsx("button", { type: "button", className: `${classes.modeBtn} ${mode === "yaml" ? classes.modeBtnActive : ""}`, onMouseDown: preventFocusScroll, onClick: () => switchMode("yaml"), children: "YAML" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: `${classes.modeBtn} ${mode === "tree" ? classes.modeBtnActive : ""}`, onMouseDown: preventFocusScroll, onClick: () => switchMode("tree"), children: "Structured" }),
      /* @__PURE__ */ jsxs("button", { type: "button", className: classes.copyBtn, onMouseDown: preventFocusScroll, onClick: copy, children: [
        /* @__PURE__ */ jsx(FileCopyOutlinedIcon, { style: { fontSize: 13 } }),
        copied ? "copied" : "copy"
      ] })
    ] }),
    resource.kind === "Secret" && /* @__PURE__ */ jsx(Typography, { className: classes.secretNote, children: "Values redacted below - this is a real Secret, not a preview of one." }),
    mode === "yaml" && /* @__PURE__ */ jsx(
      "input",
      {
        className: classes.search,
        placeholder: "filter lines\u2026",
        value: query,
        onChange: (e) => setQuery(e.target.value)
      }
    ),
    mode === "yaml" ? /* @__PURE__ */ jsx("div", { className: classes.codeBox, ref: boxRef, children: lines.map((line, i) => {
      const match = query.length > 0 && line.toLowerCase().includes(query.toLowerCase());
      if (query.length > 0 && !match) return null;
      return /* @__PURE__ */ jsxs("div", { className: `${classes.codeLine} ${match ? classes.codeLineMatch : ""}`, children: [
        /* @__PURE__ */ jsx("span", { className: classes.lineNo, children: i + 1 }),
        /* @__PURE__ */ jsx("span", { className: classes.lineText, children: /* @__PURE__ */ jsx(YamlLine, { text: line, t }) })
      ] }, i);
    }) }) : /* @__PURE__ */ jsx("div", { className: classes.treeBox, ref: boxRef, children: /* @__PURE__ */ jsx(JsonNode, { value, depth: 0 }) })
  ] });
}

export { YamlView };
//# sourceMappingURL=YamlView.esm.js.map

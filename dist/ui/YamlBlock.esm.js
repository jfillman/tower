import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { preventFocusScroll } from '../preventFocusScroll.esm.js';
import { useUi } from './styles.esm.js';

const KEY_RE = /^(\s*(?:- )?)([A-Za-z0-9_.\-/]+)(:)(\s.*)?$/;
const LIST_DASH_RE = /^(\s*)(- )(.*)$/;
function colorForScalar(text, t) {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "{}" || trimmed === "[]" || trimmed === "|" || trimmed === ">") return t.textFaint;
  if (trimmed === "null" || trimmed === "~") return t.textFaint;
  if (trimmed === "true" || trimmed === "false") return t.amberInk;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return t.amberInk;
  if (/^#/.test(trimmed)) return t.textFaint;
  return t.textHi;
}
function YamlLine({ text, t }) {
  if (/^\s*#/.test(text)) return /* @__PURE__ */ jsx("span", { style: { color: t.textFaint, fontStyle: "italic" }, children: text });
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
  return /* @__PURE__ */ jsx("span", { style: { color: colorForScalar(text, t) }, children: text });
}
const useStyles = makeStyles(() => ({
  wrap: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  heading: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  spacer: { flex: 1 },
  search: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: "5px 9px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    // In the header row with the title and Copy (2026-10-12: it sat on its own row under them).
    flex: "1 1 160px",
    minWidth: 120,
    maxWidth: 280
  },
  codeBox: {
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    overflow: "auto",
    fontFamily: fontMono,
    fontSize: 11,
    lineHeight: 1.6,
    padding: "6px 0"
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
  lineTextNoGutter: { paddingLeft: 12 }
}));
function useCopyText(text) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
    });
  };
  return { copied, copy };
}
function CopyButton({ text }) {
  const t = useHangarTokens();
  const ui = useUi({ t });
  const { copied, copy } = useCopyText(text);
  return /* @__PURE__ */ jsxs("button", { type: "button", className: `${ui.button} ${ui.buttonSmall}`, onMouseDown: preventFocusScroll, onClick: copy, "aria-label": "Copy to clipboard", children: [
    /* @__PURE__ */ jsx(FileCopyOutlinedIcon, { style: { fontSize: 13 } }),
    copied ? "Copied" : "Copy"
  ] });
}
function YamlBlock({
  text,
  title,
  actions,
  copy = true,
  filter = false,
  lineNumbers = true,
  maxHeight = 460,
  className,
  boxRef,
  "aria-label": ariaLabel
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [query, setQuery] = useState("");
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);
  const q = query.trim().toLowerCase();
  const showHead = title !== void 0 || actions !== void 0 || copy;
  return /* @__PURE__ */ jsxs("div", { className: `${classes.wrap} ${className ?? ""}`, children: [
    (showHead || filter) && /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      title !== void 0 && /* @__PURE__ */ jsx("span", { className: classes.heading, children: title }),
      filter && /* @__PURE__ */ jsx("input", { className: classes.search, placeholder: "filter lines\u2026", value: query, onChange: (e) => setQuery(e.target.value), "aria-label": "Filter lines" }),
      /* @__PURE__ */ jsx("span", { className: classes.spacer }),
      actions,
      copy && /* @__PURE__ */ jsx(CopyButton, { text })
    ] }),
    /* @__PURE__ */ jsx("div", { className: classes.codeBox, style: { maxHeight }, ref: boxRef, "aria-label": ariaLabel, role: ariaLabel ? "region" : void 0, children: lines.map((line, i) => {
      const match = q.length > 0 && line.toLowerCase().includes(q);
      if (q.length > 0 && !match) return null;
      return /* @__PURE__ */ jsxs("div", { className: `${classes.codeLine} ${match ? classes.codeLineMatch : ""}`, children: [
        lineNumbers && /* @__PURE__ */ jsx("span", { className: classes.lineNo, children: i + 1 }),
        /* @__PURE__ */ jsx("span", { className: `${classes.lineText} ${lineNumbers ? "" : classes.lineTextNoGutter}`, "data-yaml-line": "", children: /* @__PURE__ */ jsx(YamlLine, { text: line, t }) })
      ] }, i);
    }) })
  ] });
}

export { CopyButton, YamlBlock, YamlLine, useCopyText };
//# sourceMappingURL=YamlBlock.esm.js.map

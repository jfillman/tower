import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { Panel, SectionLabel, Chip, Button } from './index.esm.js';
import { useUi } from './styles.esm.js';

const useStyles = makeStyles(() => ({
  panel: { padding: 16, display: "flex", flexDirection: "column", gap: 12, alignSelf: "start" },
  stickTop: { position: "sticky", top: 12 },
  stickBottom: { position: "sticky", bottom: 12, zIndex: 1, boxShadow: "0 -6px 16px rgba(0,0,0,0.25)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  lines: { display: "flex", flexDirection: "column", gap: 12 },
  line: { display: "flex", flexDirection: "column", gap: 2 },
  lineTitle: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  detail: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  plus: { color: ({ t }) => t.good, marginRight: 4 },
  minus: { color: ({ t }) => t.bad, marginRight: 4 },
  buttons: { display: "flex", gap: 8 }
}));
function PendingPanel({
  lines,
  problems = [],
  notes = [],
  emptyText = "Nothing staged yet.",
  heading = "Pending changes",
  accent = true,
  stick,
  busy,
  canSubmit,
  submitLabel,
  busyLabel = "Opening\u2026",
  onDiscard,
  onSubmit,
  children,
  ...rest
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const ok = canSubmit ?? (lines.length > 0 && problems.length === 0);
  return /* @__PURE__ */ jsxs(Panel, { accent, className: `${c.panel} ${stick === "top" ? c.stickTop : ""} ${stick === "bottom" ? c.stickBottom : ""}`, role: "region", "aria-label": heading, ...rest, children: [
    /* @__PURE__ */ jsxs("div", { className: c.head, children: [
      /* @__PURE__ */ jsx(SectionLabel, { children: heading }),
      /* @__PURE__ */ jsxs(Chip, { tone: "flight", children: [
        lines.length,
        " staged"
      ] })
    ] }),
    lines.length === 0 ? /* @__PURE__ */ jsx("div", { className: ui.note, children: emptyText }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: c.lines, children: lines.map((l, i) => /* @__PURE__ */ jsxs("div", { className: c.line, children: [
        /* @__PURE__ */ jsxs("span", { className: c.lineTitle, children: [
          l.tone === "add" && /* @__PURE__ */ jsx("span", { className: c.plus, children: "+" }),
          l.tone === "remove" && /* @__PURE__ */ jsx("span", { className: c.minus, children: "-" }),
          l.title
        ] }),
        l.detail && /* @__PURE__ */ jsx("span", { className: c.detail, children: l.detail })
      ] }, `${l.title}-${i}`)) }),
      problems.map((p) => /* @__PURE__ */ jsx("div", { className: ui.problem, children: p }, p)),
      children,
      notes.map((n) => /* @__PURE__ */ jsx("div", { className: ui.note, children: n }, n)),
      /* @__PURE__ */ jsxs("div", { className: c.buttons, children: [
        /* @__PURE__ */ jsx(Button, { onClick: onDiscard, disabled: busy, children: "Discard all" }),
        /* @__PURE__ */ jsx(Button, { variant: "primary", style: { flex: 1 }, disabled: !ok || busy, onClick: onSubmit, children: busy ? busyLabel : submitLabel })
      ] })
    ] })
  ] });
}

export { PendingPanel };
//# sourceMappingURL=PendingPanel.esm.js.map

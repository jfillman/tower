import { jsxs, jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { TextLink } from '../ui/index.esm.js';
import { STATE_LABEL, STATE_HINT, STATE_TODO, edgeStroke } from './presentation.esm.js';

const useStyles = makeStyles(() => ({
  root: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12 },
  bar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 18px" },
  list: { display: "flex", flexWrap: "wrap", gap: "6px 18px", margin: 0, padding: 0, listStyle: "none" },
  item: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: ({ t }) => t.textLo },
  explain: { margin: 0, display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", gap: "10px 14px", fontSize: 13 },
  term: { display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: ({ t }) => t.textHi, whiteSpace: "nowrap" },
  def: { margin: 0, color: ({ t }) => t.textLo, lineHeight: 1.45, minWidth: 0 },
  todo: { display: "block", marginTop: 2, color: ({ t }) => t.textHi }
}));
function Line({ state, t }) {
  const s = edgeStroke(state, t);
  return /* @__PURE__ */ jsx("svg", { width: 28, height: 8, "aria-hidden": true, children: /* @__PURE__ */ jsx("line", { x1: 0, y1: 4, x2: 28, y2: 4, stroke: s.color, strokeWidth: 2, strokeDasharray: s.dash }) });
}
function EdgeLegend({ states }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const [open, setOpen] = useState(false);
  if (states.length === 0) return null;
  return /* @__PURE__ */ jsxs("div", { className: c.root, children: [
    /* @__PURE__ */ jsxs("div", { className: c.bar, children: [
      /* @__PURE__ */ jsx("ul", { className: c.list, "aria-label": "Edge legend", children: states.map((s) => /* @__PURE__ */ jsxs("li", { className: c.item, title: STATE_HINT[s], children: [
        /* @__PURE__ */ jsx(Line, { state: s, t }),
        STATE_LABEL[s]
      ] }, s)) }),
      /* @__PURE__ */ jsx(TextLink, { expanded: open, onClick: () => setOpen((v) => !v), children: "What the lines mean" })
    ] }),
    open && /* @__PURE__ */ jsx("dl", { className: c.explain, "aria-label": "What the lines mean", children: states.map((s) => /* @__PURE__ */ jsxs("div", { style: { display: "contents" }, children: [
      /* @__PURE__ */ jsxs("dt", { className: c.term, children: [
        /* @__PURE__ */ jsx(Line, { state: s, t }),
        STATE_LABEL[s]
      ] }),
      /* @__PURE__ */ jsxs("dd", { className: c.def, children: [
        STATE_HINT[s],
        /* @__PURE__ */ jsx("span", { className: c.todo, children: STATE_TODO[s] })
      ] })
    ] }, s)) })
  ] });
}

export { EdgeLegend };
//# sourceMappingURL=EdgeLegend.esm.js.map

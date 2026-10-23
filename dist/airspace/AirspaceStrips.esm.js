import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontScale, fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { useTableKit, Section, EmptyNote, StatusChip, TextLink } from '../ui/index.esm.js';
import { formatRate, formatSeconds } from './model.esm.js';
import { KIND_LABEL, STATE_HINT, STATE_LABEL, STATE_TONE } from './presentation.esm.js';
import { Tooltip } from '../ui/Tooltip.esm.js';

const useStyles = makeStyles(() => ({
  stack: { display: "flex", flexDirection: "column", gap: 16 },
  scrollBox: { overflowX: "auto" },
  // The three sections line up: same columns, same widths.
  stripTable: { tableLayout: "fixed", minWidth: 760 },
  colName: { width: "28%" },
  colNum: { width: "11%" },
  colState: { width: "18%" },
  colLink: { width: "10%" },
  peerName: { fontFamily: fontMono, fontSize: fontScale.md, color: ({ t }) => t.textHi },
  peerKind: { display: "block", fontSize: fontScale.sm, color: ({ t }) => t.textLo, marginTop: 2 },
  num: { fontFamily: fontMono, fontSize: fontScale.sm, whiteSpace: "nowrap" },
  errNum: { color: ({ t }) => t.bad }
}));
const SECTIONS = [
  { key: "inbound", title: "Inbound", empty: "Nothing called this app in the window, and nothing is declared as allowed to." },
  { key: "outbound", title: "Outbound", empty: "This app called nothing outside its own components in the window." },
  { key: "owned", title: "Owned infrastructure", empty: "No components in this environment\u2019s values file." }
];
function declaredText(r, valuesKnown) {
  if (r.direction === "owned") return "components[]";
  if (r.kind === "ingress") return "gateway";
  if (r.state === "broker") return "via broker";
  if (!valuesKnown) return "\u2014";
  if (!r.declared) return "no";
  return r.ports?.length ? `yes \xB7 ${r.ports.join(", ")}` : "yes";
}
function AirspaceStrips({
  airspace,
  valuesKnown,
  onOpenApp
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  return /* @__PURE__ */ jsx("div", { className: c.stack, children: SECTIONS.map((s) => {
    const rows = airspace[s.key];
    return /* @__PURE__ */ jsx(Section, { title: s.title, count: rows.length, framed: true, children: rows.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: s.empty }) : /* @__PURE__ */ jsx("div", { className: c.scrollBox, children: /* @__PURE__ */ jsxs("table", { className: `${tk.table} ${c.stripTable}`, children: [
      /* @__PURE__ */ jsxs("colgroup", { children: [
        /* @__PURE__ */ jsx("col", { className: c.colName }),
        /* @__PURE__ */ jsx("col", { className: c.colNum }),
        /* @__PURE__ */ jsx("col", { className: c.colNum }),
        /* @__PURE__ */ jsx("col", { className: c.colNum }),
        /* @__PURE__ */ jsx("col", { className: c.colNum }),
        /* @__PURE__ */ jsx("col", { className: c.colState }),
        /* @__PURE__ */ jsx("col", { className: c.colLink })
      ] }),
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Counterpart" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Declared" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Traffic" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "p95" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Errors" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "State" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, "aria-label": "Links" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: rows.map((r) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsxs("td", { className: tk.td, children: [
          /* @__PURE__ */ jsx("span", { className: c.peerName, children: r.name }),
          /* @__PURE__ */ jsxs("span", { className: c.peerKind, children: [
            r.componentType ? `${r.componentType} \xB7 ` : "",
            KIND_LABEL[r.kind]
          ] })
        ] }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: c.num, children: declaredText(r, valuesKnown) }) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: c.num, children: r.observed ? formatRate(r.observed.rate) : "\u2014" }) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: c.num, children: formatSeconds(r.observed?.p95) }) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: `${c.num} ${r.observed && r.observed.errorRate > 0 ? c.errNum : ""}`, children: r.observed ? formatRate(r.observed.errorRate) : "\u2014" }) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(Tooltip, { title: STATE_HINT[r.state], children: /* @__PURE__ */ jsx("span", { children: /* @__PURE__ */ jsx(StatusChip, { tone: STATE_TONE[r.state], children: STATE_LABEL[r.state] }) }) }) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: r.app && onOpenApp && /* @__PURE__ */ jsx(TextLink, { onClick: () => onOpenApp(r.app), children: "Open \u2192" }) })
      ] }, r.id)) })
    ] }) }) }, s.key);
  }) });
}

export { AirspaceStrips };
//# sourceMappingURL=AirspaceStrips.esm.js.map

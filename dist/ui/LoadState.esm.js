import { jsxs, jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { Callout, TextLink, Button } from './index.esm.js';

const useStyles = makeStyles(() => ({
  bone: {
    display: "block",
    borderRadius: 4,
    backgroundColor: ({ t }) => t.panelAlt,
    backgroundImage: ({ t }) => `linear-gradient(90deg, ${t.panelAlt} 0%, ${t.lineSoft} 50%, ${t.panelAlt} 100%)`,
    backgroundSize: "200% 100%",
    animation: "$shimmer 1.6s ease-in-out infinite",
    "@media (prefers-reduced-motion: reduce)": { animation: "none" }
  },
  "@keyframes shimmer": { "0%": { backgroundPosition: "100% 0" }, "100%": { backgroundPosition: "-100% 0" } },
  page: { display: "flex", flexDirection: "column", gap: 16 },
  head: { display: "flex", flexDirection: "column", gap: 8 },
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  tile: {
    height: 68,
    boxSizing: "border-box",
    padding: 12,
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panel,
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  panel: {
    padding: 14,
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panel,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  row: { display: "grid", gridTemplateColumns: "90px 1fr 140px", gap: 12 },
  caption: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textLo },
  detail: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, overflowWrap: "anywhere", marginTop: 6 }
}));
function useLoad() {
  const t = useHangarTokens();
  return useStyles({ t });
}
function Skeleton({ width = "100%", height = 12 }) {
  const c = useLoad();
  return /* @__PURE__ */ jsx("span", { className: c.bone, style: { width, height }, "aria-hidden": true });
}
function PanelSkeleton({ rows = 4, label, announce = true }) {
  const c = useLoad();
  return /* @__PURE__ */ jsxs("div", { className: c.panel, role: announce ? "status" : void 0, "aria-label": announce ? label ?? "Loading" : void 0, children: [
    Array.from({ length: rows }, (_, i) => /* @__PURE__ */ jsxs("div", { className: c.row, children: [
      /* @__PURE__ */ jsx(Skeleton, {}),
      /* @__PURE__ */ jsx(Skeleton, { width: `${85 - i * 9}%` }),
      /* @__PURE__ */ jsx(Skeleton, {})
    ] }, i)),
    label && /* @__PURE__ */ jsx("span", { className: c.caption, children: label })
  ] });
}
function TabSkeleton({ label }) {
  const c = useLoad();
  return /* @__PURE__ */ jsxs("div", { className: c.page, role: "status", "aria-label": label ?? "Loading", children: [
    /* @__PURE__ */ jsxs("div", { className: c.head, children: [
      /* @__PURE__ */ jsx(Skeleton, { width: 200, height: 18 }),
      /* @__PURE__ */ jsx(Skeleton, { width: 420, height: 12 })
    ] }),
    /* @__PURE__ */ jsx("div", { className: c.tiles, children: [0, 1, 2].map((i) => /* @__PURE__ */ jsxs("div", { className: c.tile, children: [
      /* @__PURE__ */ jsx(Skeleton, { width: "45%", height: 10 }),
      /* @__PURE__ */ jsx(Skeleton, { width: "70%", height: 16 })
    ] }, i)) }),
    /* @__PURE__ */ jsx(PanelSkeleton, { rows: 5, label, announce: false })
  ] });
}
function firstLine(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n")[0];
}
function TabError({ error, what = "this tab", onRetry }) {
  const c = useLoad();
  const [open, setOpen] = useState(false);
  const full = error instanceof Error ? error.message : String(error);
  return /* @__PURE__ */ jsxs(Callout, { tone: "bad", title: `Couldn't load ${what}`, actions: onRetry ? /* @__PURE__ */ jsx(Button, { small: true, onClick: onRetry, children: "Retry" }) : void 0, children: [
    firstLine(error),
    full !== firstLine(error) && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx(TextLink, { expanded: open, onClick: () => setOpen((v) => !v), children: "Details" }),
      open && /* @__PURE__ */ jsx("div", { className: c.detail, children: full })
    ] })
  ] });
}

export { PanelSkeleton, Skeleton, TabError, TabSkeleton };
//# sourceMappingURL=LoadState.esm.js.map

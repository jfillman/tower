import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { fmtDuration, stateLabel } from './shared.esm.js';

const useStyles = makeStyles(() => ({
  strip: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderLeft: ({ t }) => `3px solid ${t.sky}`,
    borderRadius: 5,
    backgroundColor: ({ t }) => t.panel,
    padding: "12px 14px",
    marginBottom: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  label: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: ({ t }) => t.textFaint,
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  badge: {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 600,
    padding: "1px 7px",
    borderRadius: 10,
    backgroundColor: ({ t }) => t.amber,
    color: ({ t }) => t.bg
  },
  link: {
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.sky,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    "&:hover": { textDecoration: "underline" }
  },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(140px, 1.1fr) minmax(160px, 2fr) minmax(130px, 1.2fr) 64px",
    gap: 16,
    alignItems: "center",
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    "&:hover": { outline: ({ t }) => `1px solid ${t.skyLine}` },
    "@media (max-width: 700px)": { gridTemplateColumns: "1fr auto" }
  },
  name: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 15,
    overflowWrap: "anywhere"
  },
  cur: {
    fontSize: 12.5,
    color: ({ t }) => t.textLo,
    minWidth: 0,
    "@media (max-width: 700px)": { display: "none" }
  },
  curMain: { display: "block", color: ({ t }) => t.textHi, fontWeight: 500 },
  eta: {
    fontFamily: fontMono,
    fontSize: 15,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums"
  },
  etaSub: {
    display: "block",
    fontSize: 10,
    letterSpacing: "0.08em",
    color: ({ t }) => t.textFaint
  },
  segs: {
    display: "flex",
    gap: 3,
    height: 6,
    "@media (max-width: 700px)": { gridColumn: "1 / -1", order: 3 }
  },
  seg: {
    flex: 1,
    borderRadius: 1,
    overflow: "hidden",
    backgroundColor: ({ t }) => t.line
  }
}));
function SegmentBar({
  item,
  classes,
  t
}) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: classes.segs,
      role: "img",
      "aria-label": `${item.derived.steps.filter((s) => s.state === "done").length} of ${item.derived.steps.length} steps done`,
      children: item.derived.steps.map((s) => {
        let fill = t.sky;
        if (s.state === "done") fill = t.good;
        else if (s.state === "fail") fill = t.bad;
        return /* @__PURE__ */ jsx("i", { className: classes.seg, title: `${s.title}: ${stateLabel[s.state]}`, children: /* @__PURE__ */ jsx(
          "b",
          {
            style: {
              display: "block",
              height: "100%",
              width: `${Math.round(s.fraction * 100)}%`,
              backgroundColor: fill
            }
          }
        ) }, s.id);
      })
    }
  );
}
function ProvisioningStrip({ items, onOpen }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (items.length === 0) return null;
  return /* @__PURE__ */ jsxs("section", { className: classes.strip, "aria-label": "Provisioning in flight", children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("span", { className: classes.label, children: [
        "In flight ",
        /* @__PURE__ */ jsx("span", { className: classes.badge, children: items.length })
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.link, onClick: () => onOpen(items[0].inputs.xr.name), children: "View all in Provisioning \u2192" })
    ] }),
    items.map((item) => {
      const { derived, inputs } = item;
      const running = derived.steps.find((s) => s.state === "run" || s.state === "fail");
      let etaLabel = fmtDuration(derived.etaSec);
      let etaCaption = "REMAINING";
      if (derived.complete) {
        etaLabel = "Ready";
        etaCaption = "DONE";
      } else if (derived.failed) {
        etaLabel = "Failed";
        etaCaption = "NEEDS ATTENTION";
      }
      const doneCount = derived.steps.filter((s) => s.state === "done").length;
      return /* @__PURE__ */ jsxs("button", { type: "button", className: classes.row, onClick: () => onOpen(inputs.xr.name), children: [
        /* @__PURE__ */ jsx("span", { className: classes.name, children: inputs.xr.name }),
        /* @__PURE__ */ jsx(SegmentBar, { item, classes, t }),
        /* @__PURE__ */ jsxs("span", { className: classes.cur, children: [
          /* @__PURE__ */ jsx("span", { className: classes.curMain, children: derived.complete ? "All steps done" : running?.title ?? "Starting" }),
          doneCount,
          " of ",
          derived.steps.length,
          " steps"
        ] }),
        /* @__PURE__ */ jsxs("span", { className: classes.eta, children: [
          etaLabel,
          /* @__PURE__ */ jsx("span", { className: classes.etaSub, children: etaCaption })
        ] })
      ] }, inputs.xr.name);
    })
  ] });
}

export { ProvisioningStrip, SegmentBar };
//# sourceMappingURL=ProvisioningStrip.esm.js.map

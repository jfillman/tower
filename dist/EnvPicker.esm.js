import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import FlightIcon from '@material-ui/icons/Flight';
import TerrainIcon from '@material-ui/icons/Terrain';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { TallArrow } from './SignalRail.esm.js';
import { preventFocusScroll } from './preventFocusScroll.esm.js';
import { ImageTagPill } from './tabs/deployments/ImageTagPill.esm.js';
import { ENV_TIER_LABEL } from './types.esm.js';

const useEnvPickerStyles = makeStyles(() => ({
  envBarWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "10px 12px",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 8,
    backgroundColor: ({ t }) => t.panel
  },
  envBarSummary: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  tierRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  tierConnector: { display: "flex", alignItems: "center", gap: 6, padding: "1px 0 1px 42px" },
  tierConnectorArrow: { color: ({ t }) => t.amber, display: "flex" },
  tierConnectorLabel: { fontFamily: fontMono, fontSize: 9.5, color: ({ t }) => t.textFaint, fontStyle: "italic" },
  tierLabel: {
    fontFamily: fontMono,
    fontSize: 9.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: ({ t }) => t.textFaint,
    flexShrink: 0,
    width: 42
  },
  envItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderRadius: 20,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    cursor: "pointer",
    textAlign: "left",
    "&:hover": { backgroundColor: ({ t }) => t.bg }
  },
  envItemActive: { backgroundColor: ({ t }) => t.skySoft, borderColor: ({ t }) => t.skyLine },
  envItemIncoming: { borderColor: ({ t }) => t.amberLine },
  envItemUpper: {
    borderRadius: 6,
    borderTopWidth: 3,
    borderTopColor: ({ t }) => t.textHi
  },
  // Preview envs are ephemeral, second-class citizens compared to a real
  // Ground/Flight environment - dashed border + reduced opacity says that
  // at a glance, matching the treatment the old per-env Topology cards used.
  envItemPreview: { borderStyle: "dashed", opacity: 0.82 },
  tierIcon: { flexShrink: 0, display: "flex", color: ({ t }) => t.textFaint, opacity: 0.7, fontSize: 14 },
  envName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi, lineHeight: 1.3 },
  envMeta: { display: "flex", flexDirection: "column", gap: 1 },
  envCluster: { fontFamily: fontMono, fontSize: 9.5, color: ({ t }) => t.textFaint },
  envImageRow: { display: "flex", alignItems: "center", gap: 4, marginTop: 1 },
  incomingTag: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.amberInk, fontWeight: 700 },
  statusDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  tierArrow: { color: ({ t }) => t.amber, flexShrink: 0, display: "flex" }
}));
function dotColor(t, h) {
  if (h === "healthy") return t.good;
  if (h === "progressing" || h === "paused") return t.amber;
  return t.bad;
}
function tierIconFor(tier) {
  if (tier === "upper") return /* @__PURE__ */ jsx(FlightIcon, { fontSize: "inherit" });
  if (tier === "preview") return /* @__PURE__ */ jsx(HourglassEmptyIcon, { fontSize: "inherit" });
  return /* @__PURE__ */ jsx(TerrainIcon, { fontSize: "inherit" });
}
function EnvPicker({
  groups,
  summary,
  showConnectors = true
}) {
  const t = useHangarTokens();
  const classes = useEnvPickerStyles({ t });
  return /* @__PURE__ */ jsxs("div", { className: classes.envBarWrap, children: [
    summary && /* @__PURE__ */ jsx("span", { className: classes.envBarSummary, children: summary }),
    groups.map((g, gi) => /* @__PURE__ */ jsxs("div", { style: { display: "contents" }, children: [
      showConnectors && gi > 0 && /* @__PURE__ */ jsxs("div", { className: classes.tierConnector, children: [
        (g.showConnectorArrow ?? true) && /* @__PURE__ */ jsx("span", { className: classes.tierConnectorArrow, children: /* @__PURE__ */ jsx(TallArrow, { size: 16, rotate: 90 }) }),
        /* @__PURE__ */ jsx("span", { className: classes.tierConnectorLabel, children: g.connectorLabel ?? "promotes to" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.tierRow, children: [
        /* @__PURE__ */ jsx("span", { className: classes.tierLabel, children: ENV_TIER_LABEL[g.tier] }),
        g.items.map((item, i) => /* @__PURE__ */ jsxs("div", { style: { display: "contents" }, children: [
          showConnectors && i > 0 && /* @__PURE__ */ jsx("span", { className: classes.tierArrow, children: /* @__PURE__ */ jsx(TallArrow, { size: 16 }) }),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              className: `${classes.envItem} ${g.tier === "upper" ? classes.envItemUpper : ""} ${g.tier === "preview" ? classes.envItemPreview : ""} ${item.active ? classes.envItemActive : ""} ${item.incoming ? classes.envItemIncoming : ""}`,
              onMouseDown: preventFocusScroll,
              onClick: item.onClick,
              children: [
                /* @__PURE__ */ jsx("span", { className: classes.statusDot, style: { backgroundColor: dotColor(t, item.health) }, title: item.health }),
                /* @__PURE__ */ jsx("span", { className: classes.tierIcon, title: ENV_TIER_LABEL[g.tier], children: tierIconFor(g.tier) }),
                /* @__PURE__ */ jsxs("span", { className: classes.envMeta, children: [
                  /* @__PURE__ */ jsx("span", { className: classes.envName, children: item.envName }),
                  /* @__PURE__ */ jsx("span", { className: classes.envCluster, children: item.cluster }),
                  item.imageTag && /* @__PURE__ */ jsxs("span", { className: classes.envImageRow, children: [
                    item.incoming && /* @__PURE__ */ jsx("span", { className: classes.incomingTag, children: "\u21E2" }),
                    /* @__PURE__ */ jsx(ImageTagPill, { tag: item.imageTag, nickname: item.imageNickname, size: "small" })
                  ] })
                ] })
              ]
            }
          )
        ] }, item.key))
      ] })
    ] }, g.tier))
  ] });
}

export { EnvPicker, useEnvPickerStyles };
//# sourceMappingURL=EnvPicker.esm.js.map

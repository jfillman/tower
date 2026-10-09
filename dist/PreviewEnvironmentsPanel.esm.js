import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { relativeTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { TowerEmptyState } from './TowerEmptyState.esm.js';
import { PrButton } from './PrButton.esm.js';
import { health, previewPrNumber, imageTag } from './types.esm.js';
import { StatusChip, healthTone } from './ui/index.esm.js';

const useStyles = makeStyles(() => ({
  wrap: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 5, overflow: "hidden" },
  head: { padding: "14px 20px", borderBottom: ({ t }) => `1px solid ${t.lineSoft}` },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  sub: { fontSize: 12, color: ({ t }) => t.textLo, marginTop: 2 },
  card: {
    margin: "16px 20px",
    border: ({ t }) => `1px dashed ${t.skyLine}`,
    borderRadius: 5,
    padding: "14px 18px",
    backgroundColor: ({ t }) => t.panelAlt
  },
  cardStale: { borderColor: ({ t }) => t.line, opacity: 0.75 },
  top: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  name: { fontFamily: fontMono, fontWeight: 700, fontSize: 13, color: ({ t }) => t.sky },
  nameStale: { color: ({ t }) => t.textFaint },
  meta: { fontSize: 11.5, color: ({ t }) => t.textFaint },
  facts: { marginTop: 8, fontSize: 11.5, color: ({ t }) => t.textLo },
  pillPos: { marginLeft: "auto" }
}));
const STALE_MS = 5 * 24 * 60 * 60 * 1e3;
function PreviewEnvironmentsPanel({
  previewEnvironments,
  sourcePrs
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (previewEnvironments.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: classes.wrap, children: /* @__PURE__ */ jsx(
      TowerEmptyState,
      {
        title: "No preview environments running",
        description: "Preview environments spin up automatically for open source PRs on repos configured for it."
      }
    ) });
  }
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Preview environments" }),
      /* @__PURE__ */ jsxs(Typography, { className: classes.sub, children: [
        "Spawned per open source PR, not part of the promotion order - ",
        previewEnvironments.length,
        " running."
      ] })
    ] }),
    previewEnvironments.map((env) => {
      const h = health(env);
      const stale = env.deployedAt && Date.now() - new Date(env.deployedAt).getTime() > STALE_MS;
      const pr = sourcePrs.find((p) => p.number === previewPrNumber(env.env));
      return /* @__PURE__ */ jsxs("div", { className: `${classes.card} ${stale ? classes.cardStale : ""}`, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.top, children: [
          /* @__PURE__ */ jsx("span", { className: `${classes.name} ${stale ? classes.nameStale : ""}`, children: env.env }),
          /* @__PURE__ */ jsxs("span", { className: classes.meta, children: [
            "spun up ",
            relativeTime(env.deployedAt),
            " \xB7 ",
            imageTag(env.image)
          ] }),
          /* @__PURE__ */ jsx(StatusChip, { tone: healthTone(h), dot: true, className: classes.pillPos, children: h })
        ] }),
        pr && /* @__PURE__ */ jsx("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx(PrButton, { pr }) }),
        /* @__PURE__ */ jsxs(Typography, { className: classes.facts, children: [
          env.cluster,
          " / ",
          env.namespace,
          stale ? " \xB7 no traffic recently - a candidate for manual cleanup" : " \xB7 cleans up automatically when the source PR merges or closes"
        ] })
      ] }, env.key);
    })
  ] });
}

export { PreviewEnvironmentsPanel };
//# sourceMappingURL=PreviewEnvironmentsPanel.esm.js.map

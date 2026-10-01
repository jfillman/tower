import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { fontDisplay, fontMono, useHangarTokens } from './brand/tokens.esm.js';

const useStyles = makeStyles(() => ({
  wrap: { maxWidth: 560, margin: "0 auto", padding: "48px 24px" },
  back: {
    fontFamily: fontMono,
    fontSize: 11.5,
    letterSpacing: "0.04em",
    color: ({ t }) => t.textFaint,
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    marginBottom: 16,
    "&:hover": { color: ({ t }) => t.textHi }
  },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 24, color: ({ t }) => t.textHi, marginBottom: 8 },
  body: { fontSize: 14, color: ({ t }) => t.textLo, lineHeight: 1.6 }
}));
function AutopilotPlaceholder({ entity, onBack }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsx("button", { type: "button", className: classes.back, onClick: onBack, children: "\u2190 All services" }),
    /* @__PURE__ */ jsx(Typography, { className: classes.title, children: entity.metadata.title ?? entity.metadata.name }),
    /* @__PURE__ */ jsx(Typography, { className: classes.body, children: "This is an AI workload. Its runs, Clearance policy and planner are managed by the Autopilot plugin, which is not installed in this Tower yet." })
  ] });
}

export { AutopilotPlaceholder };
//# sourceMappingURL=AutopilotPlaceholder.esm.js.map

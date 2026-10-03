import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { useEntity } from '@backstage/plugin-catalog-react';
import { fontDisplay, useHangarTokens } from './brand/tokens.esm.js';

const useStyles = makeStyles(() => ({
  wrap: { maxWidth: 560, margin: "0 auto", padding: "48px 24px" },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 24, color: ({ t }) => t.textHi, marginBottom: 8 },
  body: { fontSize: 14, color: ({ t }) => t.textLo, lineHeight: 1.6 }
}));
function AutopilotPlaceholder() {
  const { entity } = useEntity();
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.title, children: entity.metadata.title ?? entity.metadata.name }),
    /* @__PURE__ */ jsx(Typography, { className: classes.body, children: "This is an AI workload. Its runs, Clearance policy and planner are not built into Tower yet." })
  ] });
}

export { AutopilotPlaceholder };
//# sourceMappingURL=AutopilotPlaceholder.esm.js.map

import { jsxs, jsx } from 'react/jsx-runtime';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import { fontDisplay, fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { HangarMark } from './brand/HangarMark.esm.js';

const useStyles = makeStyles(() => ({
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 14,
    padding: "64px 24px",
    maxWidth: 460,
    marginLeft: "auto",
    marginRight: "auto"
  },
  markWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: "50%",
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    marginBottom: 4
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint
  },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 16, color: ({ t }) => t.textHi },
  description: { fontSize: 12.5, color: ({ t }) => t.textLo, lineHeight: 1.5 }
}));
function TowerEmptyState({
  title,
  description,
  glyph = "tower"
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsx("div", { className: classes.markWrap, children: /* @__PURE__ */ jsx(HangarMark, { glyph, size: 30 }) }),
    /* @__PURE__ */ jsx("span", { className: classes.eyebrow, children: "Hangar \xB7 Tower" }),
    /* @__PURE__ */ jsx(Typography, { className: classes.title, children: title }),
    description && /* @__PURE__ */ jsx(Typography, { className: classes.description, children: description })
  ] });
}

export { TowerEmptyState };
//# sourceMappingURL=TowerEmptyState.esm.js.map

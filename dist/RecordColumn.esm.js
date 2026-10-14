import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontDisplay, useHangarTokens } from './brand/tokens.esm.js';

const useStyles = makeStyles(() => ({
  col: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, backgroundColor: ({ t }) => t.panel, overflow: "hidden", minWidth: 0 },
  colHead: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "6px 12px",
    padding: "12px 15px",
    borderBottom: ({ t }) => `1px solid ${t.line}`
  },
  colTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: ({ t }) => t.textHi },
  colBody: { padding: "14px 15px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }
}));
function RecordColumn({ title, strip, meta, children }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return /* @__PURE__ */ jsxs("div", { className: classes.col, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.colHead, style: { borderTop: `3px solid ${strip}` }, children: [
      /* @__PURE__ */ jsx("span", { className: classes.colTitle, children: title }),
      meta
    ] }),
    /* @__PURE__ */ jsx("div", { className: classes.colBody, children })
  ] });
}

export { RecordColumn };
//# sourceMappingURL=RecordColumn.esm.js.map

import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import RefreshIcon from '@material-ui/icons/Refresh';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';

const useStyles = makeStyles(() => ({
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    "&:hover": { color: ({ t }) => t.sky }
  }
}));
function RefreshButton({ onClick, label = "Refresh" }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return /* @__PURE__ */ jsxs("button", { type: "button", className: classes.btn, onClick, title: "Re-fetch PR, deploy-history, and image data", children: [
    /* @__PURE__ */ jsx(RefreshIcon, { style: { fontSize: 14 } }),
    label
  ] });
}

export { RefreshButton };
//# sourceMappingURL=RefreshButton.esm.js.map

import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogActions from '@material-ui/core/DialogActions';
import Link from '@material-ui/core/Link';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { TextLink, Button } from './ui/index.esm.js';

const useStyles = makeStyles(() => ({
  paper: {
    backgroundColor: ({ t }) => t.panel,
    backgroundImage: "none",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6
  },
  title: { fontFamily: fontDisplay, fontWeight: 700, color: ({ t }) => t.textHi, borderBottom: ({ t }) => `1px solid ${t.lineSoft}` },
  text: { color: ({ t }) => t.textLo },
  error: { color: ({ t }) => t.bad },
  link: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.sky, wordBreak: "break-all" }
}));
function PrResultDialog({
  result,
  error,
  onClose
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return /* @__PURE__ */ jsxs(Dialog, { open: Boolean(result || error), onClose, PaperProps: { className: classes.paper }, children: [
    /* @__PURE__ */ jsx(DialogTitle, { className: classes.title, children: error ? "Couldn't open PR" : "Pull request" }),
    /* @__PURE__ */ jsx(DialogContent, { children: error ? /* @__PURE__ */ jsx(DialogContentText, { className: classes.error, children: error }) : /* @__PURE__ */ jsxs(DialogContentText, { className: classes.text, children: [
      result?.alreadyOpen ? "A PR for this exact change is already open:" : "PR opened:",
      /* @__PURE__ */ jsx("br", {}),
      /* @__PURE__ */ jsx(Link, { className: classes.link, href: result?.prUrl, target: "_blank", rel: "noopener noreferrer", children: result?.prUrl })
    ] }) }),
    /* @__PURE__ */ jsxs(DialogActions, { children: [
      result && /* @__PURE__ */ jsx(TextLink, { href: result.prUrl, children: "View PR \u2197" }),
      /* @__PURE__ */ jsx(Button, { onClick: onClose, children: "Close" })
    ] })
  ] });
}

export { PrResultDialog };
//# sourceMappingURL=PrResultDialog.esm.js.map

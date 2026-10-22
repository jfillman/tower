import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import Divider from '@material-ui/core/Divider';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { fontMono, fontBody, useHangarTokens } from '../brand/tokens.esm.js';
import { Button } from './index.esm.js';

const useStyles = makeStyles(() => ({
  paper: {
    minWidth: 260,
    marginTop: 4,
    backgroundColor: ({ t }) => t.panel,
    backgroundImage: "none",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
  },
  item: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontFamily: fontBody,
    fontSize: 13,
    color: ({ t }) => t.textHi,
    padding: "7px 12px"
  },
  off: { color: ({ t }) => t.textFaint, cursor: "not-allowed" },
  danger: { color: ({ t }) => t.bad },
  hint: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textLo },
  divider: { backgroundColor: ({ t }) => t.line, margin: "4px 0" }
}));
function MenuButton({ label = "More", actions, small = true }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [anchor, setAnchor] = useState(null);
  const items = [];
  actions.forEach((a, i) => {
    if (a.group && i > 0) items.push(/* @__PURE__ */ jsx(Divider, { className: classes.divider }, `${a.key}-divider`));
    items.push(
      // Not MUI's `disabled`: that sets pointer-events none, and the tooltip saying why would never show.
      /* @__PURE__ */ jsxs(
        MenuItem,
        {
          className: [classes.item, a.danger ? classes.danger : "", a.disabled ? classes.off : ""].join(" ").trim(),
          "aria-disabled": a.disabled || void 0,
          title: a.title,
          onClick: () => {
            if (a.disabled) return;
            setAnchor(null);
            a.onSelect();
          },
          children: [
            /* @__PURE__ */ jsx("span", { children: a.label }),
            a.hint && /* @__PURE__ */ jsx("span", { className: classes.hint, children: a.hint })
          ]
        },
        a.key
      )
    );
  });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Button, { small, "aria-haspopup": "menu", "aria-expanded": Boolean(anchor), onClick: (e) => setAnchor(e.currentTarget), children: [
      label,
      /* @__PURE__ */ jsx(ExpandMoreIcon, { style: { fontSize: 15, marginRight: -3 } })
    ] }),
    /* @__PURE__ */ jsx(
      Menu,
      {
        anchorEl: anchor,
        open: Boolean(anchor),
        onClose: () => setAnchor(null),
        getContentAnchorEl: null,
        anchorOrigin: { vertical: "bottom", horizontal: "right" },
        transformOrigin: { vertical: "top", horizontal: "right" },
        PaperProps: { className: classes.paper },
        disableScrollLock: true,
        children: items
      }
    )
  ] });
}

export { MenuButton };
//# sourceMappingURL=MenuButton.esm.js.map

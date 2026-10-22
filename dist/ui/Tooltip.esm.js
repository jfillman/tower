import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Tooltip$1 from '@material-ui/core/Tooltip';
import LockIcon from '@material-ui/icons/LockOutlined';
import { fontMono, fontBody, useHangarTokens } from '../brand/tokens.esm.js';

const useStyles = makeStyles(() => ({
  tip: {
    backgroundColor: ({ t }) => t.textHi,
    color: ({ t }) => t.bg,
    fontFamily: fontBody,
    fontSize: 12,
    lineHeight: 1.45,
    padding: "8px 10px",
    borderRadius: 6,
    maxWidth: 340,
    whiteSpace: "pre-line",
    boxShadow: "0 10px 28px rgba(0,0,0,0.25)"
  },
  reason: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    fontFamily: fontBody,
    fontSize: 13,
    lineHeight: 1.45
  },
  reasonIcon: { fontSize: 15, marginTop: 1, color: ({ t }) => t.textLo, flexShrink: 0 },
  reasonActions: { display: "flex", gap: 14, marginTop: 4, fontFamily: fontMono, fontSize: 12 }
}));
function Tooltip({ title, children }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  if (!title) return children;
  const disabled = Boolean(children.props.disabled);
  const target = typeof children.type === "string" && !disabled ? children : /* @__PURE__ */ jsx("span", { style: { display: "inline-flex" }, tabIndex: disabled ? 0 : void 0, children });
  return /* @__PURE__ */ jsx(Tooltip$1, { title, enterDelay: 300, enterNextDelay: 150, classes: { tooltip: c.tip }, placement: "bottom", children: target });
}
function ActionReason({ id, children, actions }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  return /* @__PURE__ */ jsxs("div", { id, className: c.reason, children: [
    /* @__PURE__ */ jsx(LockIcon, { className: c.reasonIcon, "aria-hidden": true }),
    /* @__PURE__ */ jsxs("div", { children: [
      children,
      actions && /* @__PURE__ */ jsx("div", { className: c.reasonActions, children: actions })
    ] })
  ] });
}

export { ActionReason, Tooltip };
//# sourceMappingURL=Tooltip.esm.js.map

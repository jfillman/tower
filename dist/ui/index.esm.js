import { jsxs, jsx } from 'react/jsx-runtime';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { preventFocusScroll } from '../preventFocusScroll.esm.js';
import { useUi } from './styles.esm.js';

const cx = (...c) => c.filter(Boolean).join(" ");
function useKit() {
  const t = useHangarTokens();
  return { t, ui: useUi({ t }) };
}
function PageHeader({ title, subtitle, actions }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.pageHead, children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { className: ui.pageTitle, children: title }),
      subtitle && /* @__PURE__ */ jsx("p", { className: ui.pageSub, children: subtitle })
    ] }),
    actions && /* @__PURE__ */ jsx("div", { className: ui.pageActions, children: actions })
  ] });
}
function Panel({ accent, className, children, ...rest }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("div", { className: cx(ui.panel, accent && ui.panelAccent, className), ...rest, children });
}
function SectionLabel({ children }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("h2", { className: ui.sectionLabel, children });
}
function ColumnLabel({ children }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("span", { className: ui.columnLabel, children });
}
function Button({
  variant = "default",
  small,
  className,
  type = "button",
  ...rest
}) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx(
    "button",
    {
      type,
      onMouseDown: preventFocusScroll,
      className: cx(ui.button, variant === "primary" && ui.buttonPrimary, variant === "danger" && ui.buttonDanger, small && ui.buttonSmall, className),
      ...rest
    }
  );
}
function IconButton({ className, type = "button", ...rest }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("button", { type, onMouseDown: preventFocusScroll, className: cx(ui.iconButton, className), ...rest });
}
function Chip({ tone = "neutral", children }) {
  const { ui } = useKit();
  const toneClass = { neutral: void 0, ground: ui.chipGround, flight: ui.chipFlight, ok: ui.chipOk, bad: ui.chipBad }[tone];
  return /* @__PURE__ */ jsx("span", { className: cx(ui.chip, toneClass), children });
}
function TierChip({ tier }) {
  return /* @__PURE__ */ jsx(Chip, { tone: tier, children: tier === "flight" ? "Flight" : "Ground" });
}
function Segmented({
  label,
  options,
  value,
  onChange
}) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("div", { className: ui.segmented, role: "group", "aria-label": label, children: options.map((o) => /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      "aria-pressed": o.id === value,
      onMouseDown: preventFocusScroll,
      className: cx(ui.segment, o.id === value && ui.segmentOn),
      onClick: () => onChange(o.id),
      children: [
        o.label,
        o.count !== void 0 ? ` ${o.count}` : ""
      ]
    },
    o.id
  )) });
}
function Subtabs({
  label,
  tabs,
  value,
  onChange
}) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("div", { className: ui.subtabs, role: "tablist", "aria-label": label, children: tabs.map((tab) => /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      role: "tab",
      "aria-selected": tab.id === value,
      onMouseDown: preventFocusScroll,
      className: cx(ui.subtab, tab.id === value && ui.subtabOn),
      onClick: () => onChange(tab.id),
      children: tab.label
    },
    tab.id
  )) });
}
function healthColor(h, t) {
  switch (h) {
    case "healthy":
      return t.good;
    case "degraded":
      return t.bad;
    case "progressing":
      return t.sky;
    case "paused":
      return t.amber;
    default:
      return t.textFaint;
  }
}
const HEALTH_LABEL = {
  healthy: "Healthy",
  progressing: "Progressing",
  paused: "Paused",
  degraded: "Degraded",
  unknown: "Unknown"
};
function StatusDot({ health }) {
  const { t, ui } = useKit();
  return /* @__PURE__ */ jsx("i", { className: ui.dot, style: { backgroundColor: healthColor(health, t) }, role: "img", "aria-label": health });
}
function Field({
  id,
  label,
  source,
  children
}) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.field, children: [
    /* @__PURE__ */ jsxs("label", { htmlFor: id, className: ui.fieldLabel, children: [
      label,
      source && /* @__PURE__ */ jsx("span", { className: cx(ui.fieldSource, source.set && ui.fieldSourceSet), children: source.text })
    ] }),
    children({ id, className: ui.input })
  ] });
}

export { Button, Chip, ColumnLabel, Field, HEALTH_LABEL, IconButton, PageHeader, Panel, SectionLabel, Segmented, StatusDot, Subtabs, TierChip, healthColor };
//# sourceMappingURL=index.esm.js.map

import { jsx, jsxs } from 'react/jsx-runtime';
import SearchIcon from '@material-ui/icons/Search';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { preventFocusScroll, keepAnchored } from '../preventFocusScroll.esm.js';
import { useUi, useControls } from './styles.esm.js';

const cx = (...c) => c.filter(Boolean).join(" ");
function useKit() {
  const t = useHangarTokens();
  return { t, ui: useUi({ t }) };
}
function useControlsKit() {
  const t = useHangarTokens();
  return useControls({ t });
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
function ActionSelect({
  label,
  options,
  onSelect
}) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsxs(
    "select",
    {
      "aria-label": label,
      className: cx(ui.button, ui.buttonSmall),
      value: "",
      onChange: (e) => {
        if (e.target.value) onSelect(e.target.value);
      },
      children: [
        /* @__PURE__ */ jsxs("option", { value: "", disabled: true, children: [
          label,
          " \u25BE"
        ] }),
        options.map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value))
      ]
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
function FilterChips({
  label,
  hideLabel,
  options,
  value,
  onChange
}) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.filterGroup, role: "group", "aria-label": label, children: [
    !hideLabel && /* @__PURE__ */ jsx("span", { className: ui.filterLabel, children: label }),
    options.map((o) => /* @__PURE__ */ jsx(ChipButton, { ui, on: o.id === value, count: o.count, title: o.title, onClick: () => onChange(o.id), children: o.label }, o.id))
  ] });
}
function ChipButton({ ui, on, count, title, onClick, children }) {
  return /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      "aria-pressed": on,
      title,
      onMouseDown: preventFocusScroll,
      className: cx(ui.filterChip, on && ui.filterChipOn),
      onClick: (e) => keepAnchored(e.currentTarget, onClick),
      children: [
        children,
        count !== void 0 && " ",
        count !== void 0 && /* @__PURE__ */ jsx("span", { className: cx(ui.filterCount, on && ui.filterCountOn), children: count })
      ]
    }
  );
}
function FilterChip(props) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsx(ChipButton, { ui, ...props });
}
function FilterGroup({ label, hideLabel, children }) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.filterGroup, role: "group", "aria-label": label, children: [
    !hideLabel && /* @__PURE__ */ jsx("span", { className: ui.filterLabel, children: label }),
    children
  ] });
}
function FilterSelect({
  label,
  value,
  options,
  onChange
}) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("label", { className: ui.filterGroup, children: [
    /* @__PURE__ */ jsx("span", { className: ui.filterLabel, children: label }),
    /* @__PURE__ */ jsx("select", { className: ui.select, value, onChange: (e) => onChange(e.target.value), children: options.map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value)) })
  ] });
}
function SearchField({
  label,
  placeholder,
  value,
  onChange
}) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.search, children: [
    /* @__PURE__ */ jsx(SearchIcon, { className: ui.searchIcon, "aria-hidden": true }),
    /* @__PURE__ */ jsx(
      "input",
      {
        type: "search",
        "aria-label": label,
        className: ui.searchInput,
        placeholder,
        value,
        onChange: (e) => onChange(e.target.value)
      }
    )
  ] });
}
function FilterBar({ children, end }) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.filterBar, children: [
    children,
    end && /* @__PURE__ */ jsx("div", { className: ui.filterBarEnd, children: end })
  ] });
}
function TextLink({
  href,
  onClick,
  title,
  expanded,
  children
}) {
  const ui = useControlsKit();
  if (href) {
    return /* @__PURE__ */ jsx("a", { className: ui.textLink, href, target: "_blank", rel: "noopener noreferrer", title, children });
  }
  return /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      className: ui.textLink,
      title,
      "aria-expanded": expanded,
      onMouseDown: preventFocusScroll,
      onClick,
      children: [
        expanded !== void 0 && /* @__PURE__ */ jsx("span", { "aria-hidden": true, children: expanded ? "\u25BE" : "\u25B8" }),
        children
      ]
    }
  );
}
function Subtabs({
  label,
  tabs,
  value,
  onChange
}) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("div", { className: ui.subtabs, role: "tablist", "aria-label": label, children: tabs.map((tab) => /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      role: "tab",
      "aria-selected": tab.id === value,
      onMouseDown: preventFocusScroll,
      className: cx(ui.subtab, tab.id === value && ui.subtabOn),
      onClick: (e) => keepAnchored(e.currentTarget, () => onChange(tab.id)),
      children: [
        tab.label,
        tab.marked && /* @__PURE__ */ jsx("i", { className: ui.marker, role: "img", "aria-label": "has staged changes" })
      ]
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

export { ActionSelect, Button, Chip, ColumnLabel, Field, FilterBar, FilterChip, FilterChips, FilterGroup, FilterSelect, HEALTH_LABEL, IconButton, PageHeader, Panel, SearchField, SectionLabel, StatusDot, Subtabs, TextLink, TierChip, healthColor };
//# sourceMappingURL=index.esm.js.map

import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { forwardRef } from 'react';
import SearchIcon from '@material-ui/icons/Search';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { preventFocusScroll, keepAnchored } from '../preventFocusScroll.esm.js';
import { useUi, useBlocks, useSection, useStatus, useData, useControls } from './styles.esm.js';
export { MenuButton } from './MenuButton.esm.js';
export { ActionReason, Tooltip } from './Tooltip.esm.js';
export { PanelSkeleton, Skeleton, TabError, TabSkeleton } from './LoadState.esm.js';
export { CopyButton, YamlBlock, YamlLine, useCopyText } from './YamlBlock.esm.js';

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
const Panel = forwardRef(
  function Panel2({ accent, className, children, ...rest }, ref) {
    const { ui } = useKit();
    return /* @__PURE__ */ jsx("div", { ref, className: cx(ui.panel, accent && ui.panelAccent, className), ...rest, children });
  }
);
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
function Chip({ tone = "neutral", className, children }) {
  const { ui } = useKit();
  const toneClass = { neutral: void 0, ground: ui.chipGround, flight: ui.chipFlight, ok: ui.chipOk, bad: ui.chipBad, sky: ui.chipSky }[tone];
  return /* @__PURE__ */ jsx("span", { className: cx(ui.chip, toneClass, className), children });
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
function healthTone(h) {
  switch (h) {
    case "healthy":
      return "ok";
    case "degraded":
      return "bad";
    case "progressing":
      return "info";
    case "paused":
      return "warn";
    default:
      return "neutral";
  }
}
function StatusChip({
  tone,
  dot,
  title,
  onClick,
  className,
  children
}) {
  const t = useHangarTokens();
  const s = useStatus({ t });
  const content = /* @__PURE__ */ jsxs(Fragment, { children: [
    dot && /* @__PURE__ */ jsx("i", { className: s.statusDot, "aria-hidden": true }),
    children
  ] });
  if (onClick) {
    return /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        title,
        onMouseDown: preventFocusScroll,
        onClick,
        className: cx(s.status, s[tone], s.statusButton, className),
        children: content
      }
    );
  }
  return /* @__PURE__ */ jsx("span", { title, className: cx(s.status, s[tone], className), children: content });
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
function useSectionKit() {
  const t = useHangarTokens();
  return useSection({ t });
}
function Section({
  title,
  meta,
  count,
  actions,
  framed,
  level = 1,
  className,
  children
}) {
  const s = useSectionKit();
  const Heading = level === 2 ? "h3" : "h2";
  return /* @__PURE__ */ jsxs("section", { className: cx(s.section, framed && s.framed, className), children: [
    /* @__PURE__ */ jsxs("div", { className: cx(s.head, framed && s.headFramed), children: [
      /* @__PURE__ */ jsxs("div", { className: s.headStart, children: [
        /* @__PURE__ */ jsx(Heading, { className: cx(s.title, level === 2 && s.title2), children: title }),
        meta
      ] }),
      (count !== void 0 || actions) && /* @__PURE__ */ jsxs("div", { className: s.headEnd, children: [
        count !== void 0 && /* @__PURE__ */ jsx("span", { className: s.count, children: count }),
        actions
      ] })
    ] }),
    children
  ] });
}
function SectionTitle({ level = 1, children }) {
  const s = useSectionKit();
  const Heading = level === 2 ? "h3" : "h2";
  return /* @__PURE__ */ jsx(Heading, { className: cx(s.title, level === 2 && s.title2), children });
}
function EmptyNote({ inset, className, ...rest }) {
  const s = useSectionKit();
  return /* @__PURE__ */ jsx("p", { className: cx(s.empty, inset && s.inset, className), ...rest });
}
function Hint({ inset, className, ...rest }) {
  const s = useSectionKit();
  return /* @__PURE__ */ jsx("p", { className: cx(s.hint, inset && s.inset, className), ...rest });
}
function Count({ children }) {
  const s = useSectionKit();
  return /* @__PURE__ */ jsx("span", { className: s.count, children });
}
function useDataKit() {
  const t = useHangarTokens();
  return useData({ t });
}
function Fact({ label, inline, title, children }) {
  const d = useDataKit();
  return /* @__PURE__ */ jsxs("div", { className: cx(d.fact, inline && d.factInline), children: [
    /* @__PURE__ */ jsx("span", { className: d.factLabel, children: label }),
    /* @__PURE__ */ jsx("span", { className: cx(d.factValue, inline && d.factValueInline), title, children })
  ] });
}
function FactGrid({ min, row, className, children }) {
  const d = useDataKit();
  const columns = min !== void 0 && !row;
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: cx(d.factGrid, !columns && d.factRow, className),
      style: columns ? { gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` } : void 0,
      children
    }
  );
}
function useTableKit() {
  const d = useDataKit();
  return { table: d.table, th: d.th, td: d.td, rowLink: d.rowLink, rowSelected: d.rowSelected, dense: d.dense };
}
function useBlocksKit() {
  const t = useHangarTokens();
  return useBlocks({ t });
}
const Card = forwardRef(function Card2({ title, meta, actions, level = 2, className, children, ...rest }, ref) {
  const b = useBlocksKit();
  return /* @__PURE__ */ jsxs(Panel, { ref, className: cx(b.card, className), ...rest, children: [
    (title !== void 0 || actions) && /* @__PURE__ */ jsxs("div", { className: b.cardHead, children: [
      /* @__PURE__ */ jsxs("div", { className: b.cardHeadStart, children: [
        title !== void 0 && /* @__PURE__ */ jsx(SectionTitle, { level, children: title }),
        meta
      ] }),
      actions && /* @__PURE__ */ jsx("div", { className: b.cardHeadEnd, children: actions })
    ] }),
    children
  ] });
});
function Tile({ onClick, className, children, ...rest }) {
  const b = useBlocksKit();
  if (onClick) {
    return /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onMouseDown: preventFocusScroll,
        onClick,
        className: cx(b.tile, b.tileLink, className),
        style: { textAlign: "left", font: "inherit", color: "inherit", width: "100%" },
        ...rest,
        children
      }
    );
  }
  return /* @__PURE__ */ jsx("div", { className: cx(b.tile, className), ...rest, children });
}
function Callout({
  tone,
  label,
  title,
  icon,
  actions,
  className,
  children
}) {
  const b = useBlocksKit();
  return /* @__PURE__ */ jsxs("div", { className: cx(b.callout, b[tone], className), role: tone === "bad" ? "alert" : "status", children: [
    icon !== void 0 && /* @__PURE__ */ jsx("span", { className: b.calloutIcon, "aria-hidden": true, children: /* @__PURE__ */ jsx("span", { className: b.calloutIconGlyph, children: icon }) }),
    /* @__PURE__ */ jsxs("div", { className: b.calloutBody, children: [
      label !== void 0 && /* @__PURE__ */ jsx("span", { className: b.calloutLabel, children: label }),
      title !== void 0 && /* @__PURE__ */ jsx("p", { className: b.calloutTitle, children: title }),
      children !== void 0 && /* @__PURE__ */ jsx("div", { className: b.calloutText, children })
    ] }),
    actions && /* @__PURE__ */ jsx("div", { className: b.calloutActions, children: actions })
  ] });
}
function Stat({
  label,
  value,
  caption,
  tone,
  title
}) {
  const b = useBlocksKit();
  const toneClass = tone && { ok: b.statValueOk, warn: b.statValueWarn, bad: b.statValueBad }[tone];
  return /* @__PURE__ */ jsxs("div", { className: b.stat, title, children: [
    /* @__PURE__ */ jsx("span", { className: b.statLabel, children: label }),
    /* @__PURE__ */ jsx("span", { className: cx(b.statValue, toneClass), children: value }),
    caption !== void 0 && /* @__PURE__ */ jsx("span", { className: b.statCaption, children: caption })
  ] });
}

export { ActionSelect, Button, Callout, Card, Chip, ColumnLabel, Count, EmptyNote, Fact, FactGrid, Field, FilterBar, FilterChip, FilterChips, FilterGroup, FilterSelect, HEALTH_LABEL, Hint, IconButton, PageHeader, Panel, SearchField, Section, SectionLabel, SectionTitle, Stat, StatusChip, StatusDot, Subtabs, TextLink, TierChip, Tile, healthColor, healthTone, useTableKit };
//# sourceMappingURL=index.esm.js.map

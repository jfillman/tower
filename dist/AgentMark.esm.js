import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { HangarMark } from './brand/HangarMark.esm.js';
import { formatDateTime, relativeTime } from './shared/format.esm.js';
import { Chip, StatusChip } from './ui/index.esm.js';
import { Tooltip } from './ui/Tooltip.esm.js';

const useStyles = makeStyles(() => ({
  mark: { display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }
}));
function AgentMark({ mark, what = "pr", className }) {
  const c = useStyles();
  const receipt = mark.verified ? "receipt verified by Clearance" : "receipt recorded, not verified";
  const title = what === "pr" ? `Opened by ${mark.agent} through Clearance \xB7 ${receipt} \xB7 ${formatDateTime(mark.at)}` : `Builds the branch of PR #${mark.pr}, opened by ${mark.agent} through Clearance \xB7 ${receipt}`;
  return /* @__PURE__ */ jsx(Tooltip, { title, children: /* @__PURE__ */ jsx("span", { className: `${c.mark} ${className ?? ""}`, children: /* @__PURE__ */ jsxs(Chip, { tone: "sky", className: c.mark, children: [
    /* @__PURE__ */ jsx(HangarMark, { glyph: "clearance", size: 12 }),
    mark.agent
  ] }) }) });
}
function RunMarkChip({ mark, className }) {
  const c = useStyles();
  let tone = "neutral";
  let verb = "investigated";
  if (mark.tripped) {
    tone = "warn";
    verb = "frozen";
  } else if (mark.state === "live") {
    tone = "info";
    verb = "investigating";
  } else if (mark.state === "unknown") verb = "started";
  const title = `An event about this run started ${mark.agent} (session ${mark.session}, ${formatDateTime(mark.at)}); its session is ${mark.tripped ? "frozen: the breaker tripped" : mark.state}`;
  return /* @__PURE__ */ jsx(Tooltip, { title, children: /* @__PURE__ */ jsx("span", { className: `${c.mark} ${className ?? ""}`, children: /* @__PURE__ */ jsxs(StatusChip, { tone, dot: mark.state === "live", children: [
    /* @__PURE__ */ jsx(HangarMark, { glyph: "clearance", size: 12 }),
    mark.agent,
    " ",
    verb
  ] }) }) });
}
function AgentStateChips({ state }) {
  const c = useStyles();
  let live = null;
  if (state.tripped > 0) live = /* @__PURE__ */ jsx(StatusChip, { tone: "warn", dot: true, children: "frozen \xB7 breaker tripped" });
  else if (state.live > 0) {
    live = /* @__PURE__ */ jsx(StatusChip, { tone: "info", dot: true, children: state.live === 1 && state.lastRun ? `running \xB7 ${relativeTime(state.lastRun.at)}` : `${state.live} live` });
  } else if (state.lastRun) {
    live = /* @__PURE__ */ jsxs(StatusChip, { tone: state.lastRun.state === "closed" ? "ok" : "neutral", children: [
      "last run ",
      state.lastRun.state === "closed" ? "ok" : state.lastRun.state,
      " \xB7 ",
      relativeTime(state.lastRun.at)
    ] });
  }
  const trigger = state.triggers.find((x) => x !== "manual");
  return /* @__PURE__ */ jsxs("div", { className: c.chips, children: [
    /* @__PURE__ */ jsx(Chip, { children: trigger ?? state.kind }),
    live,
    state.waiting > 0 && /* @__PURE__ */ jsxs(StatusChip, { tone: "warn", children: [
      state.waiting,
      " request",
      state.waiting === 1 ? "" : "s",
      " waiting"
    ] }),
    state.actsOn.length > 0 && /* @__PURE__ */ jsx(Tooltip, { title: state.actsOn.join(", "), children: /* @__PURE__ */ jsx("span", { children: /* @__PURE__ */ jsxs(Chip, { children: [
      "acts on ",
      state.actsOn.slice(0, 2).join(", "),
      state.actsOn.length > 2 ? ` +${state.actsOn.length - 2}` : ""
    ] }) }) })
  ] });
}
function ActingAgentsChip({ agents }) {
  if (agents.length === 0) return null;
  return /* @__PURE__ */ jsx(Tooltip, { title: agents.map((a) => a.name).join(", "), children: /* @__PURE__ */ jsx("span", { children: /* @__PURE__ */ jsxs(Chip, { children: [
    agents.length,
    " agent",
    agents.length === 1 ? "" : "s",
    " can act"
  ] }) }) });
}

export { ActingAgentsChip, AgentMark, AgentStateChips, RunMarkChip };
//# sourceMappingURL=AgentMark.esm.js.map

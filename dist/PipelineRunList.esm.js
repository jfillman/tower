import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { relativeTime, formatDateTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { layoutPipelineGraph } from './tekton/pipelineGraph.esm.js';
import { FilterBar, FilterChips, SearchField, Button, TextLink } from './ui/index.esm.js';

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "succeeded", label: "Succeeded" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" }
];
const FLOW_FILTERS = [
  { key: "all", label: "All flows" },
  { key: "ci", label: "Release flows" },
  { key: "pr-build", label: "Preview flows" },
  { key: "guardrail", label: "Guardrails" }
];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const useStyles = makeStyles(() => ({
  list: { maxHeight: 380, overflowY: "auto", border: ({ t }) => `1px solid ${t.line}`, borderTop: "none", borderRadius: "0 0 5px 5px" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "10px 16px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    cursor: "pointer",
    backgroundColor: ({ t }) => t.panel,
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  rowSelected: { backgroundColor: ({ t }) => t.panelAlt },
  rowLast: { borderBottom: "none" },
  statusDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  // Fixed width, not just a minWidth (2026-09-12 bug: "the mini-pipelines
  // are still not vertically aligned" - really a horizontal-alignment bug:
  // `main` used to size to its own title/meta text, so a row with a long
  // branch/sha/trigger string pushed `thumb` (and the mini-DAG inside it)
  // further right than a row with short text, staggering every row's graph
  // instead of lining them up in one column. A fixed width means `thumb`
  // always starts at the exact same x regardless of this row's own text
  // length; long meta text wraps onto a second line instead of stretching
  // the column, which MiniDag's own maxCols-shared-viewBox fix (see that
  // component's comment) already assumed was happening.
  main: { display: "flex", flexDirection: "column", gap: 2, flex: "0 0 260px", minWidth: 0 },
  title: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 13, color: ({ t }) => t.textHi },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, display: "flex", flexWrap: "wrap", gap: 6 },
  sha: { color: ({ t }) => t.sky, textDecoration: "none" },
  shaLink: { "&:hover": { textDecoration: "underline" } },
  thumb: { flex: 1, minWidth: 0 },
  side: { display: "flex", alignItems: "center", gap: 14, flexShrink: 0 },
  pill: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.03em",
    padding: "3px 9px",
    borderRadius: 11,
    border: "1px solid",
    whiteSpace: "nowrap"
  },
  when: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, textAlign: "right", minWidth: 70 },
  empty: { padding: "22px 18px", textAlign: "center", fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textFaint },
  slugChip: {
    fontFamily: fontMono,
    fontSize: 10,
    padding: "1px 7px",
    borderRadius: 8,
    border: "1px solid",
    whiteSpace: "nowrap",
    textAlign: "center"
  },
  errorLine: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.bad,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 320
  },
  footer: {
    padding: "8px 16px",
    border: ({ t }) => `1px solid ${t.line}`,
    borderTop: "none",
    borderRadius: "0 0 5px 5px",
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textFaint
  }
  // Distinct (bad/red) tone from rerunBtn - cancel tears down a run that's
  // actually in flight right now, a more consequential action than
  // resubmitting an already-finished one.
}));
function slugHue(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) hash = hash * 31 + slug.charCodeAt(i) >>> 0;
  return hash % 360;
}
function phaseTone(t, phase) {
  switch (phase) {
    case "succeeded":
      return { bg: t.goodSoft, border: t.good, fg: t.good, label: "succeeded" };
    case "failed":
      return { bg: t.badSoft, border: t.bad, fg: t.bad, label: "failed" };
    case "running":
      return { bg: t.amberSoft, border: t.amberLine, fg: t.amberInk, label: "running" };
    case "cancelled":
      return { bg: t.panelAlt, border: t.line, fg: t.textLo, label: "cancelled" };
    case "pending":
    default:
      return { bg: t.panelAlt, border: t.line, fg: t.textFaint, label: "pending" };
  }
}
function miniDotColor(t, phase) {
  if (phase === "succeeded") return t.good;
  if (phase === "failed") return t.bad;
  if (phase === "running") return t.amber;
  return t.textFaint;
}
function miniDotRadius(phase) {
  return phase === "running" ? 4 : 3.2;
}
function MiniDag({ run, maxCols, maxRows }) {
  const t = useHangarTokens();
  const layout = layoutPipelineGraph(run);
  const colCounts = /* @__PURE__ */ new Map();
  layout.nodes.forEach((n) => colCounts.set(n.col, (colCounts.get(n.col) ?? 0) + 1));
  const cellW = 26;
  const cellH = 9;
  const w = Math.max(1, maxCols) * cellW;
  const h = Math.max(1, maxRows) * cellH;
  const pos = /* @__PURE__ */ new Map();
  layout.nodes.forEach((n) => {
    const count = colCounts.get(n.col) ?? 1;
    const offsetY = (maxRows - count) * cellH / 2;
    pos.set(n.id, { x: n.col * cellW + cellW / 2, y: offsetY + n.row * cellH + cellH / 2 });
  });
  const runningLabels = layout.nodes.filter((n) => n.phase === "running").map((n) => n.label);
  const failedLabels = layout.nodes.filter((n) => n.phase === "failed").map((n) => n.label);
  let hoverTitle = `${run.phase}`;
  if (runningLabels.length > 0) hoverTitle = `Running: ${runningLabels.join(", ")}`;
  else if (failedLabels.length > 0) hoverTitle = `Failed: ${failedLabels.join(", ")}`;
  return /* @__PURE__ */ jsxs("svg", { width: "100%", height: 34, viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "xMidYMid meet", children: [
    /* @__PURE__ */ jsx("title", { children: hoverTitle }),
    layout.edges.map((e, i) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) return null;
      const ra = miniDotRadius(layout.nodes.find((n) => n.id === e.from)?.phase);
      const rb = miniDotRadius(layout.nodes.find((n) => n.id === e.to)?.phase);
      return /* @__PURE__ */ jsx("line", { x1: a.x + ra, y1: a.y, x2: b.x - rb, y2: b.y, stroke: t.line, strokeWidth: 1 }, i);
    }),
    layout.nodes.map((n) => {
      const p = pos.get(n.id);
      if (!p) return null;
      const color = miniDotColor(t, n.phase);
      const opacity = n.phase === "pending" || n.phase === "skipped" ? 0.35 : 1;
      return /* @__PURE__ */ jsx("circle", { cx: p.x, cy: p.y, r: miniDotRadius(n.phase), fill: color, opacity }, n.id);
    })
  ] });
}
function FlowSlugChip({ slug, classes }) {
  const hue = slugHue(slug);
  return /* @__PURE__ */ jsxs(
    "span",
    {
      className: classes.slugChip,
      style: {
        color: `hsl(${hue}, 65%, 60%)`,
        borderColor: `hsl(${hue}, 65%, 60%)`,
        backgroundColor: `hsla(${hue}, 65%, 60%, 0.12)`
      },
      title: "Shared by every stage of this same flow execution, including the build that started it",
      children: [
        "flow: ",
        slug
      ]
    }
  );
}
function pipelineTitle(run) {
  if (run.pipelineName === "governance-check") {
    const gate = run.params.find((p) => p.name === "gate-name")?.value;
    if (gate) return `${gate}-check`;
  }
  const env = run.params.find((p) => p.name === "env")?.value;
  if (env) {
    if (run.pipelineName === "deploy") return `deploy to ${env}`;
    if (run.pipelineName === "test") return `test ${env}`;
    if (run.pipelineName === "release") return `releasing to ${env}`;
  }
  return run.pipelineName ?? run.name;
}
function RunError({ run, classes }) {
  if (run.phase !== "failed" || !run.message) return null;
  return /* @__PURE__ */ jsx("span", { className: classes.errorLine, title: run.message, children: run.message });
}
function RunDescriptor({ run, classes }) {
  if (run.sha) {
    return /* @__PURE__ */ jsxs("div", { className: classes.main, children: [
      /* @__PURE__ */ jsx("span", { className: classes.title, children: pipelineTitle(run) }),
      /* @__PURE__ */ jsxs("span", { className: classes.meta, children: [
        (run.branch ?? run.name) && /* @__PURE__ */ jsxs("span", { children: [
          run.branch ?? run.name,
          " \xB7"
        ] }),
        run.sourceRepoUrl ? /* @__PURE__ */ jsx(
          "a",
          {
            className: `${classes.sha} ${classes.shaLink}`,
            href: `${run.sourceRepoUrl}/commit/${run.sha}`,
            target: "_blank",
            rel: "noopener noreferrer",
            onClick: (e) => e.stopPropagation(),
            children: run.sha.slice(0, 7)
          }
        ) : /* @__PURE__ */ jsx("span", { className: classes.sha, children: run.sha.slice(0, 7) }),
        run.eventType && /* @__PURE__ */ jsxs("span", { children: [
          "\xB7 trigger: ",
          run.eventType
        ] })
      ] }),
      /* @__PURE__ */ jsx(RunError, { run, classes }),
      run.flowSlug && /* @__PURE__ */ jsx(FlowSlugChip, { slug: run.flowSlug, classes })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: classes.main, children: [
    /* @__PURE__ */ jsx("span", { className: classes.title, children: pipelineTitle(run) }),
    /* @__PURE__ */ jsxs("span", { className: classes.meta, children: [
      run.pipelineName && /* @__PURE__ */ jsx("span", { className: classes.sha, children: run.name }),
      run.triggerName && /* @__PURE__ */ jsxs("span", { children: [
        "\xB7 trigger: ",
        run.triggerName
      ] })
    ] }),
    /* @__PURE__ */ jsx(RunError, { run, classes }),
    run.flowSlug && /* @__PURE__ */ jsx(FlowSlugChip, { slug: run.flowSlug, classes })
  ] });
}
function PipelineRunList({
  runs,
  selectedName,
  onSelect,
  onRerun,
  rerunPending,
  onCancel,
  cancelPending
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");
  const [pageSize, setPageSize] = useState(25);
  if (runs.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: classes.empty, children: "No pipeline runs found yet in this app's CI namespace." });
  }
  const query = search.trim().toLowerCase();
  const filtered = runs.filter((run) => {
    const matchesStatus = statusFilter === "all" || run.phase === statusFilter;
    if (!matchesStatus) return false;
    const matchesFlow = flowFilter === "all" || run.flow === flowFilter;
    if (!matchesFlow) return false;
    if (!query) return true;
    const haystack = [run.branch, run.pipelineName, run.sha, run.triggerName, run.eventType, run.flowSlug, run.name].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
  const visible = pageSize === "all" ? filtered : filtered.slice(0, pageSize);
  const truncated = visible.length < filtered.length;
  const maxCols = Math.max(1, ...visible.map((run) => layoutPipelineGraph(run).cols));
  const maxRows = Math.max(1, ...visible.map((run) => layoutPipelineGraph(run).maxRows));
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs(FilterBar, { children: [
      /* @__PURE__ */ jsx(
        FilterChips,
        {
          label: "Status",
          value: statusFilter,
          onChange: setStatusFilter,
          options: STATUS_FILTERS.map((f) => ({ id: f.key, label: f.label }))
        }
      ),
      /* @__PURE__ */ jsx(
        FilterChips,
        {
          label: "Flow",
          value: flowFilter,
          onChange: setFlowFilter,
          options: FLOW_FILTERS.map((f) => ({ id: f.key, label: f.label }))
        }
      ),
      /* @__PURE__ */ jsx(
        FilterChips,
        {
          label: "Show",
          value: String(pageSize),
          onChange: (v) => setPageSize(v === "all" ? "all" : Number(v)),
          options: [...PAGE_SIZE_OPTIONS.map((n) => ({ id: String(n), label: String(n) })), { id: "all", label: "All" }]
        }
      ),
      /* @__PURE__ */ jsx(
        SearchField,
        {
          label: "Filter runs",
          placeholder: "Pipeline, flow, trigger, branch or sha\u2026",
          value: search,
          onChange: setSearch
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.list, style: truncated ? { borderRadius: 0 } : void 0, children: [
      filtered.length === 0 && /* @__PURE__ */ jsx("div", { className: classes.empty, children: "No pipeline runs match this filter." }),
      visible.map((run, i) => {
        const cancelRequested = String(run.raw?.spec?.status ?? "").startsWith(
          "Cancelled"
        );
        const cancelling = (run.phase === "running" || run.phase === "pending") && (cancelPending === run.name || cancelRequested);
        const tone = cancelling ? { ...phaseTone(t, "running"), label: "canceling" } : phaseTone(t, run.phase);
        const durationLabel = (() => {
          if (!run.startTime) return "\u2014";
          const start = new Date(run.startTime).getTime();
          const end = run.completionTime ? new Date(run.completionTime).getTime() : Date.now();
          const secs = Math.max(0, Math.round((end - start) / 1e3));
          const mins = Math.floor(secs / 60);
          return mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
        })();
        return /* @__PURE__ */ jsxs(
          "div",
          {
            className: `${classes.row} ${run.name === selectedName ? classes.rowSelected : ""} ${i === visible.length - 1 ? classes.rowLast : ""}`,
            role: "button",
            tabIndex: 0,
            onClick: () => onSelect(run),
            onKeyDown: (ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onSelect(run);
              }
            },
            children: [
              /* @__PURE__ */ jsx("span", { className: classes.statusDot, style: { backgroundColor: tone.fg } }),
              /* @__PURE__ */ jsx(RunDescriptor, { run, classes }),
              /* @__PURE__ */ jsx("div", { className: classes.thumb, children: /* @__PURE__ */ jsx(MiniDag, { run, maxCols, maxRows }) }),
              /* @__PURE__ */ jsxs("div", { className: classes.side, children: [
                run.phase === "failed" && onRerun && !run.archive && /* @__PURE__ */ jsx(
                  Button,
                  {
                    small: true,
                    disabled: rerunPending === run.name,
                    onClick: (ev) => {
                      ev.stopPropagation();
                      onRerun(run);
                    },
                    children: rerunPending === run.name ? "Re-running\u2026" : "Re-run"
                  }
                ),
                (run.phase === "running" || run.phase === "pending") && onCancel && /* @__PURE__ */ jsx(
                  Button,
                  {
                    small: true,
                    variant: "danger",
                    disabled: cancelPending === run.name || cancelling,
                    onClick: (ev) => {
                      ev.stopPropagation();
                      onCancel(run);
                    },
                    children: cancelling ? "Canceling\u2026" : "Cancel"
                  }
                ),
                /* @__PURE__ */ jsx("span", { className: classes.pill, style: { backgroundColor: tone.bg, borderColor: tone.border, color: tone.fg }, children: tone.label }),
                /* @__PURE__ */ jsx("span", { className: classes.when, children: durationLabel }),
                /* @__PURE__ */ jsx("span", { className: classes.when, title: run.startTime ? formatDateTime(run.startTime) : void 0, children: run.startTime ? relativeTime(run.startTime) : "\u2014" })
              ] })
            ]
          },
          run.name
        );
      })
    ] }),
    truncated && /* @__PURE__ */ jsxs("div", { className: classes.footer, children: [
      "Showing ",
      visible.length,
      " of ",
      filtered.length,
      " \xB7",
      " ",
      /* @__PURE__ */ jsx(TextLink, { onClick: () => setPageSize("all"), children: "show all" })
    ] })
  ] });
}

export { PipelineRunList, phaseTone, pipelineTitle, slugHue };
//# sourceMappingURL=PipelineRunList.esm.js.map

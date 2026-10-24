import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { fontScale, fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { useTableKit, Section, EmptyNote, FactGrid, Fact, Count, Hint, TextLink, StatusChip } from '../ui/index.esm.js';
import { apiCompatOf, VERDICT_LABEL, VERDICT_TONE } from './apiCompat.esm.js';
import { formatRate } from './model.esm.js';

const useStyles = makeStyles(() => ({
  method: { fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.sky },
  path: { fontFamily: fontMono, fontSize: fontScale.sm, color: ({ t }) => t.textHi },
  mono: { fontFamily: fontMono, fontSize: fontScale.sm },
  scrollBox: { overflowX: "auto" }
}));
const short = (s) => s ? s.replace(/^sha256:/, "").slice(0, 12) : "\u2014";
function ApiCompatSection({ checks, appName }) {
  const state = apiCompatOf(checks);
  return state ? /* @__PURE__ */ jsx(ApiCompatReportSection, { state, appName }) : null;
}
function ApiCompatReportSection({ state, appName }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const [, setSearchParams] = useSearchParams();
  const { check, report } = state;
  const openDiff = (r) => appName && setSearchParams({ view: "airspace", sub: "contracts", app: appName, ...r?.env ? { compare: r.env } : {} });
  if (!report) {
    return /* @__PURE__ */ jsx(Section, { title: "API compatibility", level: 2, children: /* @__PURE__ */ jsxs(EmptyNote, { children: [
      "The api-compat check ",
      check.status === "completed" ? `finished (${check.conclusion ?? "no conclusion"})` : "is running",
      " but its comment carries no report Tower can read."
    ] }) });
  }
  return /* @__PURE__ */ jsxs(
    Section,
    {
      title: "API compatibility",
      level: 2,
      meta: /* @__PURE__ */ jsx(StatusChip, { tone: VERDICT_TONE[report.verdict], title: `api-compat check: ${check.conclusion ?? check.status}`, children: VERDICT_LABEL[report.verdict] }),
      actions: appName ? /* @__PURE__ */ jsx(TextLink, { onClick: () => openDiff(report), children: "Spec diff in Contracts \u2192" }) : void 0,
      children: [
        /* @__PURE__ */ jsxs(FactGrid, { children: [
          /* @__PURE__ */ jsx(Fact, { label: "Against", children: report.env ? `what ${report.env} runs` : "\u2014" }),
          /* @__PURE__ */ jsx(Fact, { label: "Running spec", children: /* @__PURE__ */ jsx("span", { className: c.mono, children: report.baseline ? `${report.baseline.version ?? "?"} \xB7 ${short(report.baseline.specSha256)}` : "none" }) }),
          /* @__PURE__ */ jsx(Fact, { label: "This release's spec", children: /* @__PURE__ */ jsx("span", { className: c.mono, children: report.candidate ? `${report.candidate.version ?? "?"} \xB7 ${short(report.candidate.specSha256)}` : "none" }) }),
          /* @__PURE__ */ jsx(Fact, { label: "Changes", children: /* @__PURE__ */ jsxs(Count, { children: [
            report.breaking.length,
            " breaking \xB7 ",
            report.nonBreakingCount,
            " other"
          ] }) }),
          /* @__PURE__ */ jsx(Fact, { label: "Usage", children: report.usage.source === "prometheus" ? `traces, last ${report.usage.window ?? "?"}${report.usage.callers.length ? ` \xB7 callers ${report.usage.callers.join(", ")}` : ""}` : "unknown" })
        ] }),
        report.override && /* @__PURE__ */ jsxs(Hint, { children: [
          "Breaking change accepted by ",
          report.override.by,
          report.override.at ? ` on ${new Date(report.override.at).toLocaleString()}` : "",
          report.override.reason ? `: ${report.override.reason}` : "",
          "."
        ] }),
        report.verdict === "no-spec" && /* @__PURE__ */ jsx(Hint, { children: "This release's image carries no signed spec, so nothing was compared." }),
        report.verdict === "no-baseline" && /* @__PURE__ */ jsxs(Hint, { children: [
          report.env || "The target",
          " runs no signed spec yet: this is the first one."
        ] }),
        report.breaking.length > 0 && /* @__PURE__ */ jsx("div", { className: c.scrollBox, children: /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Operation" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Change" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "In use" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: report.breaking.map((b) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { className: tk.td, children: b.operation ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: c.method, children: b.operation.method }),
              " ",
              /* @__PURE__ */ jsx("span", { className: c.path, children: b.operation.path })
            ] }) : "\u2014" }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: b.text }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(InUse, { inUse: b.inUse, rate: b.rate }) })
          ] }, b.id + b.text)) })
        ] }) }),
        /* @__PURE__ */ jsx(Hint, { children: `"In use" is per operation, from traces; they don't say which fields a caller reads.` })
      ]
    }
  );
}
function InUse({ inUse, rate }) {
  if (inUse === null) return /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", children: "unknown" });
  if (!inUse) return /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", children: "not seen" });
  return /* @__PURE__ */ jsx(StatusChip, { tone: "warn", children: rate !== null ? formatRate(rate) : "yes" });
}

export { ApiCompatSection };
//# sourceMappingURL=ApiCompatSection.esm.js.map

import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, Fragment } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import { relativeTime } from './shared/format.esm.js';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { ReleaseTimelinePanel, formatDuration } from './TimelinePanel.esm.js';
import { PrButton } from './PrButton.esm.js';
import { SupplyChainChips } from './SupplyChainChips.esm.js';
import { slugHue } from './PipelineRunList.esm.js';
import { gitopsPrForEnvAndImage, nicknameForImageTag, parseGitopsPrTitle } from './useReleaseContext.esm.js';
import { imageTag, envTierOf, previewPrNumber } from './types.esm.js';
import { useTableKit, SectionTitle, FilterChips, EmptyNote, StatusChip } from './ui/index.esm.js';

const LOG_ROW_CAP = 25;
function buildLogEntries(pipelineEnvironments, previewEnvironments, deployHistory, gitopsPrs, sourcePrs, pipelineOrder, pipelineRuns) {
  const entries = [];
  const now = Date.now();
  pipelineEnvironments.forEach((env) => {
    const history = deployHistory?.[env.env] ?? [];
    history.forEach((entry, i) => {
      const nextDate = i + 1 < history.length ? history[i + 1].date : void 0;
      const durationMs = (nextDate ? new Date(nextDate).getTime() : now) - new Date(entry.date).getTime();
      const tag = imageTag(entry.imageTag);
      const tier = envTierOf(env.env, pipelineOrder);
      const mergedPr = tier === "upper" ? gitopsPrForEnvAndImage(gitopsPrs, env.env, tag) : void 0;
      let trigger = "promoted";
      if (tier === "lower") trigger = "direct commit";
      else if (mergedPr?.state === "merged") trigger = `PR #${mergedPr.number} \xB7 merged`;
      entries.push({
        id: `${env.env}-${entry.sha}`,
        date: entry.date,
        env: env.env,
        isPreview: false,
        imageTag: tag,
        nickname: nicknameForImageTag(tag, pipelineRuns),
        fullImage: env.image && imageTag(env.image) === tag ? env.image : void 0,
        trigger,
        duration: formatDuration(durationMs),
        status: "promoted",
        pr: mergedPr
      });
    });
  });
  gitopsPrs.filter((pr) => pr.state === "open").forEach((pr) => {
    const parsed = parseGitopsPrTitle(pr.title);
    if (!parsed) return;
    entries.push({
      id: `pr-${pr.number}`,
      date: pr.updatedAt,
      env: parsed.targetEnv,
      isPreview: false,
      imageTag: parsed.imageTag,
      nickname: nicknameForImageTag(parsed.imageTag, pipelineRuns),
      trigger: `PR #${pr.number} \xB7 open`,
      status: "pending",
      pr
    });
  });
  previewEnvironments.forEach((env) => {
    if (!env.deployedAt) return;
    entries.push({
      id: `preview-${env.key}`,
      date: env.deployedAt,
      env: env.env,
      isPreview: true,
      imageTag: env.image ? imageTag(env.image) : void 0,
      nickname: env.image ? nicknameForImageTag(imageTag(env.image), pipelineRuns) : void 0,
      fullImage: env.image,
      trigger: "preview env created",
      status: "spun-up",
      pr: sourcePrs.find((pr) => pr.number === previewPrNumber(env.env))
    });
  });
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, LOG_ROW_CAP);
}
const useStyles = makeStyles(() => ({
  wrap: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, overflow: "hidden" },
  head: { padding: "14px 20px", borderBottom: ({ t }) => `1px solid ${t.lineSoft}`, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  sub: { fontSize: 12, color: ({ t }) => t.textLo, marginTop: 2, maxWidth: 640 },
  scroll: { overflowX: "auto", padding: "0 20px 18px" },
  time: { color: ({ t }) => t.textFaint, fontFamily: fontMono, fontSize: 11 },
  env: { fontFamily: fontMono, fontSize: 11, fontWeight: 600, color: ({ t }) => t.textHi },
  envPreview: { color: ({ t }) => t.sky },
  tag: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textHi },
  nicknameChip: {
    display: "inline-block",
    marginLeft: 6,
    fontFamily: fontMono,
    fontSize: 11,
    padding: "1px 7px",
    borderRadius: 8,
    border: "1px solid",
    whiteSpace: "nowrap"
  },
  expandRow: { padding: "2px 20px 14px" },
  expandFact: { fontSize: 12, color: ({ t }) => t.textLo }
}));
const STATUS_LABEL = {
  promoted: "promoted",
  pending: "pending",
  "spun-up": "spun up"
};
function ReleaseLog({
  entries,
  pipelineEnvironments,
  deployHistory,
  provenanceByImage
}) {
  const tc = useTableKit();
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [view, setView] = useState("table");
  const [expanded, setExpanded] = useState(null);
  const statusTone = (status) => {
    if (status === "pending") return "warn";
    if (status === "spun-up") return "info";
    return "ok";
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(SectionTitle, { children: "Release log" }),
        /* @__PURE__ */ jsx(Typography, { className: classes.sub, children: "Every promotion and preview spin-up, newest first - table for scanning, timeline for reading how long each release ran." })
      ] }),
      /* @__PURE__ */ jsx(
        FilterChips,
        {
          label: "View",
          value: view,
          onChange: setView,
          options: [
            { id: "table", label: "Table" },
            { id: "timeline", label: "Timeline" }
          ]
        }
      )
    ] }),
    view === "table" && entries.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "No recorded promotions yet." }),
    view === "table" && entries.length > 0 && /* @__PURE__ */ jsx("div", { className: classes.scroll, children: /* @__PURE__ */ jsxs("table", { className: tc.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Time" }),
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Env" }),
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Release" }),
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Trigger" }),
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Duration" }),
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Status" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: entries.map((entry) => {
        const tone = statusTone(entry.status);
        const clickable = Boolean(entry.fullImage) || Boolean(entry.pr);
        const isOpen = expanded === entry.id;
        return /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs(
            "tr",
            {
              className: clickable ? tc.rowLink : void 0,
              onClick: clickable ? () => setExpanded(isOpen ? null : entry.id) : void 0,
              children: [
                /* @__PURE__ */ jsx("td", { className: `${tc.td} ${classes.time}`, children: relativeTime(entry.date) }),
                /* @__PURE__ */ jsx("td", { className: `${tc.td} ${classes.env} ${entry.isPreview ? classes.envPreview : ""}`, children: entry.env }),
                /* @__PURE__ */ jsxs("td", { className: `${tc.td} ${classes.tag}`, children: [
                  entry.imageTag ?? "\u2014",
                  entry.nickname && /* @__PURE__ */ jsx(
                    "span",
                    {
                      className: classes.nicknameChip,
                      style: {
                        color: `hsl(${slugHue(entry.nickname)}, 65%, 60%)`,
                        borderColor: `hsl(${slugHue(entry.nickname)}, 65%, 60%)`,
                        backgroundColor: `hsla(${slugHue(entry.nickname)}, 65%, 60%, 0.12)`
                      },
                      children: entry.nickname
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx("td", { className: tc.td, children: entry.trigger }),
                /* @__PURE__ */ jsx("td", { className: tc.td, children: entry.duration ?? "\u2014" }),
                /* @__PURE__ */ jsx("td", { className: tc.td, children: /* @__PURE__ */ jsx(StatusChip, { tone, children: STATUS_LABEL[entry.status] }) })
              ]
            }
          ),
          clickable && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 6, style: { padding: 0, border: "none" }, children: /* @__PURE__ */ jsx(Collapse, { in: isOpen, unmountOnExit: true, children: /* @__PURE__ */ jsxs("div", { className: classes.expandRow, children: [
            entry.pr && /* @__PURE__ */ jsx(PrButton, { pr: entry.pr }),
            entry.fullImage && /* @__PURE__ */ jsx(SupplyChainChips, { provenance: provenanceByImage[entry.fullImage]?.data }),
            !entry.fullImage && !entry.pr && /* @__PURE__ */ jsx(Typography, { className: classes.expandFact, children: "No further detail recorded." })
          ] }) }) }) })
        ] }, entry.id);
      }) })
    ] }) }),
    view !== "table" && /* @__PURE__ */ jsx(ReleaseTimelinePanel, { environments: pipelineEnvironments, history: deployHistory, embedded: true })
  ] });
}

export { ReleaseLog, buildLogEntries };
//# sourceMappingURL=ReleaseLog.esm.js.map

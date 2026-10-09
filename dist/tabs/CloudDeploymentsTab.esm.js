import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { useTektonPipelineRuns } from '../tekton/useTektonPipelineRuns.esm.js';
import { summarizeCloudDeploys } from '../cloudDeploy.esm.js';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { useCicdConfig } from '../useConfigData.esm.js';
import { readEnvironments } from '../environments/stagedChanges.esm.js';
import { FlightPins } from './cloud/FlightPins.esm.js';
import { PageHeader, Chip, StatusChip } from '../ui/index.esm.js';

const useStyles = makeStyles(() => ({
  wrap: { paddingBottom: 40 },
  resource: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.textLo },
  link: {
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.sky,
    textDecoration: "none",
    "&:hover": { textDecoration: "underline" }
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 22 },
  card: {
    background: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 8,
    padding: "14px 16px"
  },
  cardBad: { borderColor: ({ t }) => t.bad, background: ({ t }) => t.badSoft },
  cardRun: { borderColor: ({ t }) => t.amberLine, background: ({ t }) => t.amberSoft },
  label: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    marginBottom: 6
  },
  big: { fontFamily: fontMono, fontSize: 15, color: ({ t }) => t.textHi, wordBreak: "break-all" },
  sub: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 4, lineHeight: 1.5 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    padding: "6px 10px",
    borderBottom: ({ t }) => `1px solid ${t.line}`
  },
  td: { padding: "9px 10px", borderBottom: ({ t }) => `1px solid ${t.lineSoft}`, color: ({ t }) => t.textHi },
  mono: { fontFamily: fontMono, fontSize: 12.5 },
  empty: { padding: "36px 8px", color: ({ t }) => t.textLo, fontSize: 14, lineHeight: 1.6 },
  linkBtn: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.sky,
    "&:hover": { textDecoration: "underline" }
  }
}));
const PHASE_LABEL = {
  succeeded: "succeeded",
  failed: "failed",
  running: "deploying",
  pending: "starting",
  cancelled: "cancelled"
};
function duration(sec) {
  if (sec === void 0) return "\u2014";
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}
function CloudDeploymentsTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { entity } = useEntity();
  const [, setSearchParams] = useSearchParams();
  const appName = entity.metadata.annotations?.["github.com/project-slug"]?.split("/")[1] ?? entity.metadata.name;
  const owner = entity.metadata.annotations?.["github.com/project-slug"]?.split("/")[0];
  const cicd = useCicdConfig(owner ? { owner, appName } : void 0);
  const flight = useMemo(() => {
    const { envs } = readEnvironments(cicd.data?.values?.deploy);
    return envs.flatMap((e, i) => e.tier === "flight" ? [{ name: e.name, previous: envs[i - 1]?.name }] : []);
  }, [cicd.data]);
  const { loading, runs, error } = useTektonPipelineRuns(appName);
  const summary = useMemo(() => summarizeCloudDeploys(runs), [runs]);
  const openRun = (name) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "pipelines");
    next.set("run", name);
    return next;
  });
  const pill = (d) => {
    let tone = "neutral";
    if (d.phase === "succeeded") tone = "ok";
    else if (d.phase === "failed") tone = "bad";
    else if (d.phase === "running" || d.phase === "pending") tone = "warn";
    return /* @__PURE__ */ jsx(StatusChip, { tone, children: PHASE_LABEL[d.phase] ?? d.phase });
  };
  if (loading && runs.length === 0) return /* @__PURE__ */ jsx(Progress, {});
  if (error && runs.length === 0) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  const { current, inFlight, latestFailure, deploys, resource } = summary;
  const targetLabel = deploys[0]?.targetLabel;
  if (deploys.length === 0) {
    return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
      /* @__PURE__ */ jsx(PageHeader, { title: "Deployments", subtitle: "What Glidepath deployed, from its pipeline runs. Tower does not read live health from the cloud, so this cannot tell you the service is up, only that the deploy finished." }),
      /* @__PURE__ */ jsx("div", { className: classes.empty, children: "No recent deploy runs. Deploys show up here while their pipeline runs are kept (Tekton cleans up older runs); a Flight environment's current release is its pin, below." }),
      owner && /* @__PURE__ */ jsx(FlightPins, { owner, appName, flight, deploys })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsx(
      PageHeader,
      {
        title: "Deployments",
        subtitle: "What Glidepath deployed, from its pipeline runs. Tower does not read live health from the cloud, so this cannot tell you the service is up, only that the deploy finished.",
        actions: /* @__PURE__ */ jsxs(Fragment, { children: [
          targetLabel && /* @__PURE__ */ jsx(Chip, { tone: "ground", children: targetLabel }),
          resource && /* @__PURE__ */ jsxs("span", { className: classes.resource, children: [
            resource.kind,
            " ",
            resource.name,
            resource.scope ? ` \xB7 ${resource.scope}` : "",
            resource.region ? ` \xB7 ${resource.region}` : ""
          ] }),
          deploys.find((d) => d.consoleUrl)?.consoleUrl && /* @__PURE__ */ jsx(
            "a",
            {
              className: classes.link,
              href: deploys.find((d) => d.consoleUrl).consoleUrl,
              target: "_blank",
              rel: "noreferrer",
              children: "open in console \u2197"
            }
          )
        ] })
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.card, children: [
        /* @__PURE__ */ jsx("div", { className: classes.label, children: "Last successful deploy" }),
        current ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: classes.big, children: current.imageTag ?? current.imageRef ?? "unknown image" }),
          /* @__PURE__ */ jsxs("div", { className: classes.sub, children: [
            current.flowSlug ? `${current.flowSlug} \xB7 ` : "",
            current.shortSha ? `commit ${current.shortSha} \xB7 ` : "",
            relativeTime(current.completionTime ?? current.startTime),
            " \xB7 took ",
            duration(current.durationSec)
          ] })
        ] }) : /* @__PURE__ */ jsx("div", { className: classes.sub, children: "No deploy has succeeded yet." })
      ] }),
      inFlight && /* @__PURE__ */ jsxs("div", { className: `${classes.card} ${classes.cardRun}`, children: [
        /* @__PURE__ */ jsx("div", { className: classes.label, children: "Deploying now" }),
        /* @__PURE__ */ jsx("div", { className: classes.big, children: inFlight.imageTag ?? inFlight.imageRef ?? "unknown image" }),
        /* @__PURE__ */ jsxs("div", { className: classes.sub, children: [
          "started ",
          relativeTime(inFlight.startTime),
          " \xB7",
          " ",
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.linkBtn, onClick: () => openRun(inFlight.runName), children: "watch the run" })
        ] })
      ] }),
      latestFailure && /* @__PURE__ */ jsxs("div", { className: `${classes.card} ${classes.cardBad}`, children: [
        /* @__PURE__ */ jsx("div", { className: classes.label, children: "Latest deploy failed" }),
        /* @__PURE__ */ jsx("div", { className: classes.big, children: latestFailure.imageTag ?? latestFailure.imageRef ?? "unknown image" }),
        /* @__PURE__ */ jsxs("div", { className: classes.sub, children: [
          latestFailure.failure?.task ? `${latestFailure.failure.task}: ` : "",
          latestFailure.failure?.message ?? "see the run for details"
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.sub, children: [
          current ? `The service may still be running ${current.imageTag ?? "the previous image"}.` : "Nothing has been deployed successfully.",
          " ",
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.linkBtn, onClick: () => openRun(latestFailure.runName), children: "open the run and its logs" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("table", { className: classes.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: classes.th, children: "Result" }),
        /* @__PURE__ */ jsx("th", { className: classes.th, children: "Image" }),
        /* @__PURE__ */ jsx("th", { className: classes.th, children: "Environment" }),
        /* @__PURE__ */ jsx("th", { className: classes.th, children: "Started" }),
        /* @__PURE__ */ jsx("th", { className: classes.th, children: "Took" }),
        /* @__PURE__ */ jsx("th", { className: classes.th })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: deploys.map((d) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { className: classes.td, children: pill(d) }),
        /* @__PURE__ */ jsxs("td", { className: `${classes.td} ${classes.mono}`, children: [
          d.imageTag ?? d.imageRef ?? "\u2014",
          d.flowSlug ? ` (${d.flowSlug})` : ""
        ] }),
        /* @__PURE__ */ jsx("td", { className: `${classes.td} ${classes.mono}`, children: d.env ?? "\u2014" }),
        /* @__PURE__ */ jsx("td", { className: classes.td, title: formatDateTime(d.startTime), children: relativeTime(d.startTime) }),
        /* @__PURE__ */ jsx("td", { className: classes.td, children: duration(d.durationSec) }),
        /* @__PURE__ */ jsx("td", { className: classes.td, children: /* @__PURE__ */ jsx("button", { type: "button", className: classes.linkBtn, onClick: () => openRun(d.runName), children: "open run" }) })
      ] }, d.runName)) })
    ] }),
    owner && /* @__PURE__ */ jsx(FlightPins, { owner, appName, flight, deploys })
  ] });
}

export { CloudDeploymentsTab };
//# sourceMappingURL=CloudDeploymentsTab.esm.js.map

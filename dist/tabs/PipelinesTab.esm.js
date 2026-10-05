import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';
import { useTektonPipelineRuns, linkFlowSlugsByChainId } from '../tekton/useTektonPipelineRuns.esm.js';
import { useTektonResultsRuns } from '../tekton/useTektonResultsRuns.esm.js';
import { useRerunPipelineRun } from '../tekton/useRerunPipelineRun.esm.js';
import { useCancelPipelineRun } from '../tekton/useCancelPipelineRun.esm.js';
import { PipelineRunList } from '../PipelineRunList.esm.js';
import { PipelineDag } from '../PipelineDag.esm.js';
import { scrollPanelIntoView } from '../preventFocusScroll.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { GlidepathSummaryPanel } from '../GlidepathSummaryPanel.esm.js';
import { isPreviewEnvName, isRolloutActive } from '../types.esm.js';

const useStyles = makeStyles(() => ({
  sectionHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 16, color: ({ t }) => t.textHi },
  sectionSub: { fontSize: 12, color: ({ t }) => t.textFaint },
  dagGap: { marginTop: 12 },
  note: { fontSize: 12.5, fontStyle: "italic", padding: "14px 20px", color: ({ t }) => t.textLo },
  warnNote: { fontSize: 11.5, fontFamily: fontMono, padding: "10px 20px 0", color: ({ t }) => t.amberInk },
  dotLive: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: ({ t }) => t.amber,
    boxShadow: ({ t }) => `0 0 0 3px ${t.amberSoft}`,
    animation: "$pulse 1.6s ease-in-out infinite"
  },
  "@keyframes pulse": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0.5 }
  },
  activityBanner: {
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.amberSoft,
    borderRadius: 8,
    padding: "12px 16px",
    marginBottom: 20
  },
  activityHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 13,
    color: ({ t }) => t.amberInk,
    marginBottom: 10
  },
  activityList: { display: "flex", flexWrap: "wrap", gap: 8 },
  activityChip: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    alignItems: "flex-start",
    padding: "7px 13px",
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.panel,
    cursor: "pointer",
    textAlign: "left",
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  activityChipLabel: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 12.5, color: ({ t }) => t.textHi },
  activityChipSub: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint }
}));
function PipelinesTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { owner, environments, loading, error, appName, refresh } = useReleaseContext();
  const cdEnvs = environments.filter((e) => !isPreviewEnvName(e.env));
  const pendingDeployCount = cdEnvs.filter(isRolloutActive).length;
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedRun = searchParams.get("run") ?? void 0;
  const [ciRefreshNonce, setCiRefreshNonce] = useState(0);
  const refreshAll = () => {
    refresh();
    setCiRefreshNonce((n) => n + 1);
  };
  const pipelineRuns = useTektonPipelineRuns(appName, ciRefreshNonce);
  const archivedPipelineRuns = useTektonResultsRuns(appName, ciRefreshNonce);
  useMemo(() => {
    const byName = /* @__PURE__ */ new Map();
    archivedPipelineRuns.runs.forEach((run) => byName.set(run.name, run));
    pipelineRuns.runs.forEach((run) => byName.set(run.name, run));
    linkFlowSlugsByChainId([...byName.values()]);
  }, [pipelineRuns.runs, archivedPipelineRuns.runs]);
  const rerun = useRerunPipelineRun(() => setCiRefreshNonce((n) => n + 1));
  const cancelRun = useCancelPipelineRun(() => setCiRefreshNonce((n) => n + 1));
  const [selectedRunName, setSelectedRunName] = useState(void 0);
  const [dagExpandSignal, setDagExpandSignal] = useState(void 0);
  useEffect(() => {
    if (selectedRunName && pipelineRuns.runs.some((r) => r.name === selectedRunName)) return;
    if (linkedRun && pipelineRuns.runs.some((r) => r.name === linkedRun)) {
      setSelectedRunName(linkedRun);
      setDagExpandSignal((n) => (n ?? 0) + 1);
      return;
    }
    setSelectedRunName(pipelineRuns.runs[0]?.name);
  }, [pipelineRuns.runs, linkedRun]);
  const selectedRun = pipelineRuns.runs.find((r) => r.name === selectedRunName);
  const dagPanelRef = useRef(null);
  const selectRun = (name) => {
    setSelectedRunName(name);
    setDagExpandSignal((n) => (n ?? 0) + 1);
    scrollPanelIntoView(() => dagPanelRef.current);
  };
  const goToDeployments = () => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "deployments");
    return next;
  });
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  const activeRunItems = pipelineRuns.runs.filter((r) => r.phase === "running");
  const hasActivity = activeRunItems.length > 0 || pendingDeployCount > 0;
  let ciBody;
  if (pipelineRuns.error && !pipelineRuns.loading && pipelineRuns.runs.length === 0) {
    ciBody = /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(pipelineRuns.error) });
  } else if (pipelineRuns.loading) {
    ciBody = /* @__PURE__ */ jsx(Progress, {});
  } else {
    ciBody = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(
        PipelineRunList,
        {
          runs: pipelineRuns.runs,
          selectedName: selectedRunName,
          onSelect: (run) => selectRun(run.name),
          onRerun: rerun.rerun,
          rerunPending: rerun.pending,
          onCancel: cancelRun.cancel,
          cancelPending: cancelRun.pending
        }
      ),
      rerun.error && /* @__PURE__ */ jsxs(Typography, { className: classes.warnNote, children: [
        "Re-run failed: ",
        rerun.error
      ] }),
      cancelRun.error && /* @__PURE__ */ jsxs(Typography, { className: classes.warnNote, children: [
        "Cancel failed: ",
        cancelRun.error
      ] }),
      selectedRun && /* @__PURE__ */ jsx("div", { className: classes.dagGap, ref: dagPanelRef, style: { scrollMarginTop: 16 }, children: /* @__PURE__ */ jsx(PipelineDag, { run: selectedRun, expandSignal: dagExpandSignal }) })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: 6 }, children: /* @__PURE__ */ jsx(RefreshButton, { onClick: refreshAll }) }),
    owner && appName && /* @__PURE__ */ jsx(GlidepathSummaryPanel, { owner, appName }),
    hasActivity && /* @__PURE__ */ jsxs("div", { className: classes.activityBanner, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.activityHead, children: [
        /* @__PURE__ */ jsx("span", { className: classes.dotLive }),
        "Active now"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.activityList, children: [
        activeRunItems.map((run) => /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            className: classes.activityChip,
            onClick: () => selectRun(run.name),
            children: [
              /* @__PURE__ */ jsx("span", { className: classes.activityChipLabel, children: run.pipelineName ?? run.name }),
              /* @__PURE__ */ jsx("span", { className: classes.activityChipSub, children: "running \xB7 CI" })
            ]
          },
          `run-${run.name}`
        )),
        pendingDeployCount > 0 && /* @__PURE__ */ jsxs("button", { type: "button", className: classes.activityChip, onClick: goToDeployments, children: [
          /* @__PURE__ */ jsxs("span", { className: classes.activityChipLabel, children: [
            pendingDeployCount,
            " deliver",
            pendingDeployCount === 1 ? "y" : "ies",
            " in flight"
          ] }),
          /* @__PURE__ */ jsx("span", { className: classes.activityChipSub, children: "rolling out \xB7 open Deployments \u2192" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: classes.sectionHead, children: /* @__PURE__ */ jsxs("span", { className: classes.sectionSub, children: [
        pipelineRuns.loading ? "loading\u2026" : `${pipelineRuns.runs.length} pipeline run${pipelineRuns.runs.length === 1 ? "" : "s"}`,
        " \xB7 kind-dev"
      ] }) }),
      ciBody
    ] })
  ] });
}

export { PipelinesTab };
//# sourceMappingURL=PipelinesTab.esm.js.map

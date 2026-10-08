import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { usePromote } from '../useReleaseData.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';
import { CommandDeck } from '../CommandDeck.esm.js';
import { ReleaseMatrix } from '../ReleaseMatrix.esm.js';
import { ReleaseLog, buildLogEntries } from '../ReleaseLog.esm.js';
import { LeadTimePanel } from '../TimelinePanel.esm.js';
import { PreviewEnvironmentsPanel } from '../PreviewEnvironmentsPanel.esm.js';
import { PromoteDialog } from '../PromoteDialog.esm.js';
import { useEntity } from '@backstage/plugin-catalog-react';
import { deployTargetOf } from '../serviceClass.esm.js';
import { CloudPromoteDialog } from './releases/CloudPromoteDialog.esm.js';
import { ReleaseRecordPanel } from '../ReleaseRecordPanel.esm.js';
import { useReleaseRecords } from '../useReleaseRecords.esm.js';
import { isPreviewEnvName, splitImageRef } from '../types.esm.js';

const useStyles = makeStyles(() => ({
  subnav: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 0,
    borderBottom: ({ t }) => `1px solid ${t.line}`
  },
  subtab: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 12,
    padding: "9px 18px",
    borderRadius: "6px 6px 0 0",
    color: ({ t }) => t.textFaint,
    background: "none",
    border: "1px solid transparent",
    borderBottom: "none",
    position: "relative",
    top: 1,
    cursor: "pointer"
  },
  subtabActive: {
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.panel,
    borderColor: ({ t }) => t.line
  },
  panelSpacer: { marginTop: 16 }
}));
function ReleasesTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ctx = useReleaseContext();
  const { environments, loading, error, provenanceByImage, repoRef, owner, appName, pipelineOrder, gitopsPrs, sourcePrs, deployHistory, releases, releaseTotalCount, pipelineRuns, refresh } = ctx;
  const pipelineEnvironmentsForRecords = environments.filter((env) => !isPreviewEnvName(env.env));
  const releaseRecords = useReleaseRecords(
    appName,
    pipelineEnvironmentsForRecords,
    releases,
    gitopsPrs,
    sourcePrs,
    pipelineRuns,
    provenanceByImage,
    pipelineOrder.lower,
    pipelineOrder.upper
  );
  const [activeTab, setActiveTab] = useState("matrix");
  const [promoteTarget, setPromoteTarget] = useState(null);
  const promote = usePromote();
  const { entity } = useEntity();
  const target = deployTargetOf(entity);
  const isCloud = Boolean(target && target.id !== "k8s-rollout");
  const [cloudTarget, setCloudTarget] = useState(null);
  useEffect(() => {
    if (promote.result && !promote.result.alreadyOpen) refresh();
  }, [promote.result]);
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  const pipelineEnvironments = pipelineEnvironmentsForRecords;
  const previewEnvironments = environments.filter((env) => isPreviewEnvName(env.env));
  const targetIsLower = promoteTarget ? (pipelineOrder.lower ?? []).some((e) => e.toLowerCase() === promoteTarget.target.env.toLowerCase()) : false;
  const handlePromote = (source, targetEnvName) => {
    if (isCloud) {
      const image = source.image ?? pipelineEnvironments.find((e) => e.env === source.env)?.image;
      if (!image) return;
      setCloudTarget({ image, from: source.env, env: targetEnvName, flight: (pipelineOrder.upper ?? []).includes(targetEnvName) });
      return;
    }
    const target2 = pipelineEnvironments.find((e) => e.env === targetEnvName);
    if (!target2) return;
    if (source.env) {
      const sourceEnv = pipelineEnvironments.find((e) => e.env === source.env);
      if (!sourceEnv) return;
      promote.reset();
      setPromoteTarget({ source: sourceEnv, target: target2 });
    } else if (source.image) {
      promote.reset();
      setPromoteTarget({ source: { image: source.image }, target: target2 });
    }
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(
      CommandDeck,
      {
        environments: pipelineEnvironments,
        previewCount: previewEnvironments.length,
        gitopsPrs,
        sourcePrs,
        deployHistory: deployHistory.data,
        provenanceByImage,
        owner,
        appName,
        refresh,
        onSelectTab: setActiveTab
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: classes.subnav, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: `${classes.subtab} ${activeTab === "matrix" ? classes.subtabActive : ""}`,
          onClick: () => setActiveTab("matrix"),
          children: "Matrix"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: `${classes.subtab} ${activeTab === "log" ? classes.subtabActive : ""}`,
          onClick: () => setActiveTab("log"),
          children: "Log"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: `${classes.subtab} ${activeTab === "lead" ? classes.subtabActive : ""}`,
          onClick: () => setActiveTab("lead"),
          children: "Lead time"
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: `${classes.subtab} ${activeTab === "preview" ? classes.subtabActive : ""}`,
          onClick: () => setActiveTab("preview"),
          children: [
            "Preview (",
            previewEnvironments.length,
            ")"
          ]
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: `${classes.subtab} ${activeTab === "record" ? classes.subtabActive : ""}`,
          onClick: () => setActiveTab("record"),
          children: [
            "Record (",
            releaseRecords.length,
            ")"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.panelSpacer, children: [
      activeTab === "matrix" && /* @__PURE__ */ jsx(
        ReleaseMatrix,
        {
          releases,
          totalCount: releaseTotalCount,
          environments: pipelineEnvironments,
          provenanceByImage,
          onPromote: handlePromote
        }
      ),
      activeTab === "log" && (deployHistory.loading ? /* @__PURE__ */ jsx(Progress, {}) : /* @__PURE__ */ jsx(
        ReleaseLog,
        {
          entries: buildLogEntries(pipelineEnvironments, previewEnvironments, deployHistory.data ?? {}, gitopsPrs, sourcePrs, pipelineOrder, pipelineRuns),
          pipelineEnvironments,
          deployHistory: deployHistory.data ?? {},
          provenanceByImage
        }
      )),
      activeTab === "lead" && (deployHistory.loading ? /* @__PURE__ */ jsx(Progress, {}) : /* @__PURE__ */ jsx(LeadTimePanel, { environments: pipelineEnvironments, history: deployHistory.data ?? {}, repoRef, gitopsPrs })),
      activeTab === "preview" && /* @__PURE__ */ jsx(PreviewEnvironmentsPanel, { previewEnvironments, sourcePrs }),
      activeTab === "record" && /* @__PURE__ */ jsx(
        ReleaseRecordPanel,
        {
          records: releaseRecords,
          totalKnown: releases.length,
          appName,
          owner,
          gitopsPrs
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      CloudPromoteDialog,
      {
        owner,
        appName,
        target: cloudTarget,
        onClose: () => setCloudTarget(null),
        onDone: refresh
      }
    ),
    /* @__PURE__ */ jsx(
      PromoteDialog,
      {
        target: promoteTarget,
        onClose: () => setPromoteTarget(null),
        promote,
        targetIsLower,
        onConfirm: () => {
          if (!promoteTarget || !repoRef) return;
          const { source, target: target2 } = promoteTarget;
          if ("env" in source) {
            promote.promote({
              owner: repoRef.owner,
              appName: source.appName ?? "",
              sourceCluster: source.cluster,
              sourceEnv: source.env,
              targetCluster: target2.cluster,
              targetEnv: target2.env
            });
            return;
          }
          const split = splitImageRef(source.image);
          if (!split) return;
          promote.promote({
            owner: repoRef.owner,
            appName: target2.appName ?? appName ?? "",
            sourceImageRepo: split.repo,
            sourceImageTag: split.tag,
            targetCluster: target2.cluster,
            targetEnv: target2.env
          });
        }
      }
    )
  ] });
}

export { ReleasesTab };
//# sourceMappingURL=ReleasesTab.esm.js.map

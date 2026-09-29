import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { useReleaseContext, nicknameForImageTag } from '../useReleaseContext.esm.js';
import { useArgoActions } from '../useReleaseData.esm.js';
import { useTektonPipelineRuns } from '../tekton/useTektonPipelineRuns.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { buildSupplyChainStages, PipelineFlow } from '../PipelineFlow.esm.js';
import { useSignalRailStyles, deliveryTag, Rail } from '../SignalRail.esm.js';
import { EnvPicker } from '../EnvPicker.esm.js';
import { buildCdEnvDelivery } from '../useCdDelivery.esm.js';
import { ArgoCommandPanel } from './deployments/ArgoCommandPanel.esm.js';
import { TroubleshootBanner } from './deployments/TroubleshootBanner.esm.js';
import { StageDetail } from './deployments/StageDetail.esm.js';
import { isPreviewEnvName, isRolloutActive, envTierOf, imageTag, health, envStageRank } from '../types.esm.js';

const TIER_ORDER = ["lower", "upper"];
const STAGE_DWELL_MS = 4e3;
const useStyles = makeStyles(() => ({
  main: { display: "flex", flexDirection: "column", gap: 16 },
  // Just the env name (2026-09-16: "there's some redundant text in the
  // header above the argocd command panel... find a better way to indicate
  // which env we're looking at" - the picker above already shows env+
  // cluster+image, and the app name is the entity/page itself, so this is
  // now a single lightweight line, not a second full heading).
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 20, color: ({ t }) => t.textHi },
  // The DAG and its stage-detail panel are one connected unit (2026-09-16:
  // "should the stage details pane actually be connected to the DAG?
  // separated by a horizontal rule or something like that?") - a single
  // bordered container, not two separate cards, since clicking a DAG node
  // drives what's shown below it. dagInner keeps the Rail's own compact
  // padding; stageDetailInner supplies the flex/gap StageDetail's own
  // panel wrapper used to before this merge.
  dagCard: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 10, display: "flex", flexDirection: "column" },
  dagInner: { padding: "10px 12px 4px" },
  dagDivider: { border: "none", borderTop: ({ t }) => `1px solid ${t.lineSoft}`, margin: 0 },
  stageDetailInner: { padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 },
  panel: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 },
  panelTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  note: { fontSize: 12.5, fontStyle: "italic", padding: "14px 20px", color: ({ t }) => t.textLo }
}));
function envPillImage(env, delivery, pipelineRuns) {
  if (delivery.current) {
    const tag = deliveryTag(delivery.current);
    if (tag) return { tag, nickname: nicknameForImageTag(tag, pipelineRuns), incoming: true };
  }
  if (env.image) {
    const tag = imageTag(env.image);
    return { tag, nickname: nicknameForImageTag(tag, pipelineRuns), incoming: false };
  }
  return { incoming: false };
}
function DeploymentsTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const railClasses = useSignalRailStyles({ t });
  const { environments, loading, error, appName, gitopsPrs, pipelineOrder, deployHistory, provenanceByImage, refresh } = useReleaseContext();
  const cdEnvs = useMemo(() => environments.filter((e) => !isPreviewEnvName(e.env)), [environments]);
  const deliveries = useMemo(
    () => cdEnvs.map((env2) => ({
      env: env2,
      delivery: buildCdEnvDelivery(
        env2.env,
        gitopsPrs,
        env2.argoAppName ? {
          syncStatus: env2.argoSyncStatus,
          healthStatus: env2.argoHealthStatus,
          operationStartedAt: env2.argoOperationStartedAt,
          operationFinishedAt: env2.argoOperationFinishedAt,
          healthSince: env2.argoHealthSince,
          operationPhase: env2.argoOperationPhase,
          // So buildStepsCore can detect a failed hook resource
          // directly (see its own comment) - 2026-09-16 bug: "the
          // 'App sync' stage is still stuck, it pulses and never
          // sets its timestamp" - operationPhase itself can apparently
          // stay stuck 'Running' forever when a hook Job never
          // resolves cleanly (a real ArgoCD gap: a Kubernetes-level
          // Job deadline failure doesn't always get promptly reflected
          // in operationState.phase), so that alone isn't a reliable
          // failure signal - the Job's own live resource-tree health
          // is.
          resources: env2.argoResources
        } : void 0,
        deployHistory.data?.[env2.env],
        isRolloutActive(env2),
        // The Rollout's own live status.phase - see useCdDelivery.ts's
        // own comment on why a real Rollout-level failure needs to be a
        // distinct signal from ArgoCD's own (sometimes-stuck) operation
        // state (2026-09-17 bug: checkout-api-pre-prod's failed rollout
        // left the DAG stalled with no notification).
        env2.rolloutPhase === "Degraded"
      )
    })),
    [cdEnvs, gitopsPrs, deployHistory.data]
  );
  const tierGroups = useMemo(() => {
    const rank = (env2) => envStageRank(env2, pipelineOrder.data);
    return TIER_ORDER.map((tier) => {
      return {
        tier,
        items: deliveries.filter((d) => envTierOf(d.env.env, pipelineOrder) === tier).sort((a, b) => rank(a.env.env) - rank(b.env.env))
      };
    }).filter((g) => g.items.length > 0);
  }, [deliveries, pipelineOrder]);
  const [searchParams] = useSearchParams();
  const linkedEnv = searchParams.get("env") ?? void 0;
  const [selectedEnv, setSelectedEnv] = useState(void 0);
  useEffect(() => {
    if (selectedEnv && deliveries.some((d) => d.env.env === selectedEnv)) return;
    if (linkedEnv && deliveries.some((d) => d.env.env === linkedEnv)) {
      setSelectedEnv(linkedEnv);
      return;
    }
    const active = deliveries.find((d) => d.delivery.current || isRolloutActive(d.env));
    setSelectedEnv((active ?? deliveries[0])?.env.env);
  }, [deliveries, linkedEnv]);
  const hasActiveDelivery = deliveries.some((d) => d.delivery.current);
  useEffect(() => {
    if (!hasActiveDelivery) return void 0;
    const id = setInterval(refresh, 2e4);
    return () => clearInterval(id);
  }, [hasActiveDelivery]);
  const argoActions = useArgoActions();
  const pipelineRuns = useTektonPipelineRuns(appName);
  const preSelected = deliveries.find((d) => d.env.env === selectedEnv) ?? deliveries[0];
  const preActiveSteps = preSelected?.delivery.current?.steps ?? preSelected?.delivery.previous?.steps;
  const liveCurrentKey = preActiveSteps?.find((s) => s.status === "current")?.key;
  const [selectedStepKey, setSelectedStepKey] = useState(void 0);
  const selectedStepKeyRef = useRef(void 0);
  selectedStepKeyRef.current = selectedStepKey;
  const followRef = useRef({});
  useEffect(() => {
    const target = liveCurrentKey ?? preActiveSteps?.[preActiveSteps.length - 1]?.key;
    const prev = followRef.current;
    followRef.current = { env: selectedEnv, key: target };
    const dwell = prev.env === selectedEnv && prev.key !== void 0 && prev.key !== target && selectedStepKeyRef.current === prev.key;
    if (!dwell) {
      setSelectedStepKey(target);
      return void 0;
    }
    const id = setTimeout(() => {
      if (selectedStepKeyRef.current === prev.key) setSelectedStepKey(target);
    }, STAGE_DWELL_MS);
    return () => clearTimeout(id);
  }, [selectedEnv, liveCurrentKey]);
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  if (cdEnvs.length === 0) {
    return /* @__PURE__ */ jsxs("div", { className: classes.main, children: [
      /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "flex-end" }, children: /* @__PURE__ */ jsx(RefreshButton, { onClick: refresh }) }),
      /* @__PURE__ */ jsx(
        EnvPicker,
        {
          summary: "0 envs",
          groups: TIER_ORDER.map((tier) => ({ tier, items: [] }))
        }
      ),
      /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No environments configured for this app yet." })
    ] });
  }
  const selected = deliveries.find((d) => d.env.env === selectedEnv) ?? deliveries[0];
  const env = selected.env;
  const delivery = selected.delivery;
  const activeSteps = delivery.current?.steps ?? delivery.previous?.steps;
  const gateCi = (delivery.current ?? delivery.previous)?.pr?.ci;
  const guardrailsLabel = activeSteps?.find((s) => s.key === "guardrails")?.label;
  const guardrailsLabelOverride = gateCi && guardrailsLabel ? { key: "guardrails", text: `${guardrailsLabel} (${gateCi.passedChecks}/${gateCi.totalChecks})` } : void 0;
  const image = env.image;
  const provenance = image ? provenanceByImage[image] : void 0;
  const supplyChainStages = buildSupplyChainStages(provenance?.data, provenance?.loading ?? false);
  const hasSupplyChain = Boolean(provenance) && (provenance.loading || Boolean(provenance.data));
  const rolloutProgress = env.workload?.kind === "Rollout" ? env.workload.canaryProgress : void 0;
  const activeDelivery = delivery.current ?? delivery.previous;
  const incomingTag = delivery.current ? deliveryTag(delivery.current) : void 0;
  let liveTag;
  if (incomingTag) {
    const priorTag = delivery.previous ? deliveryTag(delivery.previous) : void 0;
    const runningTag = env.image ? imageTag(env.image) : void 0;
    liveTag = priorTag ?? (runningTag !== incomingTag ? runningTag : void 0);
  } else if (env.image) {
    liveTag = imageTag(env.image);
  }
  const liveImage = liveTag ? { tag: liveTag, nickname: nicknameForImageTag(liveTag, pipelineRuns.runs) } : void 0;
  const incomingImage = incomingTag ? { tag: incomingTag, nickname: nicknameForImageTag(incomingTag, pipelineRuns.runs) } : void 0;
  const progressingStep = delivery.current?.steps.find((s) => s.key === "progressing");
  const liveProgress = progressingStep?.status === "current" && rolloutProgress?.currentStepIndex !== void 0 && rolloutProgress.currentWeight !== void 0 ? `step ${Math.min(rolloutProgress.currentStepIndex + 1, rolloutProgress.steps.length)}/${rolloutProgress.steps.length} \xB7 ${rolloutProgress.currentWeight}% now` : void 0;
  const summary = {
    total: cdEnvs.length,
    progressing: deliveries.filter((d) => health(d.env) === "progressing" || isRolloutActive(d.env)).length,
    blocked: deliveries.filter((d) => health(d.env) === "degraded" || d.delivery.current?.steps.some((s) => s.status === "bad")).length
  };
  const pickerGroups = tierGroups.map((g) => ({
    tier: g.tier,
    items: g.items.map(({ env: e, delivery: d }) => {
      const pill = envPillImage(e, d, pipelineRuns.runs);
      return {
        key: e.env,
        envName: e.env,
        cluster: e.cluster,
        health: health(e),
        active: e.env === selectedEnv,
        imageTag: pill.tag,
        imageNickname: pill.nickname,
        incoming: pill.incoming,
        onClick: () => setSelectedEnv(e.env)
      };
    })
  }));
  return /* @__PURE__ */ jsxs("div", { className: classes.main, children: [
    /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "flex-end" }, children: /* @__PURE__ */ jsx(RefreshButton, { onClick: refresh }) }),
    /* @__PURE__ */ jsx(
      EnvPicker,
      {
        summary: `${summary.total} env${summary.total === 1 ? "" : "s"} \xB7 ${summary.progressing} progressing \xB7 ${summary.blocked} blocked`,
        groups: pickerGroups
      }
    ),
    /* @__PURE__ */ jsx(Typography, { className: classes.title, children: env.env }),
    /* @__PURE__ */ jsx(ArgoCommandPanel, { env, argoActions, currentImage: liveImage, incomingImage }),
    /* @__PURE__ */ jsx(TroubleshootBanner, { env, currentSteps: activeSteps }),
    /* @__PURE__ */ jsxs("div", { className: classes.dagCard, children: [
      /* @__PURE__ */ jsx("div", { className: classes.dagInner, children: activeSteps && activeSteps.length > 0 ? /* @__PURE__ */ jsx(
        Rail,
        {
          steps: activeSteps,
          classes: railClasses,
          t,
          labelOverride: guardrailsLabelOverride,
          metaOverride: liveProgress ? { key: "progressing", text: liveProgress } : void 0,
          selectedKey: selectedStepKey,
          onSelectKey: setSelectedStepKey
        }
      ) : /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
        "No delivery recorded for ",
        env.env,
        " yet."
      ] }) }),
      activeDelivery && selectedStepKey ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("hr", { className: classes.dagDivider }),
        /* @__PURE__ */ jsx("div", { className: classes.stageDetailInner, children: /* @__PURE__ */ jsx(
          StageDetail,
          {
            delivery: activeDelivery,
            selectedKey: selectedStepKey,
            gateCi,
            argoOperationMessage: env.argoOperationMessage,
            argoResources: env.argoResources,
            targetImageTag: deliveryTag(activeDelivery),
            env,
            rolloutProgress,
            onSelectStage: setSelectedStepKey
          }
        ) })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("hr", { className: classes.dagDivider }),
        /* @__PURE__ */ jsxs("div", { className: classes.stageDetailInner, children: [
          /* @__PURE__ */ jsx(Typography, { className: classes.panelTitle, children: "Deployment detail" }),
          /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
            "No release PRs found yet for ",
            env.env,
            "."
          ] })
        ] })
      ] })
    ] }),
    hasSupplyChain && /* @__PURE__ */ jsxs("div", { className: classes.panel, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.panelTitle, children: "Supply chain security" }),
      /* @__PURE__ */ jsx(PipelineFlow, { stages: supplyChainStages }),
      provenance?.error && /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
        "Couldn't load supply-chain data: ",
        provenance.error
      ] })
    ] })
  ] });
}

export { DeploymentsTab };
//# sourceMappingURL=DeploymentsTab.esm.js.map

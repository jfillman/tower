import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useEffect, useMemo, useRef } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { PageHeader, StatusChip, Subtabs } from '../ui/index.esm.js';
import { usePromote } from '../useReleaseData.esm.js';
import { useReleaseContext, applyCloudPins } from '../useReleaseContext.esm.js';
import { usePinnedTags } from '../environments/releasePins.esm.js';
import { ReleaseStats, CommandDeck } from '../CommandDeck.esm.js';
import { ReleaseHeroes } from '../ReleaseHeroes.esm.js';
import { ReleaseChangelog } from '../ReleaseChangelog.esm.js';
import { liveRelease, lastOutcome, nextReleasePath, noteCount, releaseStats } from '../releaseCards.esm.js';
import { ReleaseMatrix } from '../ReleaseMatrix.esm.js';
import { ReleaseLog, buildLogEntries } from '../ReleaseLog.esm.js';
import { LeadTimePanel } from '../TimelinePanel.esm.js';
import { PreviewEnvironmentsPanel } from '../PreviewEnvironmentsPanel.esm.js';
import { PromoteDialog } from '../PromoteDialog.esm.js';
import { useEntity } from '@backstage/plugin-catalog-react';
import { deployTargetOf } from '../serviceClass.esm.js';
import { CloudPromoteDialog } from './releases/CloudPromoteDialog.esm.js';
import { ReleaseRecordPanel } from '../ReleaseRecordPanel.esm.js';
import { useReleaseRecords, withRecordedEvidence } from '../useReleaseRecords.esm.js';
import { buildNextRelease } from '../nextRelease.esm.js';
import { useReleaseNames, draftStillBelongsTo } from '../useReleaseNames.esm.js';
import { useReleaseMode, useReleaseDraft, useSaveReleaseDraft, useSubmitReleaseMode, useReleasePlanned, RELEASE_MODE_LABEL, suggestNotes } from '../releaseFlow.esm.js';
import { ReleaseModeBar } from '../ReleaseModeBar.esm.js';
import { ReleaseDraftEditor } from '../ReleaseDraftEditor.esm.js';
import { isPreviewEnvName, splitImageRef } from '../types.esm.js';

const useStyles = makeStyles(() => ({
  panelSpacer: { marginTop: 16, scrollMarginTop: 16 },
  headerEnd: { display: "inline-flex", alignItems: "center", gap: 16, flexWrap: "wrap" }
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
  const flowTarget = owner && appName ? { owner, appName } : void 0;
  const [flowNonce, setFlowNonce] = useState(0);
  const [modeNonce, setModeNonce] = useState(0);
  const [requestedMode, setRequestedMode] = useState(void 0);
  const releaseMode = useReleaseMode(flowTarget, flowNonce + modeNonce);
  const savedDraft = useReleaseDraft(flowTarget, flowNonce);
  const saveDraft = useSaveReleaseDraft();
  const submitMode = useSubmitReleaseMode();
  const modePending = Boolean(requestedMode && submitMode.result && releaseMode.data?.mode !== requestedMode);
  useEffect(() => {
    if (!modePending) return void 0;
    const reread = () => setModeNonce((n) => n + 1);
    const timer = window.setInterval(reread, 2e4);
    const stop = window.setTimeout(() => window.clearInterval(timer), 15 * 6e4);
    window.addEventListener("focus", reread);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      window.removeEventListener("focus", reread);
    };
  }, [modePending]);
  const resetSubmitMode = submitMode.reset;
  useEffect(() => {
    if (requestedMode && releaseMode.data?.mode === requestedMode) {
      setRequestedMode(void 0);
      resetSubmitMode();
    }
  }, [requestedMode, releaseMode.data?.mode, resetSubmitMode]);
  const planned = useReleasePlanned(savedDraft.data?.milestone ? flowTarget : void 0, flowNonce);
  const flow = useMemo(
    () => releaseMode.data || savedDraft.data || savedDraft.notFound ? {
      draft: savedDraft.data,
      mode: releaseMode.data?.mode,
      signoffEnv: releaseMode.data?.signoffEnv,
      jiraBaseUrl: releaseMode.data?.jiraBaseUrl,
      planned: planned.data
    } : void 0,
    [releaseMode.data, savedDraft.data, savedDraft.notFound, planned.data]
  );
  const nextRelease = useMemo(
    () => buildNextRelease({
      records: releaseRecords,
      releases,
      sourcePrs,
      pipelineRuns,
      provenanceByImage,
      pipelineEnvironments: pipelineEnvironmentsForRecords,
      pipelineOrder,
      flow
    }),
    // pipelineEnvironmentsForRecords is a fresh array every render; environments is its stable source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [releaseRecords, releases, sourcePrs, pipelineRuns, provenanceByImage, environments, pipelineOrder, flow]
  );
  const releaseNames = useReleaseNames(owner && appName ? { owner, appName } : void 0, releaseRecords);
  const [activeTab, setActiveTab] = useState("record");
  const [openRecordId, setOpenRecordId] = useState(null);
  const panelRef = useRef(null);
  const showInPanel = (id) => {
    setOpenRecordId(id);
    setActiveTab("record");
    window.requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const [promoteTarget, setPromoteTarget] = useState(null);
  const promote = usePromote();
  const { entity } = useEntity();
  const target = deployTargetOf(entity);
  const isCloud = Boolean(target && target.id !== "k8s-rollout");
  const [cloudTarget, setCloudTarget] = useState(null);
  const [pinNonce, setPinNonce] = useState(0);
  const pinnedTags = usePinnedTags(isCloud ? owner : void 0, appName, isCloud ? pipelineOrder.upper ?? [] : [], pinNonce);
  const matrixReleases = useMemo(() => isCloud ? applyCloudPins(releases, pinnedTags) : releases, [isCloud, releases, pinnedTags]);
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
  const flightEnvs = pipelineOrder.upper ?? [];
  const lowerEnvs = pipelineOrder.lower ?? [];
  const byTag = new Map((releaseNames?.index ?? []).map((e) => [e.imageTag, e]));
  const evidenced = releaseRecords.map((r) => withRecordedEvidence(r, byTag.get(r.imageTag)));
  const signoffEnv = releaseMode.data?.signoffEnv;
  const live = liveRelease(evidenced, signoffEnv, flightEnvs);
  const last = lastOutcome(evidenced, live?.id);
  const nameOf = (tag) => tag ? releaseNames?.byTag.get(tag) : void 0;
  const leadingTag = nextRelease.leading?.imageTag;
  const path = nextReleasePath(leadingTag, nextRelease.leading?.liveOn ?? [], lowerEnvs, flightEnvs, pipelineEnvironments, gitopsPrs);
  const flightSteps = path.filter((p) => p.kind === "flight");
  const draftIsNexts = !draftStillBelongsTo(releaseNames, Boolean(savedDraft.data), gitopsPrs.map((pr) => pr.title));
  const heroNext = nextRelease.leading || nextRelease.scope.length > 0 ? {
    next: nextRelease,
    name: releaseNames?.next,
    path,
    notes: draftIsNexts ? noteCount(savedDraft.data) : 0,
    owner: draftIsNexts ? savedDraft.data?.owner : void 0,
    blocked: flightSteps.find((p) => p.state === "blocked"),
    openPr: [...flightSteps].reverse().find((p) => p.pr)
  } : void 0;
  const stats = releaseStats(deployHistory.data, gitopsPrs, sourcePrs);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(
      PageHeader,
      {
        title: "Releases",
        subtitle: /* @__PURE__ */ jsxs(Fragment, { children: [
          `${pipelineEnvironments.length} environment${pipelineEnvironments.length === 1 ? "" : "s"} tracked${owner && appName ? ` \xB7 ${owner}/${appName}` : ""}`,
          releaseMode.data && /* @__PURE__ */ jsxs(Fragment, { children: [
            " ",
            /* @__PURE__ */ jsxs(StatusChip, { tone: releaseMode.data.mode === "hand-flown" ? "warn" : "neutral", dot: true, children: [
              RELEASE_MODE_LABEL[releaseMode.data.mode],
              signoffEnv && releaseMode.data.mode === "hand-flown" ? ` \xB7 sign-off on ${signoffEnv}` : ""
            ] })
          ] })
        ] }),
        actions: /* @__PURE__ */ jsxs("span", { className: classes.headerEnd, children: [
          /* @__PURE__ */ jsx(ReleaseStats, { ...stats }),
          /* @__PURE__ */ jsx(RefreshButton, { onClick: refresh })
        ] })
      }
    ),
    /* @__PURE__ */ jsx(
      CommandDeck,
      {
        environments: pipelineEnvironments,
        gitopsPrs,
        sourcePrs,
        nextTag: leadingTag,
        onSelectTab: setActiveTab
      }
    ),
    /* @__PURE__ */ jsx(
      ReleaseHeroes,
      {
        next: heroNext,
        live,
        liveName: live ? nameOf(live.imageTag) : void 0,
        liveEnvCount: live ? live.deployments.filter((d) => d.isLive && flightEnvs.some((e) => e.toLowerCase() === d.env.toLowerCase())).length : 0,
        flightEnvCount: flightEnvs.length,
        signoffEnv: signoffEnv ?? flightEnvs[flightEnvs.length - 1],
        last,
        lastName: last ? nameOf(last.imageTag) : void 0,
        nameOf,
        onOpenDraft: () => showInPanel(null),
        onOpenRecord: showInPanel
      }
    ),
    /* @__PURE__ */ jsx(
      Subtabs,
      {
        label: "Release views",
        tabs: [
          { id: "record", label: `Releases (${releaseRecords.length})` },
          { id: "matrix", label: "Matrix" },
          { id: "log", label: "Log" },
          { id: "lead", label: "Lead time" },
          { id: "preview", label: `Preview (${previewEnvironments.length})` },
          ...releaseNames ? [{ id: "changelog", label: "Changelog" }] : []
        ],
        value: activeTab,
        onChange: setActiveTab
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: classes.panelSpacer, ref: panelRef, children: [
      activeTab === "changelog" && /* @__PURE__ */ jsx(ReleaseChangelog, { names: releaseNames, onBack: () => setActiveTab("record") }),
      activeTab === "matrix" && /* @__PURE__ */ jsx(
        ReleaseMatrix,
        {
          releases: matrixReleases,
          totalCount: releaseTotalCount,
          environments: pipelineEnvironments,
          provenanceByImage,
          onPromote: handlePromote,
          names: releaseNames?.byTag
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
          gitopsPrs,
          next: nextRelease,
          names: releaseNames,
          flightEnvs: pipelineOrder.upper,
          promoteTo: pipelineOrder.upper?.[0],
          modeLabel: releaseMode.data ? `${RELEASE_MODE_LABEL[releaseMode.data.mode]} release` : void 0,
          signoffEnv: releaseMode.data?.signoffEnv,
          openId: openRecordId,
          onOpenIdChange: setOpenRecordId,
          onChangelog: () => setActiveTab("changelog"),
          modeBar: releaseMode.data && owner && appName ? /* @__PURE__ */ jsx(
            ReleaseModeBar,
            {
              info: releaseMode.data,
              submitting: submitMode.loading,
              error: submitMode.error,
              prUrl: submitMode.result?.prUrl,
              waitingForMerge: modePending,
              onChange: (mode) => {
                setRequestedMode(mode);
                submitMode.submit({ owner, appName, mode });
              }
            }
          ) : void 0,
          draftEditor: owner && appName && (savedDraft.data || savedDraft.notFound) ? /* @__PURE__ */ jsx(
            ReleaseDraftEditor,
            {
              saved: saveDraft.result?.draft ?? savedDraft.data,
              suggested: suggestNotes(nextRelease.scope),
              canEdit: releaseMode.data?.canEditDraft ?? false,
              saving: saveDraft.loading,
              error: saveDraft.error,
              commitUrl: saveDraft.result?.commitUrl,
              belongsTo: draftStillBelongsTo(
                releaseNames,
                Boolean(savedDraft.data),
                gitopsPrs.map((pr) => pr.title)
              ),
              nextName: releaseNames?.next,
              onSave: async (draft) => {
                if (await saveDraft.submit({ owner, appName, draft })) setFlowNonce((n) => n + 1);
              }
            }
          ) : void 0,
          onPromote: (candidate) => {
            const lower = pipelineOrder.lower ?? [];
            const source = [...candidate.liveOn].sort(
              (a, b) => lower.indexOf(b) - lower.indexOf(a)
            )[0];
            handlePromote({ env: source, image: candidate.image }, pipelineOrder.upper[0]);
          }
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
        onDone: () => {
          refresh();
          setPinNonce((n) => n + 1);
        }
      }
    ),
    /* @__PURE__ */ jsx(
      PromoteDialog,
      {
        target: promoteTarget,
        onClose: () => setPromoteTarget(null),
        promote,
        targetIsLower,
        names: releaseNames,
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

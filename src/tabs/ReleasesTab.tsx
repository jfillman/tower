import { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useHangarTokens, type HangarTokens } from '../brand/tokens';
import { RefreshButton } from '../RefreshButton';
import { PageHeader, Subtabs } from '../ui';
import { usePromote } from '../useReleaseData';
import { applyCloudPins, useReleaseContext } from '../useReleaseContext';
import { usePinnedTags } from '../environments/releasePins';
import { CommandDeck } from '../CommandDeck';
import { ReleaseMatrix } from '../ReleaseMatrix';
import { ReleaseLog, buildLogEntries } from '../ReleaseLog';
import { LeadTimePanel } from '../TimelinePanel';
import { PreviewEnvironmentsPanel } from '../PreviewEnvironmentsPanel';
import { PromoteDialog } from '../PromoteDialog';
import { useEntity } from '@backstage/plugin-catalog-react';
import { deployTargetOf } from '../serviceClass';
import { CloudPromoteDialog, type CloudPromoteTarget } from './releases/CloudPromoteDialog';
import { ReleaseRecordPanel } from '../ReleaseRecordPanel';
import { useReleaseRecords } from '../useReleaseRecords';
import { buildNextRelease } from '../nextRelease';
import { draftStillBelongsTo, useReleaseNames } from '../useReleaseNames';
import {
  RELEASE_MODE_LABEL,
  suggestNotes,
  useReleaseDraft,
  useReleaseMode,
  useReleasePlanned,
  useSaveReleaseDraft,
  useSubmitReleaseMode,
  type ReleaseMode,
} from '../releaseFlow';
import { ReleaseModeBar } from '../ReleaseModeBar';
import { ReleaseDraftEditor } from '../ReleaseDraftEditor';
import { isPreviewEnvName, splitImageRef, type EnvironmentSummary } from '../types';

// Tower's Releases tab, revamped 2026-09-16 (Command Deck + Split Sub-tabs +
// the Log's Table/Timeline toggle - see that session's design discussion,
// built against the mockups at that time and the Tower field report's
// finding that Releases scored a real "gap" on the Own axis). Structure:
//
//   - CommandDeck: the permanent, dynamic top panel the field report and
//     user feedback both asked for - a full deck (env chips, a ranked task
//     queue, quick stats) plus a slim status bar that stays pinned while any
//     sub-tab scrolls. Replaces ReleaseStatusPanel (deleted this pass).
//   - Four sub-tabs (Matrix / Log / Lead time / Preview), not one long
//     stacked scroll - each fact now renders in exactly one place instead of
//     three (health, supply-chain detail) or being duplicated by an
//     always-rendered per-env ReleaseCard list (also deleted this pass -
//     its "Promote" action lives on the matrix's own frontier cell now, see
//     buildReleases' 'promotable' cell status).
//   - Preview/PR environments get their own tab instead of a matrix column
//     or a full-weight card mixed in with dev/test/staging/pre-prod/prod -
//     the same isPreviewEnvName split OverviewTab already established.
//
// Deliberately NOT in this pass: Rollback and a real ArgoCD "Force sync"
// action. The field report flagged both as the real remaining gap, but
// promoteEnvironment (packages/backend/src/glidepathPromote.ts) hard-enforces
// "target is exactly the stage after source" as a real safety invariant, and
// this backend has no ArgoCD write access at all (see useReleaseData.ts's
// own comment on useArgoStatusMap) - both need real, separately-scoped
// backend work, not a frontend button wired to nothing.

export type ReleasesSubTab = 'matrix' | 'log' | 'lead' | 'preview' | 'record';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  panelSpacer: { marginTop: 16 },
}));

export function ReleasesTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ctx = useReleaseContext();
  const { environments, loading, error, provenanceByImage, repoRef, owner, appName, pipelineOrder, gitopsPrs, sourcePrs, deployHistory, releases, releaseTotalCount, pipelineRuns, refresh } = ctx;

  // Computed unconditionally, before this component's early-return guards
  // below (loading/error/empty) - useReleaseRecords calls useMemo
  // internally, so it (like every other hook here) must run on every
  // render, not just once environments/releases are known good.
  const pipelineEnvironmentsForRecords = environments.filter(env => !isPreviewEnvName(env.env));
  const releaseRecords = useReleaseRecords(
    appName,
    pipelineEnvironmentsForRecords,
    releases,
    gitopsPrs,
    sourcePrs,
    pipelineRuns,
    provenanceByImage,
    pipelineOrder.lower,
    pipelineOrder.upper,
  );

  // R2: the app's release mode and the saved draft (notes, owner, risk), refetched after a save.
  const flowTarget = owner && appName ? { owner, appName } : undefined;
  const [flowNonce, setFlowNonce] = useState(0);
  // A mode change is a PR someone merges on GitHub, so Tower can't know when it lands: while one is pending, the mode
  // is re-read every 20 seconds and whenever this window gets focus back (2026-10-14 bug: after merging, the bar kept
  // the old mode until you left the tab and came back).
  const [modeNonce, setModeNonce] = useState(0);
  const [requestedMode, setRequestedMode] = useState<ReleaseMode | undefined>(undefined);
  const releaseMode = useReleaseMode(flowTarget, flowNonce + modeNonce);
  const savedDraft = useReleaseDraft(flowTarget, flowNonce);
  const saveDraft = useSaveReleaseDraft();
  const submitMode = useSubmitReleaseMode();
  const modePending = Boolean(requestedMode && submitMode.result && releaseMode.data?.mode !== requestedMode);
  useEffect(() => {
    if (!modePending) return undefined;
    const reread = () => setModeNonce(n => n + 1);
    const timer = window.setInterval(reread, 20_000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 15 * 60_000);
    window.addEventListener('focus', reread);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      window.removeEventListener('focus', reread);
    };
  }, [modePending]);
  // Once the new mode is in, the "PR opened" note has done its job.
  const resetSubmitMode = submitMode.reset;
  useEffect(() => {
    if (requestedMode && releaseMode.data?.mode === requestedMode) {
      setRequestedMode(undefined);
      resetSubmitMode();
    }
  }, [requestedMode, releaseMode.data?.mode, resetSubmitMode]);
  const planned = useReleasePlanned(savedDraft.data?.milestone ? flowTarget : undefined, flowNonce);
  const flow = useMemo(
    () =>
      releaseMode.data || savedDraft.data || savedDraft.notFound
        ? {
            draft: savedDraft.data,
            mode: releaseMode.data?.mode,
            signoffEnv: releaseMode.data?.signoffEnv,
            jiraBaseUrl: releaseMode.data?.jiraBaseUrl,
            planned: planned.data,
          }
        : undefined,
    [releaseMode.data, savedDraft.data, savedDraft.notFound, planned.data],
  );

  // The release in progress, shown above the records (Release Record R1). Computed here,
  // beside the records it follows, from the same data.
  const nextRelease = useMemo(
    () =>
      buildNextRelease({
        records: releaseRecords,
        releases,
        sourcePrs,
        pipelineRuns,
        provenanceByImage,
        pipelineEnvironments: pipelineEnvironmentsForRecords,
        pipelineOrder,
        flow,
      }),
    // pipelineEnvironmentsForRecords is a fresh array every render; environments is its stable source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [releaseRecords, releases, sourcePrs, pipelineRuns, provenanceByImage, environments, pipelineOrder, flow],
  );
  const releaseNames = useReleaseNames(owner && appName ? { owner, appName } : undefined, releaseRecords);

  const [activeTab, setActiveTab] = useState<ReleasesSubTab>('matrix');
  // source is a real EnvironmentSummary when promoting an already-deployed
  // release forward, or just its image when this is a first deploy of a
  // release that's never been deployed anywhere (2026-09-16: "trigger a
  // promotion to the first env" for a build-only release's matrix row) -
  // there's no environment to describe in that case, only the artifact.
  const [promoteTarget, setPromoteTarget] = useState<{
    source: EnvironmentSummary | { image: string };
    target: EnvironmentSummary;
  } | null>(null);
  const promote = usePromote();
  // A cloud target (glidepath ADR-0020) promotes by release pin PR, not through the Kubernetes gitops flow.
  const { entity } = useEntity();
  const target = deployTargetOf(entity);
  const isCloud = Boolean(target && target.id !== 'k8s-rollout');
  const [cloudTarget, setCloudTarget] = useState<CloudPromoteTarget | null>(null);
  const [pinNonce, setPinNonce] = useState(0);
  const pinnedTags = usePinnedTags(isCloud ? owner : undefined, appName, isCloud ? pipelineOrder.upper ?? [] : [], pinNonce);
  const matrixReleases = useMemo(() => (isCloud ? applyCloudPins(releases, pinnedTags) : releases), [isCloud, releases, pinnedTags]);

  // 2026-09-16: "clicking on the promote button should refresh the panel as
  // soon as the promotion PR has been created" - Promote is currently the
  // only write action this tab has (see this file's own header comment on
  // what's deliberately not here yet - Rollback/Force-sync), so this also
  // covers "refresh the releases tab after any action is taken" for now.
  // Fires once per successful promote.promote() call, not on every render -
  // handlePromote always calls promote.reset() before setting a new target,
  // so a fresh result is a real undefined->defined transition, not a stale
  // value surviving a re-render. Skipped for an alreadyOpen retry (nothing
  // new actually happened, gitopsPrs/deployHistory already reflect it).
  useEffect(() => {
    if (promote.result && !promote.result.alreadyOpen) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promote.result]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;

  const pipelineEnvironments = pipelineEnvironmentsForRecords;
  const previewEnvironments = environments.filter(env => isPreviewEnvName(env.env));

  const targetIsLower = promoteTarget
    ? (pipelineOrder.lower ?? []).some(e => e.toLowerCase() === promoteTarget.target.env.toLowerCase())
    : false;

  const handlePromote = (source: { env?: string; image?: string }, targetEnvName: string) => {
    if (isCloud) {
      const image = source.image ?? pipelineEnvironments.find(e => e.env === source.env)?.image;
      if (!image) return;
      setCloudTarget({ image, from: source.env, env: targetEnvName, flight: (pipelineOrder.upper ?? []).includes(targetEnvName) });
      return;
    }
    const target = pipelineEnvironments.find(e => e.env === targetEnvName);
    if (!target) return;
    if (source.env) {
      const sourceEnv = pipelineEnvironments.find(e => e.env === source.env);
      if (!sourceEnv) return;
      promote.reset();
      setPromoteTarget({ source: sourceEnv, target });
    } else if (source.image) {
      promote.reset();
      setPromoteTarget({ source: { image: source.image }, target });
    }
  };

  return (
    <div>
      <PageHeader
        title="Releases"
        subtitle={`${pipelineEnvironments.length} environment${pipelineEnvironments.length === 1 ? '' : 's'} tracked${owner && appName ? ` · ${owner}/${appName}` : ''}`}
        actions={<RefreshButton onClick={refresh} />}
      />
      <CommandDeck
        environments={pipelineEnvironments}
        previewCount={previewEnvironments.length}
        gitopsPrs={gitopsPrs}
        sourcePrs={sourcePrs}
        deployHistory={deployHistory.data}
        provenanceByImage={provenanceByImage}
        onSelectTab={setActiveTab}
      />

      <Subtabs
        label="Release views"
        tabs={[
          { id: 'matrix', label: 'Matrix' },
          { id: 'log', label: 'Log' },
          { id: 'lead', label: 'Lead time' },
          { id: 'preview', label: `Preview (${previewEnvironments.length})` },
          { id: 'record', label: `Record (${releaseRecords.length})` },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      <div className={classes.panelSpacer}>
        {activeTab === 'matrix' && (
          <ReleaseMatrix
            releases={matrixReleases}
            totalCount={releaseTotalCount}
            environments={pipelineEnvironments}
            provenanceByImage={provenanceByImage}
            onPromote={handlePromote}
            names={releaseNames?.byTag}
          />
        )}

        {activeTab === 'log' &&
          (deployHistory.loading ? (
            <Progress />
          ) : (
            <ReleaseLog
              entries={buildLogEntries(pipelineEnvironments, previewEnvironments, deployHistory.data ?? {}, gitopsPrs, sourcePrs, pipelineOrder, pipelineRuns)}
              pipelineEnvironments={pipelineEnvironments}
              deployHistory={deployHistory.data ?? {}}
              provenanceByImage={provenanceByImage}
            />
          ))}

        {activeTab === 'lead' &&
          (deployHistory.loading ? (
            <Progress />
          ) : (
            <LeadTimePanel environments={pipelineEnvironments} history={deployHistory.data ?? {}} repoRef={repoRef} gitopsPrs={gitopsPrs} />
          ))}

        {activeTab === 'preview' && (
          <PreviewEnvironmentsPanel previewEnvironments={previewEnvironments} sourcePrs={sourcePrs} />
        )}

        {activeTab === 'record' && (
          <ReleaseRecordPanel
            records={releaseRecords}
            totalKnown={releases.length}
            appName={appName}
            owner={owner}
            gitopsPrs={gitopsPrs}
            next={nextRelease}
            names={releaseNames}
            flightEnvs={pipelineOrder.upper}
            promoteTo={pipelineOrder.upper?.[0]}
            modeLabel={releaseMode.data ? `${RELEASE_MODE_LABEL[releaseMode.data.mode]} release` : undefined}
            signoffEnv={releaseMode.data?.signoffEnv}
            modeBar={
              releaseMode.data && owner && appName ? (
                <ReleaseModeBar
                  info={releaseMode.data}
                  submitting={submitMode.loading}
                  error={submitMode.error}
                  prUrl={submitMode.result?.prUrl}
                  waitingForMerge={modePending}
                  onChange={mode => {
                    setRequestedMode(mode);
                    submitMode.submit({ owner, appName, mode });
                  }}
                />
              ) : undefined
            }
            draftEditor={
              owner && appName && (savedDraft.data || savedDraft.notFound) ? (
                <ReleaseDraftEditor
                  saved={saveDraft.result?.draft ?? savedDraft.data}
                  suggested={suggestNotes(nextRelease.scope)}
                  canEdit={releaseMode.data?.canEditDraft ?? false}
                  saving={saveDraft.loading}
                  error={saveDraft.error}
                  commitUrl={saveDraft.result?.commitUrl}
                  belongsTo={draftStillBelongsTo(
                    releaseNames,
                    Boolean(savedDraft.data),
                    gitopsPrs.map(pr => pr.title),
                  )}
                  nextName={releaseNames?.next}
                  onSave={async draft => {
                    if (await saveDraft.submit({ owner, appName, draft })) setFlowNonce(n => n + 1);
                  }}
                />
              ) : undefined
            }
            onPromote={candidate => {
              // From the highest Ground environment running it; an image on none is promoted as an image.
              const lower = pipelineOrder.lower ?? [];
              const source = [...candidate.liveOn].sort(
                (a, b) => lower.indexOf(b) - lower.indexOf(a),
              )[0];
              handlePromote({ env: source, image: candidate.image }, pipelineOrder.upper![0]);
            }}
          />
        )}
      </div>

      <CloudPromoteDialog
        owner={owner}
        appName={appName}
        target={cloudTarget}
        onClose={() => setCloudTarget(null)}
        onDone={() => {
          refresh();
          setPinNonce(n => n + 1);
        }}
      />
      <PromoteDialog
        target={promoteTarget}
        onClose={() => setPromoteTarget(null)}
        promote={promote}
        targetIsLower={targetIsLower}
        names={releaseNames}
        onConfirm={() => {
          if (!promoteTarget || !repoRef) return;
          const { source, target } = promoteTarget;
          if ('env' in source) {
            promote.promote({
              owner: repoRef.owner,
              appName: source.appName ?? '',
              sourceCluster: source.cluster,
              sourceEnv: source.env,
              targetCluster: target.cluster,
              targetEnv: target.env,
            });
            return;
          }
          const split = splitImageRef(source.image);
          if (!split) return;
          promote.promote({
            owner: repoRef.owner,
            appName: target.appName ?? appName ?? '',
            sourceImageRepo: split.repo,
            sourceImageTag: split.tag,
            targetCluster: target.cluster,
            targetEnv: target.env,
          });
        }}
      />
    </div>
  );
}

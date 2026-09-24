import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { usePromote } from '../useReleaseData';
import { useReleaseContext } from '../useReleaseContext';
import { CommandDeck } from '../CommandDeck';
import { ReleaseMatrix } from '../ReleaseMatrix';
import { ReleaseLog, buildLogEntries } from '../ReleaseLog';
import { LeadTimePanel } from '../TimelinePanel';
import { PreviewEnvironmentsPanel } from '../PreviewEnvironmentsPanel';
import { PromoteDialog } from '../PromoteDialog';
import { ReleaseRecordPanel } from '../ReleaseRecordPanel';
import { useReleaseRecords } from '../useReleaseRecords';
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
  subnav: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 0,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
  },
  subtab: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 12,
    padding: '9px 18px',
    borderRadius: '6px 6px 0 0',
    color: ({ t }) => t.textFaint,
    background: 'none',
    border: '1px solid transparent',
    borderBottom: 'none',
    position: 'relative',
    top: 1,
    cursor: 'pointer',
  },
  subtabActive: {
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.panel,
    borderColor: ({ t }) => t.line,
  },
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
      <CommandDeck
        environments={pipelineEnvironments}
        previewCount={previewEnvironments.length}
        gitopsPrs={gitopsPrs}
        sourcePrs={sourcePrs}
        deployHistory={deployHistory.data}
        provenanceByImage={provenanceByImage}
        owner={owner}
        appName={appName}
        refresh={refresh}
        onSelectTab={setActiveTab}
      />

      <div className={classes.subnav}>
        <button
          type="button"
          className={`${classes.subtab} ${activeTab === 'matrix' ? classes.subtabActive : ''}`}
          onClick={() => setActiveTab('matrix')}
        >
          Matrix
        </button>
        <button
          type="button"
          className={`${classes.subtab} ${activeTab === 'log' ? classes.subtabActive : ''}`}
          onClick={() => setActiveTab('log')}
        >
          Log
        </button>
        <button
          type="button"
          className={`${classes.subtab} ${activeTab === 'lead' ? classes.subtabActive : ''}`}
          onClick={() => setActiveTab('lead')}
        >
          Lead time
        </button>
        <button
          type="button"
          className={`${classes.subtab} ${activeTab === 'preview' ? classes.subtabActive : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          Preview ({previewEnvironments.length})
        </button>
        <button
          type="button"
          className={`${classes.subtab} ${activeTab === 'record' ? classes.subtabActive : ''}`}
          onClick={() => setActiveTab('record')}
        >
          Record ({releaseRecords.length})
        </button>
      </div>

      <div className={classes.panelSpacer}>
        {activeTab === 'matrix' && (
          <ReleaseMatrix
            releases={releases}
            totalCount={releaseTotalCount}
            environments={pipelineEnvironments}
            provenanceByImage={provenanceByImage}
            onPromote={handlePromote}
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
          />
        )}
      </div>

      <PromoteDialog
        target={promoteTarget}
        onClose={() => setPromoteTarget(null)}
        promote={promote}
        targetIsLower={targetIsLower}
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

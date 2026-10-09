import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { useReleaseContext } from '../useReleaseContext';
import { linkFlowSlugsByChainId, useTektonPipelineRuns } from '../tekton/useTektonPipelineRuns';
import { useTektonResultsRuns } from '../tekton/useTektonResultsRuns';
import type { PipelineRunSummary } from '../tekton/types';
import { useRerunPipelineRun } from '../tekton/useRerunPipelineRun';
import { useCancelPipelineRun } from '../tekton/useCancelPipelineRun';
import { PipelineRunList } from '../PipelineRunList';
import { PipelineDag } from '../PipelineDag';
import { scrollPanelIntoView } from '../preventFocusScroll';
import { RefreshButton } from '../RefreshButton';
import { FilterBar, FilterChips, PageHeader } from '../ui';
import { GlidepathSummaryPanel } from '../GlidepathSummaryPanel';
import { isPreviewEnvName, isRolloutActive } from '../types';

// The CI half of what used to be one combined "CI / CD" tab - split out
// 2026-09-16 (HANDOFF-tower-cicd-redesign.md) so Pipelines (this file) and
// Deployments (tabs/deployments/DeploymentsTab.tsx, the new "Ground
// Control" ArgoCD/Rollouts command center) each get their own tab and their
// own URL. Per that handoff's explicit direction this half is a near-1:1
// lift of the old CiCdTab.tsx's Tekton run list/DAG - no redesign, only the
// removal of the CD panel (which moved to DeploymentsTab) and the
// cross-link to it at the bottom.
const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  sectionSub: { fontSize: 12, color: ({ t }) => t.textFaint },
  dagGap: { marginTop: 12 },
  note: { fontSize: 12.5, fontStyle: 'italic', padding: '14px 20px', color: ({ t }) => t.textLo },
  warnNote: { fontSize: 11.5, fontFamily: fontMono, padding: '10px 20px 0', color: ({ t }) => t.amberInk },
  dotLive: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: ({ t }) => t.amber,
    boxShadow: ({ t }) => `0 0 0 3px ${t.amberSoft}`,
    animation: '$pulse 1.6s ease-in-out infinite',
  },
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.5 },
  },
  activityBanner: {
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.amberSoft,
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 20,
  },
  activityHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 13,
    color: ({ t }) => t.amberInk,
    marginBottom: 10,
  },
  activityList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  activityChip: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    alignItems: 'flex-start',
    padding: '7px 13px',
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: ({ t }) => t.panel,
    cursor: 'pointer',
    textAlign: 'left',
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  activityChipLabel: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 12.5, color: ({ t }) => t.textHi },
  activityChipSub: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
}));

// How far back the run list reaches. 'live' is what the cluster still holds (Tekton deletes a finished run about an
// hour after it completes); the others add archived runs from Tekton Results, which keeps 30 days.
type HistoryRange = 'live' | '24h' | '7d' | '30d';
const HISTORY_RANGES: Array<{ key: HistoryRange; label: string; hours: number }> = [
  { key: 'live', label: 'Live', hours: 0 },
  { key: '24h', label: '24h', hours: 24 },
  { key: '7d', label: '7d', hours: 168 },
  { key: '30d', label: '30d', hours: 720 },
];
// Live view still reads a day of archive: a live run borrows its flow nickname from earlier stages already archived.
const LIVE_ARCHIVE_HOURS = 24;
const HISTORY_LIMIT = 500;

export function PipelinesTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { owner, environments, loading, error, appName, refresh } = useReleaseContext();

  const cdEnvs = environments.filter(e => !isPreviewEnvName(e.env));
  const pendingDeployCount = cdEnvs.filter(isRolloutActive).length;

  const [searchParams, setSearchParams] = useSearchParams();
  const linkedRun = searchParams.get('run') ?? undefined;
  const historyRange = (HISTORY_RANGES.find(r => r.key === searchParams.get('history'))?.key ?? 'live') as HistoryRange;
  const setHistoryRange = (range: HistoryRange) =>
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (range === 'live') next.delete('history');
      else next.set('history', range);
      return next;
    });

  const [ciRefreshNonce, setCiRefreshNonce] = useState(0);
  const refreshAll = () => {
    refresh();
    setCiRefreshNonce(n => n + 1);
  };

  const pipelineRuns = useTektonPipelineRuns(appName, ciRefreshNonce);
  // Widens linkFlowSlugsByChainId's own borrowing (see that function's
  // comment in useTektonPipelineRuns.ts) to also reach Tekton Results'
  // archived history, not just this hook's own live-cluster window - since
  // Results was enabled (glidepath docs/admin/tekton-results.md), a
  // completed run's PipelineRun/TaskRun CRs get deleted from the live
  // cluster ~1h after completion, well before some of that same flow's
  // OTHER stages (a release-outcome/-progress pair further down the chain)
  // do (2026-09-18 bug: "the flow slug has disappeared... release-outcome-
  // notify and release-progress-notify are missing it" - confirmed live:
  // the build run for a still-visible guardrail/release-tracking pair from
  // 40-58 minutes earlier no longer existed anywhere in the live cluster).
  // useReleaseContext.ts's own mergedPipelineRuns already solved this for
  // Releases/Overview; this tab still called the live-only hook directly
  // and never got the same fix. Deliberately does NOT change what's
  // rendered below - pipelineRuns.runs (the live window) stays the list
  // this tab shows, archived runs never appear as rows of their own here -
  // this only widens what a live run's OWN flowSlug can be borrowed from,
  // via the same in-place-mutation linkFlowSlugsByChainId already relies on
  // (a live run object in `byName` below is the exact same reference
  // pipelineRuns.runs holds, so setting its .flowSlug here is visible to
  // every other read of pipelineRuns.runs too).
  //
  // 2026-10-08: archived runs are also listed when a history range is picked (owner: "view pipelines and their
  // results for the last n pipelines and/or the last n hours"); the live view still lists live runs only.
  const rangeHours = HISTORY_RANGES.find(r => r.key === historyRange)!.hours;
  const archivedPipelineRuns = useTektonResultsRuns(
    appName,
    ciRefreshNonce,
    historyRange === 'live' ? LIVE_ARCHIVE_HOURS : rangeHours,
    HISTORY_LIMIT,
  );
  const mergedRuns = useMemo(() => {
    const byName = new Map<string, PipelineRunSummary>();
    archivedPipelineRuns.runs.forEach(run => byName.set(run.name, run));
    pipelineRuns.runs.forEach(run => byName.set(run.name, run));
    const merged = [...byName.values()].sort(
      (a, b) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime(),
    );
    linkFlowSlugsByChainId(merged);
    return merged;
  }, [pipelineRuns.runs, archivedPipelineRuns.runs]);
  const listRuns = historyRange === 'live' ? pipelineRuns.runs : mergedRuns;
  const rerun = useRerunPipelineRun(() => setCiRefreshNonce(n => n + 1));
  const cancelRun = useCancelPipelineRun(() => setCiRefreshNonce(n => n + 1));
  const [selectedRunName, setSelectedRunName] = useState<string | undefined>(undefined);
  const [dagExpandSignal, setDagExpandSignal] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (selectedRunName && mergedRuns.some(r => r.name === selectedRunName)) return;
    // A linked run may already be archived (deep links from the Release tab): it opens even in the live view.
    if (linkedRun && mergedRuns.some(r => r.name === linkedRun)) {
      setSelectedRunName(linkedRun);
      setDagExpandSignal(n => (n ?? 0) + 1);
      return;
    }
    setSelectedRunName(listRuns[0]?.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRuns, mergedRuns, linkedRun]);
  const selectedRun = mergedRuns.find(r => r.name === selectedRunName);
  const dagPanelRef = useRef<HTMLDivElement>(null);
  const selectRun = (name: string) => {
    setSelectedRunName(name);
    setDagExpandSignal(n => (n ?? 0) + 1);
    // Bring the details panel into view (2026-09-24 feedback) - a long run
    // list can leave it well below the fold, so a click looked like nothing
    // happened.
    scrollPanelIntoView(() => dagPanelRef.current);
  };

  const goToDeployments = () =>
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'deployments');
      return next;
    });

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;

  const activeRunItems = pipelineRuns.runs.filter(r => r.phase === 'running');
  // A delivery in flight (a rollout moving) belongs with the running pipelines: one place for what is active right now.
  const hasActivity = activeRunItems.length > 0 || pendingDeployCount > 0;

  let ciBody: JSX.Element;
  const listLoading = pipelineRuns.loading || (historyRange !== 'live' && archivedPipelineRuns.loading);
  if (pipelineRuns.error && !pipelineRuns.loading && listRuns.length === 0) {
    ciBody = <ResponseErrorPanel error={new Error(pipelineRuns.error)} />;
  } else if (listLoading && listRuns.length === 0) {
    ciBody = <Progress />;
  } else {
    ciBody = (
      <>
        {historyRange !== 'live' && archivedPipelineRuns.error && (
          <Typography className={classes.warnNote}>Archived runs unavailable: {archivedPipelineRuns.error}</Typography>
        )}
        <PipelineRunList
          runs={listRuns}
          selectedName={selectedRunName}
          onSelect={run => selectRun(run.name)}
          onRerun={rerun.rerun}
          rerunPending={rerun.pending}
          onCancel={cancelRun.cancel}
          cancelPending={cancelRun.pending}
        />
        {rerun.error && <Typography className={classes.warnNote}>Re-run failed: {rerun.error}</Typography>}
        {cancelRun.error && <Typography className={classes.warnNote}>Cancel failed: {cancelRun.error}</Typography>}
        {selectedRun && (
          <div className={classes.dagGap} ref={dagPanelRef} style={{ scrollMarginTop: 16 }}>
            <PipelineDag run={selectedRun} expandSignal={dagExpandSignal} />
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pipelines"
        subtitle="Build and check runs. Deliveries to environments are on the Deployments tab."
        actions={<RefreshButton onClick={refreshAll} />}
      />
      {owner && appName && <GlidepathSummaryPanel owner={owner} appName={appName} />}
      {hasActivity && (
        <div className={classes.activityBanner}>
          <div className={classes.activityHead}>
            <span className={classes.dotLive} />
            Active now
          </div>
          <div className={classes.activityList}>
            {activeRunItems.map(run => (
              <button
                key={`run-${run.name}`}
                type="button"
                className={classes.activityChip}
                onClick={() => selectRun(run.name)}
              >
                <span className={classes.activityChipLabel}>{run.pipelineName ?? run.name}</span>
                <span className={classes.activityChipSub}>running &middot; CI</span>
              </button>
            ))}
            {pendingDeployCount > 0 && (
              <button type="button" className={classes.activityChip} onClick={goToDeployments}>
                <span className={classes.activityChipLabel}>
                  {pendingDeployCount} deliver{pendingDeployCount === 1 ? 'y' : 'ies'} in flight
                </span>
                <span className={classes.activityChipSub}>rolling out &middot; open Deployments &rarr;</span>
              </button>
            )}
          </div>
        </div>
      )}
      <div>
        {/* No section title (2026-09-24: "does it make sense to still have the 'Continuous Integration' header?") - CD
            moved to the Deployments tab, so this tab is only pipelines and the tab name already says so. */}
        <FilterBar
          end={
            <span className={classes.sectionSub}>
              {listLoading
                ? 'loading…'
                : `${listRuns.length} pipeline run${listRuns.length === 1 ? '' : 's'}${
                    historyRange === 'live' ? ' still on the cluster' : ` in the last ${historyRange}${listRuns.length >= HISTORY_LIMIT ? ' (newest only)' : ''}`
                  }`}{' '}
              &middot; kind-dev
            </span>
          }
        >
          <FilterChips<HistoryRange>
            label="History"
            value={historyRange}
            onChange={setHistoryRange}
            options={HISTORY_RANGES.map(r => ({
              id: r.key,
              label: r.label,
              title: r.key === 'live' ? 'Runs still on the cluster (about the last hour)' : `Include archived runs from the last ${r.label}`,
            }))}
          />
        </FilterBar>
        {ciBody}
      </div>
    </div>
  );
}

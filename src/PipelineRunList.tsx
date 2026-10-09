import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { relativeTime, formatDateTime } from './shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { layoutPipelineGraph } from './tekton/pipelineGraph';
import type { PipelineRunSummary, RunPhase, TaskPhase } from './tekton/types';
import { Button, FilterBar, FilterChips, SearchField, StatusChip, type StatusTone, TextLink } from './ui';

// Rows sorted newest-started-first (useTektonPipelineRuns already sorts this
// way) with a small non-interactive DAG thumbnail per row - the
// "pipelinerun row images" half of the Tekton plugin the user asked to
// adopt. Real retention here is time-bounded, not count-bounded (confirmed
// live: a cluster-wide hourly `pipelinerun-pruner` CronJob keeps each
// (namespace, pipeline) pair's newest run forever and drops anything else
// past a 24h window) - a busy day's worth of build/deploy/test/gitops-bump
// chains can genuinely add up, hence both the search/filter (2026-09-11:
// brought back from the original mockup) and the row-count picker
// (2026-09-11 follow-up) rather than assuming a short, fixed-size list.

const STATUS_FILTERS: Array<{ key: 'all' | RunPhase; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'succeeded', label: 'Succeeded' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

// 2026-09-12: "pr builds could be a busy task that fills up the table. users
// might want to view release flows only" - 'ci' and 'pr-build' are the two
// reserved, platform-defined flow labels useTektonPipelineRuns.ts's own
// fetch already allows through (see that file's comment on why pr-build was
// added there) - a PR build can genuinely outnumber real release-chain runs
// on an active repo, so this is a separate filter dimension from status
// above, not folded into it.
// 2026-09-16: 'guardrail' added alongside the original two, not replacing
// them - useTektonPipelineRuns.ts no longer excludes anything running in
// this namespace at fetch time (it used to silently drop every real
// release-guardrail PipelineRun, which carries no flow label at all), so
// this chip is what lets a user isolate just those runs the same way the
// existing two isolate ci/pr-build. 'All flows' already shows everything,
// guardrail runs included, with no filter selected.
const FLOW_FILTERS: Array<{ key: 'all' | 'ci' | 'pr-build' | 'guardrail'; label: string }> = [
  { key: 'all', label: 'All flows' },
  { key: 'ci', label: 'Release flows' },
  { key: 'pr-build', label: 'Preview flows' },
  { key: 'guardrail', label: 'Guardrails' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number] | 'all';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  list: { maxHeight: 380, overflowY: 'auto', border: ({ t }) => `1px solid ${t.line}`, borderTop: 'none', borderRadius: '0 0 5px 5px' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 16px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    cursor: 'pointer',
    backgroundColor: ({ t }) => t.panel,
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  rowSelected: { backgroundColor: ({ t }) => t.panelAlt },
  rowLast: { borderBottom: 'none' },
  statusDot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  // Fixed width, not just a minWidth (2026-09-12 bug: "the mini-pipelines
  // are still not vertically aligned" - really a horizontal-alignment bug:
  // `main` used to size to its own title/meta text, so a row with a long
  // branch/sha/trigger string pushed `thumb` (and the mini-DAG inside it)
  // further right than a row with short text, staggering every row's graph
  // instead of lining them up in one column. A fixed width means `thumb`
  // always starts at the exact same x regardless of this row's own text
  // length; long meta text wraps onto a second line instead of stretching
  // the column, which MiniDag's own maxCols-shared-viewBox fix (see that
  // component's comment) already assumed was happening.
  main: { display: 'flex', flexDirection: 'column', gap: 2, flex: '0 0 260px', minWidth: 0 },
  title: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 13, color: ({ t }) => t.textHi },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, display: 'flex', flexWrap: 'wrap', gap: 6 },
  sha: { color: ({ t }) => t.sky, textDecoration: 'none' },
  shaLink: { '&:hover': { textDecoration: 'underline' } },
  thumb: { flex: 1, minWidth: 0 },
  side: { display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 },
  when: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, textAlign: 'right', minWidth: 70 },
  empty: { padding: '22px 18px', textAlign: 'center', fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textFaint },
  slugChip: {
    fontFamily: fontMono,
    fontSize: 10,
    padding: '1px 7px',
    borderRadius: 8,
    border: '1px solid',
    whiteSpace: 'nowrap',
    textAlign: 'center',
  },
  errorLine: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.bad,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 320,
  },
  footer: {
    padding: '8px 16px',
    border: ({ t }) => `1px solid ${t.line}`,
    borderTop: 'none',
    borderRadius: '0 0 5px 5px',
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textFaint,
  },
  // Distinct (bad/red) tone from rerunBtn - cancel tears down a run that's
  // actually in flight right now, a more consequential action than
  // resubmitting an already-finished one.
}));

// The only place a CDEvent-triggered run's flow-correlation slug exists is
// its own name (see useTektonPipelineRuns.ts's extractFlowSlug) - shown as a
// small chip, colored by a hash of the slug text itself rather than a fixed
// tone, so two rows sharing the same slug (the same flow execution, e.g.
// "vivid-egret" across a deploy/test/deploy/test chain) visibly match at a
// glance without needing any actual grouping/sorting logic.
// Exported for ReleaseMatrix.tsx's own nickname chip (2026-09-16: "using the
// same colour from the pipeline") - one hash, not two copies drifting apart.
export function slugHue(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return hash % 360;
}

// Exported for ReleaseRecordDetail.tsx's own pipeline-run list (2026-09-17,
// Tekton Results build/test/deploy/release data) - same phase pill language
// as this tab's own run list, reused rather than redrawn.
export function phaseTone(t: HangarTokens, phase: RunPhase) {
  switch (phase) {
    case 'succeeded':
      return { bg: t.goodSoft, border: t.good, fg: t.good, label: 'succeeded', status: 'ok' as StatusTone };
    case 'failed':
      return { bg: t.badSoft, border: t.bad, fg: t.bad, label: 'failed', status: 'bad' as StatusTone };
    case 'running':
      return { bg: t.amberSoft, border: t.amberLine, fg: t.amberInk, label: 'running', status: 'warn' as StatusTone };
    case 'cancelled':
      return { bg: t.panelAlt, border: t.line, fg: t.textLo, label: 'cancelled', status: 'neutral' as StatusTone };
    case 'pending':
    default:
      return { bg: t.panelAlt, border: t.line, fg: t.textFaint, label: 'pending', status: 'neutral' as StatusTone };
  }
}

function miniDotColor(t: HangarTokens, phase: TaskPhase): string {
  if (phase === 'succeeded') return t.good;
  if (phase === 'failed') return t.bad;
  if (phase === 'running') return t.amber;
  return t.textFaint;
}

function miniDotRadius(phase: TaskPhase | undefined): number {
  return phase === 'running' ? 4 : 3.2;
}

function MiniDag({ run, maxCols, maxRows }: { run: PipelineRunSummary; maxCols: number; maxRows: number }) {
  const t = useHangarTokens();
  const layout = layoutPipelineGraph(run);
  const colCounts = new Map<number, number>();
  layout.nodes.forEach(n => colCounts.set(n.col, (colCounts.get(n.col) ?? 0) + 1));
  const cellW = 26;
  const cellH = 9;
  // The viewBox width comes from the shared maxCols across every row in the
  // list, not this run's own layout.cols - each row's SVG independently
  // scales width:100% to the same fixed container width, so sizing the
  // viewBox to each row's own (usually different) column count gave each
  // row its own pixels-per-column scale: a 3-stage pipeline's dots got
  // stretched out to fill the exact same width as an 8-stage one right next
  // to it (2026-09-12: "ensure that all the miniature pipelines are column
  // aligned"). A shared width fixes that inconsistent stretch - every row
  // now uses the same pixels-per-column scale - while xMidYMid keeps a
  // shorter pipeline centered with breathing room on both sides, same look
  // as before that fix, rather than left-anchored (2026-09-12 follow-up:
  // "before it was nicely centered... move it back... just make sure
  // they're aligned with each other" - the alignment problem was always the
  // per-row scale, not the centering).
  const w = Math.max(1, maxCols) * cellW;
  const h = Math.max(1, maxRows) * cellH;

  const pos = new Map<string, { x: number; y: number }>();
  layout.nodes.forEach(n => {
    const count = colCounts.get(n.col) ?? 1;
    const offsetY = ((maxRows - count) * cellH) / 2;
    pos.set(n.id, { x: n.col * cellW + cellW / 2, y: offsetY + n.row * cellH + cellH / 2 });
  });

  // Hover info for the thumbnail itself (2026-09-12: "hovering over the
  // mini-pipeline... should produce some info... maybe which steps are
  // running") - a native title tooltip naming the in-flight/failed task(s)
  // rather than a full custom hovercard, since this is a small per-row
  // thumbnail, not the dedicated DAG view (which already has its own richer
  // per-node hover with step timings - see PipelineDag's hoverCard).
  const runningLabels = layout.nodes.filter(n => n.phase === 'running').map(n => n.label);
  const failedLabels = layout.nodes.filter(n => n.phase === 'failed').map(n => n.label);
  let hoverTitle = `${run.phase}`;
  if (runningLabels.length > 0) hoverTitle = `Running: ${runningLabels.join(', ')}`;
  else if (failedLabels.length > 0) hoverTitle = `Failed: ${failedLabels.join(', ')}`;

  return (
    <svg width="100%" height={34} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <title>{hoverTitle}</title>
      {layout.edges.map((e, i) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        // Side-to-side (2026-09-24), matching PipelineDag: leave the source dot's
        // right edge, arrive at the target dot's left edge. Was center-to-center
        // (see docs/pipeline-dag-edge-routing-before.md).
        const ra = miniDotRadius(layout.nodes.find(n => n.id === e.from)?.phase);
        const rb = miniDotRadius(layout.nodes.find(n => n.id === e.to)?.phase);
        return <line key={i} x1={a.x + ra} y1={a.y} x2={b.x - rb} y2={b.y} stroke={t.line} strokeWidth={1} />;
      })}
      {layout.nodes.map(n => {
        const p = pos.get(n.id);
        if (!p) return null;
        const color = miniDotColor(t, n.phase);
        const opacity = n.phase === 'pending' || n.phase === 'skipped' ? 0.35 : 1;
        return <circle key={n.id} cx={p.x} cy={p.y} r={miniDotRadius(n.phase)} fill={color} opacity={opacity} />;
      })}
    </svg>
  );
}

// The flow-correlation slug chip - shared by every stage of one flow
// execution. Originally only ever existed on a CDEvent-triggered run's own
// generated name, but the flow's own first stage (the git-triggered build
// pipeline) now gets one backfilled too via a shared chain-id
// (useTektonPipelineRuns.ts's linkFlowSlugsByChainId, 2026-09-12: "is there
// anything in the pipelinerun from a build pipeline that gets associated
// with the remaining flow pipelines? some way to visually link them") - so
// this chip now renders for either run shape, not just the CDEvent one.
function FlowSlugChip({ slug, classes }: { slug: string; classes: ReturnType<typeof useStyles> }) {
  const hue = slugHue(slug);
  return (
    <span
      className={classes.slugChip}
      style={{
        color: `hsl(${hue}, 65%, 60%)`,
        borderColor: `hsl(${hue}, 65%, 60%)`,
        backgroundColor: `hsla(${hue}, 65%, 60%, 0.12)`,
      }}
      title="Shared by every stage of this same flow execution, including the build that started it"
    >
      flow: {slug}
    </span>
  );
}

// deploy/test/release are all stage-generic pipeline names (see
// glidepath-catalog's pipelines/{deploy,test,release}.yaml) - every one of
// them declares its own top-level `env` param, so a bare "deploy"/"test"/
// "release" row gave no clue WHICH environment without opening the run
// (2026-09-16: "include the env that is being deployed/tested/released to").
// Reads spec.params (already captured into run.params by
// toPipelineRunSummary) rather than anything env-specific added just for
// this - the same param every one of those three Pipelines already declares.
export function pipelineTitle(run: PipelineRunSummary): string {
  // The still-stub release gates (itsm, qa, policy-validation) all run the one shared
  // governance-check Pipeline; which gate a run is lives only in its gate-name param. Titled like the real
  // gates' own Pipelines (sast-check, provenance-check, ...).
  if (run.pipelineName === 'governance-check') {
    const gate = run.params.find(p => p.name === 'gate-name')?.value;
    if (gate) return `${gate}-check`;
  }
  const env = run.params.find(p => p.name === 'env')?.value;
  if (env) {
    if (run.pipelineName === 'deploy') return `deploy to ${env}`;
    if (run.pipelineName === 'test') return `test ${env}`;
    if (run.pipelineName === 'release') return `releasing to ${env}`;
  }
  return run.pipelineName ?? run.name;
}

// A failed run's Succeeded condition `message` (Tekton's own summary, e.g.
// which task failed and why) - surfaced directly in the row rather than
// requiring a click into the DAG just to learn a build failed on, say, the
// unit-test step (2026-09-16: "failed pipelineruns should surface the error
// message"). Not shown for any other phase - a running/succeeded run's
// condition message is either empty or uninformative boilerplate.
function RunError({ run, classes }: { run: PipelineRunSummary; classes: ReturnType<typeof useStyles> }) {
  if (run.phase !== 'failed' || !run.message) return null;
  return (
    <span className={classes.errorLine} title={run.message}>
      {run.message}
    </span>
  );
}

// A run's descriptor is one of two genuinely different shapes depending on
// how it was triggered (2026-09-11) - a Pipelines-as-Code run off a real git
// push/PR carries a branch/commit/event, while a Tekton-Trigger run off a
// CDEvent (e.g. a flow's gitops-image-bump stage) carries none of that, only
// a pipeline name + the trigger that fired it.
function RunDescriptor({ run, classes }: { run: PipelineRunSummary; classes: ReturnType<typeof useStyles> }) {
  if (run.sha) {
    return (
      <div className={classes.main}>
        <span className={classes.title}>{pipelineTitle(run)}</span>
        <span className={classes.meta}>
          {(run.branch ?? run.name) && <span>{run.branch ?? run.name} &middot;</span>}
          {run.sourceRepoUrl ? (
            <a
              className={`${classes.sha} ${classes.shaLink}`}
              href={`${run.sourceRepoUrl}/commit/${run.sha}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >
              {run.sha.slice(0, 7)}
            </a>
          ) : (
            <span className={classes.sha}>{run.sha.slice(0, 7)}</span>
          )}
          {run.eventType && <span>&middot; trigger: {run.eventType}</span>}
        </span>
        <RunError run={run} classes={classes} />
        {run.flowSlug && <FlowSlugChip slug={run.flowSlug} classes={classes} />}
      </div>
    );
  }
  return (
    <div className={classes.main}>
      <span className={classes.title}>{pipelineTitle(run)}</span>
      <span className={classes.meta}>
        {run.pipelineName && <span className={classes.sha}>{run.name}</span>}
        {run.triggerName && <span>&middot; trigger: {run.triggerName}</span>}
      </span>
      <RunError run={run} classes={classes} />
      {run.flowSlug && <FlowSlugChip slug={run.flowSlug} classes={classes} />}
    </div>
  );
}

export function PipelineRunList({
  runs,
  selectedName,
  onSelect,
  onRerun,
  rerunPending,
  onCancel,
  cancelPending,
}: {
  runs: PipelineRunSummary[];
  selectedName?: string;
  onSelect: (run: PipelineRunSummary) => void;
  // Tower's Tekton "Re-run" action (HANDOFF-tower-write-actions.md Tier 1) -
  // optional so every other caller/test of this list stays untouched.
  // Rendered only on a 'failed' row; there's nothing meaningful to re-run
  // from a still-running or already-succeeded one.
  onRerun?: (run: PipelineRunSummary) => void;
  // Name of whichever run currently has a re-run request in flight, if any -
  // disables just that row's own button rather than the whole list, so a
  // slow request doesn't block re-running a different failed row.
  rerunPending?: string;
  // Tower's Tekton "Cancel" action - rendered only on a 'running' or
  // 'pending' row (nothing to cancel once a run has already finished one
  // way or the other). Same optional/per-row-pending shape as onRerun above.
  onCancel?: (run: PipelineRunSummary) => void;
  cancelPending?: string;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RunPhase>('all');
  const [flowFilter, setFlowFilter] = useState<'all' | 'ci' | 'pr-build' | 'guardrail'>('all');
  const [pageSize, setPageSize] = useState<PageSize>(25);

  if (runs.length === 0) {
    return <div className={classes.empty}>No pipeline runs found yet in this app's CI namespace.</div>;
  }

  const query = search.trim().toLowerCase();
  const filtered = runs.filter(run => {
    const matchesStatus = statusFilter === 'all' || run.phase === statusFilter;
    if (!matchesStatus) return false;
    const matchesFlow = flowFilter === 'all' || run.flow === flowFilter;
    if (!matchesFlow) return false;
    if (!query) return true;
    const haystack = [run.branch, run.pipelineName, run.sha, run.triggerName, run.eventType, run.flowSlug, run.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
  const visible = pageSize === 'all' ? filtered : filtered.slice(0, pageSize);
  const truncated = visible.length < filtered.length;
  // Shared across every visible row's MiniDag so their columns line up -
  // see that component's own comment on why.
  const maxCols = Math.max(1, ...visible.map(run => layoutPipelineGraph(run).cols));
  // 2026-09-17: maxRows needed the exact same fix as maxCols above, just
  // never got it until now the table started carrying real single-task rows
  // (guardrail checks, release-outcome-notify) - a run with `layout.maxRows`
  // of 1 was sizing its viewBox height to 1 cellH and letting
  // preserveAspectRatio scale that up to fill the same fixed 34px as an
  // 8-row build/test/deploy chain's viewBox, so its lone dot rendered
  // visibly larger than every other row's dots instead of matching them.
  const maxRows = Math.max(1, ...visible.map(run => layoutPipelineGraph(run).maxRows));

  return (
    <div>
      <FilterBar>
        <FilterChips
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTERS.map(f => ({ id: f.key, label: f.label }))}
        />
        <FilterChips
          label="Flow"
          value={flowFilter}
          onChange={setFlowFilter}
          options={FLOW_FILTERS.map(f => ({ id: f.key, label: f.label }))}
        />
        <FilterChips<string>
          label="Show"
          value={String(pageSize)}
          onChange={v => setPageSize(v === 'all' ? 'all' : (Number(v) as PageSize))}
          options={[...PAGE_SIZE_OPTIONS.map(n => ({ id: String(n), label: String(n) })), { id: 'all', label: 'All' }]}
        />
        <SearchField
          label="Filter runs"
          placeholder="Pipeline, flow, trigger, branch or sha…"
          value={search}
          onChange={setSearch}
        />
      </FilterBar>
      <div className={classes.list} style={truncated ? { borderRadius: 0 } : undefined}>
        {filtered.length === 0 && <div className={classes.empty}>No pipeline runs match this filter.</div>}
        {visible.map((run, i) => {
          // 'cancelling' (2026-09-24: "when you click on the 'cancel' button, the
          // 'running' chip should change to 'canceling'") - from the moment the
          // click is in flight, and afterwards for as long as the run's own
          // spec.status says it was asked to cancel but it hasn't reached a
          // terminal phase yet (CancelledRunFinally lets the finally block run
          // first, so that window can last a while).
          const cancelRequested = String((run.raw as { spec?: { status?: string } } | undefined)?.spec?.status ?? '').startsWith(
            'Cancelled',
          );
          const cancelling = (run.phase === 'running' || run.phase === 'pending') && (cancelPending === run.name || cancelRequested);
          const tone = cancelling
            ? { ...phaseTone(t, 'running'), label: 'canceling' }
            : phaseTone(t, run.phase);
          const durationLabel = (() => {
            if (!run.startTime) return '—';
            const start = new Date(run.startTime).getTime();
            const end = run.completionTime ? new Date(run.completionTime).getTime() : Date.now();
            const secs = Math.max(0, Math.round((end - start) / 1000));
            const mins = Math.floor(secs / 60);
            return mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
          })();
          return (
            <div
              key={run.name}
              className={`${classes.row} ${run.name === selectedName ? classes.rowSelected : ''} ${i === visible.length - 1 ? classes.rowLast : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(run)}
              onKeyDown={ev => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  onSelect(run);
                }
              }}
            >
              <span className={classes.statusDot} style={{ backgroundColor: tone.fg }} />
              <RunDescriptor run={run} classes={classes} />
              <div className={classes.thumb}>
                <MiniDag run={run} maxCols={maxCols} maxRows={maxRows} />
              </div>
              <div className={classes.side}>
                {run.phase === 'failed' && onRerun && !run.archive && (
                  <Button
                    small
                    disabled={rerunPending === run.name}
                    onClick={ev => {
                      ev.stopPropagation();
                      onRerun(run);
                    }}
                  >
                    {rerunPending === run.name ? 'Re-running…' : 'Re-run'}
                  </Button>
                )}
                {(run.phase === 'running' || run.phase === 'pending') && onCancel && (
                  <Button
                    small
                    variant="danger"
                    disabled={cancelPending === run.name || cancelling}
                    onClick={ev => {
                      ev.stopPropagation();
                      onCancel(run);
                    }}
                  >
                    {cancelling ? 'Canceling…' : 'Cancel'}
                  </Button>
                )}
                <StatusChip tone={tone.status}>{tone.label}</StatusChip>
                <span className={classes.when}>{durationLabel}</span>
                <span className={classes.when} title={run.startTime ? formatDateTime(run.startTime) : undefined}>
                  {run.startTime ? relativeTime(run.startTime) : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {truncated && (
        <div className={classes.footer}>
          Showing {visible.length} of {filtered.length} &middot;{' '}
          <TextLink onClick={() => setPageSize('all')}>show all</TextLink>
        </div>
      )}
    </div>
  );
}

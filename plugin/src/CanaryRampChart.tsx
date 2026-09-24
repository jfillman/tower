import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { formatDateTime } from '../shared/format';
import { preventFocusScroll } from './preventFocusScroll';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { useAnalysisRuns } from './useAnalysisRuns';
import type { AnalysisRunSummary, CanaryProgress, CanaryStepDef } from './types';

// Real canary weight chart + step ramp, replacing the mocked-up version
// (2026-09-11 design session, artifact 44818a11) with live data: real steps
// from the Rollout's own spec (useTowerEnvironments.ts's buildCanaryProgress)
// and real AnalysisRun metric results (useAnalysisRuns.ts). Geometry is
// shared between the chart and the ramp via one set of constants so the two
// always land on the same x per step (2026-09-11: "the rollout steps should
// also vertically align between the weight chart and the step ramp") -
// a chart that computed its own x-scale independently of the ramp's fixed
// column widths would drift the moment either one's constants changed.

const STEP_COL = 64;
const STEP_GAP = 2;
const STEP_LINE = 14;
const STEP_PITCH = STEP_COL + STEP_GAP + STEP_LINE + STEP_GAP; // 82
const CHART_GUTTER = 32; // left space reserved for 0/25/50/75/100% axis labels
const CHART_TRAIL = 14;
const CHART_HEIGHT = 130;

function stepCenterX(i: number): number {
  return CHART_GUTTER + STEP_PITCH * i + STEP_COL / 2;
}
function contentWidth(stepCount: number): number {
  return CHART_GUTTER + STEP_PITCH * Math.max(0, stepCount - 1) + STEP_COL;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { padding: '14px 16px', border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8, backgroundColor: ({ t }) => t.panelAlt },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 },
  headTitle: { fontFamily: fontMono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: ({ t }) => t.textFaint },
  headTitleValue: { color: ({ t }) => t.textLo, textTransform: 'none' },
  // Chart+ramp on the left (its own horizontal scroll for a long step list),
  // background analysis pinned on the right, never scrolled out of view with
  // it - a background AnalysisTemplate runs for the whole canary revision,
  // not at any one step position, so it doesn't belong inside the step ramp
  // itself (2026-09-12: "that should be present on the canary rollout step
  // diagram... maybe as a detached item on the right side?").
  // flexWrap (2026-09-16 bug: "the background analysis section covers the
  // graph and other steps when the browser window shrinks") - `scroll`
  // already handles a too-wide STEP LIST via its own overflowX, but at a
  // narrow enough container width there isn't room for both a legible chart
  // AND a fixed-240px side panel on the same row at all; without wrapping,
  // backgroundAnalysis (flex-shrink: 0) held its width and visually
  // overlapped the chart instead of the two ever properly sharing the row.
  // Wrapping drops it to its own full-width row below the chart instead -
  // never overlapping, whatever the container width.
  mainRow: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  scroll: { overflowX: 'auto', flex: '1 1 380px', minWidth: 0 },
  // flex-grow: 0 (2026-09-17 bug: "the background analysis section seems to
  // take precedence... causing the steps section to use a scrollbar" -
  // equal flex-grow: 1 on both this and `scroll` meant any extra row width
  // split evenly between them, so this panel (whose content is a fixed-size
  // card, never wider than it needs) kept claiming a share of space the step
  // ramp actually needed, pushing it into overflowX before it had to be).
  // Fixed at its own basis and free to shrink on a narrow row (unchanged
  // from before - see the flexWrap comment above); `scroll` alone now
  // absorbs any extra width the row has.
  // Wider (2026-09-24: "the background analysis panel... is a little squashed") -
  // the card holds a full PromQL query and measurement rows, which need real
  // horizontal room; the step ramp (`scroll`) scrolls sideways if it must.
  backgroundAnalysis: { flex: '1 1 380px', minWidth: 320 },
  backgroundAnalysisTitle: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: ({ t }) => t.textFaint,
    marginBottom: 6,
  },
  chartBox: { paddingBottom: 6 },
  ramp: { display: 'flex', alignItems: 'flex-start', gap: STEP_GAP, paddingLeft: CHART_GUTTER, paddingBottom: 4 },
  step: { flex: `0 0 ${STEP_COL}px`, width: STEP_COL, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, position: 'relative' },
  stepClickable: { cursor: 'pointer' },
  node: { width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid', fontSize: 12, backgroundColor: ({ t }) => t.panel },
  nodeCurrent: { animation: '$pulse 1.6s ease-in-out infinite' },
  '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
  // Live-canary activity on the weight chart itself (2026-09-23: "a little
  // more alive/active during a rollout") - the current step's dot pulses, a
  // halo ripples out from it, and the "x% now" label pulses amber. Only ever
  // applied to the step that stepState() says is 'current'.
  '@keyframes halo': { '0%': { opacity: 0.7, transform: 'scale(0.8)' }, '100%': { opacity: 0, transform: 'scale(2.2)' } },
  chartDotLive: { animation: '$pulse 1.2s ease-in-out infinite' },
  chartHalo: { transformBox: 'fill-box', transformOrigin: 'center', animation: '$halo 1.6s ease-out infinite' },
  nowLabelLive: { animation: '$pulse 1.2s ease-in-out infinite' },
  line: { flex: `0 0 ${STEP_LINE}px`, height: 2, marginTop: STEP_COL / 2 },
  label: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.textFaint, textAlign: 'center', lineHeight: 1.3 },
  labelValue: { display: 'block', color: ({ t }) => t.textHi, fontSize: 10 },
  legend: { display: 'flex', gap: 16, flexWrap: 'wrap', padding: '8px 2px 0', fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint },
  legendDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 5 },
  analysisCard: { marginTop: 12, padding: '12px 14px', border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8, backgroundColor: ({ t }) => t.panel },
  analysisHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  // The AnalysisRun/metric's own real message (2026-09-18: "canary error
  // messages need to surface better") - distinct from `note` (this
  // platform's generic "nothing to show" italic caption elsewhere in this
  // file) since this is an actual reported fact, not an absence.
  analysisMessage: { fontSize: 11.5, lineHeight: 1.5, marginBottom: 8, padding: '6px 8px', borderRadius: 6 },
  metricMessage: { fontFamily: fontMono, fontSize: 10, marginTop: 4 },
  analysisName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  badge: { fontFamily: fontMono, fontSize: 10, padding: '2px 8px', borderRadius: 10, border: '1px solid' },
  query: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint, backgroundColor: ({ t }) => t.panelAlt, padding: '6px 8px', borderRadius: 4, marginBottom: 10, overflowX: 'auto', whiteSpace: 'pre' },
  measureRow: { display: 'flex', gap: 14, alignItems: 'center', fontFamily: fontMono, fontSize: 11, padding: '4px 0', borderBottom: ({ t }) => `1px dashed ${t.lineSoft}` },
  measureRowLast: { borderBottom: 'none' },
  measureTime: { color: ({ t }) => t.textFaint, width: 172, flexShrink: 0, whiteSpace: 'nowrap' },
  measureVal: { color: ({ t }) => t.textHi },
  cond: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint, marginTop: 8 },
  note: { fontSize: 12, fontStyle: 'italic', color: ({ t }) => t.textLo, padding: '4px 0' },
}));

function stepLabelParts(s: CanaryStepDef): { icon: string; text: string; caption: string } {
  if (s.kind === 'setWeight') {
    return { icon: '●', text: `${s.weight}%`, caption: s.implied ? 'full promotion' : 'weight' };
  }
  if (s.kind === 'pause') return { icon: '⏱', text: s.pauseDuration ?? 'manual', caption: 'pause' };
  return { icon: '🧪', text: (s.analysisTemplates ?? []).join(', ') || 'analysis', caption: 'analysis' };
}

function phaseColor(t: HangarTokens, state: 'done' | 'current' | 'pending' | 'bad'): string {
  if (state === 'done') return t.good;
  if (state === 'current') return t.amber;
  if (state === 'bad') return t.bad;
  return t.textFaint;
}

// A step definition alone can't say whether an analysis step is "still
// running" vs "failed" - that only exists on the real AnalysisRun. A
// setWeight/pause step's own state comes purely from its position relative
// to currentStepIndex.
function stepState(
  index: number,
  currentStepIndex: number | undefined,
  run: AnalysisRunSummary | undefined,
): 'done' | 'current' | 'pending' | 'bad' {
  if (currentStepIndex === undefined) return 'pending';
  if (run?.phase === 'Failed' || run?.phase === 'Error') return 'bad';
  if (index < currentStepIndex) return 'done';
  if (index === currentStepIndex) return run?.phase === 'Successful' ? 'done' : 'current';
  return 'pending';
}

function analysisTone(t: HangarTokens, phase: string | undefined): { color: string; soft: string } {
  if (phase === 'Successful') return { color: t.good, soft: t.goodSoft };
  if (phase === 'Failed' || phase === 'Error') return { color: t.bad, soft: t.badSoft };
  return { color: t.amberInk, soft: t.amberSoft };
}

function AnalysisCard({ templateName, run, classes, t }: { templateName: string; run: AnalysisRunSummary; classes: ReturnType<typeof useStyles>; t: HangarTokens }) {
  const { color: toneColor, soft: toneSoft } = analysisTone(t, run.phase);
  return (
    <div className={classes.analysisCard}>
      <div className={classes.analysisHead}>
        <span className={classes.analysisName}>{templateName}</span>
        <span className={classes.badge} style={{ borderColor: toneColor, backgroundColor: toneSoft, color: toneColor }}>
          {run.phase ?? 'Unknown'}
        </span>
      </div>
      {run.message && (
        <Typography className={classes.analysisMessage} style={{ backgroundColor: toneSoft, color: toneColor }}>
          {run.message}
        </Typography>
      )}
      {run.metrics.length === 0 && <Typography className={classes.note}>No metric results recorded yet.</Typography>}
      {run.metrics.map(m => (
        <div key={m.name} style={{ marginBottom: 8 }}>
          {m.query && <div className={classes.query}>{m.query}</div>}
          {m.measurements.map((meas, i) => (
            <div key={i} className={`${classes.measureRow} ${i === m.measurements.length - 1 ? classes.measureRowLast : ''}`}>
              <span className={classes.measureTime}>{meas.at ? formatDateTime(meas.at) : '—'}</span>
              <span className={classes.measureVal}>{m.name} = {meas.value}</span>
            </div>
          ))}
          {m.successCondition && (
            <div className={classes.cond}>success condition: {m.successCondition}</div>
          )}
          {m.message && (
            <div className={classes.metricMessage} style={{ color: analysisTone(t, m.phase).color }}>
              {m.message}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function CanaryRampChart({
  cluster,
  namespace,
  rolloutName,
  podHash,
  progress,
}: {
  cluster: string;
  namespace: string;
  rolloutName: string;
  podHash?: string;
  progress: CanaryProgress;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  // Analysis-step results are shown inline by default and this only tracks the
  // ones the user collapsed (2026-09-24: "analysis check steps still don't show
  // their results" / "the first analysis job displayed results, but the second
  // did not") - the old click-to-open model showed at most ONE step's result at
  // a time and lost it whenever the tab re-rendered from its 20s refresh.
  const [collapsedSteps, setCollapsedSteps] = useState<Set<number>>(new Set());
  const analysisRuns = useAnalysisRuns({ cluster, namespace, rolloutName, podHash });

  const steps = progress.steps;
  const currentStepIndex = progress.currentStepIndex;
  const currentWeight = progress.currentWeight;

  // Argo Rollouts runs analysis steps strictly in order for one canary
  // revision - the Kth analysis-kind step in the spec is always the Kth
  // AnalysisRun chronologically for this podHash, regardless of whatever
  // internal name Argo Rollouts gave that run (confirmed live those names
  // don't reliably encode step position across revisions). Positional
  // pairing by start time is the one mapping that's always correct - but
  // only across step-analysis runs. useAnalysisRuns fetches every AnalysisRun
  // this Rollout owns, which as of the background-analysis feature now
  // includes the background run too - it starts at revision start, before
  // any step-analysis run, so left in this list it silently took slot 0 and
  // shifted every real step's result down by one (2026-09-12 bug: "the
  // canary step/graph is broken now for an active delivery" - confirmed live
  // on app-checkout-api-prod, mid-canary with both
  // status.canary.currentBackgroundAnalysisRunStatus and
  // currentStepAnalysisRunStatus populated at once). Excluded by name via
  // progress.currentBackgroundAnalysisRunName - the same live pointer
  // buildCanaryProgress already reads from status.canary, so this is exactly
  // Argo Rollouts' own idea of "which run is the background one", not a
  // guessed naming convention.
  // Prefer Argo Rollouts' own labels (rollout-type / step-index) - exact, and
  // still present after the rollout completes, unlike the live
  // status.canary.currentBackgroundAnalysisRunStatus pointer this used to
  // depend on (2026-09-24 bugs: "the background analysis panel... didn't
  // display anything" and "the analysis checks... no longer display the check
  // results" - both because that pointer is cleared once the rollout finishes,
  // leaving the background run miscounted as a step run). The positional
  // pairing below is only the fallback for runs missing those labels.
  const analysisStepIndices = steps.map((s, i) => ({ s, i })).filter(x => x.s.kind === 'analysis').map(x => x.i);
  const labelledStepRuns = analysisRuns.runs.filter(r => r.rolloutType === 'Step' && r.stepIndex !== undefined);
  const sortedRuns = analysisRuns.runs
    .filter(r => r.rolloutType !== 'Background' && r.name !== progress.currentBackgroundAnalysisRunName)
    .sort((a, b) => new Date(a.startedAt ?? 0).getTime() - new Date(b.startedAt ?? 0).getTime());
  const runByStepIndex = new Map<number, AnalysisRunSummary>();
  if (labelledStepRuns.length > 0) {
    // A step can be retried (same index, more than one run) - the newest wins.
    [...labelledStepRuns]
      .sort((a, b) => new Date(a.startedAt ?? 0).getTime() - new Date(b.startedAt ?? 0).getTime())
      .forEach(r => runByStepIndex.set(r.stepIndex!, r));
  } else {
    analysisStepIndices.forEach((stepIndex, k) => {
      if (sortedRuns[k]) runByStepIndex.set(stepIndex, sortedRuns[k]);
    });
  }

  if (steps.length === 0) {
    return <Typography className={classes.note}>This rollout declares no canary steps.</Typography>;
  }

  const width = contentWidth(steps.length) + CHART_TRAIL;
  const padT = 10;
  const padB = 20;
  const yFor = (pct: number) => padT + ((100 - pct) / 100) * (CHART_HEIGHT - padT - padB);

  // Carry the last setWeight forward across pause/analysis steps so the
  // line has a y-value at every step, not just the setWeight ones.
  let lastWeight = 0;
  const series = steps.map(s => {
    if (s.kind === 'setWeight' && s.weight !== undefined) lastWeight = s.weight;
    return lastWeight;
  });

  const boundary = currentStepIndex ?? 0;
  let donePath = '';
  let pendingPath = '';
  series.forEach((v, i) => {
    const x = stepCenterX(i);
    const y = yFor(v);
    if (i <= boundary) {
      donePath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      if (i === boundary) pendingPath += `M ${x} ${y}`;
    } else {
      pendingPath += ` L ${x} ${y}`;
    }
  });

  const ticks = [0, 25, 50, 75, 100];

  const backgroundTemplates = progress.backgroundAnalysisTemplates ?? [];
  const backgroundRun =
    analysisRuns.runs.find(r => r.rolloutType === 'Background') ??
    (progress.currentBackgroundAnalysisRunName
      ? analysisRuns.runs.find(r => r.name === progress.currentBackgroundAnalysisRunName)
      : undefined);

  return (
    <div className={classes.wrap}>
      <div className={classes.head}>
        <span className={classes.headTitle}>
          Canary rollout &middot; <span className={classes.headTitleValue}>{rolloutName}</span>
          {currentWeight !== undefined && <span className={classes.headTitleValue}> &middot; weight {currentWeight}%</span>}
        </span>
        {currentStepIndex !== undefined && (
          <span className={classes.headTitle}>step {Math.min(currentStepIndex + 1, steps.length)} / {steps.length}</span>
        )}
      </div>
      <div className={classes.mainRow}>
        <div className={classes.scroll}>
          <div className={classes.chartBox}>
            <svg style={{ display: 'block', width, height: CHART_HEIGHT }} width={width} height={CHART_HEIGHT} viewBox={`0 0 ${width} ${CHART_HEIGHT}`}>
              {ticks.map(tick => (
                <g key={tick}>
                  <line x1={CHART_GUTTER} y1={yFor(tick)} x2={width - CHART_TRAIL} y2={yFor(tick)} stroke={t.lineSoft} strokeWidth={1} />
                  <text x={CHART_GUTTER - 6} y={yFor(tick) + 3} textAnchor="end" fontFamily={fontMono} fontSize={9} fill={t.textFaint}>{tick}%</text>
                </g>
              ))}
              <path d={pendingPath} fill="none" stroke={t.textFaint} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} />
              <path d={donePath} fill="none" stroke={t.sky} strokeWidth={2} />
              {steps.map((s, i) => {
                const run = runByStepIndex.get(i);
                const state = stepState(i, currentStepIndex, run);
                const color = phaseColor(t, state);
                const x = stepCenterX(i);
                const y = yFor(series[i]);
                const filled = state === 'done' || state === 'current' || state === 'bad';
                const live = state === 'current';
                const halo = live ? <circle cx={x} cy={y} r={7} fill="none" stroke={color} strokeWidth={1.5} className={classes.chartHalo} /> : null;
                if (s.kind === 'analysis') {
                  return (
                    <g key={i}>
                    {halo}
                    <rect className={live ? classes.chartDotLive : undefined} x={x - 5} y={y - 5} width={10} height={10} fill={filled ? color : t.panel} stroke={color} strokeWidth={1.5} transform={`rotate(45 ${x} ${y})`} />
                    </g>
                  );
                }
                if (s.kind === 'pause') {
                  return (
                    <g key={i}>
                      {halo}
                      <circle className={live ? classes.chartDotLive : undefined} cx={x} cy={y} r={4} fill={t.panel} stroke={color} strokeWidth={1.5} />
                    </g>
                  );
                }
                return (
                  <g key={i}>
                  {halo}
                  <circle
                    className={live ? classes.chartDotLive : undefined}
                    cx={x}
                    cy={y}
                    r={5}
                    fill={filled ? color : t.panel}
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray={s.implied ? '2 2' : undefined}
                  />
                  </g>
                );
              })}
              {currentStepIndex !== undefined && currentStepIndex < steps.length && currentWeight !== undefined && (
                <text x={stepCenterX(currentStepIndex)} y={yFor(series[currentStepIndex]) - 14} textAnchor="middle" fontFamily={fontMono} fontWeight={600} fontSize={11} fill={t.amberInk} className={currentWeight < 100 ? classes.nowLabelLive : undefined}>
                  {currentWeight}% now
                </text>
              )}
            </svg>
          </div>
          <div className={classes.ramp}>
            {steps.map((s, i) => {
              const run = runByStepIndex.get(i);
              const state = stepState(i, currentStepIndex, run);
              const color = phaseColor(t, state);
              const parts = stepLabelParts(s);
              const clickable = s.kind === 'analysis' && Boolean(run);
              const toggle = () =>
                setCollapsedSteps(prev => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                });
              return (
                <div style={{ display: 'contents' }} key={i}>
                  <div
                    className={`${classes.step} ${clickable ? classes.stepClickable : ''}`}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? toggle : undefined}
                    onKeyDown={
                      clickable
                        ? ev => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault();
                              toggle();
                            }
                          }
                        : undefined
                    }
                  >
                    <div
                      className={`${classes.node} ${state === 'current' ? classes.nodeCurrent : ''}`}
                      style={{
                        borderColor: color,
                        borderStyle: s.implied ? 'dashed' : 'solid',
                        color,
                        backgroundColor: state === 'pending' ? t.panelAlt : t.panel,
                      }}
                    >
                      {parts.icon}
                    </div>
                    <span className={classes.label}>
                      <span className={classes.labelValue}>{parts.text}</span>
                      {parts.caption}
                    </span>
                  </div>
                  {i < steps.length - 1 && <div className={classes.line} style={{ backgroundColor: i < boundary ? t.good : t.line }} />}
                </div>
              );
            })}
          </div>
        </div>
        {backgroundTemplates.length > 0 && (
          <div className={classes.backgroundAnalysis}>
            <div className={classes.backgroundAnalysisTitle}>Background analysis</div>
            {backgroundRun ? (
              <AnalysisCard templateName={backgroundTemplates.join(', ')} run={backgroundRun} classes={classes} t={t} />
            ) : (
              <Typography className={classes.note}>{backgroundTemplates.join(', ')} - not currently running.</Typography>
            )}
          </div>
        )}
      </div>
      <div className={classes.legend}>
        <span><i className={classes.legendDot} style={{ backgroundColor: t.good }} />completed</span>
        <span><i className={classes.legendDot} style={{ backgroundColor: t.amber }} />current</span>
        <span><i className={classes.legendDot} style={{ backgroundColor: t.bad }} />failed</span>
        <span><i className={classes.legendDot} style={{ backgroundColor: t.textFaint, opacity: 0.5 }} />pending</span>
      </div>
      {analysisStepIndices.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className={classes.backgroundAnalysisTitle}>Analysis checks</div>
          {analysisStepIndices.map(i => {
            const run = runByStepIndex.get(i);
            const name = (steps[i].analysisTemplates ?? []).join(', ') || 'analysis';
            const label = `Step ${i + 1} · ${name}`;
            if (!run) {
              return (
                <Typography key={i} className={classes.note}>
                  {label} - not started yet.
                </Typography>
              );
            }
            const collapsed = collapsedSteps.has(i);
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onMouseDown={preventFocusScroll}
                  onClick={() =>
                    setCollapsedSteps(prev => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: fontMono, fontSize: 11, color: t.textLo }}
                >
                  {collapsed ? '▸' : '▾'} {label} · {run.phase ?? 'Unknown'}
                </button>
                {!collapsed && <AnalysisCard templateName={name} run={run} classes={classes} t={t} />}
              </div>
            );
          })}
        </div>
      )}
      {analysisStepIndices.length > 0 && analysisRuns.runs.length === 0 && !analysisRuns.loading && !analysisRuns.error && (
        <Typography className={classes.note}>
          No AnalysisRuns found for this rollout{podHash ? ` (pod hash ${podHash})` : ''} yet.
        </Typography>
      )}
      {analysisRuns.error && <Typography className={classes.note}>Couldn't load analysis results: {analysisRuns.error}</Typography>}
    </div>
  );
}

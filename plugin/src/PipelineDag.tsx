import { useEffect, useMemo, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import CheckIcon from '@material-ui/icons/Check';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import RemoveIcon from '@material-ui/icons/Remove';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import CloseIcon from '@material-ui/icons/Close';
import { dump as dumpYaml } from 'js-yaml';
import { formatDateTime, relativeTime } from '../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { TaskRunLogConsole, stepDuration } from './TaskRunLogConsole';
import { layoutPipelineGraph } from './tekton/pipelineGraph';
import type { PipelineRunSummary, TaskPhase, TaskRunSummary } from './tekton/types';

// The one piece of the Tekton plugin the user actually wants adopted here
// (2026-09-11: "the only part of the tekton plugin that i want incorporated
// is the expanded live DAG diagram part") - a real task graph, laid out by
// actual `runAfter` dependency depth (see pipelineGraph.ts), skinned in
// Hangar tokens instead of the stock Tekton dashboard's own palette, with
// live per-task status/logs instead of a static diagram.

export const NODE_W = 150;
export const NODE_H = 56;
export const COL_GAP = 90;
export const ROW_GAP = 24;
export const PAD = 32;
const FINALLY_EXTRA = 50;
const ELBOW_GAP = 18;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.2;

function layoutPixels(run: PipelineRunSummary) {
  const layout = layoutPipelineGraph(run);
  const colUnit = NODE_W + COL_GAP;
  const rowUnit = NODE_H + ROW_GAP;
  const colCounts = new Map<number, number>();
  layout.nodes.forEach(n => colCounts.set(n.col, (colCounts.get(n.col) ?? 0) + 1));
  const totalHeight = layout.maxRows * rowUnit - ROW_GAP;

  const pos = new Map<string, { x: number; y: number }>();
  layout.nodes.forEach(n => {
    const count = colCounts.get(n.col) ?? 1;
    const colHeight = count * rowUnit - ROW_GAP;
    const offsetY = (totalHeight - colHeight) / 2;
    const extraX = n.finally ? FINALLY_EXTRA : 0;
    pos.set(n.id, {
      x: PAD + n.col * colUnit + extraX + NODE_W / 2,
      y: PAD + offsetY + n.row * rowUnit + NODE_H / 2,
    });
  });

  const hasFinally = run.finallyTasks.length > 0;
  const width = PAD * 2 + layout.cols * colUnit - COL_GAP + (hasFinally ? FINALLY_EXTRA : 0);
  const height = PAD * 2 + Math.max(totalHeight, NODE_H);
  const finallyDividerX = hasFinally
    ? PAD + layout.finallyColStart * colUnit - COL_GAP / 2 + FINALLY_EXTRA / 2
    : undefined;

  return { layout, pos, width, height, finallyDividerX };
}

// Exported so the Deployment tab's rollout topology DAG (RolloutTopologyDag.tsx)
// wears the exact same node/edge/detail styling as this one (2026-09-24).
export const usePipelineDagStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 5, backgroundColor: ({ t }) => t.panelAlt },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 14px',
    flexWrap: 'wrap',
  },
  headTitle: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em' },
  headTitleValue: { color: ({ t }) => t.textLo },
  controls: { display: 'flex', alignItems: 'center', gap: 8 },
  zoomCtl: { display: 'flex', alignItems: 'center', border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, overflow: 'hidden' },
  zoomBtn: {
    width: 26,
    height: 24,
    background: ({ t }) => t.panel,
    border: 'none',
    cursor: 'pointer',
    fontFamily: fontMono,
    fontSize: 13,
    color: ({ t }) => t.textLo,
    '&:hover': { backgroundColor: ({ t }) => t.line },
  },
  zoomLabel: {
    minWidth: 42,
    textAlign: 'center',
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    borderLeft: ({ t }) => `1px solid ${t.line}`,
    borderRight: ({ t }) => `1px solid ${t.line}`,
    height: 24,
    lineHeight: '24px',
    background: ({ t }) => t.panel,
  },
  utilBtn: {
    height: 26,
    padding: '0 10px',
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    background: ({ t }) => t.panel,
    color: ({ t }) => t.textLo,
    fontFamily: fontMono,
    fontSize: 11,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    '&:hover': { backgroundColor: ({ t }) => t.line },
  },
  body: { padding: '0 14px 14px' },
  scroll: {
    width: '100%',
    overflow: 'auto',
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 5,
    backgroundColor: ({ t }) => t.panel,
  },
  sizer: { position: 'relative' },
  inner: { position: 'absolute', top: 0, left: 0, transformOrigin: 'top left' },
  finallyDivider: { position: 'absolute', top: 8, bottom: 8, width: 0, borderLeft: ({ t }) => `1px dashed ${t.line}` },
  finallyTag: {
    position: 'absolute',
    top: 0,
    fontFamily: fontMono,
    fontSize: 9,
    color: ({ t }) => t.textFaint,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  node: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
    borderRadius: 8,
    border: '1.5px solid',
    backgroundColor: ({ t }) => t.panel,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    cursor: 'pointer',
    transform: 'translate(-50%, -50%)',
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  nodeSelected: { boxShadow: ({ t }) => `0 0 0 2px ${t.sky}` },
  // 2026-09-12: "can we also make it slowly blink while its running like
  // elsewhere on the page? i want activity to be more prominent" - same
  // opacity pulse + timing as SignalRail's liveDot/gatesTogglePulse and
  // CiCdTab's dotLive, scoped locally since makeStyles keyframes aren't
  // shared across components.
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.5 },
  },
  nodeRunning: { animation: '$pulse 1.6s ease-in-out infinite' },
  hoverCard: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    marginBottom: 8,
    minWidth: 170,
    padding: '8px 10px',
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    pointerEvents: 'none',
    zIndex: 2,
    textAlign: 'left',
  },
  hoverTitle: {
    fontFamily: fontMono,
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: ({ t }) => t.textFaint,
    marginBottom: 5,
  },
  hoverRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textHi,
    padding: '2px 0',
  },
  hoverStep: { color: ({ t }) => t.sky },
  hoverDuration: { color: ({ t }) => t.textFaint, whiteSpace: 'nowrap' },
  dotRow: { display: 'flex', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  nodeLabel: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textHi, textAlign: 'center', lineHeight: 1.2 },
  nodeSub: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.textFaint, letterSpacing: '0.03em' },
  legend: { display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 2px 0', fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  legendDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 6 },
  detail: { marginTop: 12, padding: '14px 16px', backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8 },
  detailTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13.5, marginBottom: 8, color: ({ t }) => t.textHi },
  detailGrid: { display: 'flex', flexWrap: 'wrap', gap: '10px 22px', marginBottom: 8 },
  detailGridItem: { flex: '1 1 140px' },
  kvLabel: { fontFamily: fontMono, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: ({ t }) => t.textFaint, display: 'block' },
  kvValue: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi, wordBreak: 'break-word' },
  note: { fontSize: 12.5, fontStyle: 'italic', color: ({ t }) => t.textLo },
  logsWrap: { marginTop: 10, paddingTop: 10, borderTop: ({ t }) => `1px dashed ${t.lineSoft}` },
  ioSection: { marginTop: 10, paddingTop: 10, borderTop: ({ t }) => `1px dashed ${t.lineSoft}` },
  ioTitle: {
    fontFamily: fontMono,
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: ({ t }) => t.textFaint,
    marginBottom: 6,
  },
  ioRow: {
    display: 'flex',
    gap: 12,
    padding: '4px 0',
    borderBottom: ({ t }) => `1px dashed ${t.lineSoft}`,
    '&:last-child': { borderBottom: 'none' },
  },
  ioName: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.sky, flexShrink: 0, minWidth: 130 },
  ioValue: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textHi, wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
  pipelineDetail: { marginTop: 12, padding: '14px 16px', backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8 },
  pipelineDetailHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  dialogTitle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: fontMono,
    fontSize: 13,
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.panelAlt,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
  },
  dialogCloseBtn: { background: 'none', border: 'none', cursor: 'pointer', color: ({ t }) => t.textLo, display: 'flex' },
  yamlPre: {
    margin: 0,
    padding: 16,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6,
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.panel,
    whiteSpace: 'pre',
    overflow: 'auto',
  },
}));

function phaseColor(t: HangarTokens, phase: TaskPhase): { bg: string; border: string; fg: string } {
  switch (phase) {
    case 'succeeded':
      return { bg: t.goodSoft, border: t.good, fg: t.good };
    case 'failed':
      return { bg: t.badSoft, border: t.bad, fg: t.bad };
    case 'running':
      return { bg: t.amberSoft, border: t.amber, fg: t.amberInk };
    case 'skipped':
      return { bg: t.panelAlt, border: t.line, fg: t.textFaint };
    case 'pending':
    default:
      return { bg: t.panelAlt, border: t.line, fg: t.textFaint };
  }
}

function PhaseIcon({ phase }: { phase: TaskPhase }) {
  if (phase === 'succeeded') return <CheckIcon style={{ fontSize: 12 }} />;
  if (phase === 'failed') return <ErrorOutlineIcon style={{ fontSize: 12 }} />;
  if (phase === 'skipped') return <RemoveIcon style={{ fontSize: 12 }} />;
  return null;
}

function taskResultText(openTaskRun: TaskRunSummary | undefined, openTaskPhase: TaskPhase): string {
  if (openTaskRun) {
    if (openTaskRun.phase === 'running') return 'in progress…';
    return openTaskRun.reason ?? openTaskRun.phase;
  }
  if (openTaskPhase === 'skipped') return "skipped (this task's `when` condition wasn't met)";
  return 'not started yet';
}

// Some real param/result values are genuinely huge (a task's whole cicd.yaml
// re-serialized as `config-json`, confirmed live at several KB) - full text
// stays available via the native title tooltip, but inlining it unclipped
// would make one parameter dwarf the entire detail panel.
const IO_VALUE_MAX = 240;
function truncateIoValue(value: string): string {
  return value.length > IO_VALUE_MAX ? `${value.slice(0, IO_VALUE_MAX)}…` : value;
}

function taskDuration(startTime?: string, completionTime?: string): string {
  if (!startTime) return '—';
  const start = new Date(startTime).getTime();
  const end = completionTime ? new Date(completionTime).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1000));
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  const text = mins > 0 ? `${mins}m ${rem}s` : `${rem}s`;
  return completionTime ? text : `${text} so far`;
}

export function PipelineDag({ run, expandSignal }: { run: PipelineRunSummary; expandSignal?: number }) {
  const t = useHangarTokens();
  const classes = usePipelineDagStyles({ t });
  const { layout, pos, width, height, finallyDividerX } = useMemo(() => layoutPixels(run), [run]);

  const [zoom, setZoom] = useState(1);
  // Minimized by default (2026-09-11) - the run list already carries a
  // per-row MiniDag thumbnail, so the full interactive DAG is opt-in detail
  // rather than something every run load has to render/scroll past.
  const [collapsed, setCollapsed] = useState(true);
  // Also closed by default (2026-09-12: "make the pipelinerun inputs/results
  // info expandable too... only visible if I specifically click on a link")
  // - independent of `collapsed` above, which only governs the DAG diagram
  // itself. Expanding the DAG shouldn't also dump every top-level param/
  // result on screen; that needs its own explicit click.
  const [pipelineIoOpen, setPipelineIoOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | undefined>(undefined);
  const [hoverTaskId, setHoverTaskId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bumped by CiCdTab only when the user actually clicks a run row (not on
  // the tab's own initial auto-selection) - a deliberate click on a
  // different run should re-open the DAG even though it stays minimized by
  // default otherwise (2026-09-11 bug: "it sets the details panel to that
  // pipeline but it should open the panel"). `undefined` at mount so this
  // never fires on the very first render.
  useEffect(() => {
    if (expandSignal !== undefined) setCollapsed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal]);

  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));

  const fit = () => {
    const containerWidth = scrollRef.current?.clientWidth ?? width;
    setZoom(clampZoom(Math.min(1, containerWidth / width)));
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ left: 0, top: 0 }));
  };

  const center = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        left: (el.scrollWidth - el.clientWidth) / 2,
        top: (el.scrollHeight - el.clientHeight) / 2,
      });
    });
  };

  // Every "leaf" regular task gets its own dashed edge to every finally task
  // (see pipelineGraph.ts) - drawn as straight point-to-point curves, those
  // fan out starting from wherever each individual leaf happens to sit,
  // criss-crossing when leaves span different columns. Routing them as an
  // "elbow" instead - flat until they all line up with whichever leaf sits
  // closest to the finally column, only fanning out from that shared point -
  // reads as one coherent "the pipeline's done, now the finally tasks run"
  // moment instead of a tangle (2026-09-11 request). The elbow itself sits
  // ELBOW_GAP past that leaf's own right edge, not at its center - fanning
  // out exactly at the last task's own x put the bend visually behind/under
  // that node's box instead of clearly past it (2026-09-11 follow-up).
  const finallyElbowX = useMemo(() => {
    const xs = layout.edges
      .filter(e => e.finally)
      .map(e => pos.get(e.from)?.x)
      .filter((x): x is number => x !== undefined);
    return xs.length ? Math.max(...xs) + NODE_W / 2 + ELBOW_GAP : undefined;
  }, [layout, pos]);

  const openTask = layout.nodes.find(n => n.id === openTaskId);
  const openTaskRun = openTaskId ? run.taskRunsByPipelineTask[openTaskId] : undefined;
  const openTaskDef = openTaskId ? [...run.tasks, ...run.finallyTasks].find(td => td.name === openTaskId) : undefined;

  // The raw PipelineRun object is already fetched in full (see
  // useTektonPipelineRuns.ts's `raw`) - dumped as YAML on demand rather than
  // kept pre-rendered, since most runs are never inspected this deeply
  // (2026-09-11: "can we make the pipelineRun yaml available to view?").
  const [yamlOpen, setYamlOpen] = useState(false);

  return (
    <div className={classes.wrap}>
      <div className={classes.head}>
        <span className={classes.headTitle}>
          {run.pipelineName ?? 'pipeline'} &middot;{' '}
          <span className={classes.headTitleValue}>{run.name}</span>
        </span>
        <div className={classes.controls}>
          <button type="button" className={classes.utilBtn} onClick={() => setYamlOpen(true)}>
            YAML
          </button>
          <button type="button" className={classes.utilBtn} onClick={fit}>
            Fit
          </button>
          <button type="button" className={classes.utilBtn} onClick={center}>
            Center
          </button>
          <div className={classes.zoomCtl}>
            <button type="button" className={classes.zoomBtn} onClick={() => setZoom(z => clampZoom(z - ZOOM_STEP))}>
              −
            </button>
            <span className={classes.zoomLabel}>{Math.round(zoom * 100)}%</span>
            <button type="button" className={classes.zoomBtn} onClick={() => setZoom(z => clampZoom(z + ZOOM_STEP))}>
              +
            </button>
          </div>
          <button type="button" className={classes.utilBtn} onClick={() => setCollapsed(v => !v)}>
            {collapsed ? <ExpandMoreIcon style={{ fontSize: 14 }} /> : <ExpandLessIcon style={{ fontSize: 14 }} />}
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className={classes.body}>
          <div className={classes.scroll} ref={scrollRef}>
            <div className={classes.sizer} style={{ width: width * zoom, height: height * zoom }}>
              <div className={classes.inner} style={{ width, height, transform: `scale(${zoom})` }}>
                <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                  {layout.edges.map((e, i) => {
                    const a = pos.get(e.from);
                    const b = pos.get(e.to);
                    if (!a || !b) return null;
                    // Attach to the middle of each node's SIDES (2026-09-24), not
                    // its center: leave from the source's right edge, arrive at the
                    // target's left edge. Previous center-to-center routing is saved
                    // in docs/pipeline-dag-edge-routing-before.md.
                    const sx = a.x + NODE_W / 2;
                    const tx = b.x - NODE_W / 2;
                    let d: string;
                    if (e.finally && finallyElbowX !== undefined) {
                      const mx = (finallyElbowX + tx) / 2;
                      d = `M ${sx} ${a.y} L ${finallyElbowX} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${tx} ${b.y}`;
                    } else {
                      const mx = (sx + tx) / 2;
                      d = `M ${sx} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${tx} ${b.y}`;
                    }
                    return (
                      <path
                        key={`${e.from}-${e.to}-${i}`}
                        d={d}
                        fill="none"
                        stroke={t.line}
                        strokeWidth={1.5}
                        strokeDasharray={e.finally ? '3 3' : undefined}
                      />
                    );
                  })}
                </svg>
                {finallyDividerX !== undefined && (
                  <>
                    <div className={classes.finallyDivider} style={{ left: finallyDividerX }} />
                    <span className={classes.finallyTag} style={{ left: finallyDividerX + 8 }}>
                      finally
                    </span>
                  </>
                )}
                {layout.nodes.map(n => {
                  const p = pos.get(n.id);
                  if (!p) return null;
                  const color = phaseColor(t, n.phase);
                  const hoverTaskRun = hoverTaskId === n.id ? run.taskRunsByPipelineTask[n.id] : undefined;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={`${classes.node} ${openTaskId === n.id ? classes.nodeSelected : ''} ${n.phase === 'running' ? classes.nodeRunning : ''}`}
                      style={{ left: p.x, top: p.y, borderColor: color.border }}
                      onClick={() => setOpenTaskId(prev => (prev === n.id ? undefined : n.id))}
                      onMouseEnter={() => setHoverTaskId(n.id)}
                      onMouseLeave={() => setHoverTaskId(undefined)}
                    >
                      <span className={classes.dotRow}>
                        <span className={classes.dot} style={{ backgroundColor: color.fg }} />
                        <span className={classes.nodeLabel}>{n.label}</span>
                      </span>
                      <span className={classes.nodeSub} style={{ color: color.fg }}>
                        {n.sub ?? n.id} <PhaseIcon phase={n.phase} />
                      </span>
                      {hoverTaskRun && hoverTaskRun.steps.length > 0 && (
                        <div
                          className={classes.hoverCard}
                          style={{ transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: 'bottom center' }}
                        >
                          <div className={classes.hoverTitle}>Steps</div>
                          {hoverTaskRun.steps.map(step => (
                            <div key={step.container} className={classes.hoverRow}>
                              <span className={classes.hoverStep}>{step.name}</span>
                              <span className={classes.hoverDuration}>
                                {step.state === 'waiting' ? 'queued' : (stepDuration(step) ?? '—')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className={classes.legend}>
            <span><span className={classes.legendDot} style={{ backgroundColor: t.good }} />succeeded</span>
            <span><span className={classes.legendDot} style={{ backgroundColor: t.amber }} />running</span>
            <span><span className={classes.legendDot} style={{ backgroundColor: t.bad }} />failed</span>
            <span><span className={classes.legendDot} style={{ backgroundColor: t.textFaint, opacity: 0.5 }} />pending / skipped</span>
          </div>
          {/* The whole PipelineRun's own top-level params/results - distinct
              from any one task's, and shown regardless of which (if any)
              task node is selected below (2026-09-11: "add the pipeline
              inputs and results somewhere in the expanded panel below the
              DAG"). */}
          {(run.params.length > 0 || run.results.length > 0) && (
            <div className={classes.pipelineDetail}>
              <div className={classes.pipelineDetailHead}>
                <Typography className={classes.detailTitle} style={{ marginBottom: 0 }}>
                  Pipeline
                </Typography>
                <button type="button" className={classes.utilBtn} onClick={() => setPipelineIoOpen(v => !v)}>
                  {pipelineIoOpen ? <ExpandLessIcon style={{ fontSize: 14 }} /> : <ExpandMoreIcon style={{ fontSize: 14 }} />}
                  {pipelineIoOpen ? 'Hide inputs & results' : 'Show inputs & results'}
                </button>
              </div>
              {pipelineIoOpen && (
                <>
                  {run.params.length > 0 && (
                    <div className={classes.ioSection}>
                      <div className={classes.ioTitle}>Input parameters</div>
                      {run.params.map(p => (
                        <div key={p.name} className={classes.ioRow}>
                          <span className={classes.ioName}>{p.name}</span>
                          <span className={classes.ioValue} title={p.value}>
                            {truncateIoValue(p.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {run.results.length > 0 && (
                    <div className={classes.ioSection}>
                      <div className={classes.ioTitle}>Results</div>
                      {run.results.map(r => (
                        <div key={r.name} className={classes.ioRow}>
                          <span className={classes.ioName}>{r.name}</span>
                          <span className={classes.ioValue} title={r.value}>
                            {truncateIoValue(r.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {openTask && (
            <div className={classes.detail}>
              <Typography className={classes.detailTitle}>{openTask.label}</Typography>
              <div className={classes.detailGrid}>
                <div className={classes.detailGridItem}>
                  <span className={classes.kvLabel}>Duration</span>
                  <span className={classes.kvValue}>
                    {openTaskRun ? taskDuration(openTaskRun.startTime, openTaskRun.completionTime) : '—'}
                  </span>
                </div>
                {/* The Task field only earns its place when the referenced Task
                    resource's name actually differs from this pipeline task's
                    own name - the two are usually identical (confirmed live:
                    "build-image"/"build-image"), which just repeated the title
                    right above it (2026-09-11 bug report). */}
                {openTaskDef?.taskRefName && openTaskDef.taskRefName !== openTask.label && (
                  <div className={classes.detailGridItem}>
                    <span className={classes.kvLabel}>Task</span>
                    <span className={classes.kvValue}>{openTaskDef.taskRefName}</span>
                  </div>
                )}
                <div className={classes.detailGridItem}>
                  <span className={classes.kvLabel}>Result</span>
                  <span className={classes.kvValue} title={openTaskRun?.message}>
                    {taskResultText(openTaskRun, openTask.phase)}
                  </span>
                </div>
              </div>
              {openTaskRun?.startTime && (
                <Typography className={classes.note} style={{ marginBottom: 0 }}>
                  Started {relativeTime(openTaskRun.startTime)} &middot; {formatDateTime(openTaskRun.startTime)}
                </Typography>
              )}
              {openTaskRun && openTaskRun.params.length > 0 && (
                <div className={classes.ioSection}>
                  <div className={classes.ioTitle}>Input parameters</div>
                  {openTaskRun.params.map(p => (
                    <div key={p.name} className={classes.ioRow}>
                      <span className={classes.ioName}>{p.name}</span>
                      <span className={classes.ioValue} title={p.value}>
                        {truncateIoValue(p.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {openTaskRun && openTaskRun.results.length > 0 && (
                <div className={classes.ioSection}>
                  <div className={classes.ioTitle}>Results</div>
                  {openTaskRun.results.map(r => (
                    <div key={r.name} className={classes.ioRow}>
                      <span className={classes.ioName}>{r.name}</span>
                      <span className={classes.ioValue} title={r.value}>
                        {truncateIoValue(r.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {openTaskRun?.podName && openTaskRun.steps.length > 0 && (
                <div className={classes.logsWrap}>
                  <div className={classes.ioTitle}>Logs</div>
                  <TaskRunLogConsole
                    cluster={run.cluster}
                    namespace={openTaskRun.namespace}
                    podName={openTaskRun.podName}
                    steps={openTaskRun.steps}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <Dialog open={yamlOpen} onClose={() => setYamlOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle className={classes.dialogTitle} disableTypography>
          <span>
            {run.name}.yaml
          </span>
          <button type="button" className={classes.dialogCloseBtn} onClick={() => setYamlOpen(false)}>
            <CloseIcon style={{ fontSize: 18 }} />
          </button>
        </DialogTitle>
        <DialogContent style={{ padding: 0 }}>
          <pre className={classes.yamlPre}>{dumpYaml(run.raw)}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

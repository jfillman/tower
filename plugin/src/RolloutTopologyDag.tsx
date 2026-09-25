import { useEffect, useMemo, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { dump as dumpYaml } from 'js-yaml';
import { formatDateTime, relativeTime } from '../shared/format';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { preventFocusScroll } from './preventFocusScroll';
import { PodLogsView } from './PodLogsView';
import { COL_GAP, NODE_H, NODE_W, PAD, ROW_GAP, usePipelineDagStyles } from './PipelineDag';
import {
  useRolloutTopology,
  type K8sObj,
  type RolloutTopology,
  type TopoAnalysisRun,
  type TopoPod,
  type TopoReplicaSet,
} from './useRolloutTopology';

// The Deployment tab's "Rollout Starts" Kubernetes topology DAG (2026-09-24):
// Service -> Rollout -> ReplicaSet(s) -> Pods, plus AnalysisRuns (and their
// Job pods) hanging off the Rollout. Same node/edge/detail styling as the
// Pipelines tab's DAG (it literally reuses that component's style hook), live
// via useRolloutTopology's polling. Traffic numbers are SIMULATED - only the
// weight split on the edges is real (Rollout status), the req/s is not.

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.2;

type Kind = 'Service' | 'Rollout' | 'ReplicaSet' | 'Pod' | 'AnalysisRun';
type DetailTab = 'info' | 'yaml' | 'logs';

interface TNode {
  id: string;
  kind: Kind;
  label: string;
  sub: string;
  tag?: 'canary' | 'stable';
  col: number;
  row: number; // fractional, in row units
  tone: 'good' | 'amber' | 'bad' | 'sky' | 'faint';
  pulse?: boolean;
  dim?: boolean;
  obj: K8sObj;
  pod?: TopoPod;
  ar?: TopoAnalysisRun;
}
interface TEdge {
  from: string;
  to: string;
  weight?: number; // 0-100, undefined = unweighted (dashed relationship)
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  '@keyframes flow': { to: { strokeDashoffset: -24 } },
  edgeFlow: { strokeDasharray: '6 6', animationName: '$flow', animationTimingFunction: 'linear', animationIterationCount: 'infinite' },
  edgeLabel: { fontFamily: fontMono, fontSize: 10, fontWeight: 700 },
  tag: { fontFamily: fontMono, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0 5px', borderRadius: 6, marginLeft: 4 },
  traffic: { position: 'absolute', display: 'flex', alignItems: 'center', gap: 5, fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.amberInk, whiteSpace: 'nowrap', transform: 'translate(-50%, -100%)' },
  tabs: { display: 'flex', gap: 6, marginBottom: 10 },
  tabBtn: { fontFamily: fontMono, fontSize: 11, padding: '3px 10px', borderRadius: 6, border: ({ t }) => `1px solid ${t.line}`, background: 'none', color: ({ t }) => t.textLo, cursor: 'pointer' },
  tabBtnOn: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  yaml: { margin: 0, padding: 12, fontFamily: fontMono, fontSize: 11.5, lineHeight: 1.55, color: ({ t }) => t.textHi, backgroundColor: ({ t }) => t.bg, border: ({ t }) => `1px solid ${t.lineSoft}`, borderRadius: 4, maxHeight: 420, overflow: 'auto', whiteSpace: 'pre' },
}));

function toneColor(t: HangarTokens, tone: TNode['tone']) {
  switch (tone) {
    case 'good': return { bg: t.goodSoft, border: t.good, fg: t.good };
    case 'amber': return { bg: t.amberSoft, border: t.amber, fg: t.amberInk };
    case 'bad': return { bg: t.badSoft, border: t.bad, fg: t.bad };
    case 'sky': return { bg: t.skySoft, border: t.sky, fg: t.sky };
    default: return { bg: t.panelAlt, border: t.line, fg: t.textFaint };
  }
}

function podTone(p: TopoPod): Pick<TNode, 'tone' | 'pulse' | 'dim'> {
  if (p.terminating) return { tone: 'faint', pulse: true, dim: true };
  if (p.phase === 'Failed') return { tone: 'bad' };
  if (p.phase === 'Succeeded') return { tone: 'good' };
  if (p.ready) return { tone: 'good' };
  return { tone: 'amber', pulse: true };
}

function arTone(phase: string): Pick<TNode, 'tone' | 'pulse'> {
  if (phase === 'Successful') return { tone: 'good' };
  if (phase === 'Failed' || phase === 'Error') return { tone: 'bad' };
  if (phase === 'Running' || phase === 'Pending') return { tone: 'amber', pulse: true };
  return { tone: 'faint' };
}

function roleWeight(role: string, canaryWeight: number): number {
  if (role === 'canary') return canaryWeight;
  if (role === 'stable') return 100 - canaryWeight;
  return 0;
}

function roleTone(role: string): TNode['tone'] {
  if (role === 'canary') return 'amber';
  if (role === 'stable') return 'good';
  return 'faint';
}

function rolloutTone(phase: string): TNode['tone'] {
  if (phase === 'Healthy') return 'good';
  if (phase === 'Degraded') return 'bad';
  return 'amber';
}

function podSub(p: TopoPod): string {
  if (p.terminating) return 'terminating';
  return p.ready ? 'running' : p.phase.toLowerCase();
}

function shortPod(name: string, rsName: string): string {
  return name.startsWith(`${rsName}-`) ? `…-${name.slice(rsName.length + 1)}` : name;
}

function buildGraph(topo: RolloutTopology): { nodes: TNode[]; edges: TEdge[]; totalRows: number } {
  const nodes: TNode[] = [];
  const edges: TEdge[] = [];
  let row = 0;
  const rsWeight = (rs: TopoReplicaSet) => roleWeight(rs.role, topo.canaryWeight);

  // Only the group's children are laid out sequentially in col 3; each parent
  // in col 2 centers on its children.
  const groupRows: number[] = [];
  const place = (count: number): number => {
    const n = Math.max(count, 1);
    const center = row + (n - 1) / 2;
    row += n;
    return center;
  };

  topo.replicaSets.forEach(rs => {
    const center = place(rs.pods.length);
    groupRows.push(center);
    const w = rsWeight(rs);
    nodes.push({
      id: `rs:${rs.obj.metadata.name}`, kind: 'ReplicaSet', label: 'ReplicaSet', sub: `${rs.ready}/${rs.replicas} ready`,
      tag: rs.role === 'unknown' ? undefined : rs.role, col: 2, row: center, obj: rs.obj,
      tone: roleTone(rs.role), pulse: rs.role === 'canary' && rs.ready < rs.replicas,
    });
    edges.push({ from: 'rollout', to: `rs:${rs.obj.metadata.name}`, weight: w });
    const live = rs.pods.filter(p => p.ready && !p.terminating);
    rs.pods.forEach((p, i) => {
      const tone = podTone(p);
      nodes.push({
        id: `pod:${p.obj.metadata.name}`, kind: 'Pod', label: shortPod(p.obj.metadata.name, rs.obj.metadata.name),
        sub: podSub(p),
        tag: rs.role === 'unknown' ? undefined : rs.role, col: 3, row: center - (rs.pods.length - 1) / 2 + i, obj: p.obj, pod: p, ...tone,
      });
      edges.push({ from: `rs:${rs.obj.metadata.name}`, to: `pod:${p.obj.metadata.name}`, weight: p.ready && !p.terminating ? w / Math.max(live.length, 1) : 0 });
    });
  });

  topo.analysisRuns.forEach(ar => {
    const center = place(ar.pods.length);
    groupRows.push(center);
    nodes.push({
      id: `ar:${ar.obj.metadata.name}`, kind: 'AnalysisRun', label: 'AnalysisRun', sub: ar.phase.toLowerCase(),
      col: 2, row: center, obj: ar.obj, ar, ...arTone(ar.phase),
    });
    edges.push({ from: 'rollout', to: `ar:${ar.obj.metadata.name}` });
    ar.pods.forEach((p, i) => {
      const tone = podTone(p);
      nodes.push({
        id: `pod:${p.obj.metadata.name}`, kind: 'Pod', label: shortPod(p.obj.metadata.name, ar.obj.metadata.name),
        sub: p.phase === 'Succeeded' ? 'completed' : p.phase.toLowerCase(), col: 3, row: center - (ar.pods.length - 1) / 2 + i, obj: p.obj, pod: p, ...tone,
      });
      edges.push({ from: `ar:${ar.obj.metadata.name}`, to: `pod:${p.obj.metadata.name}` });
    });
  });

  const mid = groupRows.length ? (Math.min(...groupRows) + Math.max(...groupRows)) / 2 : 0;
  const rolloutPhase: string = topo.rollout.status?.phase ?? 'Unknown';
  nodes.push({
    id: 'rollout', kind: 'Rollout', label: topo.rollout.metadata.name, sub: `rollout · ${rolloutPhase.toLowerCase()}`,
    col: 1, row: mid, obj: topo.rollout,
    tone: rolloutTone(rolloutPhase), pulse: rolloutPhase === 'Progressing',
  });
  if (topo.service) {
    nodes.push({ id: 'svc', kind: 'Service', label: topo.service.metadata.name, sub: 'service', col: 0, row: mid, obj: topo.service, tone: 'sky' });
    edges.push({ from: 'svc', to: 'rollout', weight: 100 });
  }
  return { nodes, edges, totalRows: Math.max(row, 1) };
}

function kvRows(node: TNode, topo: RolloutTopology): Array<[string, string]> {
  const m = node.obj.metadata;
  const rows: Array<[string, string]> = [['Kind', node.kind], ['Name', m.name]];
  if (node.tag) rows.push(['Role', node.tag]);
  if (m.creationTimestamp) rows.push(['Created', `${relativeTime(m.creationTimestamp)} · ${formatDateTime(m.creationTimestamp)}`]);
  if (node.kind === 'Service') {
    rows.push(['Type', node.obj.spec?.type ?? 'ClusterIP'], ['Cluster IP', node.obj.spec?.clusterIP ?? '—']);
    rows.push(['Ports', (node.obj.spec?.ports ?? []).map((p: { port: number; protocol?: string }) => `${p.port}/${p.protocol ?? 'TCP'}`).join(', ') || '—']);
  } else if (node.kind === 'Rollout') {
    rows.push(['Phase', node.obj.status?.phase ?? '—'], ['Canary weight', `${topo.canaryWeight}%`], ['Stable weight', `${100 - topo.canaryWeight}%`]);
    if (node.obj.status?.message) rows.push(['Message', node.obj.status.message]);
  } else if (node.kind === 'ReplicaSet') {
    rows.push(['Replicas', `${node.obj.status?.readyReplicas ?? 0} ready / ${node.obj.spec?.replicas ?? 0} desired`]);
    rows.push(['Pod template hash', node.obj.metadata.labels?.['rollouts-pod-template-hash'] ?? '—']);
    rows.push(['Image', node.obj.spec?.template?.spec?.containers?.[0]?.image ?? '—']);
  } else if (node.kind === 'Pod') {
    rows.push(['Phase', node.obj.status?.phase ?? '—'], ['Node', node.obj.spec?.nodeName ?? '—'], ['Pod IP', node.obj.status?.podIP ?? '—']);
    rows.push(['Image', node.obj.spec?.containers?.[0]?.image ?? '—']);
  } else if (node.kind === 'AnalysisRun') {
    rows.push(['Phase', node.obj.status?.phase ?? '—']);
    if (node.obj.status?.message) rows.push(['Message', node.obj.status.message]);
    (node.obj.status?.metricResults ?? []).forEach((mr: { name: string; phase?: string; successful?: number; failed?: number; message?: string }) => {
      rows.push([`Metric ${mr.name}`, `${mr.phase ?? '—'} · ${mr.successful ?? 0} ok / ${mr.failed ?? 0} failed${mr.message ? ` · ${mr.message}` : ''}`]);
    });
  }
  return rows;
}

export function RolloutTopologyDag({ cluster, namespace, rolloutName }: { cluster: string; namespace: string; rolloutName: string }) {
  const t = useHangarTokens();
  const dag = usePipelineDagStyles({ t });
  const classes = useStyles({ t });
  const target = useMemo(() => ({ cluster, namespace, rolloutName }), [cluster, namespace, rolloutName]);
  const { loading, error, topology } = useRolloutTopology(target);

  const [zoom, setZoom] = useState(1);
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<DetailTab>('info');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Simulated inbound traffic - a jittering req/s around a fixed base, purely
  // to make the weighted edges read as live. Not measured from anywhere.
  const [rps, setRps] = useState(120);
  useEffect(() => {
    const id = setInterval(() => setRps(Math.max(20, Math.round(120 + (Math.random() - 0.5) * 40))), 1200);
    return () => clearInterval(id);
  }, []);

  const graph = useMemo(() => (topology ? buildGraph(topology) : undefined), [topology]);
  const geom = useMemo(() => {
    if (!graph) return undefined;
    const colUnit = NODE_W + COL_GAP;
    const rowUnit = NODE_H + ROW_GAP;
    const pos = new Map<string, { x: number; y: number }>();
    graph.nodes.forEach(n => pos.set(n.id, { x: PAD + n.col * colUnit + NODE_W / 2, y: PAD + 14 + n.row * rowUnit + NODE_H / 2 }));
    return { pos, width: PAD * 2 + 4 * colUnit - COL_GAP, height: PAD * 2 + 14 + graph.totalRows * rowUnit - ROW_GAP };
  }, [graph]);

  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));
  const fit = () => {
    const w = scrollRef.current?.clientWidth ?? geom?.width ?? 1;
    setZoom(clampZoom(Math.min(1, w / (geom?.width ?? 1))));
  };

  const openNode = graph?.nodes.find(n => n.id === openId);
  // A node that vanished (old ReplicaSet/pod deleted) just closes its detail.
  useEffect(() => {
    if (openId && graph && !graph.nodes.some(n => n.id === openId)) setOpenId(undefined);
  }, [graph, openId]);

  return (
    <div className={dag.wrap}>
      <div className={dag.head}>
        <span className={dag.headTitle}>
          kubernetes topology &middot; <span className={dag.headTitleValue}>{rolloutName}</span>
        </span>
        <div className={dag.controls}>
          <button type="button" className={dag.utilBtn} onMouseDown={preventFocusScroll} onClick={fit}>Fit</button>
          <div className={dag.zoomCtl}>
            <button type="button" className={dag.zoomBtn} onMouseDown={preventFocusScroll} onClick={() => setZoom(z => clampZoom(z - ZOOM_STEP))}>−</button>
            <span className={dag.zoomLabel}>{Math.round(zoom * 100)}%</span>
            <button type="button" className={dag.zoomBtn} onMouseDown={preventFocusScroll} onClick={() => setZoom(z => clampZoom(z + ZOOM_STEP))}>+</button>
          </div>
        </div>
      </div>
      <div className={dag.body}>
        {loading && !topology && <Typography className={dag.note}>Loading rollout topology…</Typography>}
        {error && <Typography className={dag.note}>Couldn't refresh topology: {error}</Typography>}
        {topology && graph && geom && (
          <>
            <div className={dag.scroll} ref={scrollRef}>
              <div className={dag.sizer} style={{ width: geom.width * zoom, height: geom.height * zoom, margin: '0 auto' }}>
                <div className={dag.inner} style={{ width: geom.width, height: geom.height, transform: `scale(${zoom})` }}>
                  <svg width={geom.width} height={geom.height} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                    {graph.edges.map(e => {
                      const a = geom.pos.get(e.from);
                      const b = geom.pos.get(e.to);
                      if (!a || !b) return null;
                      const sx = a.x + NODE_W / 2;
                      const tx = b.x - NODE_W / 2;
                      const mx = (sx + tx) / 2;
                      const d = `M ${sx} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${tx} ${b.y}`;
                      const weighted = e.weight !== undefined;
                      const active = weighted && e.weight! > 0;
                      const canaryEdge = e.to.startsWith('rs:') || e.from.startsWith('rs:');
                      const isCanary = canaryEdge && graph.nodes.find(n => n.id === (e.to.startsWith('rs:') ? e.to : e.from))?.tag === 'canary';
                      const activeStroke = isCanary ? t.amber : t.good;
                      const stroke = active ? activeStroke : t.line;
                      // Faster flow = more traffic.
                      const dur = active ? 0.5 + (1 - e.weight! / 100) * 2.5 : 0;
                      return (
                        <g key={`${e.from}-${e.to}`}>
                          <path
                            d={d}
                            fill="none"
                            stroke={stroke}
                            strokeWidth={active ? 1.5 + (e.weight! / 100) * 2 : 1.5}
                            strokeDasharray={!weighted ? '3 3' : undefined}
                            className={active ? classes.edgeFlow : undefined}
                            style={active ? { animationDuration: `${dur}s` } : undefined}
                          />
                          {weighted && (
                            <g transform={`translate(${mx}, ${(a.y + b.y) / 2})`}>
                              <rect x={-19} y={-8} width={38} height={16} rx={8} fill={t.panel} stroke={stroke} strokeWidth={1} />
                              <text className={classes.edgeLabel} textAnchor="middle" dy={3.5} fill={active ? stroke : t.textFaint}>
                                {Math.round(e.weight! * 10) / 10}%
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                  {geom.pos.get('svc') && (
                    <span className={classes.traffic} style={{ left: geom.pos.get('svc')!.x, top: geom.pos.get('svc')!.y - NODE_H / 2 - 4 }}>
                      <span className={dag.dot} style={{ backgroundColor: t.amber, animation: 'none' }} />
                      ~{rps} req/s in (simulated)
                    </span>
                  )}
                  {graph.nodes.map(n => {
                    const p = geom.pos.get(n.id)!;
                    const color = toneColor(t, n.tone);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className={`${dag.node} ${openId === n.id ? dag.nodeSelected : ''} ${n.pulse ? dag.nodeRunning : ''}`}
                        style={{ left: p.x, top: p.y, borderColor: color.border, opacity: n.dim ? 0.55 : 1 }}
                        onMouseDown={preventFocusScroll}
                        onClick={() => {
                          setOpenId(prev => (prev === n.id ? undefined : n.id));
                          setTab('info');
                        }}
                      >
                        <span className={dag.dotRow}>
                          <span className={dag.dot} style={{ backgroundColor: color.fg }} />
                          <span className={dag.nodeLabel}>{n.label}</span>
                          {n.tag && (
                            <span className={classes.tag} style={{ backgroundColor: toneColor(t, roleTone(n.tag)).bg, color: toneColor(t, roleTone(n.tag)).fg }}>
                              {n.tag}
                            </span>
                          )}
                        </span>
                        <span className={dag.nodeSub} style={{ color: color.fg }}>{n.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className={dag.legend}>
              <span><span className={dag.legendDot} style={{ backgroundColor: t.good }} />stable / healthy</span>
              <span><span className={dag.legendDot} style={{ backgroundColor: t.amber }} />canary / starting</span>
              <span><span className={dag.legendDot} style={{ backgroundColor: t.bad }} />failed</span>
              <span><span className={dag.legendDot} style={{ backgroundColor: t.textFaint, opacity: 0.5 }} />terminating / idle</span>
              <span>edge % = traffic weight (from Rollout status) · req/s is simulated</span>
            </div>
            {openNode && (
              <div className={dag.detail}>
                <Typography className={dag.detailTitle}>{openNode.kind}: {openNode.obj.metadata.name}</Typography>
                <div className={classes.tabs}>
                  {(['info', 'yaml', 'logs'] as DetailTab[]).map(k => (
                    <button key={k} type="button" className={`${classes.tabBtn} ${tab === k ? classes.tabBtnOn : ''}`} onMouseDown={preventFocusScroll} onClick={() => setTab(k)}>
                      {k}
                    </button>
                  ))}
                </div>
                {tab === 'info' && (
                  <div className={dag.detailGrid}>
                    {kvRows(openNode, topology).map(([k, v]) => (
                      <div key={k} className={dag.detailGridItem}>
                        <span className={dag.kvLabel}>{k}</span>
                        <span className={dag.kvValue}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {tab === 'yaml' && (
                  <pre className={classes.yaml}>
                    {dumpYaml(stripNoise(openNode.obj))}
                  </pre>
                )}
                {tab === 'logs' && <NodeLogs node={openNode} cluster={cluster} namespace={namespace} noteClass={dag.note} />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function stripNoise(obj: K8sObj): unknown {
  const { managedFields, ...meta } = (obj.metadata ?? {}) as Record<string, unknown>;
  void managedFields;
  return { ...obj, metadata: meta };
}

function NodeLogs({ node, cluster, namespace, noteClass }: { node: TNode; cluster: string; namespace: string; noteClass: string }) {
  const pod = node.pod ?? node.ar?.pods[0];
  if (pod) {
    return (
      <PodLogsView
        cluster={cluster}
        namespace={namespace}
        podName={pod.obj.metadata.name}
        containers={pod.containers}
        live={pod.phase === 'Running' && !pod.terminating}
      />
    );
  }
  if (node.kind === 'AnalysisRun') {
    return (
      <Typography className={noteClass}>
        This analysis has no Job pod (e.g. a Prometheus/web metric provider queries directly) - see the Info tab for
        its metric results and messages.
      </Typography>
    );
  }
  return <Typography className={noteClass}>{node.kind}s don't produce logs - select a Pod to see its container logs.</Typography>;
}

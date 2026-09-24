import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import { relativeTime, formatDateTime } from '../../../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import { PodLogsView } from '../../PodLogsView';
import { preventFocusScroll } from '../../preventFocusScroll';
import { MetricsPanel } from './MetricsPanel';
import { YamlView } from './YamlView';
import type { EnvironmentSummary, K8sResourceRef, PodSummary } from '../../types';

// Items 6 & 7 of the Topology-tab modernization ("pod logs should be
// accessible" / "more info/details about each resource, especially pods").
// Every real fact here - IP, node, QoS class, per-container resources/
// state, conditions - already lives on the pod's own raw V1Pod object
// (env.resources carries a K8sResourceRef per pod with `raw` being the
// exact object the Kubernetes API returned, see useTowerEnvironments.ts) -
// no new backend call, this is purely reading more of what Tower already
// fetches.
//
// One selected pod at a time, detail rendered full-width below the summary
// grid - the original shipped a card-per-pod grid where EACH card could be
// independently expanded in place, so logs/metrics/YAML for two or more
// pods could end up open side by side, each squeezed into its own narrow
// grid column (2026-09-17 bug report: "viewing logs and metrics looks a
// bit problematic... might not be necessary to view pod info at the same
// time"). Selecting a different pod just re-targets the one detail panel,
// same select-then-show-below pattern StageDetail's Service view and
// ResourceGallery already use.

interface RawContainerStatus {
  name: string;
  ready?: boolean;
  restartCount?: number;
  image?: string;
  state?: { running?: { startedAt?: string }; waiting?: { reason?: string; message?: string }; terminated?: { reason?: string; exitCode?: number } };
}
interface RawContainerSpec {
  name: string;
  image?: string;
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> };
  ports?: Array<{ containerPort?: number; protocol?: string }>;
}
interface RawPodCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}
interface RawPod {
  metadata?: { creationTimestamp?: string };
  spec?: { nodeName?: string; containers?: RawContainerSpec[] };
  status?: {
    podIP?: string;
    hostIP?: string;
    qosClass?: string;
    containerStatuses?: RawContainerStatus[];
    conditions?: RawPodCondition[];
  };
}

function findPodResource(resources: K8sResourceRef[], name: string): K8sResourceRef | undefined {
  return resources.find(r => r.kind === 'Pod' && r.name === name);
}

function podColor(t: HangarTokens, pod: PodSummary): string {
  if (pod.phase === 'Running' && pod.ready) return t.good;
  if (pod.phase === 'Running' || pod.phase === 'Pending') return t.amber;
  return t.bad;
}

function containerStateLabel(cs: RawContainerStatus | undefined): { label: string; ok: boolean } {
  if (!cs) return { label: 'unknown', ok: false };
  if (cs.state?.running) return { label: 'running', ok: true };
  if (cs.state?.waiting) return { label: cs.state.waiting.reason ?? 'waiting', ok: false };
  if (cs.state?.terminated) return { label: `${cs.state.terminated.reason ?? 'terminated'} (${cs.state.terminated.exitCode ?? '?'})`, ok: cs.state.terminated.exitCode === 0 };
  return { label: 'unknown', ok: false };
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  // auto-fit, not auto-fill - see StageDetail.tsx's serviceGrid comment.
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 },
  card: {
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 12px',
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panelAlt,
    cursor: 'pointer',
    '&:hover': { backgroundColor: ({ t }) => t.bg },
  },
  cardSelected: { borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  dot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  cardMeta: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 },
  cardName: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardSub: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint },
  restartBadge: { fontFamily: fontMono, fontSize: 10, fontWeight: 700, color: ({ t }) => t.amberInk, flexShrink: 0 },
  detail: {
    marginTop: 12,
    padding: '14px 16px',
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  detailHead: { display: 'flex', alignItems: 'center', gap: 8 },
  detailName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  kvGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px 12px' },
  kv: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  k: { fontFamily: fontMono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: ({ t }) => t.textFaint, fontWeight: 700 },
  v: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi, wordBreak: 'break-word' },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 12, color: ({ t }) => t.textHi },
  containerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 10px',
    borderRadius: 6,
    backgroundColor: ({ t }) => t.panelAlt,
    fontFamily: fontMono,
    fontSize: 11,
    flexWrap: 'wrap',
  },
  containerName: { color: ({ t }) => t.textHi, fontWeight: 600, minWidth: 90 },
  containerState: { fontSize: 10, padding: '1px 7px', borderRadius: 10 },
  containerStateOk: { backgroundColor: ({ t }) => t.goodSoft, color: ({ t }) => t.good },
  containerStateBad: { backgroundColor: ({ t }) => t.badSoft, color: ({ t }) => t.bad },
  containerRes: { color: ({ t }) => t.textFaint, fontSize: 10 },
  conditionRow: { display: 'flex', gap: 8, fontSize: 11, alignItems: 'baseline' },
  conditionType: { fontFamily: fontMono, fontWeight: 700, color: ({ t }) => t.textHi, minWidth: 90 },
  conditionOk: { color: ({ t }) => t.good },
  conditionBad: { color: ({ t }) => t.bad },
  actionsRow: { display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4, borderTop: ({ t }) => `1px dashed ${t.lineSoft}` },
  actionBtn: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '4px 10px',
    borderRadius: 5,
    border: ({ t }) => `1px solid ${t.line}`,
    background: 'none',
    color: ({ t }) => t.textFaint,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    '&:hover': { color: ({ t }) => t.sky },
  },
  actionBtnActive: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  // The active action's own content (logs/metrics/YAML) always gets its own
  // full-width row below the action buttons, one at a time - never squeezed
  // next to the summary grid or another pod's panel.
  panelBody: { marginTop: 2 },
  none: { fontSize: 11.5, fontStyle: 'italic', color: ({ t }) => t.textFaint },
}));

type OpenPanel = 'logs' | 'yaml' | 'metrics' | null;

function PodSummaryCard({
  pod,
  raw,
  selected,
  onClick,
  classes,
  t,
}: {
  pod: PodSummary;
  raw: RawPod | undefined;
  selected: boolean;
  onClick: () => void;
  classes: ReturnType<typeof useStyles>;
  t: HangarTokens;
}) {
  return (
    <button type="button" className={`${classes.card} ${selected ? classes.cardSelected : ''}`} onMouseDown={preventFocusScroll} onClick={onClick}>
      <span className={classes.dot} style={{ backgroundColor: podColor(t, pod) }} />
      <span className={classes.cardMeta}>
        <span className={classes.cardName} title={pod.name}>{pod.name}</span>
        <span className={classes.cardSub}>
          {pod.phase ?? '—'} · {pod.startTime ? relativeTime(pod.startTime) : '—'}
          {raw?.status?.podIP ? ` · ${raw.status.podIP}` : ''}
        </span>
      </span>
      {pod.restarts > 0 && <span className={classes.restartBadge}>{pod.restarts} restart{pod.restarts === 1 ? '' : 's'}</span>}
    </button>
  );
}

function PodDetail({
  pod,
  raw,
  env,
  classes,
}: {
  pod: PodSummary;
  raw: RawPod | undefined;
  env: EnvironmentSummary;
  classes: ReturnType<typeof useStyles>;
}) {
  const [panel, setPanel] = useState<OpenPanel>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const resource = findPodResource(env.resources, pod.name);

  // A different pod got selected while a panel was open - close it rather
  // than silently keep showing e.g. the PREVIOUS pod's logs under the new
  // pod's name.
  useEffect(() => {
    setPanel(null);
  }, [pod.name]);

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard denied - button just won't confirm
    }
  };

  return (
    <div className={classes.detail}>
      <div className={classes.detailHead}>
        <Typography className={classes.detailName}>{pod.name}</Typography>
      </div>

      <div className={classes.kvGrid}>
        <div className={classes.kv}>
          <span className={classes.k}>Node</span>
          <span className={classes.v}>{raw?.spec?.nodeName ?? '—'}</span>
        </div>
        <div className={classes.kv}>
          <span className={classes.k}>Pod IP</span>
          <span className={classes.v}>{raw?.status?.podIP ?? '—'}</span>
        </div>
        <div className={classes.kv}>
          <span className={classes.k}>Host IP</span>
          <span className={classes.v}>{raw?.status?.hostIP ?? '—'}</span>
        </div>
        <div className={classes.kv}>
          <span className={classes.k}>QoS class</span>
          <span className={classes.v}>{raw?.status?.qosClass ?? '—'}</span>
        </div>
        <div className={classes.kv}>
          <span className={classes.k}>Created</span>
          <span className={classes.v} title={raw?.metadata?.creationTimestamp ? formatDateTime(raw.metadata.creationTimestamp) : undefined}>
            {raw?.metadata?.creationTimestamp ? relativeTime(raw.metadata.creationTimestamp) : '—'}
          </span>
        </div>
      </div>

      <div>
        <Typography className={classes.sectionTitle} style={{ marginBottom: 6 }}>Containers</Typography>
        {(raw?.spec?.containers ?? []).length === 0 ? (
          <Typography className={classes.none}>No container spec recorded.</Typography>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(raw?.spec?.containers ?? []).map(c => {
              const cs = raw?.status?.containerStatuses?.find(s => s.name === c.name);
              const state = containerStateLabel(cs);
              return (
                <div key={c.name} className={classes.containerRow}>
                  <span className={classes.containerName}>{c.name}</span>
                  <span className={`${classes.containerState} ${state.ok ? classes.containerStateOk : classes.containerStateBad}`}>
                    {state.label}
                  </span>
                  {cs?.restartCount ? <span className={classes.containerRes}>{cs.restartCount} restarts</span> : null}
                  <span className={classes.containerRes}>
                    req {c.resources?.requests?.cpu ?? '—'}/{c.resources?.requests?.memory ?? '—'} · lim{' '}
                    {c.resources?.limits?.cpu ?? '—'}/{c.resources?.limits?.memory ?? '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(raw?.status?.conditions ?? []).length > 0 && (
        <div>
          <Typography className={classes.sectionTitle} style={{ marginBottom: 6 }}>Conditions</Typography>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {raw!.status!.conditions!.map(c => (
              <div key={c.type} className={classes.conditionRow}>
                <span className={classes.conditionType}>{c.type}</span>
                <span className={c.status === 'True' ? classes.conditionOk : classes.conditionBad}>{c.status}</span>
                {c.message && <span className={classes.cardSub}>{c.message}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={classes.actionsRow}>
        <button type="button" className={`${classes.actionBtn} ${panel === 'logs' ? classes.actionBtnActive : ''}`} onMouseDown={preventFocusScroll} onClick={() => setPanel(p => (p === 'logs' ? null : 'logs'))}>
          Logs
        </button>
        <button type="button" className={`${classes.actionBtn} ${panel === 'metrics' ? classes.actionBtnActive : ''}`} onMouseDown={preventFocusScroll} onClick={() => setPanel(p => (p === 'metrics' ? null : 'metrics'))}>
          Metrics
        </button>
        {resource && (
          <button type="button" className={`${classes.actionBtn} ${panel === 'yaml' ? classes.actionBtnActive : ''}`} onMouseDown={preventFocusScroll} onClick={() => setPanel(p => (p === 'yaml' ? null : 'yaml'))}>
            YAML
          </button>
        )}
        <button
          type="button"
          className={classes.actionBtn}
          onMouseDown={preventFocusScroll}
          onClick={() => copy(`kubectl logs -n ${env.namespace} ${pod.name} --context ${env.cluster}`, 'kubectl-logs')}
        >
          <FileCopyOutlinedIcon style={{ fontSize: 12 }} />
          {copied === 'kubectl-logs' ? 'copied' : 'copy kubectl logs'}
        </button>
        <button
          type="button"
          className={classes.actionBtn}
          onMouseDown={preventFocusScroll}
          onClick={() => copy(`kubectl exec -it -n ${env.namespace} ${pod.name} --context ${env.cluster} -- sh`, 'kubectl-exec')}
        >
          <FileCopyOutlinedIcon style={{ fontSize: 12 }} />
          {copied === 'kubectl-exec' ? 'copied' : 'copy kubectl exec'}
        </button>
      </div>

      {panel === 'logs' && (
        <div className={classes.panelBody}>
          <PodLogsView cluster={env.cluster} namespace={env.namespace} podName={pod.name} containers={pod.containers} live />
        </div>
      )}
      {panel === 'metrics' && (
        <div className={classes.panelBody}>
          <MetricsPanel cluster={env.cluster} namespace={env.namespace} podNames={[pod.name]} title="Pod performance" />
        </div>
      )}
      {panel === 'yaml' && resource && (
        <div className={classes.panelBody}>
          <YamlView resource={resource} />
        </div>
      )}
    </div>
  );
}

export function PodsPanel({ env }: { env: EnvironmentSummary }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [selected, setSelected] = useState<string | undefined>(env.pods[0]?.name);

  useEffect(() => {
    if (selected && env.pods.some(p => p.name === selected)) return;
    setSelected(env.pods[0]?.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.pods]);

  if (env.pods.length === 0) {
    return <Typography className={classes.none}>No pods running in {env.namespace} right now.</Typography>;
  }

  const selectedPod = env.pods.find(p => p.name === selected);
  const selectedRaw = selectedPod ? (findPodResource(env.resources, selectedPod.name)?.raw as RawPod | undefined) : undefined;

  return (
    <div>
      <div className={classes.grid}>
        {env.pods.map(pod => {
          const resource = findPodResource(env.resources, pod.name);
          return (
            <PodSummaryCard
              key={pod.name}
              pod={pod}
              raw={resource?.raw as RawPod | undefined}
              selected={pod.name === selected}
              onClick={() => setSelected(pod.name)}
              classes={classes}
              t={t}
            />
          );
        })}
      </div>
      {selectedPod && <PodDetail pod={selectedPod} raw={selectedRaw} env={env} classes={classes} />}
    </div>
  );
}

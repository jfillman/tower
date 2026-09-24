import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesProxyApiRef } from '@backstage/plugin-kubernetes-react';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { preventFocusScroll } from './preventFocusScroll';

// Item 6: "Pod logs". kubernetesProxyApiRef.getPodLogs handles cluster
// auth/routing the same way NamespaceEvents' proxy() call does - confirmed
// against @backstage/plugin-kubernetes-react's real .d.ts (KubernetesProxyApi
// .getPodLogs({podName, namespace, clusterName, containerName, previous?})).
// No tailLines knob is exposed by that API - it returns whatever the backend
// itself caps at, which is enough for "what's this pod been saying," not a
// full-history log browser.
const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  head: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  select: {
    fontFamily: fontMono,
    fontSize: 11.5,
    padding: '3px 8px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
  },
  toggle: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: '3px 9px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    background: 'none',
    color: ({ t }) => t.textFaint,
    cursor: 'pointer',
  },
  toggleActive: { color: ({ t }) => t.amberInk, borderColor: ({ t }) => t.amberLine, backgroundColor: ({ t }) => t.amberSoft },
  refresh: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  liveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: ({ t }) => t.amberInk,
    marginLeft: 'auto',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: ({ t }) => t.amber,
    animation: '$pulse 1.6s ease-in-out infinite',
  },
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.4 },
  },
  log: {
    margin: 0,
    padding: '12px 14px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.5,
    maxHeight: 420,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
  },
  note: { fontSize: 12.5, fontStyle: 'italic', color: ({ t }) => t.textLo },
}));

// live: auto-poll every 3s in addition to the manual refresh button - for a
// still-running TaskRun's step (see PipelineDag.tsx's task detail panel),
// "just click refresh yourself" isn't what "live logs, like the Tekton
// plugin" asked for. Every other Tower data hook is deliberately manual-only
// (see this file's own top comment / usePullRequests' rate-limit reasoning),
// but that reasoning is about GitHub's API specifically - polling this
// cluster's own pod logs carries no such cost, so `live` opts in per call
// site instead of changing this component's default for every other caller
// (pod inspection elsewhere in Tower has no reason to auto-poll a pod that
// isn't actively running something).
export function PodLogsView({
  cluster,
  namespace,
  podName,
  containers,
  live = false,
}: {
  cluster: string;
  namespace: string;
  podName: string;
  containers: string[];
  live?: boolean;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const proxyApi = useApi(kubernetesProxyApiRef);
  const [container, setContainer] = useState(containers[0] ?? '');
  const [previous, setPrevious] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error?: string; text?: string }>({
    loading: true,
  });

  // Real bug, confirmed live 2026-09-11: this component's container
  // selection is only ever initialized once (the useState initializer
  // above), so reusing the same PodLogsView instance for a DIFFERENT pod
  // (e.g. clicking between different DAG task nodes, each rendering
  // <PodLogsView> at the same position in the tree) kept whichever container
  // name was selected for the PREVIOUS pod - fetching a container name that
  // may not exist at all on the new pod ("container step-run-build-script is
  // not valid for pod ...-validate-config-pod"). Reset selection whenever
  // the pod identity itself changes.
  useEffect(() => {
    setContainer(containers[0] ?? '');
    setPrevious(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podName]);

  useEffect(() => {
    if (!container) return undefined;
    let cancelled = false;
    setState(prev => ({ loading: prev.text === undefined, text: prev.text }));
    proxyApi
      .getPodLogs({ podName, namespace, clusterName: cluster, containerName: container, previous })
      .then(res => {
        if (!cancelled) setState({ loading: false, text: res.text });
      })
      .catch(e => {
        if (!cancelled) setState({ loading: false, error: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [cluster, namespace, podName, container, previous, nonce, proxyApi]);

  useEffect(() => {
    if (!live) return undefined;
    const interval = setInterval(() => setNonce(n => n + 1), 3000);
    return () => clearInterval(interval);
  }, [live, container, previous]);

  return (
    <div>
      <div className={classes.head}>
        <Typography className={classes.title}>Logs — {podName}</Typography>
        {containers.length > 1 && (
          <select className={classes.select} value={container} onChange={e => setContainer(e.target.value)}>
            {containers.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={`${classes.toggle} ${previous ? classes.toggleActive : ''}`}
          onMouseDown={preventFocusScroll}
          onClick={() => setPrevious(v => !v)}
        >
          previous
        </button>
        {live ? (
          <span className={classes.liveBadge}>
            <span className={classes.liveDot} />
            live
          </span>
        ) : (
          <button type="button" className={classes.refresh} onMouseDown={preventFocusScroll} onClick={() => setNonce(n => n + 1)}>
            ↻ refresh
          </button>
        )}
      </div>
      {state.loading && <Typography className={classes.note}>Loading logs…</Typography>}
      {state.error && (
        <Typography className={classes.note}>
          Couldn't load logs{previous ? ' (no previous terminated container found?)' : ''}: {state.error}
        </Typography>
      )}
      {!state.loading && !state.error && (
        <pre className={classes.log}>{state.text || '(empty)'}</pre>
      )}
    </div>
  );
}

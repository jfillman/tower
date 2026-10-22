import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesProxyApiRef } from '@backstage/plugin-kubernetes-react';
import { fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { Button, EmptyNote, FilterChip, FilterSelect, SectionTitle, Tooltip } from './ui';

// Item 6: "Pod logs". kubernetesProxyApiRef.getPodLogs handles cluster
// auth/routing the same way NamespaceEvents' proxy() call does - confirmed
// against @backstage/plugin-kubernetes-react's real .d.ts (KubernetesProxyApi
// .getPodLogs({podName, namespace, clusterName, containerName, previous?})).
// No tailLines knob is exposed by that API - it returns whatever the backend
// itself caps at, which is enough for "what's this pod been saying," not a
// full-history log browser.
const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  head: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  liveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: ({ t }) => t.sky,
    marginLeft: 'auto',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: ({ t }) => t.sky,
  },
  log: {
    margin: 0,
    padding: '12px 14px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
    fontFamily: fontMono,
    fontSize: 11,
    lineHeight: 1.5,
    maxHeight: 420,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
  },
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
        <SectionTitle level={2}>Logs — {podName}</SectionTitle>
        {containers.length > 1 && (
          <FilterSelect label="Container" value={container} onChange={setContainer} options={containers.map(c => ({ value: c, label: c }))} />
        )}
        <Tooltip title="The container's previous run (before its last restart)">
          <FilterChip on={previous} onClick={() => setPrevious(v => !v)}>
            Previous run
          </FilterChip>
        </Tooltip>
        {live ? (
          <span className={classes.liveBadge}>
            <span className={classes.liveDot} />
            live
          </span>
        ) : (
          <Button small onClick={() => setNonce(n => n + 1)}>
            ↻ Refresh
          </Button>
        )}
      </div>
      {state.loading && <EmptyNote>Loading logs…</EmptyNote>}
      {state.error && (
        <EmptyNote>
          Couldn't load logs{previous ? ' (no previous terminated container found?)' : ''}: {state.error}
        </EmptyNote>
      )}
      {!state.loading && !state.error && (
        <pre className={classes.log}>{state.text || '(empty)'}</pre>
      )}
    </div>
  );
}

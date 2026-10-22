import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { relativeTime } from './shared/format';
import { fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { EmptyNote, SectionTitle, useTableKit } from './ui';

// Item 5 of the Topology-tab feature request (2026-09-08): "Events!! i want
// events added." Namespace-wide, not scoped to one object -
// kubernetesProxyApiRef.getEventsByInvolvedObjectName only covers one
// object at a time (confirmed against @backstage/plugin-kubernetes-react's
// real .d.ts), so this goes straight through kubernetesApiRef.proxy() at
// the raw /api/v1/namespaces/<ns>/events endpoint instead - the same
// mechanism, just not pre-scoped to a single Pod/Deployment. Auth/cluster
// selection is handled entirely by proxy() (a Backstage-Kubernetes-Cluster
// header under the hood) - no token plumbing needed here, same posture as
// every other real data source in this module.
interface RawEvent {
  type?: string;
  reason?: string;
  message?: string;
  count?: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  involvedObject?: { kind?: string; name?: string };
  metadata?: { creationTimestamp?: string };
}

function useNamespaceEvents(cluster: string, namespace: string) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; events?: RawEvent[] }>({
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const res = await kubernetesApi.proxy({
          clusterName: cluster,
          path: `/api/v1/namespaces/${namespace}/events?limit=200`,
        });
        if (!res.ok) throw new Error(`request failed with ${res.status}`);
        const body = (await res.json()) as { items?: RawEvent[] };
        if (!cancelled) setState({ loading: false, events: body.items ?? [] });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cluster, namespace, kubernetesApi]);

  return state;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  mono: { fontFamily: fontMono, fontSize: 11 },
  dot: { width: 7, height: 7, borderRadius: '50%', display: 'inline-block', marginRight: 6 },
  faint: { color: ({ t }) => t.textFaint },
  titleGap: { marginBottom: 8 },
}));

export function NamespaceEvents({ cluster, namespace }: { cluster: string; namespace: string }) {
  const tc = useTableKit();
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { loading, error, events } = useNamespaceEvents(cluster, namespace);

  const sorted = [...(events ?? [])].sort((a, b) => {
    const at = new Date(a.lastTimestamp ?? a.metadata?.creationTimestamp ?? 0).getTime();
    const bt = new Date(b.lastTimestamp ?? b.metadata?.creationTimestamp ?? 0).getTime();
    return bt - at;
  });

  return (
    <div>
      <div className={classes.titleGap}><SectionTitle level={2}>Events in {namespace}</SectionTitle></div>
      {loading && <EmptyNote>Loading events…</EmptyNote>}
      {error && <EmptyNote>Couldn't load events: {error}</EmptyNote>}
      {!loading && !error && sorted.length === 0 && (
        <EmptyNote>No events recorded in this namespace.</EmptyNote>
      )}
      {!loading && !error && sorted.length > 0 && (
        <table className={`${tc.table} ${tc.dense}`}>
          <thead>
            <tr>
              <th className={tc.th}>Type</th>
              <th className={tc.th}>Object</th>
              <th className={tc.th}>Reason</th>
              <th className={tc.th}>Message</th>
              <th className={tc.th}>Count</th>
              <th className={tc.th}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => {
              const isWarning = e.type === 'Warning';
              return (
                <tr key={i}>
                  <td className={tc.td}>
                    <span className={classes.dot} style={{ backgroundColor: isWarning ? t.bad : t.good }} />
                    <span className={classes.mono}>{e.type ?? '—'}</span>
                  </td>
                  <td className={`${tc.td} ${classes.mono}`}>
                    {e.involvedObject?.kind ?? '—'}/{e.involvedObject?.name ?? '—'}
                  </td>
                  <td className={`${tc.td} ${classes.mono}`}>{e.reason ?? '—'}</td>
                  <td className={tc.td}>{e.message ?? '—'}</td>
                  <td className={`${tc.td} ${classes.mono} ${classes.faint}`}>{e.count ?? 1}</td>
                  <td className={`${tc.td} ${classes.mono} ${classes.faint}`}>
                    {relativeTime(e.lastTimestamp ?? e.metadata?.creationTimestamp)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

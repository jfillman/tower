import { useMemo } from 'react';
import { Callout, Count, EmptyNote, Hint, PanelSkeleton, Section, StatusChip, TextLink, useTableKit } from '../ui';
import { appsInGraph, buildAppAirspace, fleetDrift, formatRate, type ServiceGraph } from './model';
import { STATE_LABEL, STATE_TONE } from './presentation';
import { useFleetValues } from './useAirspace';
import type { HangarApp } from './useHangarApps';

// Fleet drift: for every app with traffic in the env in view, the connections seen but not declared and the ones
// declared but silent. Reads one values file per app with traffic (through GitHub), so it loads when this view opens.
// TODO(airspace phase 2): surface these, and breaking contract changes, as Ops Wall Needs-Attention items.

export function DriftView({
  graph,
  env,
  cluster,
  apps,
  nonce,
  onOpenApp,
}: {
  graph: ServiceGraph;
  env: string;
  cluster: string;
  apps: HangarApp[];
  nonce: number;
  onOpenApp: (app: string) => void;
}) {
  const tk = useTableKit();
  const names = useMemo(() => appsInGraph(graph, env, apps.map(a => a.app)), [graph, env, apps]);
  const targets = useMemo(
    () => apps.filter(a => names.includes(a.app) && a.owner).map(a => ({ owner: a.owner!, appName: a.app })),
    [apps, names],
  );
  const values = useFleetValues(targets, env, cluster, nonce);
  const items = useMemo(
    () =>
      fleetDrift(
        names
          .filter(n => values.byApp.has(n))
          .map(n => buildAppAirspace({ app: n, env, graph, values: values.byApp.get(n) })),
      ),
    [names, values.byApp, env, graph],
  );

  if (names.length === 0) return <EmptyNote inset>No app had traced traffic in {env} in this window.</EmptyNote>;
  if (values.loading && values.byApp.size === 0) return <PanelSkeleton label="Reading values files" />;
  return (
    <>
      <Hint>
        Drift compares traffic with each app's declarations (networkPolicy.allowIngressFrom / allowEgressTo). Calls through a
        broker, to owned components and from the gateway are not drift.
      </Hint>
      {values.failed.length > 0 && (
        <Callout tone="neutral" title="Some values files could not be read">
          {values.failed.join(', ')}: their connections are left out.
        </Callout>
      )}
      <Section title="Drift" meta={<Count>{env} · {cluster}</Count>} count={items.length} framed>
        {items.length === 0 ? (
          <EmptyNote inset>Nothing out of step: every app-to-app call seen is declared, and every declaration saw traffic.</EmptyNote>
        ) : (
          <table className={tk.table}>
            <thead>
              <tr>
                <th className={tk.th}>App</th>
                <th className={tk.th}>Connection</th>
                <th className={tk.th}>Traffic</th>
                <th className={tk.th}>State</th>
              </tr>
            </thead>
            <tbody>
              {items.map(d => (
                <tr key={`${d.app}:${d.direction}:${d.peer}`}>
                  <td className={tk.td}>
                    <TextLink onClick={() => onOpenApp(d.app)}>{d.app}</TextLink>
                  </td>
                  <td className={tk.td}>{d.direction === 'inbound' ? `← ${d.peer}` : `→ ${d.peer}`}</td>
                  <td className={tk.td}>{formatRate(d.rate)}</td>
                  <td className={tk.td}>
                    <StatusChip tone={STATE_TONE[d.state]}>{STATE_LABEL[d.state]}</StatusChip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}

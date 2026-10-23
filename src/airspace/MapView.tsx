import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useHangarTokens, type HangarTokens } from '../brand/tokens';
import { Card, EmptyNote, Fact, Hint, TextLink, useTableKit } from '../ui';
import { buildFleetGraph, formatRate, formatSeconds, type ServiceGraph } from './model';
import { GraphCanvas, NODE_H, NODE_W, type CanvasEdge, type CanvasNode } from './GraphCanvas';
import { KIND_LABEL } from './presentation';

// The fleet Map: every edge of one environment on one cluster, ingress on the left, apps by call depth, then what they
// call that is not an app (databases, caches, external hosts).

const COL_GAP = 90;
const ROW_GAP = 20;
const PAD = 24;

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  // The map takes the full width (a fleet is wider than one app's radar); the detail of a node sits under it.
  layout: { display: 'flex', flexDirection: 'column', gap: 16 },
  canvasCard: { minWidth: 0 },
  inspector: { minWidth: 0 },
}));

function roleWord(role: 'app' | 'peer' | 'ingress'): string {
  if (role === 'ingress') return 'no traced caller';
  return role === 'peer' ? 'not a Hangar app' : 'app';
}

export function MapView({
  graph,
  env,
  knownApps,
  onOpenApp,
}: {
  graph: ServiceGraph;
  env: string;
  knownApps: string[];
  onOpenApp: (app: string) => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const fleet = useMemo(() => buildFleetGraph(graph, env, knownApps), [graph, env, knownApps]);
  const [selected, setSelected] = useState<string | undefined>(undefined);

  const layout = useMemo(() => {
    const byCol = new Map<number, string[]>();
    fleet.nodes.forEach(n => byCol.set(n.column, [...(byCol.get(n.column) ?? []), n.id]));
    const tallest = Math.max(1, ...[...byCol.values()].map(ids => ids.length));
    const height = PAD * 2 + tallest * NODE_H + (tallest - 1) * ROW_GAP;
    const width = PAD * 2 + fleet.columns * NODE_W + (fleet.columns - 1) * COL_GAP;
    const nodes: CanvasNode[] = fleet.nodes.map(n => {
      const ids = byCol.get(n.column)!;
      const i = ids.indexOf(n.id);
      const colH = ids.length * NODE_H + (ids.length - 1) * ROW_GAP;
      const inbound = fleet.edges.filter(e => e.to === n.id).reduce((s, e) => s + e.stats.rate, 0);
      return {
        id: n.id,
        label: n.label,
        sub: n.role === 'app' ? `${env} · ${formatRate(inbound)} in` : roleWord(n.role),
        x: PAD + n.column * (NODE_W + COL_GAP),
        y: PAD + (height - PAD * 2 - colH) / 2 + i * (NODE_H + ROW_GAP),
        dashed: n.role === 'peer',
        dotColor: fleet.edges.some(e => e.to === n.id && e.stats.errorRate > 0) ? t.bad : undefined,
      };
    });
    const edges: CanvasEdge[] = fleet.edges.map(e => ({
      id: `${e.from}->${e.to}`,
      from: e.from,
      to: e.to,
      color: e.kind === 'messaging' || e.kind === 'ingress' ? t.skyLine : t.sky,
    }));
    return { nodes, edges, width, height };
  }, [fleet, env, t]);

  if (fleet.nodes.length === 0) {
    return <EmptyNote inset>No traced traffic for {env} in this window on this cluster.</EmptyNote>;
  }
  const node = fleet.nodes.find(n => n.id === selected);
  const touching = node ? fleet.edges.filter(e => e.from === node.id || e.to === node.id) : [];
  return (
    <div className={c.layout}>
      <Card className={c.canvasCard} title="Map" meta={<Hint>ingress → apps by call depth → databases, caches, external</Hint>}>
        <GraphCanvas
          label={`Fleet map, ${env}`}
          nodes={layout.nodes}
          edges={layout.edges}
          width={layout.width}
          height={layout.height}
          selected={selected}
          onSelect={setSelected}
        />
      </Card>
      <Card className={c.inspector} title={node ? node.label : `${fleet.nodes.filter(n => n.role === 'app').length} apps in ${env}`}>
        {node ? (
          <>
            <Fact inline label="Role">{roleWord(node.role)}</Fact>
            {touching.length === 0 ? (
              <Hint>No edges in this window.</Hint>
            ) : (
              <table className={tk.table}>
                <thead>
                  <tr>
                    <th className={tk.th}>Edge</th>
                    <th className={tk.th}>Kind</th>
                    <th className={tk.th}>Rate</th>
                    <th className={tk.th}>p95</th>
                  </tr>
                </thead>
                <tbody>
                  {touching.map(e => (
                    <tr key={`${e.from}->${e.to}`}>
                      <td className={tk.td}>{e.from === node.id ? `→ ${e.to}` : `← ${e.from}`}</td>
                      <td className={tk.td}>{KIND_LABEL[e.kind]}</td>
                      <td className={tk.td}>{formatRate(e.stats.rate)}</td>
                      <td className={tk.td}>{formatSeconds(e.stats.p95)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {node.app && <TextLink onClick={() => onOpenApp(node.app!)}>Open {node.app}'s Airspace →</TextLink>}
          </>
        ) : (
          <Hint>Select a node to see its edges. Dashed nodes are not Hangar apps: databases, caches and external hosts.</Hint>
        )}
      </Card>
    </div>
  );
}

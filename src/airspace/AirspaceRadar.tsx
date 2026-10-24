import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useHangarTokens, type HangarTokens } from '../brand/tokens';
import { Card, Fact, FactGrid, Hint, StatusChip, TextLink } from '../ui';
import { formatRate, formatSeconds, type AppAirspace, type Counterpart } from './model';
import { GraphCanvas, NODE_H, NODE_W, type CanvasEdge, type CanvasNode } from './GraphCanvas';
import { KIND_LABEL, STATE_HINT, STATE_LABEL, STATE_TONE, edgeStroke } from './presentation';
import { EdgeLegend } from './EdgeLegend';

// Radar Scope (mockup A): the app in the middle, callers to the left, what it calls to the right, what it owns below.
// Click a node for its detail in the inspector.

const COL_GAP = 120;
const ROW_GAP = 22;
const PAD = 24;

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  layout: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  canvasCard: { flex: '999 1 560px', minWidth: 0 },
  inspector: { flex: '1 1 300px', minWidth: 0 },
}));

/**
 * The edge states drawn in this graph, in a fixed order: the legend shows only what is on the canvas, each with the
 * same stroke and dash the edge uses (edgeStroke), so a line on the graph can be matched to its meaning.
 */
const LEGEND_ORDER = ['ok', 'undeclared', 'silent', 'broker', 'ingress', 'composed'] as const;
export function legendStates(airspace: AppAirspace): (typeof LEGEND_ORDER)[number][] {
  const present = new Set([...airspace.inbound, ...airspace.outbound, ...airspace.owned].map(r => r.state));
  return LEGEND_ORDER.filter(s => present.has(s));
}

export function radarLayout(airspace: AppAirspace, t: HangarTokens) {
  const cols = { inbound: airspace.inbound, outbound: airspace.outbound };
  const rowsTall = Math.max(cols.inbound.length, cols.outbound.length, 1);
  const bandH = rowsTall * NODE_H + (rowsTall - 1) * ROW_GAP;
  const ownedRowY = PAD + bandH + 80;
  const width = PAD * 2 + NODE_W * 3 + COL_GAP * 2;
  const ownedPerRow = 3;
  const ownedRows = Math.ceil(airspace.owned.length / ownedPerRow);
  const height = airspace.owned.length ? ownedRowY + ownedRows * (NODE_H + ROW_GAP) + PAD : PAD * 2 + bandH;
  const centre: CanvasNode = {
    id: 'self',
    label: airspace.app,
    sub: `${airspace.env} · this app`,
    x: PAD + NODE_W + COL_GAP,
    y: PAD + bandH / 2 - NODE_H / 2,
    emphasis: 'centre',
  };
  const place = (rows: Counterpart[], x: number): CanvasNode[] => {
    const total = rows.length * NODE_H + (rows.length - 1) * ROW_GAP;
    const top = PAD + (bandH - total) / 2;
    return rows.map((r, i) => nodeOf(r, x, top + i * (NODE_H + ROW_GAP), t));
  };
  const ownedNodes = airspace.owned.map((r, i) => {
    const inRow = Math.min(ownedPerRow, airspace.owned.length - Math.floor(i / ownedPerRow) * ownedPerRow);
    const rowWidth = inRow * NODE_W + (inRow - 1) * 40;
    const left = (width - rowWidth) / 2;
    return nodeOf(r, left + (i % ownedPerRow) * (NODE_W + 40), ownedRowY + Math.floor(i / ownedPerRow) * (NODE_H + ROW_GAP), t);
  });
  const nodes = [centre, ...place(cols.inbound, PAD), ...place(cols.outbound, PAD + (NODE_W + COL_GAP) * 2), ...ownedNodes];
  const edges: CanvasEdge[] = [
    ...cols.inbound.map(r => ({ id: r.id, from: r.id, to: 'self', ...edgeStroke(r.state, t) })),
    ...cols.outbound.map(r => ({ id: r.id, from: 'self', to: r.id, ...edgeStroke(r.state, t) })),
    ...airspace.owned.map(r => ({ id: r.id, from: 'self', to: r.id, vertical: true, ...edgeStroke(r.state, t) })),
  ];
  return { nodes, edges, width, height };
}

function declaredWord(r: Counterpart, valuesKnown: boolean): string {
  if (!valuesKnown && r.direction !== 'owned') return 'values file not loaded';
  return r.declared ? 'yes' : 'no';
}

function nodeOf(r: Counterpart, x: number, y: number, t: HangarTokens): CanvasNode {
  return {
    id: r.id,
    label: r.name,
    sub: [r.componentType, KIND_LABEL[r.kind], r.observed ? formatRate(r.observed.rate) : undefined].filter(Boolean).join(' · '),
    x,
    y,
    emphasis: r.state === 'undeclared' ? 'attention' : undefined,
    dashed: r.state === 'silent',
    dotColor: r.observed && r.observed.errorRate > 0 ? t.bad : undefined,
  };
}

export function AirspaceRadar({
  airspace,
  valuesKnown,
  onOpenApp,
}: {
  airspace: AppAirspace;
  valuesKnown: boolean;
  onOpenApp?: (app: string) => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const layout = useMemo(() => radarLayout(airspace, t), [airspace, t]);
  const all = [...airspace.inbound, ...airspace.outbound, ...airspace.owned];
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const selected = all.find(r => r.id === selectedId);
  return (
    <div className={c.layout}>
      <Card className={c.canvasCard} title="Radar" meta={<Hint>callers ← this app → calls · owned below</Hint>}>
        <GraphCanvas
          label={`${airspace.app} connections`}
          nodes={layout.nodes}
          edges={layout.edges}
          width={layout.width}
          height={layout.height}
          selected={selectedId}
          onSelect={id => setSelectedId(id === 'self' ? undefined : id)}
        />
        <EdgeLegend states={legendStates(airspace)} />
      </Card>
      <Card className={c.inspector} title={selected ? selected.name : airspace.app} meta={selected ? <StatusChip tone={STATE_TONE[selected.state]}>{STATE_LABEL[selected.state]}</StatusChip> : undefined}>
        {selected ? (
          <>
            <FactGrid min={90}>
              <Fact label="Traffic">{selected.observed ? formatRate(selected.observed.rate) : '—'}</Fact>
              <Fact label="p95">{formatSeconds(selected.observed?.p95)}</Fact>
              <Fact label="Errors">{selected.observed ? formatRate(selected.observed.errorRate) : '—'}</Fact>
            </FactGrid>
            <Fact inline label="Direction">{selected.direction}</Fact>
            <Fact inline label="Kind">{[selected.componentType, KIND_LABEL[selected.kind]].filter(Boolean).join(' · ')}</Fact>
            <Fact inline label="Declared">{declaredWord(selected, valuesKnown)}</Fact>
            {selected.ports && <Fact inline label="Ports">{selected.ports.join(', ')}</Fact>}
            <Hint>{STATE_HINT[selected.state]}</Hint>
            {selected.app && onOpenApp && <TextLink onClick={() => onOpenApp(selected.app!)}>Open {selected.app}'s Airspace →</TextLink>}
          </>
        ) : (
          <Hint>
            {airspace.inbound.length} inbound, {airspace.outbound.length} outbound, {airspace.owned.length} owned. Select a node for its detail.
          </Hint>
        )}
      </Card>
    </div>
  );
}

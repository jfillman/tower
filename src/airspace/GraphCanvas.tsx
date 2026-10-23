import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, fontScale, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { Tile } from '../ui';

// The node-and-edge drawing both graph views use: the per-app Radar (one app in the middle) and the fleet Map
// (columns by call depth). Bespoke on purpose, like the Pipeline and Rollout DAGs: nodes are kit Tiles placed on a
// fixed canvas, edges an SVG layer under them. The canvas scrolls sideways in its box on a narrow screen.

export const NODE_W = 180;
export const NODE_H = 56;

export interface CanvasNode {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  /** Amber edge for a node that needs attention, a heavier edge for the centre/selected one. */
  emphasis?: 'attention' | 'centre';
  dashed?: boolean;
  dotColor?: string;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  color: string;
  dash?: string;
  /** Leave from the node's bottom and enter the other's top (owned infrastructure under an app). */
  vertical?: boolean;
}

const useStyles = makeStyles<Theme, { t: HangarTokens; w: number; h: number }>(() => ({
  scroll: { overflowX: 'auto', overflowY: 'hidden' },
  canvas: {
    position: 'relative',
    width: ({ w }) => w,
    height: ({ h }) => h,
    margin: '0 auto',
  },
  edges: { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' },
  node: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  nodeSelected: { boxShadow: ({ t }) => `0 0 0 2px ${t.sky}` },
  nodeAttention: { borderColor: ({ t }) => `${t.amber} !important` },
  nodeCentre: { borderColor: ({ t }) => `${t.textLo} !important` },
  nodeDashed: { borderStyle: 'dashed !important' },
  nodeName: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: fontMono,
    fontSize: fontScale.md,
    color: ({ t }) => t.textHi,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nodeSub: { fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.textLo, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  dot: { width: 8, height: 8, borderRadius: '50%', flex: 'none' },
}));

function path(a: CanvasNode, b: CanvasNode, vertical: boolean): string {
  if (vertical) {
    const x1 = a.x + NODE_W / 2;
    const y1 = a.y + NODE_H;
    const x2 = b.x + NODE_W / 2;
    const y2 = b.y;
    const my = (y1 + y2) / 2;
    return `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
  }
  const leftToRight = a.x <= b.x;
  const x1 = leftToRight ? a.x + NODE_W : a.x;
  const x2 = leftToRight ? b.x : b.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const y2 = b.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}

export function GraphCanvas({
  nodes,
  edges,
  width,
  height,
  selected,
  onSelect,
  label,
}: {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  width: number;
  height: number;
  selected?: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t, w: width, h: height });
  const byId = new Map(nodes.map(n => [n.id, n]));
  return (
    <div className={c.scroll}>
      <div className={c.canvas} role="group" aria-label={label}>
        <svg className={c.edges} width={width} height={height} aria-hidden>
          {edges.map(e => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const hot = selected !== undefined && (selected === e.from || selected === e.to);
            return (
              <path
                key={e.id}
                d={path(a, b, Boolean(e.vertical))}
                fill="none"
                stroke={e.color}
                strokeWidth={hot ? 2.5 : 1.5}
                strokeDasharray={e.dash}
              />
            );
          })}
        </svg>
        {nodes.map(n => (
          <Tile
            key={n.id}
            onClick={() => onSelect(n.id)}
            aria-pressed={selected === n.id}
            className={[
              c.node,
              selected === n.id ? c.nodeSelected : '',
              n.emphasis === 'attention' ? c.nodeAttention : '',
              n.emphasis === 'centre' ? c.nodeCentre : '',
              n.dashed ? c.nodeDashed : '',
            ].join(' ')}
            style={{ left: n.x, top: n.y, position: 'absolute', textAlign: 'left', font: 'inherit', color: 'inherit', width: NODE_W }}
          >
            <span className={c.nodeName}>
              {n.dotColor && <span className={c.dot} style={{ backgroundColor: n.dotColor }} aria-hidden />}
              {n.label}
            </span>
            {n.sub && <span className={c.nodeSub}>{n.sub}</span>}
          </Tile>
        ))}
      </div>
    </div>
  );
}

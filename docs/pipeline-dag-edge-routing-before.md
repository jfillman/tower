# Pipelines tab DAG: edge routing before the "attach to node sides" change

Saved 2026-09-24 so the change can be reverted. The last commit with this behaviour is
`0261e6c` on `main`, so `git checkout 0261e6c -- plugin/src/PipelineDag.tsx plugin/src/PipelineRunList.tsx`
restores it (also copy both into `backstage/packages/app/src/modules/tower/`).

## Full DAG - `plugin/src/PipelineDag.tsx`

Constants: `NODE_W=150 NODE_H=56 COL_GAP=90 ROW_GAP=24 PAD=32 FINALLY_EXTRA=50 ELBOW_GAP=18`.
`pos` holds each node's **center**. Edges were drawn center-to-center (so they began/ended
underneath the node boxes); the finally-elbow x was the rightmost leaf's right edge + `ELBOW_GAP`.

```tsx
const finallyElbowX = useMemo(() => {
  const xs = layout.edges.filter(e => e.finally).map(e => pos.get(e.from)?.x).filter((x): x is number => x !== undefined);
  return xs.length ? Math.max(...xs) + NODE_W / 2 + ELBOW_GAP : undefined;
}, [layout, pos]);

// per edge, a = pos(from) center, b = pos(to) center
if (e.finally && finallyElbowX !== undefined) {
  const mx = (finallyElbowX + b.x) / 2;
  d = `M ${a.x} ${a.y} L ${finallyElbowX} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
} else {
  const mx = (a.x + b.x) / 2;
  d = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
}
```
Stroke `t.line`, width 1.5, dashed `3 3` for finally edges.

## Mini pipeline - `plugin/src/PipelineRunList.tsx` (`MiniDag`)

Straight line between dot centers; dots `r = 4` when running else `3.2`:

```tsx
return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={t.line} strokeWidth={1} />;
```

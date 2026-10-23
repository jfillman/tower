import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontScale, fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { Tile } from '../ui/index.esm.js';

const NODE_W = 180;
const NODE_H = 56;
const useStyles = makeStyles(() => ({
  scroll: { overflowX: "auto", overflowY: "hidden" },
  canvas: {
    position: "relative",
    width: ({ w }) => w,
    height: ({ h }) => h,
    margin: "0 auto"
  },
  edges: { position: "absolute", left: 0, top: 0, pointerEvents: "none" },
  node: {
    position: "absolute",
    width: NODE_W,
    height: NODE_H,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 4,
    overflow: "hidden"
  },
  nodeSelected: { boxShadow: ({ t }) => `0 0 0 2px ${t.sky}` },
  nodeAttention: { borderColor: ({ t }) => `${t.amber} !important` },
  nodeCentre: { borderColor: ({ t }) => `${t.textLo} !important` },
  nodeDashed: { borderStyle: "dashed !important" },
  nodeName: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: fontMono,
    fontSize: fontScale.md,
    color: ({ t }) => t.textHi,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  nodeSub: { fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.textLo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  dot: { width: 8, height: 8, borderRadius: "50%", flex: "none" }
}));
function path(a, b, vertical) {
  if (vertical) {
    const x12 = a.x + NODE_W / 2;
    const y12 = a.y + NODE_H;
    const x22 = b.x + NODE_W / 2;
    const y22 = b.y;
    const my = (y12 + y22) / 2;
    return `M${x12} ${y12} C${x12} ${my} ${x22} ${my} ${x22} ${y22}`;
  }
  const leftToRight = a.x <= b.x;
  const x1 = leftToRight ? a.x + NODE_W : a.x;
  const x2 = leftToRight ? b.x : b.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const y2 = b.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}
function GraphCanvas({
  nodes,
  edges,
  width,
  height,
  selected,
  onSelect,
  label
}) {
  const t = useHangarTokens();
  const c = useStyles({ t, w: width, h: height });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("div", { className: c.canvas, role: "group", "aria-label": label, children: [
    /* @__PURE__ */ jsx("svg", { className: c.edges, width, height, "aria-hidden": true, children: edges.map((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) return null;
      const hot = selected !== void 0 && (selected === e.from || selected === e.to);
      return /* @__PURE__ */ jsx(
        "path",
        {
          d: path(a, b, Boolean(e.vertical)),
          fill: "none",
          stroke: e.color,
          strokeWidth: hot ? 2.5 : 1.5,
          strokeDasharray: e.dash
        },
        e.id
      );
    }) }),
    nodes.map((n) => /* @__PURE__ */ jsxs(
      Tile,
      {
        onClick: () => onSelect(n.id),
        "aria-pressed": selected === n.id,
        className: [
          c.node,
          selected === n.id ? c.nodeSelected : "",
          n.emphasis === "attention" ? c.nodeAttention : "",
          n.emphasis === "centre" ? c.nodeCentre : "",
          n.dashed ? c.nodeDashed : ""
        ].join(" "),
        style: { left: n.x, top: n.y, position: "absolute", textAlign: "left", font: "inherit", color: "inherit", width: NODE_W },
        children: [
          /* @__PURE__ */ jsxs("span", { className: c.nodeName, children: [
            n.dotColor && /* @__PURE__ */ jsx("span", { className: c.dot, style: { backgroundColor: n.dotColor }, "aria-hidden": true }),
            n.label
          ] }),
          n.sub && /* @__PURE__ */ jsx("span", { className: c.nodeSub, children: n.sub })
        ]
      },
      n.id
    ))
  ] }) });
}

export { GraphCanvas, NODE_H, NODE_W };
//# sourceMappingURL=GraphCanvas.esm.js.map

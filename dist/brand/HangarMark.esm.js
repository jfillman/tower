import { jsx, Fragment, jsxs } from 'react/jsx-runtime';
import { useHangarTokens } from './tokens.esm.js';

const TICK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
function HangarMark({
  glyph,
  size = 24
}) {
  const t = useHangarTokens();
  let accent = t.sky;
  if (glyph === "hangar" || glyph === "tower" || glyph === "autopilot") accent = t.amber;
  else if (glyph === "apron") accent = t.textLo;
  let center = /* @__PURE__ */ jsx(Fragment, {});
  switch (glyph) {
    case "hangar":
      center = /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("path", { d: "M32,64 V48 A16,16 0 0 1 64,48 V64", fill: "none", stroke: accent, strokeWidth: 4, strokeLinecap: "round" }),
        /* @__PURE__ */ jsx("line", { x1: "26", y1: "68", x2: "70", y2: "68", stroke: t.line, strokeWidth: 2 })
      ] });
      break;
    case "tower":
      center = /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("line", { x1: "48", y1: "34", x2: "48", y2: "64", stroke: accent, strokeWidth: 4, strokeLinecap: "round" }),
        /* @__PURE__ */ jsx("rect", { x: "42", y: "64", width: "12", height: "5", rx: "1", fill: accent }),
        /* @__PURE__ */ jsx("path", { d: "M40,34 A8,8 0 0 1 56,34", fill: "none", stroke: accent, strokeWidth: 2 }),
        /* @__PURE__ */ jsx("path", { d: "M34,34 A14,14 0 0 1 62,34", fill: "none", stroke: accent, strokeWidth: 2, opacity: 0.5 })
      ] });
      break;
    case "glidepath":
      center = /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("line", { x1: "32", y1: "36", x2: "60", y2: "60", stroke: accent, strokeWidth: 4, strokeLinecap: "round" }),
        /* @__PURE__ */ jsx("circle", { cx: "60", cy: "60", r: "4", fill: accent }),
        /* @__PURE__ */ jsx("line", { x1: "28", y1: "66", x2: "68", y2: "66", stroke: t.line, strokeWidth: 2 })
      ] });
      break;
    case "airframe":
      center = /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("line", { x1: "28", y1: "48", x2: "68", y2: "48", stroke: accent, strokeWidth: 4, strokeLinecap: "round" }),
        [36, 44, 52, 60].map((x) => /* @__PURE__ */ jsx("line", { x1: x, y1: "44", x2: x, y2: "52", stroke: accent, strokeWidth: 2 }, x))
      ] });
      break;
    case "apron":
      center = /* @__PURE__ */ jsx(Fragment, { children: [
        [34, 34],
        [52, 34],
        [34, 52],
        [52, 52]
      ].map(([x, y]) => /* @__PURE__ */ jsx("rect", { x, y, width: "10", height: "10", rx: "2", fill: "none", stroke: accent, strokeWidth: 2 }, `${x}-${y}`)) });
      break;
    case "autopilot":
      center = /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          "path",
          {
            d: "M33,34 H28 V62 H33 M63,34 H68 V62 H63",
            fill: "none",
            stroke: accent,
            strokeWidth: 3,
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        ),
        /* @__PURE__ */ jsx(
          "polygon",
          {
            points: "48,33 57.5,59 48,53.5 38.5,59",
            fill: accent,
            stroke: accent,
            strokeWidth: 1.5,
            strokeLinejoin: "round"
          }
        )
      ] });
      break;
  }
  return /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 96 96", role: "img", "aria-label": `${glyph} mark`, children: [
    /* @__PURE__ */ jsx("circle", { cx: "48", cy: "48", r: "40", fill: "none", stroke: t.line, strokeWidth: 2 }),
    /* @__PURE__ */ jsx("g", { stroke: t.textFaint, strokeWidth: 2, children: TICK_ANGLES.map((angle) => /* @__PURE__ */ jsx("line", { x1: "48", y1: "8", x2: "48", y2: "15", transform: `rotate(${angle} 48 48)` }, angle)) }),
    /* @__PURE__ */ jsx("polygon", { points: "44,2 52,2 48,9", fill: accent }),
    center
  ] });
}

export { HangarMark };
//# sourceMappingURL=HangarMark.esm.js.map

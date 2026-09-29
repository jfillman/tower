import { jsx } from 'react/jsx-runtime';

const BASIC = ["#3b4048", "#e05561", "#5ec27a", "#e8b34a", "#5aa1e6", "#c678dd", "#4fc1c9", "#c9ced6"];
const BRIGHT = ["#6b7480", "#ff7b86", "#7fe39a", "#ffd166", "#82b8f5", "#df9bf0", "#7fe0e6", "#ffffff"];
function color256(n) {
  if (n < 0 || n > 255) return void 0;
  if (n < 8) return BASIC[n];
  if (n < 16) return BRIGHT[n - 8];
  if (n < 232) {
    const i = n - 16;
    const level = (v) => v === 0 ? 0 : 55 + v * 40;
    return `rgb(${level(Math.floor(i / 36))}, ${level(Math.floor(i % 36 / 6))}, ${level(i % 6)})`;
  }
  const g = 8 + (n - 232) * 10;
  return `rgb(${g}, ${g}, ${g})`;
}
function applySgr(state, params) {
  const next = { ...state };
  const codes = params.length === 0 ? [0] : params;
  for (let i = 0; i < codes.length; i += 1) {
    const c = codes[i];
    if (c === 0) {
      next.fg = void 0;
      next.bg = void 0;
      next.bold = false;
      next.dim = false;
      next.italic = false;
      next.underline = false;
    } else if (c === 1) next.bold = true;
    else if (c === 2) next.dim = true;
    else if (c === 3) next.italic = true;
    else if (c === 4) next.underline = true;
    else if (c === 22) {
      next.bold = false;
      next.dim = false;
    } else if (c === 23) next.italic = false;
    else if (c === 24) next.underline = false;
    else if (c >= 30 && c <= 37) next.fg = BASIC[c - 30];
    else if (c === 39) next.fg = void 0;
    else if (c >= 40 && c <= 47) next.bg = BASIC[c - 40];
    else if (c === 49) next.bg = void 0;
    else if (c >= 90 && c <= 97) next.fg = BRIGHT[c - 90];
    else if (c >= 100 && c <= 107) next.bg = BRIGHT[c - 100];
    else if (c === 38 || c === 48) {
      const target = c === 38 ? "fg" : "bg";
      if (codes[i + 1] === 5) {
        next[target] = color256(codes[i + 2]);
        i += 2;
      } else if (codes[i + 1] === 2) {
        next[target] = `rgb(${codes[i + 2] ?? 0}, ${codes[i + 3] ?? 0}, ${codes[i + 4] ?? 0})`;
        i += 4;
      }
    }
  }
  return next;
}
function styleOf(state) {
  const style = {};
  if (state.fg) style.color = state.fg;
  if (state.bg) style.backgroundColor = state.bg;
  if (state.bold) style.fontWeight = 700;
  if (state.dim) style.opacity = 0.65;
  if (state.italic) style.fontStyle = "italic";
  if (state.underline) style.textDecoration = "underline";
  return Object.keys(style).length > 0 ? style : void 0;
}
const CSI = /\u001b\[([0-9;:?]*)([ -/]*)([@-~])/g;
function renderAnsi(text, initial = {}) {
  const nodes = [];
  let state = initial;
  let last = 0;
  let key = 0;
  const push = (chunk) => {
    if (!chunk) return;
    const style = styleOf(state);
    nodes.push(style ? /* @__PURE__ */ jsx("span", { style, children: chunk }, key++) : chunk);
  };
  CSI.lastIndex = 0;
  let m = CSI.exec(text);
  while (m !== null) {
    push(text.slice(last, m.index));
    if (m[3] === "m") {
      const params = m[1] === "" ? [] : m[1].split(/[;:]/).map((n) => Number(n) || 0);
      state = applySgr(state, params);
    }
    last = m.index + m[0].length;
    m = CSI.exec(text);
  }
  push(text.slice(last));
  return { nodes: nodes.map((n) => typeof n === "string" ? n.replace(/\u001b|\r/g, "") : n), state };
}

export { renderAnsi };
//# sourceMappingURL=ansi.esm.js.map

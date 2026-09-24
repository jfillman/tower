import type { CSSProperties, ReactNode } from 'react';

// Minimal ANSI SGR ("ASCII color code") renderer for the task-log panel (2026-09-24:
// "can we support ascii coding in the log lines?") - turns `ESC[...m` sequences
// (colors, bold, dim, italic, underline) into styled <span>s instead of showing
// the raw `[31m` garbage, and drops any other CSI sequence (cursor movement,
// erase-line, etc.) since a static log view has nothing to apply it to. Written
// in-house rather than pulling a dependency for what is a small, well-defined
// subset. Handles 16-color (30-37/90-97, 40-47/100-107), 256-color (38;5;n /
// 48;5;n) and truecolor (38;2;r;g;b / 48;2;r;g;b); state persists across lines
// only within the caller's own choice (see ansiState below) - a colour opened on
// one line and closed on a later one is common in real tool output.

export interface AnsiState {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

// xterm-ish palette, tuned to stay legible on both Hangar themes' log background.
const BASIC = ['#3b4048', '#e05561', '#5ec27a', '#e8b34a', '#5aa1e6', '#c678dd', '#4fc1c9', '#c9ced6'];
const BRIGHT = ['#6b7480', '#ff7b86', '#7fe39a', '#ffd166', '#82b8f5', '#df9bf0', '#7fe0e6', '#ffffff'];

function color256(n: number): string | undefined {
  if (n < 0 || n > 255) return undefined;
  if (n < 8) return BASIC[n];
  if (n < 16) return BRIGHT[n - 8];
  if (n < 232) {
    const i = n - 16;
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return `rgb(${level(Math.floor(i / 36))}, ${level(Math.floor((i % 36) / 6))}, ${level(i % 6)})`;
  }
  const g = 8 + (n - 232) * 10;
  return `rgb(${g}, ${g}, ${g})`;
}

function applySgr(state: AnsiState, params: number[]): AnsiState {
  const next = { ...state };
  const codes = params.length === 0 ? [0] : params;
  for (let i = 0; i < codes.length; i += 1) {
    const c = codes[i];
    if (c === 0) {
      next.fg = undefined;
      next.bg = undefined;
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
    else if (c === 39) next.fg = undefined;
    else if (c >= 40 && c <= 47) next.bg = BASIC[c - 40];
    else if (c === 49) next.bg = undefined;
    else if (c >= 90 && c <= 97) next.fg = BRIGHT[c - 90];
    else if (c >= 100 && c <= 107) next.bg = BRIGHT[c - 100];
    else if (c === 38 || c === 48) {
      const target = c === 38 ? 'fg' : 'bg';
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

function styleOf(state: AnsiState): CSSProperties | undefined {
  const style: CSSProperties = {};
  if (state.fg) style.color = state.fg;
  if (state.bg) style.backgroundColor = state.bg;
  if (state.bold) style.fontWeight = 700;
  if (state.dim) style.opacity = 0.65;
  if (state.italic) style.fontStyle = 'italic';
  if (state.underline) style.textDecoration = 'underline';
  return Object.keys(style).length > 0 ? style : undefined;
}

// ESC (0x1b) followed by `[`, parameter bytes, optional intermediates, final byte.
// The escape char is matched by code so the regex source stays plain ASCII.
// eslint-disable-next-line no-control-regex
const CSI = /\u001b\[([0-9;:?]*)([ -/]*)([@-~])/g;

// Returns the line's styled nodes plus the SGR state at its end, so a caller can
// carry a still-open colour into the next line.
export function renderAnsi(text: string, initial: AnsiState = {}): { nodes: ReactNode[]; state: AnsiState } {
  const nodes: ReactNode[] = [];
  let state = initial;
  let last = 0;
  let key = 0;
  const push = (chunk: string) => {
    if (!chunk) return;
    const style = styleOf(state);
    nodes.push(style ? <span key={key++} style={style}>{chunk}</span> : chunk);
  };
  CSI.lastIndex = 0;
  let m = CSI.exec(text);
  while (m !== null) {
    push(text.slice(last, m.index));
    if (m[3] === 'm') {
      const params = m[1] === '' ? [] : m[1].split(/[;:]/).map(n => Number(n) || 0);
      state = applySgr(state, params);
    }
    last = m.index + m[0].length;
    m = CSI.exec(text);
  }
  push(text.slice(last));
  // A stray lone ESC or carriage return would otherwise render as a glitch box.
  // eslint-disable-next-line no-control-regex
  return { nodes: nodes.map(n => (typeof n === 'string' ? n.replace(/\u001b|\r/g, '') : n)), state };
}

import type { MouseEvent } from 'react';

// A focusable element's native click-to-focus can trigger scrollIntoView
// against the wrong ancestor in this page's nested-scroll layout - first
// diagnosed on SignalRail's own DAG stage nodes (2026-09-16: "when you
// click on a deployment stage, the page scrolls up to the top... it should
// stay focused on the DAG and details panel"), and independently hit again
// across the Topology tab's newer buttons (2026-09-17: Structured/Logs/
// Metrics/YAML all jumping to the top of the page) - far more visible the
// deeper down the page a button sits, which is exactly why it went
// unnoticed on buttons near the top (the DAG's own stage nodes) but was
// very visible on ones buried well below it. preventDefault on mousedown
// (fires before focus is applied) suppresses that scroll without affecting
// the click handler (fires later, on click) or keyboard activation
// (Tab+Enter never goes through mousedown). Shared here rather than
// redefined per file, now that it's needed well beyond SignalRail's own
// stage buttons - every interactive element in this page's layout is a
// candidate for the same bug.
export function preventFocusScroll(e: MouseEvent) {
  e.preventDefault();
}

// Belt-and-braces for the same bug class (2026-09-23: "clicking on any one
// of the deployment DAG items scrolls you to the top of the screen" - still
// reproducing with the mousedown fix above in place, so something other than
// native focus is moving the scroll, e.g. the detail panel below swapping to
// a much shorter/taller body and the nested scroll container re-clamping).
// Snapshots every scrollable ancestor's scrollTop before `change` runs and
// restores any that moved once React has committed the resulting re-render.
export function keepScrollPosition(from: Element | null, change: () => void) {
  const saved: Array<[Element, number]> = [];
  for (let el: Element | null = from; el; el = el.parentElement) {
    if (el.scrollTop > 0) saved.push([el, el.scrollTop]);
  }
  saved.push([document.scrollingElement ?? document.documentElement, window.scrollY]);
  change();
  const restore = () => {
    for (const [el, top] of saved) {
      if (el.scrollTop !== top) el.scrollTop = top;
    }
  };
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}

// Scrolls a just-revealed panel into view once its own open animation/render
// has settled (2026-09-24: "clicking on a pipeline in the table should scroll
// down to the pipeline details panel", same for the Release Matrix) - the
// delay is what lets the element have its real height first, otherwise a
// Collapse that's still growing scrolls to the wrong offset.
export function scrollPanelIntoView(
  getEl: () => Element | null | undefined,
  delayMs = 120,
  block: ScrollLogicalPosition = 'start',
) {
  window.setTimeout(() => {
    getEl()?.scrollIntoView({ behavior: 'smooth', block });
  }, delayMs);
}

/** The nearest ancestor that actually scrolls vertically, else the page. */
function scrollParent(el: Element): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = window.getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * Runs `change` (a click that swaps the content below, like choosing a sub-tab) and keeps the clicked element where it was on
 * screen. keepScrollPosition alone restores every ancestor's scrollTop, which is not enough when the new content is shorter:
 * the browser clamps the position and the page appears to jump to the top (2026-10-05: pod Logs/Metrics/YAML and the values
 * sub-tabs, in this page's nested-scroll layout). Anchoring on the element works whatever happens to the height.
 */
export function keepAnchored(el: Element | null, change: () => void) {
  const before = el?.getBoundingClientRect().top;
  keepScrollPosition(el, change);
  if (!el || before === undefined) return;
  const settle = () => {
    if (!el.isConnected) return;
    const delta = el.getBoundingClientRect().top - before;
    if (Math.abs(delta) > 1) scrollParent(el).scrollTop += delta;
  };
  // After the first restore frame, and once more for content that finishes laying out a frame later.
  requestAnimationFrame(() => {
    requestAnimationFrame(settle);
    requestAnimationFrame(() => requestAnimationFrame(settle));
  });
}

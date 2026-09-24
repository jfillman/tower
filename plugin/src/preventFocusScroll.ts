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

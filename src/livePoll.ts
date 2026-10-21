import { createContext, useContext, useEffect, useState } from 'react';

// How fast Tower's live data refreshes (2026-10-20: "doesn't feel very responsive during a rollout... increase
// polling while a user is watching a rollout but disable the polling altogether when they're not").
//   - A hidden browser tab polls nothing.
//   - A visible page polls Kubernetes at the normal cadence.
//   - A visible Deployments tab with something moving (Argo CD out of sync or syncing, a Rollout progressing, a
//     delivery in flight) asks for the fast cadence, for Kubernetes and Argo CD both.
export const NORMAL_POLL_MS = 10_000;
export const FAST_POLL_MS = 3_000;
/** Argo CD status while the Deployments tab is open and nothing is moving: soon enough to see a sync start. */
export const ARGO_WATCH_POLL_MS = 10_000;

/** False while the browser tab is hidden (another tab in front, window minimised). */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/** The interval for a live poll, or null to stop it (react-use's useInterval and usePollEvery treat null as off). */
export function livePollMs(visible: boolean, fast: boolean, normalMs: number = NORMAL_POLL_MS): number | null {
  if (!visible) return null;
  return fast ? FAST_POLL_MS : normalMs;
}

export interface LivePollControl {
  /** A view watching something move asks for the fast cadence while `fast` is true. */
  setFast: (owner: string, fast: boolean) => void;
}

export const LivePollContext = createContext<LivePollControl | undefined>(undefined);

/** Asks the page's live poller for the fast cadence while `fast` is true (and the page is visible). */
export function useFastLivePoll(owner: string, fast: boolean) {
  const control = useContext(LivePollContext);
  useEffect(() => {
    if (!control) return undefined;
    control.setFast(owner, fast);
    return () => control.setFast(owner, false);
  }, [control, owner, fast]);
}

/** Bumps a counter every `ms` (null = never): a refetch trigger for hooks keyed on a nonce. */
export function usePollTick(ms: number | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (ms === null) return undefined;
    const id = setInterval(() => setTick(n => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}

/** For a hand-rolled poll loop: skip this tick while the browser tab is hidden (keep the loop, fetch nothing). */
export function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

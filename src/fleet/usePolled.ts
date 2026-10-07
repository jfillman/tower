import { useEffect, useRef, useState } from 'react';

// One polled data source on the Ops Wall. A wallboard stays open for days, so every source reports
// when it last succeeded and how many polls in a row have failed: the page shows a source as stale
// instead of quietly showing old numbers as if they were current.
export interface Polled<T> {
  data?: T;
  error?: string;
  /** Epoch ms of the last successful poll. */
  updatedAt?: number;
  /** Polls failed in a row since the last success. */
  failures: number;
  loading: boolean;
  /** How often this source refreshes, for "is this old?" and the source tooltip. */
  intervalMs: number;
}

export const STALE_AFTER_FAILURES = 3;

/** Three polls failed in a row, or (with `now`) no success for three intervals (a paused tab, a hung request). */
export function isStale(p: Pick<Polled<unknown>, 'failures' | 'updatedAt' | 'intervalMs'>, now?: number): boolean {
  if (p.failures >= STALE_AFTER_FAILURES) return true;
  return now !== undefined && p.updatedAt !== undefined && now - p.updatedAt > STALE_AFTER_FAILURES * p.intervalMs;
}

// A hidden tab does not poll, unless it is fullscreen (a wallboard on a TV is often "hidden" to the
// Page Visibility API while still being looked at).
function shouldPoll(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.hidden || Boolean(document.fullscreenElement);
}

/**
 * Calls `fetcher` now and then every `intervalMs`, keeping the last good data on failure.
 * `key` restarts the loop when what is fetched changes (a window or a filter).
 */
export function usePolled<T>(key: string, fetcher: () => Promise<T>, intervalMs: number): Polled<T> {
  const [state, setState] = useState<Polled<T>>({ failures: 0, loading: true, intervalMs });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A new key is a different question: never show the old answer under it.
    setState({ failures: 0, loading: true, intervalMs });

    async function tick() {
      if (shouldPoll()) {
        try {
          const data = await fetcherRef.current();
          if (!cancelled) setState({ data, updatedAt: Date.now(), failures: 0, loading: false, intervalMs });
        } catch (e) {
          if (!cancelled) {
            setState(prev => ({
              ...prev,
              error: e instanceof Error ? e.message : String(e),
              failures: prev.failures + 1,
              loading: false,
            }));
          }
        }
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, intervalMs]);

  return state;
}

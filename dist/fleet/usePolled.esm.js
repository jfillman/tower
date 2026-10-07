import { useState, useRef, useEffect } from 'react';

const STALE_AFTER_FAILURES = 3;
function isStale(p) {
  return p.failures >= STALE_AFTER_FAILURES;
}
function shouldPoll() {
  if (typeof document === "undefined") return true;
  return !document.hidden || Boolean(document.fullscreenElement);
}
function usePolled(key, fetcher, intervalMs) {
  const [state, setState] = useState({ failures: 0, loading: true });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  useEffect(() => {
    let cancelled = false;
    let timer;
    setState({ failures: 0, loading: true });
    async function tick() {
      if (shouldPoll()) {
        try {
          const data = await fetcherRef.current();
          if (!cancelled) setState({ data, updatedAt: Date.now(), failures: 0, loading: false });
        } catch (e) {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              error: e instanceof Error ? e.message : String(e),
              failures: prev.failures + 1,
              loading: false
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

export { STALE_AFTER_FAILURES, isStale, usePolled };
//# sourceMappingURL=usePolled.esm.js.map

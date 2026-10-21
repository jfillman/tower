import { createContext, useState, useEffect, useContext } from 'react';

const NORMAL_POLL_MS = 1e4;
const FAST_POLL_MS = 3e3;
const ARGO_WATCH_POLL_MS = 1e4;
function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    if (typeof document === "undefined") return void 0;
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}
function livePollMs(visible, fast, normalMs = NORMAL_POLL_MS) {
  if (!visible) return null;
  return fast ? FAST_POLL_MS : normalMs;
}
const LivePollContext = createContext(void 0);
function useFastLivePoll(owner, fast) {
  const control = useContext(LivePollContext);
  useEffect(() => {
    if (!control) return void 0;
    control.setFast(owner, fast);
    return () => control.setFast(owner, false);
  }, [control, owner, fast]);
}
function usePollTick(ms) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (ms === null) return void 0;
    const id = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}
function pageHidden() {
  return typeof document !== "undefined" && document.hidden;
}

export { ARGO_WATCH_POLL_MS, FAST_POLL_MS, LivePollContext, NORMAL_POLL_MS, livePollMs, pageHidden, useFastLivePoll, usePageVisible, usePollTick };
//# sourceMappingURL=livePoll.esm.js.map

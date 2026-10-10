import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useCallback, useRef, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { TierChip, Button, Chip } from '../../ui/index.esm.js';

const ACTION_COPY = {
  resume: {
    label: "Resume",
    body: "Continue a paused canary to its next step: the approval a pause step waits for, or the end of a manual Pause."
  },
  "skip-current-step": {
    label: "Promote",
    body: "Skip the current canary step, and any analysis on it, and move to the next step.",
    confirm: true
  },
  "promote-full": {
    label: "Promote full",
    body: "Skip every remaining step and analysis and send all traffic to the new version now.",
    confirm: true
  },
  pause: { label: "Pause", body: "Hold the canary at its current step until someone resumes it." },
  abort: {
    label: "Abort",
    body: "Stop the canary now and send all traffic back to the stable version. Git still asks for the new version, so the Rollout stays aborted until a rollback release replaces it or someone retries.",
    confirm: true,
    danger: true
  },
  retry: { label: "Retry", body: "Start an aborted canary again from its first step, with the same version." },
  restart: {
    label: "Restart pods",
    body: "Restart the current version's pods, a few at a time. Changes nothing in git.",
    confirm: true
  }
};
const ORDER = ["resume", "skip-current-step", "promote-full", "pause", "abort", "retry", "restart"];
const POLL_MS = 15e3;
const useStyles = makeStyles(() => ({
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBottom: 12,
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`
  },
  row: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  label: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint, textTransform: "uppercase", letterSpacing: "0.05em" },
  note: { fontSize: 11.5, color: ({ t }) => t.textLo, lineHeight: 1.5 },
  confirm: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 6,
    backgroundColor: ({ t }) => t.amberSoft,
    color: ({ t }) => t.amberInk,
    fontSize: 12
  },
  bad: { fontSize: 11.5, fontStyle: "italic", color: ({ t }) => t.bad },
  ok: { fontSize: 11.5, color: ({ t }) => t.good }
}));
function errorMessage(e) {
  return e instanceof Error ? e.message : String(e);
}
function useRolloutActions(target) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [data, setData] = useState();
  const [loadError, setLoadError] = useState();
  const [pending, setPending] = useState();
  const [runError, setRunError] = useState();
  const [lastRun, setLastRun] = useState();
  const { cluster, appName, namespace, rolloutName } = target;
  const load = useCallback(async () => {
    try {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const q = new URLSearchParams({ cluster, appName, namespace, rolloutName });
      const res = await fetchApi.fetch(`${base}/argo/rollout-actions?${q}`);
      const body = await res.json().catch(() => void 0);
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setData(body);
      setLoadError(void 0);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [discoveryApi, fetchApi, cluster, appName, namespace, rolloutName]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    setData(void 0);
    setLastRun(void 0);
    setRunError(void 0);
    loadRef.current();
    const id = setInterval(() => loadRef.current(), POLL_MS);
    return () => clearInterval(id);
  }, [cluster, appName, namespace, rolloutName]);
  const run = async (action) => {
    setPending(action);
    setRunError(void 0);
    setLastRun(void 0);
    try {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${base}/argo/rollout-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cluster, appName, namespace, rolloutName, action })
      });
      const body = await res.json().catch(() => void 0);
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setLastRun({ action, bypass: Boolean(body?.bypass) });
    } catch (e) {
      setRunError(errorMessage(e));
    } finally {
      setPending(void 0);
      load();
    }
  };
  return { data, loadError, pending, runError, lastRun, run };
}
function titleFor(a) {
  const copy = ACTION_COPY[a.name];
  if (!a.allowed) return `${copy.body}

Only the app's owning team (or an admin) can do this.`;
  if (a.disabled) return `${copy.body}

Not available in the Rollout's current state.`;
  if (a.bypass) return `${copy.body}

On this Flight environment that skips canary analysis: recorded and announced as a bypass.`;
  return copy.body;
}
function RolloutControls({
  cluster,
  argoAppName,
  namespace,
  rolloutName
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const { data, loadError, pending, runError, lastRun, run } = useRolloutActions({
    cluster,
    appName: argoAppName,
    namespace,
    rolloutName
  });
  const [confirming, setConfirming] = useState();
  const byName = new Map((data?.actions ?? []).map((a) => [a.name, a]));
  const actions = ORDER.flatMap((n) => byName.has(n) ? [byName.get(n)] : []);
  const noneAllowed = actions.length > 0 && actions.every((a) => !a.allowed);
  const click = (a) => {
    if (ACTION_COPY[a.name].confirm || a.bypass) setConfirming(a);
    else run(a.name);
  };
  return /* @__PURE__ */ jsxs("div", { className: c.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: c.row, children: [
      /* @__PURE__ */ jsx("span", { className: c.label, children: "Rollout controls" }),
      data && /* @__PURE__ */ jsx(TierChip, { tier: data.tier })
    ] }),
    loadError && !data && /* @__PURE__ */ jsxs("span", { className: c.bad, children: [
      "Couldn't read the Rollout's actions: ",
      loadError
    ] }),
    !loadError && !data && /* @__PURE__ */ jsx("span", { className: c.note, children: "Reading the Rollout's actions\u2026" }),
    data && /* @__PURE__ */ jsx("div", { className: c.row, children: actions.map((a) => /* @__PURE__ */ jsxs(
      Button,
      {
        small: true,
        variant: ACTION_COPY[a.name].danger ? "danger" : "default",
        title: titleFor(a),
        disabled: a.disabled || !a.allowed || Boolean(pending),
        onClick: () => click(a),
        children: [
          pending === a.name ? `${ACTION_COPY[a.name].label}\u2026` : ACTION_COPY[a.name].label,
          a.bypass && !a.disabled ? " \u26A0" : ""
        ]
      },
      a.name
    )) }),
    noneAllowed && /* @__PURE__ */ jsx("span", { className: c.note, children: "Only the app's owning team (or an admin) can run these. Hover a button for what it does." }),
    confirming && /* @__PURE__ */ jsxs("div", { className: c.confirm, children: [
      /* @__PURE__ */ jsxs("span", { children: [
        ACTION_COPY[confirming.name].body,
        confirming.bypass && /* @__PURE__ */ jsxs(Fragment, { children: [
          " ",
          /* @__PURE__ */ jsx("strong", { children: "This skips canary analysis on a Flight environment. It is recorded and announced to everyone, like a break-glass bypass." })
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        Button,
        {
          small: true,
          variant: confirming.bypass || ACTION_COPY[confirming.name].danger ? "danger" : "primary",
          onClick: () => {
            const a = confirming;
            setConfirming(void 0);
            run(a.name);
          },
          children: ACTION_COPY[confirming.name].label
        }
      ),
      /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setConfirming(void 0), children: "Cancel" })
    ] }),
    runError && /* @__PURE__ */ jsx("span", { className: c.bad, children: runError }),
    lastRun && /* @__PURE__ */ jsxs("span", { className: c.ok, children: [
      ACTION_COPY[lastRun.action].label,
      " sent to Argo CD.",
      lastRun.action === "abort" && " Traffic is back on the stable version. Git still asks for the new one: release a fix or roll back, or Retry once the cause is gone.",
      lastRun.bypass && " Recorded as a bypass and announced."
    ] }),
    lastRun?.bypass && /* @__PURE__ */ jsx(Chip, { tone: "bad", children: "analysis skipped" })
  ] });
}

export { RolloutControls };
//# sourceMappingURL=RolloutControls.esm.js.map

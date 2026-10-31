import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { relativeTime } from '../../shared/format.esm.js';
import { Hint, Button, Callout } from '../../ui/index.esm.js';
import { OPENING_PR, PrReceipt } from '../../ui/PrRef.esm.js';
import { useSearchParams } from 'react-router-dom';
import { ReleaseRunTracker } from '../../ReleaseRunTracker.esm.js';
import { ActionReason } from '../../ui/Tooltip.esm.js';

const useStyles = makeStyles(() => ({
  wrap: { display: "flex", flexDirection: "column", gap: 6, paddingTop: 8, borderTop: ({ t }) => `1px dashed ${t.lineSoft}` },
  label: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, textTransform: "uppercase", letterSpacing: "0.05em" },
  row: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  mono: { fontFamily: fontMono, fontSize: 11 },
  input: {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    minWidth: 220
  }
}));
const tagOf = (image) => image ? image.slice(image.lastIndexOf(":") + 1) : "?";
function RollbackControl({
  owner,
  appName,
  env,
  cluster,
  allowed
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [plan, setPlan] = useState();
  const [error, setError] = useState();
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState();
  const [, setSearchParams] = useSearchParams();
  const openRun = (run) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "pipelines");
    next.set("run", run);
    return next;
  });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl("glidepath");
        const q = new URLSearchParams({ appName, env, cluster });
        const res = await fetchApi.fetch(`${base}/release/rollback-plan?${q}`);
        const body = await res.json().catch(() => void 0);
        if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
        if (!live) return;
        setPlan(body);
        setTarget((t0) => t0 || body.targets[0]?.releaseId || "");
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [discoveryApi, fetchApi, appName, env, cluster, result]);
  const submit = async () => {
    setBusy(true);
    setError(void 0);
    try {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${base}/release/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, appName, env, cluster, targetReleaseId: target, reason })
      });
      const body = await res.json().catch(() => void 0);
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setResult({ ...body, label: tagOf(plan?.targets.find((x) => x.releaseId === target)?.image) });
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const chosen = plan?.targets.find((x) => x.releaseId === target);
  return /* @__PURE__ */ jsxs("div", { className: c.wrap, children: [
    /* @__PURE__ */ jsxs("span", { className: c.label, children: [
      "Roll back ",
      env
    ] }),
    !plan && !error && /* @__PURE__ */ jsx(Hint, { children: "Reading this environment's releases\u2026" }),
    plan && !plan.current && /* @__PURE__ */ jsxs(Hint, { children: [
      "Nothing has been released to ",
      env,
      " yet."
    ] }),
    plan?.current && /* @__PURE__ */ jsxs(Hint, { children: [
      "Running: ",
      /* @__PURE__ */ jsx("span", { className: c.mono, children: tagOf(plan.current.image) }),
      " (",
      plan.current.state,
      plan.current.stateAt ? `, ${relativeTime(plan.current.stateAt)}` : "",
      ")"
    ] }),
    plan?.current && plan.targets.length === 0 && /* @__PURE__ */ jsx(Hint, { children: "No earlier image ran healthy here in the last five releases, so there is nothing to roll back to." }),
    plan?.current && plan.targets.length > 0 && /* @__PURE__ */ jsxs("div", { className: c.row, children: [
      /* @__PURE__ */ jsx("select", { "aria-label": `Release to roll ${env} back to`, className: c.input, value: target, onChange: (e) => setTarget(e.target.value), children: plan.targets.map((x) => /* @__PURE__ */ jsxs("option", { value: x.releaseId, children: [
        tagOf(x.image),
        " - healthy ",
        relativeTime(x.healthyAt)
      ] }, x.releaseId)) }),
      /* @__PURE__ */ jsx(
        "input",
        {
          "aria-label": "Reason",
          className: c.input,
          placeholder: "Why (goes on the PR and the release record)",
          value: reason,
          onChange: (e) => setReason(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx(
        Button,
        {
          small: true,
          variant: "danger",
          disabled: !allowed || busy || confirming || !target || !reason.trim(),
          "aria-describedby": allowed ? void 0 : "rollback-reason",
          onClick: () => setConfirming(true),
          children: "Roll back"
        }
      )
    ] }),
    !allowed && /* @__PURE__ */ jsx(ActionReason, { id: "rollback-reason", children: "Only the app's owning team (or an admin) can roll back." }),
    confirming && chosen && /* @__PURE__ */ jsxs("div", { className: c.row, children: [
      /* @__PURE__ */ jsxs(Hint, { children: [
        "Open a release PR putting ",
        /* @__PURE__ */ jsx("span", { className: c.mono, children: tagOf(chosen.image) }),
        " back on ",
        env,
        "? It ran healthy here, so the content checks report without blocking; integrity checks and approvals apply as always."
      ] }),
      /* @__PURE__ */ jsx(Button, { small: true, variant: "danger", disabled: busy, onClick: submit, children: busy ? OPENING_PR : "Open rollback PR" }),
      /* @__PURE__ */ jsx(Button, { small: true, disabled: busy, onClick: () => setConfirming(false), children: "Cancel" })
    ] }),
    error && /* @__PURE__ */ jsx(Callout, { tone: "bad", children: error }),
    result?.prUrl && /* @__PURE__ */ jsx(PrReceipt, { prUrl: result.prUrl, alreadyOpen: result.alreadyOpen, next: "merge it to roll back." }),
    result && !result.prUrl && result.pipelineRun && // The backend waited 90 s for the PR; the run goes on, and this follows it to the PR (2026-10-31: the first
    // live rollback took 8 minutes to open its PR, with nothing on screen in between).
    /* @__PURE__ */ jsx(
      ReleaseRunTracker,
      {
        appName,
        release: { run: result.pipelineRun, env, label: result.label ?? "?", kind: "rollback" },
        onPr: () => void 0,
        onOpenRun: openRun,
        onDismiss: () => setResult(void 0)
      }
    )
  ] });
}

export { RollbackControl };
//# sourceMappingURL=RollbackControl.esm.js.map

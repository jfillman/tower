import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { preventFocusScroll } from '../../preventFocusScroll.esm.js';
import { useArgoCapabilities } from '../../useReleaseData.esm.js';

function PodRestartControl({
  env,
  podName,
  buttonClass,
  noteClass,
  badClass
}) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const caps = useArgoCapabilities(env.argoAppName ? env.cluster : void 0, env.argoAppName);
  const [step, setStep] = useState("idle");
  const [message, setMessage] = useState();
  let blocked;
  if (!env.argoAppName) blocked = "No Argo CD Application is known for this environment.";
  else if (caps.data && !caps.data.podRestart) blocked = "Only the app's owning team (or an admin) can restart its pods.";
  const restart = async (acceptDowntime) => {
    setStep("busy");
    setMessage(void 0);
    try {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${base}/argo/pod-restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cluster: env.cluster, appName: env.argoAppName, namespace: env.namespace, podName, ...acceptDowntime ? { acceptDowntime: true } : {} })
      });
      const body = await res.json().catch(() => void 0);
      if (res.status === 409 && body?.canAcceptDowntime) {
        setStep("downtime");
        setMessage({ text: body.error });
        return;
      }
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setStep("idle");
      setMessage({ text: `Restarting ${podName}: its replacement will appear in this list shortly.` });
    } catch (e) {
      setStep("idle");
      setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        className: buttonClass,
        disabled: !!blocked || step === "busy",
        title: blocked ?? "Delete this pod so its ReplicaSet starts a new one. Changes nothing in git.",
        onMouseDown: preventFocusScroll,
        onClick: () => setStep("confirm"),
        children: step === "busy" ? "Restarting\u2026" : "Restart pod"
      }
    ),
    (step === "confirm" || step === "downtime") && /* @__PURE__ */ jsxs("div", { "data-testid": "pod-restart-confirm", style: { flexBasis: "100%", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("span", { className: noteClass, children: step === "confirm" ? `Restart ${podName}? Argo CD deletes it and its ReplicaSet starts a new one. A delete skips the PodDisruptionBudget, so the last ready pod is refused on a Flight environment.` : `${message?.text} Restart anyway?` }),
      /* @__PURE__ */ jsx("button", { type: "button", className: buttonClass, onMouseDown: preventFocusScroll, onClick: () => restart(step === "downtime"), children: step === "downtime" ? "Restart anyway" : "Restart" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: buttonClass,
          onMouseDown: preventFocusScroll,
          onClick: () => {
            setStep("idle");
            setMessage(void 0);
          },
          children: "Cancel"
        }
      )
    ] }),
    message && step === "idle" && /* @__PURE__ */ jsx("span", { className: message.bad ? badClass : noteClass, style: { flexBasis: "100%" }, children: message.text })
  ] });
}

export { PodRestartControl };
//# sourceMappingURL=PodRestartControl.esm.js.map

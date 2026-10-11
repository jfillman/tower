async function pipelineRunAction(discoveryApi, fetchApi, action, run) {
  const base = await discoveryApi.getBaseUrl("glidepath");
  const res = await fetchApi.fetch(`${base}/tekton/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ namespace: run.namespace, name: run.name })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => void 0);
    throw new Error(body?.error ?? `request failed with ${res.status}`);
  }
}

export { pipelineRunAction };
//# sourceMappingURL=pipelineRunAction.esm.js.map

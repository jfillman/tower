const COMPONENT_INGESTOR_TASK = "KubernetesEntityProvider";
async function triggerCatalogRefresh(discoveryApi, fetchApi) {
  const base = await discoveryApi.getBaseUrl("catalog");
  const res = await fetchApi.fetch(
    `${base}/.backstage/scheduler/v1/tasks/${encodeURIComponent(COMPONENT_INGESTOR_TASK)}/trigger`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`catalog refresh failed with ${res.status}`);
}

export { COMPONENT_INGESTOR_TASK, triggerCatalogRefresh };
//# sourceMappingURL=catalogRefresh.esm.js.map

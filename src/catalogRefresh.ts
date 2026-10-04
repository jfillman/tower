// The catalog ingestor (kubernetes-ingestor, a catalog module) re-reads the clusters on a
// schedule, 10 minutes by default, so a service created a minute ago is not in the catalog
// yet. Backstage's scheduler serves a trigger for every scheduled task on the owning plugin's
// router; this fires the one that turns Kubernetes/Crossplane resources into catalog
// Components. The task runs on its normal worker, so this only moves the next run to now: it
// is idempotent and holds no credentials of its own (the caller's own session is used).
export const COMPONENT_INGESTOR_TASK = 'KubernetesEntityProvider';

export async function triggerCatalogRefresh(
  discoveryApi: { getBaseUrl(id: string): Promise<string> },
  fetchApi: { fetch: typeof fetch },
): Promise<void> {
  const base = await discoveryApi.getBaseUrl('catalog');
  const res = await fetchApi.fetch(
    `${base}/.backstage/scheduler/v1/tasks/${encodeURIComponent(COMPONENT_INGESTOR_TASK)}/trigger`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(`catalog refresh failed with ${res.status}`);
}

// Tower's Tekton Re-run and Cancel go through owner-gated backend routes (backstage glidepathProvenance.ts
// /tekton/rerun and /tekton/cancel, tektonActions.ts; 2026-10-11). They used to POST/PATCH the cluster straight
// through /api/kubernetes/proxy, which runs as Backstage's own identity with no ownership check; that proxy is now
// read-only. The backend builds the re-run from the original run itself, so the browser sends only which run.

export async function pipelineRunAction(
  discoveryApi: { getBaseUrl(id: string): Promise<string> },
  fetchApi: { fetch: typeof fetch },
  action: 'rerun' | 'cancel',
  run: { namespace: string; name: string },
): Promise<void> {
  const base = await discoveryApi.getBaseUrl('glidepath');
  const res = await fetchApi.fetch(`${base}/tekton/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace: run.namespace, name: run.name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new Error(body?.error ?? `request failed with ${res.status}`);
  }
}

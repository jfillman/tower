async function k8sProxyGet(discoveryApi, fetchApi, clusterName, path) {
  const baseUrl = await discoveryApi.getBaseUrl("kubernetes");
  const res = await fetchApi.fetch(`${baseUrl}/proxy${path}`, {
    headers: { "Backstage-Kubernetes-Cluster": clusterName }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => void 0);
    throw new Error(body?.error?.message ?? body?.message ?? `request failed with ${res.status}`);
  }
  return res.json();
}
async function k8sProxyGetText(discoveryApi, fetchApi, clusterName, path) {
  const baseUrl = await discoveryApi.getBaseUrl("kubernetes");
  const res = await fetchApi.fetch(`${baseUrl}/proxy${path}`, {
    headers: { "Backstage-Kubernetes-Cluster": clusterName }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => void 0);
    throw new Error(body?.error?.message ?? body?.message ?? `request failed with ${res.status}`);
  }
  return res.text();
}

export { k8sProxyGet, k8sProxyGetText };
//# sourceMappingURL=k8sProxy.esm.js.map

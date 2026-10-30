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

export { k8sProxyGet };
//# sourceMappingURL=k8sProxy.esm.js.map

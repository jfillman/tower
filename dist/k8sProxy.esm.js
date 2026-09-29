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
async function k8sProxyPost(discoveryApi, fetchApi, clusterName, path, body) {
  const baseUrl = await discoveryApi.getBaseUrl("kubernetes");
  const res = await fetchApi.fetch(`${baseUrl}/proxy${path}`, {
    method: "POST",
    headers: { "Backstage-Kubernetes-Cluster": clusterName, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const responseBody = await res.json().catch(() => void 0);
    throw new Error(responseBody?.error?.message ?? responseBody?.message ?? `request failed with ${res.status}`);
  }
  return res.json();
}
async function k8sProxyPatch(discoveryApi, fetchApi, clusterName, path, body) {
  const baseUrl = await discoveryApi.getBaseUrl("kubernetes");
  const res = await fetchApi.fetch(`${baseUrl}/proxy${path}`, {
    method: "PATCH",
    headers: { "Backstage-Kubernetes-Cluster": clusterName, "Content-Type": "application/merge-patch+json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const responseBody = await res.json().catch(() => void 0);
    throw new Error(responseBody?.error?.message ?? responseBody?.message ?? `request failed with ${res.status}`);
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

export { k8sProxyGet, k8sProxyGetText, k8sProxyPatch, k8sProxyPost };
//# sourceMappingURL=k8sProxy.esm.js.map

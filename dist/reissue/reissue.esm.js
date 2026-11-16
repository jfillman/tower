const NOT_OWNER = "Only the app's owning team (or an admin) can reissue a release PR.";
function reissueDisabledReason(entry, allowed) {
  if (!allowed) return NOT_OWNER;
  if (!entry.eligible) return entry.reason ?? "glidepath-api would refuse this reissue.";
  return void 0;
}
function tagOf(image) {
  return image ? image.slice(image.lastIndexOf(":") + 1) : "?";
}
async function fetchReissuable(discoveryApi, fetchApi, appName, owner) {
  const base = await discoveryApi.getBaseUrl("glidepath");
  const q = new URLSearchParams({ appName, ...owner ? { owner } : {} });
  const res = await fetchApi.fetch(`${base}/release/reissuable?${q}`);
  const body = await res.json().catch(() => void 0);
  if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
  return { releases: Array.isArray(body?.releases) ? body.releases : [], allowed: Boolean(body?.allowed) };
}
async function postReissue(discoveryApi, fetchApi, owner, appName, chainId) {
  const base = await discoveryApi.getBaseUrl("glidepath");
  const res = await fetchApi.fetch(`${base}/release/reissue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, appName, chainId })
  });
  const body = await res.json().catch(() => void 0);
  if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
  return body;
}

export { NOT_OWNER, fetchReissuable, postReissue, reissueDisabledReason, tagOf };
//# sourceMappingURL=reissue.esm.js.map

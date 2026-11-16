// Reissue a release PR that was closed without merging (glidepath-api POST /v1/apps/{app}/releases/{chainId}/reissue; the backend
// routes are backstage glidepathProvenance.ts /release/reissue and /release/reissuable). The browser sends only which release:
// the image, commit, environment and cluster are the closed release's own, read by glidepath-api from its record, and the PR's
// state is read by it from the git host.

/** One release whose PR was closed unmerged and is the newest for its environment and cluster (glidepath-api's `reissuable`). */
export interface ReissuableRelease {
  chainId: string;
  releaseId?: string;
  env: string;
  cluster: string;
  image?: string;
  prUrl: string;
  state: 'proposed' | 'closed';
  /** Whether glidepath-api would accept a reissue now. */
  eligible: boolean;
  reason?: string;
  hint?: string;
}

export interface ReissueStarted {
  pipelineRun: string;
  reissues: string;
  env: string;
  cluster: string;
  image: string;
  linked: boolean;
  replayed?: boolean;
}

export const NOT_OWNER = "Only the app's owning team (or an admin) can reissue a release PR.";

/** Why the action is off, or undefined when it is on: the caller's permission first, then the API's own reason. */
export function reissueDisabledReason(entry: ReissuableRelease, allowed: boolean): string | undefined {
  if (!allowed) return NOT_OWNER;
  if (!entry.eligible) return entry.reason ?? 'glidepath-api would refuse this reissue.';
  return undefined;
}

/** The image's tag, for names a person reads. */
export function tagOf(image: string | undefined): string {
  return image ? image.slice(image.lastIndexOf(':') + 1) : '?';
}

type Discovery = { getBaseUrl(id: string): Promise<string> };
type Fetcher = { fetch: typeof fetch };

export async function fetchReissuable(
  discoveryApi: Discovery,
  fetchApi: Fetcher,
  appName: string,
  owner?: string,
): Promise<{ releases: ReissuableRelease[]; allowed: boolean }> {
  const base = await discoveryApi.getBaseUrl('glidepath');
  const q = new URLSearchParams({ appName, ...(owner ? { owner } : {}) });
  const res = await fetchApi.fetch(`${base}/release/reissuable?${q}`);
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
  return { releases: Array.isArray(body?.releases) ? body.releases : [], allowed: Boolean(body?.allowed) };
}

export async function postReissue(
  discoveryApi: Discovery,
  fetchApi: Fetcher,
  owner: string,
  appName: string,
  chainId: string,
): Promise<ReissueStarted> {
  const base = await discoveryApi.getBaseUrl('glidepath');
  const res = await fetchApi.fetch(`${base}/release/reissue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, appName, chainId }),
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
  return body as ReissueStarted;
}

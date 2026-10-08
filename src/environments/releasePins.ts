import type { ImageVersion } from '../types';
import { relativeTime } from '../shared/format';
import { useCallback, useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import type { CloudDeploy } from '../cloudDeploy';

// A cloud target's Flight environments are released by pin PRs on the app's own repo (glidepath ADR-0020): the
// backend's /pin route reads glidepath/releases/<env>.yaml, its history and any open pin PR, and opens a pin PR to
// promote a built image or roll back to an earlier pin.

export interface ReleasePin {
  repository: string;
  tag: string;
  digest: string;
  promotedFrom?: string;
  sourceRevision?: string;
}

export interface PinHistoryEntry {
  sha: string;
  date: string;
  message: string;
  pin?: ReleasePin;
}

export interface PinState {
  env: string;
  path: string;
  current?: ReleasePin;
  history: PinHistoryEntry[];
  openPr?: { url: string };
}

export interface PinResult {
  prUrl?: string;
  alreadyOpen: boolean;
  unchanged?: boolean;
  pin: ReleasePin;
}

/** The pin to restore on Roll back: the newest earlier pin that differs from the current one. */
export function rollbackCandidate(state: PinState | undefined): PinHistoryEntry | undefined {
  const current = state?.current;
  if (!current) return undefined;
  return state!.history.slice(1).find(h => h.pin && (h.pin.digest !== current.digest || h.pin.tag !== current.tag));
}

/**
 * Images Promote can offer, newest first and one per image: what the pipeline built, read from its deploy runs, then
 * the registry's own images. The previous environment's last successful deploy comes first, since that is what normally
 * moves on. Deploy runs are cleaned up by Tekton after a while, so the registry is what keeps Promote usable for an app
 * that has not deployed recently (smoke-az-fn's prod card offered nothing once its runs were gone).
 */
export function promoteCandidates(
  deploys: CloudDeploy[],
  fromEnv: string | undefined,
  registry?: { repository: string; versions: ImageVersion[] },
): Array<{ image: string; tag: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ image: string; tag: string; label: string; rank: number; at: number }> = [];
  for (const d of deploys) {
    if (!d.imageRef || !d.imageTag || seen.has(d.imageRef)) continue;
    seen.add(d.imageRef);
    const ok = d.phase === 'succeeded';
    const fromPrev = Boolean(fromEnv && d.env === fromEnv);
    const where = d.env ? `${d.env}, ${ok ? 'deployed' : `deploy ${d.phase}`}` : ok ? 'deployed' : `deploy ${d.phase}`;
    out.push({
      image: d.imageRef,
      tag: d.imageTag,
      label: `${d.imageTag} (${where})`,
      rank: fromPrev && ok ? 0 : ok ? 1 : 2,
      at: Date.parse(d.completionTime ?? d.startTime ?? '') || 0,
    });
  }
  for (const v of registry?.versions ?? []) {
    const tag = releaseTagOf(v.tags);
    if (!tag) continue;
    const image = `${registry!.repository}:${tag}`;
    if (seen.has(image)) continue;
    seen.add(image);
    const at = Date.parse(v.createdAt ?? '') || 0;
    out.push({ image, tag, label: `${tag} (built${v.createdAt ? ` ${relativeTime(new Date(v.createdAt))}` : ''})`, rank: 3, at });
  }
  return out.sort((a, b) => a.rank - b.rank || b.at - a.at).map(({ image, tag, label }) => ({ image, tag, label }));
}

/** The tag of a registry version to offer: not a signature/attestation (sha256-...) and not a per-architecture tag. */
export function releaseTagOf(tags: string[]): string | undefined {
  return tags.find(t => !t.startsWith('sha256-') && !/-(amd64|arm64)$/.test(t) && t !== 'latest');
}

export function usePinState(target: { owner: string; appName: string; env: string } | undefined, nonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: PinState }>({ loading: Boolean(target) });
  const key = target ? `${target.owner}/${target.appName}/${target.env}` : '';
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${base}/pin?${new URLSearchParams(target).toString()}`);
        const body = await res.json().catch(() => undefined);
        if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
        if (!cancelled) setState({ loading: false, data: body as PinState });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, discoveryApi, fetchApi]);
  return state;
}

export function useSubmitPin() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: PinResult }>({ loading: false });
  const submit = useCallback(
    async (body: { owner: string; appName: string; env: string; image?: string; promotedFrom?: string; rollbackTo?: string }) => {
      setState({ loading: true });
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${base}/pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => undefined);
        if (!res.ok) throw new Error(json?.error ?? `request failed with ${res.status}`);
        setState({ loading: false, result: json as PinResult });
        return json as PinResult;
      } catch (e) {
        setState({ loading: false, error: String(e) });
        return undefined;
      }
    },
    [discoveryApi, fetchApi],
  );
  const reset = useCallback(() => setState({ loading: false }), []);
  return { ...state, submit, reset };
}

/** The pinned image tag of each of a cloud app's Flight environments (env -> tag; absent when unpinned or unreadable). */
export function usePinnedTags(owner: string | undefined, appName: string | undefined, envs: string[], nonce = 0): Record<string, string | undefined> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [pins, setPins] = useState<Record<string, string | undefined>>({});
  const key = owner && appName ? `${owner}/${appName}/${envs.join(',')}` : '';
  useEffect(() => {
    if (!owner || !appName || envs.length === 0) {
      setPins({});
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const entries = await Promise.all(
        envs.map(async env => {
          try {
            const res = await fetchApi.fetch(`${base}/pin?${new URLSearchParams({ owner, appName, env }).toString()}`);
            if (!res.ok) return [env, undefined] as const;
            return [env, ((await res.json()) as PinState).current?.tag] as const;
          } catch {
            return [env, undefined] as const;
          }
        }),
      );
      if (!cancelled) setPins(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, discoveryApi, fetchApi]);
  return pins;
}

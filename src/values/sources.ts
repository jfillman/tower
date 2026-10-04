import { useCallback, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import {
  useAppConfig,
  usePlatformFile,
  useSubmitConfigChange,
  useSubmitPlatformFileChange,
} from '../useConfigData';
import type { ConfigTopLevelField } from '../types';

// Where the values form reads an environment's chart values from and where its pull request goes. A Flight
// environment's values are gitops-<app>/<cluster>/<env>/values.yaml; a Ground environment's are the source repo's
// platform/envs/<env>.yaml. Both routes return the same shape and open a PR the same way, so the form does not care.
export interface ValuesSource {
  loading: boolean;
  error?: string;
  data?: { values: Partial<Record<ConfigTopLevelField, unknown>>; raw: string; path: string };
  refresh: () => void;
  submit: (patch: Partial<Record<ConfigTopLevelField, unknown>>, summary: string[]) => Promise<void>;
  submitting: boolean;
  result?: { prUrl: string; alreadyOpen: boolean };
  submitError?: string;
  resetSubmit: () => void;
}

export function useFlightValuesSource(target: { owner: string; appName: string; cluster: string; env: string }): ValuesSource {
  const [nonce, setNonce] = useState(0);
  const cfg = useAppConfig(target, nonce);
  const sub = useSubmitConfigChange();
  return {
    loading: cfg.loading,
    error: cfg.error,
    data: cfg.data,
    refresh: () => setNonce(n => n + 1),
    submit: (patch, summary) => sub.submit({ ...target, patch, summary }),
    submitting: sub.loading,
    result: sub.result,
    submitError: sub.error,
    resetSubmit: sub.reset,
  };
}

export function useGroundValuesSource(target: { owner: string; appName: string; env: string }): ValuesSource {
  const [nonce, setNonce] = useState(0);
  const selector = { kind: 'env' as const, env: target.env };
  const file = usePlatformFile({ owner: target.owner, appName: target.appName, selector }, nonce);
  const sub = useSubmitPlatformFileChange();
  return {
    loading: file.loading,
    error: file.error,
    data: file.data,
    refresh: () => setNonce(n => n + 1),
    submit: (patch, summary) => sub.submit({ owner: target.owner, appName: target.appName, selector, patch, summary }),
    submitting: sub.loading,
    result: sub.result,
    submitError: sub.error,
    resetSubmit: sub.reset,
  };
}

export interface EnvValuesTarget {
  owner: string;
  appName: string;
  env: string;
  tier: 'ground' | 'flight';
  /** Flight: the cluster directory of the gitops repo. */
  cluster?: string;
}

/** Reads another environment's values (the same routes the form uses), for "Copy values from" and for duplicating. */
export function useEnvValuesLoader(): (target: EnvValuesTarget) => Promise<Partial<Record<ConfigTopLevelField, unknown>>> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  return useCallback(
    async target => {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const params = new URLSearchParams({ owner: target.owner, appName: target.appName, env: target.env });
      let url = `${base}/config/platform-env?${params}`;
      if (target.tier === 'flight') {
        params.set('cluster', target.cluster ?? '');
        url = `${base}/config?${params}`;
      }
      const res = await fetchApi.fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      return ((await res.json()) as { values: Partial<Record<ConfigTopLevelField, unknown>> }).values ?? {};
    },
    [discoveryApi, fetchApi],
  );
}

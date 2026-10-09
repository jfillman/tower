import { useCallback, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import {
  useAppConfig,
  useFlightBase,
  usePlatformFile,
  useSubmitConfigChange,
  useSubmitFlightBase,
  useSubmitPlatformFileChange,
} from '../useConfigData';
import type { ConfigTopLevelField, PlatformEnvSelector } from '../types';

// Where the values form reads an environment's chart values from and where its pull request goes. A Flight
// environment's values are gitops-<app>/<cluster>/<env>/values.yaml; a Ground environment's are the source repo's
// glidepath/envs/<env>.yaml. Both routes return the same shape and open a PR the same way, so the form does not care.
export interface ValuesSource {
  loading: boolean;
  error?: string;
  data?: { values: Partial<Record<ConfigTopLevelField, unknown>>; raw: string; path: string };
  refresh: () => void;
  submit: (patch: Partial<Record<ConfigTopLevelField, unknown>>, summary: string[]) => Promise<void>;
  /** The whole file as YAML, for an environment that renders its own chart (environments/ownChart.ts). */
  submitRaw: (raw: string, summary: string[]) => Promise<void>;
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
    submitRaw: (raw, summary) => sub.submit({ ...target, patch: {}, raw, summary }),
    submitting: sub.loading,
    result: sub.result,
    submitError: sub.error,
    resetSubmit: sub.reset,
  };
}

export function useGroundValuesSource(target: { owner: string; appName: string; env: string }): ValuesSource {
  return usePlatformValuesSource({ owner: target.owner, appName: target.appName, selector: { kind: 'env', env: target.env } });
}

/** One file of the source repo's glidepath/ folder: an environment's, the shared base.yaml, or the preview template. */
export function usePlatformValuesSource(target: { owner: string; appName: string; selector: PlatformEnvSelector }): ValuesSource {
  const [nonce, setNonce] = useState(0);
  const { selector } = target;
  const file = usePlatformFile({ owner: target.owner, appName: target.appName, selector }, nonce);
  const sub = useSubmitPlatformFileChange();
  return {
    loading: file.loading,
    error: file.error,
    data: file.data,
    refresh: () => setNonce(n => n + 1),
    submit: (patch, summary) => sub.submit({ owner: target.owner, appName: target.appName, selector, patch, summary }),
    submitRaw: (raw, summary) => sub.submit({ owner: target.owner, appName: target.appName, selector, patch: {}, raw, summary }),
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

/** Shared values of the app's Flight environments on one cluster: gitops-<app>/<cluster>/base.yaml, edited through a PR. */
export function useFlightBaseValuesSource(target: { owner: string; appName: string; cluster: string }): ValuesSource {
  const [nonce, setNonce] = useState(0);
  const file = useFlightBase(target, nonce);
  const sub = useSubmitFlightBase();
  return {
    loading: file.loading,
    error: file.error,
    data: file.data,
    refresh: () => setNonce(n => n + 1),
    submit: (patch, summary) => sub.submit({ ...target, patch, summary }),
    submitRaw: (raw, summary) => sub.submit({ ...target, patch: {}, raw, summary }),
    submitting: sub.loading,
    result: sub.result,
    submitError: sub.error,
    resetSubmit: sub.reset,
  };
}

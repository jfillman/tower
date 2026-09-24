import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import type {
  AppConfigResponse,
  CicdConfigChangeRequest,
  CicdConfigChangeResult,
  CicdConfigResponse,
  ConfigChangeRequest,
  ConfigChangeResult,
  ConfigMapFilesChangeRequest,
  ConfigMapFilesResponse,
  EnvXrChangeRequest,
  EnvXrResponse,
  PlatformEnvSelector,
  PlatformEnvsResponse,
  PlatformFileChangeRequest,
  PlatformFileChangeResult,
  PlatformFileResponse,
} from './types';

// Same shape/posture as useReleaseData.ts's hooks (fetch-once with a manual
// refreshNonce, one plugin-scoped baseUrl lookup, thrown-body-as-error
// convention) - calls the two new /config routes glidepathProvenance.ts's
// router now exposes (see glidepathConfig.ts for what they actually do).

export function useAppConfig(
  target: { owner: string; appName: string; cluster: string; env: string } | undefined,
  refreshNonce = 0,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: AppConfigResponse }>({
    loading: Boolean(target),
  });
  const key = target ? `${target.owner}/${target.appName}/${target.cluster}/${target.env}` : '';

  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/config?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as AppConfigResponse;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

export function useSubmitConfigChange() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: ConfigChangeResult }>({
    loading: false,
  });

  const submit = async (request: ConfigChangeRequest) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${baseUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = (await res.json()) as ConfigChangeResult;
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };

  const reset = () => setState({ loading: false });

  return { ...state, submit, reset };
}

export function useEnvXr(target: { owner: string; appName: string; env: string } | undefined, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: EnvXrResponse }>({
    loading: Boolean(target),
  });
  const key = target ? `${target.owner}/${target.appName}/${target.env}` : '';

  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/config/env-xr?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as EnvXrResponse;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

// One-shot, not polled - same posture as every other GitHub-backed hook
// here. The schema is a fixed platform artifact (airframe-application's own
// values.schema.json), so a page refresh is enough to pick up a chart change;
// no reason to re-fetch it on every keystroke a user makes in the form.
export function useValuesSchema(owner: string | undefined) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: Record<string, unknown> }>({
    loading: Boolean(owner),
  });

  useEffect(() => {
    if (!owner) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${baseUrl}/config/schema?owner=${encodeURIComponent(owner)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as Record<string, unknown>;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, discoveryApi, fetchApi]);

  return state;
}

export function useSubmitEnvXrChange() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: ConfigChangeResult }>({
    loading: false,
  });

  const submit = async (request: EnvXrChangeRequest) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${baseUrl}/config/env-xr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = (await res.json()) as ConfigChangeResult;
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };

  const reset = () => setState({ loading: false });

  return { ...state, submit, reset };
}

export function useConfigMapFiles(
  target: { owner: string; appName: string; cluster: string; env: string } | undefined,
  refreshNonce = 0,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: ConfigMapFilesResponse }>({
    loading: Boolean(target),
  });
  const key = target ? `${target.owner}/${target.appName}/${target.cluster}/${target.env}` : '';

  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/config/configmap-files?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as ConfigMapFilesResponse;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

// --- Glidepath tab: cicd.yaml (mirrors glidepathCicdConfig.ts's routes) ---

export function useCicdConfig(target: { owner: string; appName: string } | undefined, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: CicdConfigResponse }>({
    loading: Boolean(target),
  });
  const key = target ? `${target.owner}/${target.appName}` : '';

  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/config/cicd?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as CicdConfigResponse;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

export function useSubmitCicdConfigChange() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: CicdConfigChangeResult }>({
    loading: false,
  });

  const submit = async (request: CicdConfigChangeRequest) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${baseUrl}/config/cicd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = (await res.json()) as CicdConfigChangeResult;
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };

  const reset = () => setState({ loading: false });

  return { ...state, submit, reset };
}

// One-shot, same posture as useValuesSchema - a fixed platform artifact
// (glidepath's own schemas/cicd.schema.json), a page refresh is enough to
// pick up a schema change.
export function useCicdSchema(owner: string | undefined) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: Record<string, unknown> }>({
    loading: Boolean(owner),
  });

  useEffect(() => {
    if (!owner) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${baseUrl}/config/cicd/schema?owner=${encodeURIComponent(owner)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as Record<string, unknown>;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, discoveryApi, fetchApi]);

  return state;
}

// --- Glidepath tab: platform/ folder (mirrors glidepathPlatformConfig.ts) -

function platformEnvKey(selector: PlatformEnvSelector): string {
  return selector.kind === 'pr-env' ? 'pr-env' : `env:${selector.env}`;
}

export function usePlatformFile(
  target: { owner: string; appName: string; selector: PlatformEnvSelector } | undefined,
  refreshNonce = 0,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: PlatformFileResponse }>({
    loading: Boolean(target),
  });
  const key = target ? `${target.owner}/${target.appName}/${platformEnvKey(target.selector)}` : '';

  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const params = new URLSearchParams({ owner: target.owner, appName: target.appName });
        if (target.selector.kind === 'env') params.set('env', target.selector.env);
        const res = await fetchApi.fetch(`${baseUrl}/config/platform-env?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as PlatformFileResponse;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

export function useSubmitPlatformFileChange() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: PlatformFileChangeResult }>({
    loading: false,
  });

  const submit = async (request: PlatformFileChangeRequest) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${baseUrl}/config/platform-env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: request.owner,
          appName: request.appName,
          env: request.selector.kind === 'env' ? request.selector.env : undefined,
          patch: request.patch,
          summary: request.summary,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = (await res.json()) as PlatformFileChangeResult;
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };

  const reset = () => setState({ loading: false });

  return { ...state, submit, reset };
}

export function usePlatformEnvs(target: { owner: string; appName: string } | undefined, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: PlatformEnvsResponse }>({
    loading: Boolean(target),
  });
  const key = target ? `${target.owner}/${target.appName}` : '';

  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/config/platform-envs?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as PlatformEnvsResponse;
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

export function useSubmitConfigMapFiles() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: ConfigChangeResult }>({
    loading: false,
  });

  const submit = async (request: ConfigMapFilesChangeRequest) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${baseUrl}/config/configmap-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = (await res.json()) as ConfigChangeResult;
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };

  const reset = () => setState({ loading: false });

  return { ...state, submit, reset };
}

import { useState, useEffect } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

function useAppConfig(target, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(target)
  });
  const key = target ? `${target.owner}/${target.appName}/${target.cluster}/${target.env}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/config?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function useSubmitConfigChange() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: false
  });
  const submit = async (request) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => void 0);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = await res.json();
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };
  const reset = () => setState({ loading: false });
  return { ...state, submit, reset };
}
function useEnvXr(target, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(target)
  });
  const key = target ? `${target.owner}/${target.appName}/${target.env}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/config/env-xr?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function useValuesSchema(owner) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(owner)
  });
  useEffect(() => {
    if (!owner) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${baseUrl}/config/schema?owner=${encodeURIComponent(owner)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
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
function useSubmitEnvXrChange() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: false
  });
  const submit = async (request) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${baseUrl}/config/env-xr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => void 0);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = await res.json();
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };
  const reset = () => setState({ loading: false });
  return { ...state, submit, reset };
}
function useConfigMapFiles(target, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(target)
  });
  const key = target ? `${target.owner}/${target.appName}/${target.cluster}/${target.env}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/config/configmap-files?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function useCicdConfig(target, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(target)
  });
  const key = target ? `${target.owner}/${target.appName}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/config/cicd?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function useSubmitCicdConfigChange() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: false
  });
  const submit = async (request) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${baseUrl}/config/cicd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => void 0);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = await res.json();
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };
  const reset = () => setState({ loading: false });
  return { ...state, submit, reset };
}
function platformEnvKey(selector) {
  return selector.kind === "env" ? `env:${selector.env}` : selector.kind;
}
function usePlatformFile(target, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(target)
  });
  const key = target ? `${target.owner}/${target.appName}/${platformEnvKey(target.selector)}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams({ owner: target.owner, appName: target.appName });
        if (target.selector.kind === "env") params.set("env", target.selector.env);
        if (target.selector.kind === "base") params.set("file", "base");
        const res = await fetchApi.fetch(`${baseUrl}/config/platform-env?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function useSubmitPlatformFileChange() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: false
  });
  const submit = async (request) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${baseUrl}/config/platform-env`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: request.owner,
          appName: request.appName,
          env: request.selector.kind === "env" ? request.selector.env : void 0,
          file: request.selector.kind === "base" ? "base" : void 0,
          patch: request.patch,
          raw: request.raw,
          summary: request.summary
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => void 0);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = await res.json();
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };
  const reset = () => setState({ loading: false });
  return { ...state, submit, reset };
}
function usePlatformEnvs(target, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(target)
  });
  const key = target ? `${target.owner}/${target.appName}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/config/platform-envs?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function useSubmitConfigMapFiles() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: false
  });
  const submit = async (request) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${baseUrl}/config/configmap-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => void 0);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = await res.json();
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };
  const reset = () => setState({ loading: false });
  return { ...state, submit, reset };
}
function useFlightBase(target, refreshNonce = 0) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(target)
  });
  const key = target ? `${target.owner}/${target.appName}/${target.cluster}` : "";
  useEffect(() => {
    if (!target) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${baseUrl}/config/flight-base?${new URLSearchParams(target).toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => void 0);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function useSubmitFlightBase() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: false });
  const submit = async (request) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${baseUrl}/config/flight-base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => void 0);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      setState({ loading: false, result: await res.json() });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };
  return { ...state, submit, reset: () => setState({ loading: false }) };
}

export { useAppConfig, useCicdConfig, useConfigMapFiles, useEnvXr, useFlightBase, usePlatformEnvs, usePlatformFile, useSubmitCicdConfigChange, useSubmitConfigChange, useSubmitConfigMapFiles, useSubmitEnvXrChange, useSubmitFlightBase, useSubmitPlatformFileChange, useValuesSchema };
//# sourceMappingURL=useConfigData.esm.js.map

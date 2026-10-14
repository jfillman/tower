import { useState, useEffect, useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { classifyPr } from './useReleaseRecords.esm.js';

const RELEASE_MODES = ["hand-flown", "assisted", "autoland"];
const RELEASE_MODE_LABEL = {
  "hand-flown": "Hand-flown",
  assisted: "Assisted",
  autoland: "Autoland"
};
const RELEASE_MODE_HELP = {
  "hand-flown": "A production release needs an approving review from someone other than the person who merges it.",
  assisted: "A person merges each Flight release PR. Tower records who merged and who reviewed; no sign-off is required.",
  autoland: "Releases land in production with no human, once a candidate passes every gate and soaks without SLO burn. Not available yet: it needs real test results and canary metrics."
};
const NOTE_CATEGORIES = ["added", "changed", "fixed", "security", "deprecated", "removed"];
const NOTE_LABEL = {
  added: "Added",
  changed: "Changed",
  fixed: "Fixed",
  security: "Security",
  deprecated: "Deprecated",
  removed: "Removed"
};
const SIGNOFF_LABEL = {
  awaiting: "awaiting sign-off",
  approved: "signed off",
  signed: "signed off",
  "self-approved": "self-approved",
  "shipped-without": "shipped without sign-off"
};
function countedSignoffs(signoff) {
  return signoff?.approvals.filter((a) => a.counts).length ?? 0;
}
function suggestNotes(scope) {
  const notes = {};
  const add = (c, line) => {
    notes[c] = [...notes[c] ?? [], line];
  };
  scope.forEach((pr) => {
    const title = pr.title.replace(/^\w+(?:\([^)]*\))?!?:\s*/, "");
    const line = `${title.charAt(0).toUpperCase()}${title.slice(1)} (#${pr.number})`;
    const bucket = classifyPr(pr);
    if (bucket === "features") add("added", line);
    else if (bucket === "fixes") add("fixed", line);
    else add("changed", line);
  });
  return notes;
}
function useGet(path, params, refreshNonce) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({
    loading: Boolean(params)
  });
  const key = params ? JSON.stringify(params) : "";
  useEffect(() => {
    if (!params) {
      setState({ loading: false });
      return void 0;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${baseUrl}${path}?${new URLSearchParams(params).toString()}`);
        if (res.status === 404) {
          if (!cancelled) setState({ loading: false, notFound: true });
          return;
        }
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
  }, [key, path, discoveryApi, fetchApi, refreshNonce]);
  return state;
}
function usePost(path) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ loading: false });
  const submit = useCallback(
    async (body) => {
      setState({ loading: true });
      try {
        const baseUrl = await discoveryApi.getBaseUrl("glidepath");
        const res = await fetchApi.fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => void 0);
        if (!res.ok) throw new Error(data?.error ?? `request failed with ${res.status}`);
        setState({ loading: false, result: data });
        return data;
      } catch (e) {
        setState({ loading: false, error: String(e) });
        return void 0;
      }
    },
    [discoveryApi, fetchApi, path]
  );
  const reset = useCallback(() => setState({ loading: false }), []);
  return { ...state, submit, reset };
}
function useReleaseMode(target, refreshNonce = 0) {
  return useGet("/release-mode", target, refreshNonce);
}
function useSubmitReleaseMode() {
  return usePost(
    "/release-mode"
  );
}
function useReleaseDraft(target, refreshNonce = 0) {
  return useGet("/release-draft", target, refreshNonce);
}
function useSaveReleaseDraft() {
  return usePost(
    "/release-draft"
  );
}
function useReleaseSignoff(target) {
  return useGet("/release-signoff", target, 0);
}

export { NOTE_CATEGORIES, NOTE_LABEL, RELEASE_MODES, RELEASE_MODE_HELP, RELEASE_MODE_LABEL, SIGNOFF_LABEL, countedSignoffs, suggestNotes, useReleaseDraft, useReleaseMode, useReleaseSignoff, useSaveReleaseDraft, useSubmitReleaseMode };
//# sourceMappingURL=releaseFlow.esm.js.map

import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

// Phase 2 of HANDOFF-tower-release-record.md - the persisted counterpart to
// Phase 1's client-only useReleaseRecords.ts. This talks to the two new
// /release-record routes glidepathProvenance.ts's router now exposes (see
// glidepathReleaseRecord.ts for what they actually do): whether a Release
// Record has been generated yet for a given image tag, and its own
// `humanContext` - the one part of the record a person, not Tower, writes.
// Same "fetch-once with a manual refreshNonce, thrown-body-as-error"
// conventions as useConfigData.ts's hooks, and the same "submit opens a PR,
// show the link, no merge-polling" contract as its useSubmitConfigChange.

export interface ReleaseRecordApproval {
  by: string;
  at: string;
  role?: string;
}

export interface ReleaseRecordHumanContext {
  summary?: string;
  risk?: 'low' | 'medium' | 'high';
  riskNotes?: string;
  verificationNotes?: string;
  approvals: ReleaseRecordApproval[];
  authoredBy?: string;
  tags?: string[];
}

export interface ReleaseRecordDoc {
  schemaVersion: 1;
  id: string;
  appName: string;
  imageTag: string;
  imageRepo?: string;
  gitRevisionShort?: string;
  cluster: string;
  env: string;
  generatedAt: string;
  humanContext: ReleaseRecordHumanContext;
}

export interface HumanContextChangeRequest {
  owner: string;
  appName: string;
  imageTag: string;
  patch: Partial<Omit<ReleaseRecordHumanContext, 'approvals'>> & { approvals?: ReleaseRecordApproval[] };
  summary: string[];
}

export interface HumanContextChangeResult {
  prUrl: string;
  alreadyOpen: boolean;
}

// 404 (no record committed yet - generation is a background poll, not
// on-demand) is a normal, common state here, not an error - see this hook's
// own `data: undefined` return for that case, distinguished from a genuine
// fetch failure via `error`.
export function useReleaseRecordDoc(
  target: { owner: string; appName: string; imageTag: string } | undefined,
  refreshNonce = 0,
) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; data?: ReleaseRecordDoc; notFound?: boolean }>({
    loading: Boolean(target),
  });
  const key = target ? `${target.owner}/${target.appName}/${target.imageTag}` : '';

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
        const res = await fetchApi.fetch(`${baseUrl}/release-record?${params.toString()}`);
        if (res.status === 404) {
          if (!cancelled) setState({ loading: false, notFound: true });
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new Error(body?.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as ReleaseRecordDoc;
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

export function useSubmitHumanContext() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: HumanContextChangeResult }>({
    loading: false,
  });

  const submit = async (request: HumanContextChangeRequest) => {
    setState({ loading: true });
    try {
      const baseUrl = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${baseUrl}/release-record/human-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        throw new Error(body?.error ?? `request failed with ${res.status}`);
      }
      const result = (await res.json()) as HumanContextChangeResult;
      setState({ loading: false, result });
    } catch (e) {
      setState({ loading: false, error: String(e) });
    }
  };

  const reset = () => setState({ loading: false });

  return { ...state, submit, reset };
}

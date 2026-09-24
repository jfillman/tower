import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import { TEKTON_CLUSTER, toPipelineRunSummary, type RawPipelineRun, type RawTaskRun } from './useTektonPipelineRuns';
import type { PipelineRunSummary } from './types';

// Tekton Results was enabled on kind-dev 2026-09-17 (see
// gitops-cluster-dev/50-platform-cicd/tekton-operator/tektonconfig.yaml and
// glidepath's docs/admin/tekton-results.md) specifically because the
// watcher now deletes each completed PipelineRun/TaskRun's own CR from the
// live cluster within an hour of completion (`watcher.
// completed_run_grace_period: "1h"`) - FAR shorter than the ~24h the old
// pipelinerun-pruner-cronjob allowed, and shorter still than how long a
// release typically takes to actually reach a Flight env through every
// stage of promotion. useTektonPipelineRuns.ts's own live query
// (`/apis/tekton.dev/v1/...`) can now only ever see the last hour of
// activity - useReleaseRecords.ts's "KNOWN PHASE 1 GAP" comment predicted
// exactly this (no CI build data, no nickname chip, for any release old
// enough to have reached prod) before Results even existed to fix it. This
// hook is that fix: it queries the SAME namespace's ARCHIVED runs instead,
// unwraps them back into the exact tekton.dev PipelineRun/TaskRun object
// shape a live watch already produces, and feeds them through
// toPipelineRunSummary/toTaskRunSummary (exported from
// useTektonPipelineRuns.ts) so archived and live runs are indistinguishable
// once summarized - one parser, not two that could quietly drift apart.
//
// Originally reached tekton-results-api-service directly through
// services/proxy, mirroring how this codebase already reaches Rekor in
// glidepathProvenance.ts. VERIFIED LIVE (2026-09-17) that this does not
// work: the generic services/proxy subresource never forwards the caller's
// Authorization header to the proxied backend pod, and Results' own API
// server does its own TokenReview/SubjectAccessReview check that needs to
// actually see a bearer token - confirmed by hitting Results' ClusterIP
// directly from an in-cluster debug pod with the same token (clean 200)
// versus the identical call through services/proxy
// (`{"code":16,"message":"unable to find token"}`). Full isolating test in
// HANDOFF-tower-tekton-results.md.
//
// Fix: this hook now goes through `tekton-results-relay`
// (platform-system) instead - a small relay (glidepath's
// platform/tekton-results-relay) that re-issues the request to the real
// Results API using ITS OWN ServiceAccount token, not this caller's. It's
// plain HTTP on its incoming side (unlike Results' TLS-only port), so the
// `https:` scheme-prefix mechanic Rekor never needed is gone too - one
// less untested code path. The RBAC grant for this exact proxy path
// (backstage-ingestor-rbac/rbac.yaml's `backstage-ingestor-tekton-
// results-proxy` Role) now targets the relay's Service instead of
// Results' own.
//
// Every other assumption below is still called out inline; none of them
// are guesses this hook trusts blindly - a wrong one degrades to "no
// archived data" (the caller falls back to whatever the live query
// already had), never a crash.
const TEKTON_RESULTS_RELAY_NAMESPACE = 'platform-system';
const TEKTON_RESULTS_RELAY_SERVICE = 'tekton-results-relay';
const TEKTON_RESULTS_RELAY_PORT = 8080;

// ASSUMED: tektoncd/results' documented v1alpha2 REST surface
// (`/apis/results.tekton.dev/v1alpha2/parents/{parent}/results/-/records` -
// the `-` wildcard result ID lists every Record under a parent without a
// separate ListResults round-trip first) and that `parent` for a
// namespace-scoped install is the plain Kubernetes namespace name (matches
// docs/admin/tekton-results.md's own `tkn results list ... default`
// example, "default" being a namespace, not a made-up parent string).
// `page_size`/`page_token` are the documented snake_case query param names;
// the response envelope's own field casing is read defensively below
// (`nextPageToken` OR `next_page_token`) since gRPC-gateway JSON casing can
// go either way depending on the server's own marshalling config.
function recordsProxyPath(parent: string, pageToken: string | undefined): string {
  const base = `/api/v1/namespaces/${TEKTON_RESULTS_RELAY_NAMESPACE}/services/${TEKTON_RESULTS_RELAY_SERVICE}:${TEKTON_RESULTS_RELAY_PORT}/proxy/apis/results.tekton.dev/v1alpha2/parents/${encodeURIComponent(parent)}/results/-/records`;
  // 2026-09-23 bug: "all the pipeline result info... is missing" from the
  // Release Record. Verified live (checkout-api: 241 archived PipelineRuns,
  // ~11 pages of 200) that an unfiltered, unordered listing came back in no
  // useful order and a third of it was Log records this hook discards
  // anyway, so the old 5-page cap silently dropped roughly half of the
  // archive - including builds for recent releases. Server-side `filter`
  // (CEL) drops the Log records, and `order_by=create_time desc` makes
  // whatever the page cap does cut off the OLDEST runs, not arbitrary ones.
  const params = new URLSearchParams({
    page_size: '200',
    filter: 'data_type in ["tekton.dev/v1.PipelineRun","tekton.dev/v1.TaskRun"]',
    order_by: 'create_time desc',
  });
  if (pageToken) params.set('page_token', pageToken);
  return `${base}?${params.toString()}`;
}

interface ResultsRecord {
  name?: string;
  uid?: string;
  data?: { type?: string; value?: string };
}
interface ResultsRecordsResponse {
  records?: ResultsRecord[];
  nextPageToken?: string;
  next_page_token?: string;
}

// A Record's `data.value` is base64 - decoded with TextDecoder rather than
// bare atob() so a non-ASCII commit author/message embedded in the archived
// object (atob alone mangles multi-byte UTF-8) doesn't corrupt the parse.
function decodeRecordValue<T>(record: ResultsRecord): T | undefined {
  if (!record.data?.value) return undefined;
  try {
    const binary = atob(record.data.value);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return undefined;
  }
}

// Only the two type-URL substrings this hook needs to tell apart - matched
// loosely (not against one exact string) since the ASSUMED section above
// already flags that the precise `data.type` string tektoncd/results emits
// (e.g. "results.tekton.dev/v1alpha2.PipelineRun" vs a raw
// "tekton.dev/v1.PipelineRun") depends on the deployed version and hasn't
// been confirmed live.
function classifyRecordType(record: ResultsRecord): 'pipelineRun' | 'taskRun' | undefined {
  const type = record.data?.type ?? '';
  if (/pipelinerun/i.test(type)) return 'pipelineRun';
  if (/taskrun/i.test(type)) return 'taskRun';
  return undefined;
}

export interface UseTektonResultsRunsResult {
  loading: boolean;
  error?: string;
  runs: PipelineRunSummary[];
}

// Capped, same "don't fetch unboundedly" posture as useReleaseRecords.ts's
// own MATRIX_ROW_CAP reasoning - a namespace with a very long release
// history could otherwise page indefinitely for a view that only needs
// enough archived runs to cover this app's own visible Release Records.
const MAX_PAGES = 12;

// Not polled like useTektonPipelineRuns - archived runs are, by definition,
// already finished and never change again, so there's nothing to watch for.
// refreshNonce still bumps a re-fetch (same manual-refresh convention as
// every other Tower hook) for the case where Results has just archived a
// run this session cares about right now.
export function useTektonResultsRuns(appName: string | undefined, refreshNonce = 0): UseTektonResultsRunsResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<UseTektonResultsRunsResult>({ loading: Boolean(appName), runs: [] });

  useEffect(() => {
    if (!appName) {
      setState({ loading: false, runs: [] });
      return undefined;
    }
    let cancelled = false;
    const parent = `app-${appName}-cicd`;

    (async () => {
      setState(prev => ({ loading: true, runs: prev.runs }));
      try {
        const rawPipelineRuns: RawPipelineRun[] = [];
        const rawTaskRuns: RawTaskRun[] = [];
        let pageToken: string | undefined;
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const res = await k8sProxyGet<ResultsRecordsResponse>(
            discoveryApi,
            fetchApi,
            TEKTON_CLUSTER,
            recordsProxyPath(parent, pageToken),
          );
          for (const record of res.records ?? []) {
            const kind = classifyRecordType(record);
            if (kind === 'pipelineRun') {
              const obj = decodeRecordValue<RawPipelineRun>(record);
              if (obj) rawPipelineRuns.push(obj);
            } else if (kind === 'taskRun') {
              const obj = decodeRecordValue<RawTaskRun>(record);
              if (obj) rawTaskRuns.push(obj);
            }
          }
          pageToken = res.nextPageToken ?? res.next_page_token;
          if (!pageToken) break;
        }
        if (cancelled) return;
        const taskRunsByName = new Map(rawTaskRuns.map(tr => [tr.metadata.name, tr]));
        const runs = rawPipelineRuns.map(pr => toPipelineRunSummary(pr, TEKTON_CLUSTER, taskRunsByName));
        setState({ loading: false, runs });
      } catch (e) {
        // Degrade to "no archived data", never crash the Release Record
        // view over this - the live-only behavior this hook is layered on
        // top of is still fully intact either way.
        if (!cancelled) setState({ loading: false, runs: [], error: String(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appName, discoveryApi, fetchApi, refreshNonce]);

  return state;
}

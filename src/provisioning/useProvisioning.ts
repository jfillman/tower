import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { k8sProxyGet } from '../k8sProxy';
import { TEKTON_CLUSTER } from '../tekton/useTektonPipelineRuns';
import {
  deriveProvisioning,
  type BuildSnapshot,
  type ManagedSnapshot,
  type PrSnapshot,
  type ProvisioningInputs,
  type ProvisioningLinks,
  type RolloutSnapshot,
  type SecretsSnapshot,
  type XrCondition,
} from './deriveProvisioning';

// Airframe application XRs live on the dev cluster, the same one that runs
// Tekton (see TEKTON_CLUSTER). The four app-tier kinds are the ones a user
// can request from the scaffolder.
const XR_CLUSTER = TEKTON_CLUSTER;
const XR_PLURALS = ['nodejsapplications', 'springbootapplications', 'pythonapplications', 'goapplications'];
const XR_KINDS = ['NodeJSApplication', 'SpringBootApplication', 'PythonApplication', 'GoApplication'];
const POLL_MS = 6000;
// A service that was created long ago and never finished is a stuck or
// abandoned XR, not something being provisioned right now.
const MAX_AGE_MS = 24 * 3600 * 1000;
// GitHub-backed lookups (the request PR, the onboarding PRs) are not polled at the
// k8s cadence: this platform has hit its GitHub rate limit before. The backend
// answers repeats with conditional requests, so this is cheap, but not free.
const GITHUB_POLL_MS = 45000;
// How long a finished provision stays in the strip so the user sees it land.
const KEEP_DONE_MS = 15 * 60 * 1000;

interface ListResponse<T> {
  items?: T[];
}
interface RawXr {
  kind?: string;
  metadata: { name: string; namespace: string; creationTimestamp: string; annotations?: Record<string, string> };
  spec?: { devCluster?: string; crossplane?: { resourceRefs?: { kind: string; name: string }[] } };
  status?: { conditions?: XrCondition[] };
}
interface RawManaged {
  kind?: string;
  metadata: { name: string; annotations?: Record<string, string> };
  status?: { conditions?: XrCondition[]; atProvider?: { htmlUrl?: string; fullName?: string } };
}
interface RawPipelineRun {
  metadata: { name: string; creationTimestamp: string };
  status?: {
    conditions?: { type: string; status: string; reason?: string }[];
    startTime?: string;
    completionTime?: string;
    pipelineSpec?: { tasks?: unknown[] };
    childReferences?: unknown[];
  };
}
interface RawRollout {
  metadata: { creationTimestamp: string };
  spec?: { replicas?: number };
  status?: { phase?: string; availableReplicas?: number };
}

const epoch = (iso?: string) => (iso ? Date.parse(iso) : undefined);

export function toBuild(run: RawPipelineRun): BuildSnapshot {
  const succeeded = run.status?.conditions?.find(c => c.type === 'Succeeded');
  let phase: BuildSnapshot['phase'] = 'pending';
  if (succeeded?.status === 'True') phase = 'succeeded';
  else if (succeeded?.status === 'False') phase = 'failed';
  else if (run.status?.startTime) phase = 'running';
  const total = run.status?.pipelineSpec?.tasks?.length ?? 0;
  // childReferences lists every TaskRun created so far, including the one
  // running now, so a running pipeline has finished one fewer than it lists.
  const created = run.status?.childReferences?.length ?? 0;
  const done = phase === 'succeeded' ? total : Math.max(0, created - (phase === 'running' ? 1 : 0));
  return {
    name: run.metadata.name,
    phase,
    startedAt: epoch(run.status?.startTime),
    completedAt: epoch(run.status?.completionTime),
    tasksDone: done,
    tasksTotal: total,
  };
}

const GITHUB_KINDS = new Set(['Repository', 'RepositoryFile']);

/**
 * One entry per repository or file the XR composes. The XR's resourceRefs are
 * the expected set, so one that has not been created yet counts as not ready
 * instead of being left out. Undefined when nothing could be read, so the
 * caller falls back to inferring from the XR itself.
 */
export function toManaged(
  refs: { kind: string; name: string }[] | undefined,
  found: RawManaged[],
): ManagedSnapshot[] | undefined {
  const byName = new Map(found.map(m => [m.metadata.name, m]));
  const expected = (refs ?? []).filter(r => GITHUB_KINDS.has(r.kind)).map(r => r.name);
  const names = expected.length > 0 ? expected : found.map(m => m.metadata.name);
  if (names.length === 0 || found.length === 0) return undefined;
  return names.map(name => {
    const ready = byName.get(name)?.status?.conditions?.find(c => c.type === 'Ready');
    return { name, ready: ready?.status === 'True', readyAt: epoch(ready?.lastTransitionTime) };
  });
}

/**
 * The tenants repo the XR was applied from. The scaffolder's GitOps writer
 * stamps it on every XR as `terasky.backstage.io/source-info`, whose gitRepo is
 * `github.com?owner=<o>&repo=<r>`.
 */
export function parseTenantsRepo(sourceInfo?: string): { owner: string; repo: string } | undefined {
  if (!sourceInfo) return undefined;
  try {
    const gitRepo = (JSON.parse(sourceInfo) as { gitRepo?: string }).gitRepo;
    const params = new URLSearchParams(gitRepo?.split('?')[1] ?? '');
    const owner = params.get('owner');
    const repo = params.get('repo');
    return owner && repo ? { owner, repo } : undefined;
  } catch {
    return undefined;
  }
}

/** The source and GitOps repository URLs, and the GitHub owner, from the Repository managed resources. */
export function toRepoLinks(
  name: string,
  repos: RawManaged[],
): { owner?: string; sourceRepoUrl?: string; gitopsRepoUrl?: string } {
  const urlOf = (suffix: string) => repos.find(r => r.metadata.name === `${name}-${suffix}`)?.status?.atProvider;
  const src = urlOf('src');
  const gitops = urlOf('gitops');
  const fullName = src?.fullName ?? gitops?.fullName;
  return {
    owner: fullName?.split('/')[0],
    sourceRepoUrl: src?.htmlUrl,
    gitopsRepoUrl: gitops?.htmlUrl,
  };
}

/** The app's SecretStore XR (Infisical project, identity, cluster store). Undefined when it could not be read. */
export function toSecrets(store: RawXr | undefined, missing: boolean): SecretsSnapshot | undefined {
  if (!store) return missing ? { found: false, ready: false } : undefined;
  const cond = (type: string) => store.status?.conditions?.find(c => c.type === type);
  const ready = cond('Ready');
  const synced = cond('Synced');
  return {
    found: true,
    ready: ready?.status === 'True',
    readyAt: epoch(ready?.lastTransitionTime),
    failed: synced?.status === 'False' ? (synced.message ?? synced.reason ?? 'sync failed') : undefined,
  };
}

interface RawPr {
  repo: 'source' | 'gitops';
  number: number;
  title: string;
  url: string;
  state: 'open' | 'merged';
  mergedAt?: string;
}

/**
 * The onboarding PRs Glidepath opens ("Onboarding: re-sync ..."). Later cicd.yaml
 * changes open more of them, so per repo a merged one wins over an open one: the
 * step is about the first one.
 */
export function toOnboardingPrs(prs: RawPr[]): NonNullable<ProvisioningLinks['onboarding']> {
  const pick = (repo: RawPr['repo']): PrSnapshot | undefined => {
    const mine = prs.filter(p => p.repo === repo && p.title.startsWith('Onboarding:'));
    const merged = mine
      .filter(p => p.state === 'merged')
      .sort((a, b) => (a.mergedAt ?? '').localeCompare(b.mergedAt ?? ''))[0];
    const hit = merged ?? mine.find(p => p.state === 'open');
    return hit && { number: hit.number, url: hit.url, state: hit.state, mergedAt: epoch(hit.mergedAt) };
  };
  return { source: pick('source'), gitops: pick('gitops') };
}

export function toRollout(r: RawRollout): RolloutSnapshot {
  return {
    phase: r.status?.phase,
    desired: r.spec?.replicas ?? 1,
    available: r.status?.availableReplicas ?? 0,
    createdAt: epoch(r.metadata.creationTimestamp),
  };
}

export interface UseProvisioningResult {
  items: ProvisioningInputs[];
  loading: boolean;
  /** Set when the XR list could not be read at all, so an empty list is not mistaken for "nothing in flight". */
  error?: string;
}

export function useProvisioning(): UseProvisioningResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<UseProvisioningResult>({
    items: [],
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    // Per service: what GitHub last said, and when it was last asked.
    const github = new Map<
      string,
      {
        at: number;
        busy: boolean;
        requestTries: number;
        requestPr?: PrSnapshot;
        onboarding?: ProvisioningLinks['onboarding'];
      }
    >();

    const refreshGithub = (
      x: RawXr,
      owner: string | undefined,
      tenants: { owner: string; repo: string } | undefined,
    ) => {
      const name = x.metadata.name;
      const entry = github.get(name) ?? { at: 0, busy: false, requestTries: 0 };
      github.set(name, entry);
      const bothMerged = entry.onboarding?.source?.state === 'merged' && entry.onboarding.gitops?.state === 'merged';
      // A hand-applied XR has no request PR, so stop asking after a few misses.
      const wantsRequest = !entry.requestPr && entry.requestTries < 3 && Boolean(tenants);
      if (entry.busy || Date.now() - entry.at < GITHUB_POLL_MS || (bothMerged && !wantsRequest)) return;
      entry.busy = true;
      (async () => {
        try {
          const prBase = await discoveryApi.getBaseUrl('pull-requests');
          const get = async <T>(url: string): Promise<T | undefined> => {
            try {
              const res = await fetchApi.fetch(url);
              return res.ok ? ((await res.json()) as T) : undefined;
            } catch {
              return undefined;
            }
          };
          const [request, prs] = await Promise.all([
            wantsRequest && tenants
              ? get<{ pr: PrSnapshot | null }>(
                  `${prBase}/request-pr?${new URLSearchParams({ owner: tenants.owner, repo: tenants.repo, kind: x.kind ?? '', name })}`,
                )
              : undefined,
            owner && !bothMerged
              ? get<RawPr[]>(`${prBase}/pull-requests?${new URLSearchParams({ owner, appName: name })}`)
              : undefined,
          ]);
          if (request) entry.requestTries += 1;
          if (request?.pr) entry.requestPr = request.pr;
          if (prs) entry.onboarding = toOnboardingPrs(prs);
        } catch {
          // The links are an extra: a failed lookup just leaves the step without them.
        } finally {
          entry.at = Date.now();
          entry.busy = false;
        }
      })();
    };

    const optional = async <T>(path: string): Promise<T | undefined> => {
      try {
        return await k8sProxyGet<T>(discoveryApi, fetchApi, XR_CLUSTER, path);
      } catch {
        // Missing namespace or no read grant: the step just stays pending.
        return undefined;
      }
    };

    const load = async () => {
      const lists = await Promise.allSettled(
        XR_PLURALS.map(p =>
          k8sProxyGet<ListResponse<RawXr>>(discoveryApi, fetchApi, XR_CLUSTER, `/apis/catalog.hangar.io/v1alpha1/${p}`),
        ),
      );
      if (cancelled) return;
      if (lists.every(l => l.status === 'rejected')) {
        const reason = (lists[0] as PromiseRejectedResult).reason;
        setState({
          items: [],
          loading: false,
          error: String(reason?.message ?? reason),
        });
        return;
      }
      const now = Date.now();
      const xrs = lists
        .flatMap((l, i) =>
          l.status === 'fulfilled'
            ? (l.value.items ?? []).map(x => ({
                ...x,
                kind: x.kind ?? XR_KINDS[i],
              }))
            : [],
        )
        .filter(x => now - Date.parse(x.metadata.creationTimestamp) < MAX_AGE_MS);

      const items = await Promise.all(
        xrs.map(async (x): Promise<ProvisioningInputs> => {
          const name = x.metadata.name;
          const selector = `labelSelector=${encodeURIComponent(`crossplane.io/composite=${name}`)}`;
          const mrBase = `/apis/repo.github.m.upbound.io/v1alpha1/namespaces/${x.metadata.namespace}`;
          const nsBase = `/apis/catalog.hangar.io/v1alpha1/namespaces/${x.metadata.namespace}`;
          const [runs, rollouts, repos, files, stores] = await Promise.all([
            optional<ListResponse<RawPipelineRun>>(`/apis/tekton.dev/v1/namespaces/app-${name}-cicd/pipelineruns`),
            optional<ListResponse<RawRollout>>(`/apis/argoproj.io/v1alpha1/namespaces/app-${name}-dev/rollouts`),
            optional<ListResponse<RawManaged>>(`${mrBase}/repositories?${selector}`),
            optional<ListResponse<RawManaged>>(`${mrBase}/repositoryfiles?${selector}`),
            optional<ListResponse<RawXr & { spec?: { appRef?: { name?: string } } }>>(`${nsBase}/secretstores`),
          ]);
          const store = stores?.items?.find(s => s.spec?.appRef?.name === name);
          // The Infisical project id is the Project resource's external name. Needs a read
          // grant that may not exist on every cluster, so it is optional.
          const project = store
            ? await optional<ListResponse<RawManaged>>(
                `/apis/project.infisical.m.hangar.io/v1alpha1/namespaces/${x.metadata.namespace}/projects`,
              )
            : undefined;
          const projectId = project?.items?.find(p => p.metadata.name === store?.metadata.name)?.metadata.annotations?.[
            'crossplane.io/external-name'
          ];
          const repoLinks = toRepoLinks(name, repos?.items ?? []);
          const tenants = parseTenantsRepo(x.metadata.annotations?.['terasky.backstage.io/source-info']);
          refreshGithub(x, repoLinks.owner ?? tenants?.owner, tenants);
          const gh = github.get(name);
          const first = [...(runs?.items ?? [])].sort((a, b) =>
            a.metadata.creationTimestamp.localeCompare(b.metadata.creationTimestamp),
          )[0];
          return {
            xr: {
              kind: x.kind ?? '',
              name,
              namespace: x.metadata.namespace,
              cluster: XR_CLUSTER,
              createdAt: Date.parse(x.metadata.creationTimestamp),
              conditions: x.status?.conditions ?? [],
            },
            build: first ? toBuild(first) : undefined,
            rollout: rollouts?.items?.[0] ? toRollout(rollouts.items[0]) : undefined,
            managed: toManaged(x.spec?.crossplane?.resourceRefs, [...(repos?.items ?? []), ...(files?.items ?? [])]),
            secrets: toSecrets(store, stores !== undefined),
            links: {
              requestPr: gh?.requestPr,
              sourceRepoUrl: repoLinks.sourceRepoUrl,
              gitopsRepoUrl: repoLinks.gitopsRepoUrl,
              onboarding: gh?.onboarding,
              infisicalProjectId: projectId,
            },
          };
        }),
      );
      if (cancelled) return;
      const kept = items.filter(i => {
        const p = deriveProvisioning(i, now);
        if (p.stalled) return false;
        return !p.complete || (p.completedAt !== undefined && now - p.completedAt < KEEP_DONE_MS);
      });
      kept.sort((a, b) => b.xr.createdAt - a.xr.createdAt);
      setState({ items: kept, loading: false });
    };

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [discoveryApi, fetchApi]);

  return state;
}

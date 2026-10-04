import { useEffect, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { k8sProxyGet } from '../k8sProxy';
import {
  TEKTON_CLUSTER,
  toPipelineRunSummary,
  type RawPipelineRun as TektonRawPipelineRun,
  type RawTaskRun,
} from '../tekton/useTektonPipelineRuns';
import { summarizeCloudDeploys } from '../cloudDeploy';
import {
  deriveProvisioning,
  type BuildSnapshot,
  type CreatedResource,
  type ManagedSnapshot,
  type PrSnapshot,
  type ProvisioningInputs,
  type ProvisioningLinks,
  type RolloutSnapshot,
  type SecretsSnapshot,
  type XrCondition,
  type ArgoSnapshot,
  type CatalogSnapshot,
  type CloudDeploySnapshot,
} from './deriveProvisioning';

// Airframe application XRs live on the dev cluster, the same one that runs
// Tekton (see TEKTON_CLUSTER). The four app-tier kinds are the ones a user
// can request from the scaffolder.
const XR_CLUSTER = TEKTON_CLUSTER;
const XR_PLURALS = [
  'nodejsapplications',
  'springbootapplications',
  'pythonapplications',
  'goapplications',
  'lambdafunctions',
  'azurefunctions',
];
const XR_KINDS = [
  'NodeJSApplication',
  'SpringBootApplication',
  'PythonApplication',
  'GoApplication',
  'LambdaFunction',
  'AzureFunction',
];
// The tenants repo each dev cluster's XR requests are opened against, used to find a request before
// any XR exists to read it off (an existing XR names it in its source-info annotation, which wins).
const TENANTS_REPO_BY_CLUSTER: Record<string, { owner: string; repo: string }> = {
  'kind-dev': { owner: 'jfillman', repo: 'gitops-cluster-dev-tenants' },
};
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
  metadata: { name: string; creationTimestamp?: string; labels?: Record<string, string> };
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

/**
 * The state of the app's deploys to a cloud target (ECS, Lambda, Container Apps), from its Tekton
 * deploy runs, or undefined when it has none (a Kubernetes app, or nothing deployed yet). The same
 * reading the Deployments tab uses (cloudDeploy.ts), so the two never disagree about a deploy.
 * A deploy in progress wins over an older result; a failure counts only until a newer success.
 */
export function toCloudDeploySnapshot(
  runs: TektonRawPipelineRun[] | undefined,
  taskRuns: RawTaskRun[] | undefined,
): CloudDeploySnapshot | undefined {
  if (!runs?.length) return undefined;
  const byName = new Map((taskRuns ?? []).map(t => [t.metadata.name, t]));
  const summary = summarizeCloudDeploys(runs.map(r => toPipelineRunSummary(r, TEKTON_CLUSTER, byName)));
  const pick = summary.inFlight ?? summary.latestFailure ?? summary.current;
  if (!pick) return undefined;
  let state: CloudDeploySnapshot['state'] = 'succeeded';
  if (pick === summary.inFlight) state = 'running';
  else if (pick === summary.latestFailure) state = 'failed';
  const r = pick.resource;
  return {
    state,
    label: pick.targetLabel,
    resource: r ? `${r.kind} ${r.name}` : undefined,
    completedAt: pick.completionTime ? Date.parse(pick.completionTime) : undefined,
    failure: pick.failure ? [pick.failure.task, pick.failure.message].filter(Boolean).join(': ') : undefined,
    consoleUrl: pick.consoleUrl,
  };
}

// The app's own build pipeline, as Pipelines-as-Code runs it on a push. The namespace also holds
// Glidepath's own runs (the onboarding-resync that delivers the .tekton files, the values check on
// GitOps PRs), which finish before any build exists. Counting one of those as "the first build"
// marked the step done and, through it, the onboarding step too, while the real build had not started.
export const BUILD_PIPELINE = 'build';

export function pickFirstBuild<T extends RawPipelineRun>(runs: T[] | undefined): T | undefined {
  return [...(runs ?? [])]
    .filter(r => r.metadata.labels?.['tekton.dev/pipeline'] === BUILD_PIPELINE)
    .sort((a, b) => (a.metadata.creationTimestamp ?? '').localeCompare(b.metadata.creationTimestamp ?? ''))[0];
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

/**
 * Everything the XR composes (its resourceRefs), with readiness where Tower can read
 * the kind: the GitHub repositories and files, the CI/CD child XR, and the SecretStore
 * (added on its own, since it is a sibling XR rather than one of this XR's refs).
 */
export function toCreated(
  refs: { kind: string; name: string }[] | undefined,
  readable: RawManaged[],
  store?: { name: string; ready: boolean },
): CreatedResource[] {
  const readyOf = new Map(
    readable.map(m => [m.metadata.name, m.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True']),
  );
  const out: CreatedResource[] = (refs ?? []).map(r => ({ kind: r.kind, name: r.name, ready: readyOf.get(r.name) }));
  if (store) out.push({ kind: 'SecretStore', name: store.name, ready: store.ready });
  return out;
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

interface RawPending {
  kind: string;
  name: string;
  number: number;
  url: string;
  state: 'open' | 'merged';
  createdAt?: string;
  mergedAt?: string;
}

/**
 * Requests that have no XR yet, as provisioning inputs. A request shows from the moment its PR opens,
 * which is the long stretch (a person merging, then Argo applying) the XR cannot cover. Skips kinds
 * Tower does not provision, names that already have an XR, and old abandoned PRs.
 */
export function toPendingInputs(
  requests: RawPending[],
  haveXr: Set<string>,
  cluster: string,
  now: number,
): ProvisioningInputs[] {
  return requests
    .filter(r => XR_KINDS.includes(r.kind) && !haveXr.has(r.name))
    .map(r => ({ r, created: epoch(r.createdAt) ?? now }))
    .filter(({ created }) => now - created < MAX_AGE_MS)
    .map(({ r, created }) => ({
      xr: { kind: r.kind, name: r.name, namespace: '', cluster, createdAt: created, conditions: [], pending: true },
      links: { requestPr: { number: r.number, url: r.url, state: r.state, mergedAt: epoch(r.mergedAt) } },
    }));
}

const CATALOG_RECHECK_MS = 30000;

export function useProvisioning(): UseProvisioningResult {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const catalogApi = useApi(catalogApiRef);
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

    // Pending requests come from GitHub through the backend, so they are asked at the GitHub cadence and
    // the last answer is reused between polls.
    const pendingCache: { at: number; busy: boolean; list: RawPending[] } = { at: 0, busy: false, list: [] };
    const refreshPending = (tenants: { owner: string; repo: string } | undefined) => {
      if (!tenants || pendingCache.busy || Date.now() - pendingCache.at < GITHUB_POLL_MS) return;
      pendingCache.busy = true;
      (async () => {
        try {
          const prBase = await discoveryApi.getBaseUrl('pull-requests');
          const res = await fetchApi.fetch(
            `${prBase}/pending-requests?${new URLSearchParams({ owner: tenants.owner, repo: tenants.repo })}`,
          );
          if (res.ok) pendingCache.list = ((await res.json()) as { requests?: RawPending[] }).requests ?? [];
        } catch {
          // An extra: a failed lookup leaves the list as it was.
        } finally {
          pendingCache.at = Date.now();
          pendingCache.busy = false;
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

    // Whether the catalog has a Component for this service yet. Undefined when the lookup fails, so
    // the step waits rather than guessing.
    // A service stays in the catalog once found, so only misses are asked again, and not every poll.
    const catalogSeen = new Map<string, { found: boolean; at: number }>();
    const inCatalog = async (name: string): Promise<CatalogSnapshot | undefined> => {
      const seen = catalogSeen.get(name);
      if (seen && (seen.found || Date.now() - seen.at < CATALOG_RECHECK_MS)) return { found: seen.found };
      try {
        const res = await catalogApi.getEntities({
          filter: { kind: 'Component', 'metadata.name': name },
          fields: ['metadata.name'],
        });
        catalogSeen.set(name, { found: res.items.length > 0, at: Date.now() });
        return { found: res.items.length > 0 };
      } catch {
        return undefined;
      }
    };

    // The ArgoCD app that installs the pipeline namespace. Undefined when ArgoCD cannot be read,
    // so the step falls back to the XR condition alone.
    const cicdApp = async (name: string): Promise<ArgoSnapshot | undefined> => {
      const appName = `${name}-cicd`;
      try {
        const baseUrl = await discoveryApi.getBaseUrl('argocd');
        const res = await fetchApi.fetch(`${baseUrl}/find/name/${encodeURIComponent(appName)}?expand=applications`);
        if (!res.ok) return undefined;
        const instances = (await res.json()) as Array<{
          applications?: Array<{ status?: { sync?: { status?: string }; health?: { status?: string } } }>;
        }>;
        const app = instances.flatMap(i => i.applications ?? [])[0];
        // Not created yet: still waiting on ArgoCD, reported as unsynced rather than unreadable.
        return { name: appName, sync: app?.status?.sync?.status, health: app?.status?.health?.status };
      } catch {
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
          const [runs, rollouts, repos, files, stores, cicds, catalog, cicdArgo] = await Promise.all([
            optional<ListResponse<TektonRawPipelineRun>>(
              `/apis/tekton.dev/v1/namespaces/app-${name}-cicd/pipelineruns`,
            ),
            optional<ListResponse<RawRollout>>(`/apis/argoproj.io/v1alpha1/namespaces/app-${name}-dev/rollouts`),
            optional<ListResponse<RawManaged>>(`${mrBase}/repositories?${selector}`),
            optional<ListResponse<RawManaged>>(`${mrBase}/repositoryfiles?${selector}`),
            optional<ListResponse<RawXr & { spec?: { appRef?: { name?: string } } }>>(`${nsBase}/secretstores`),
            optional<ListResponse<RawManaged>>(`${nsBase}/tektoncicds`),
            inCatalog(name),
            cicdApp(name),
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
          const first = pickFirstBuild(runs?.items);
          // TaskRuns carry the deploy target and config, so they are only fetched for an app that has
          // a deploy run to read them for (the common case of "nothing deployed yet" costs nothing).
          const deployRuns = (runs?.items ?? []).filter(r => r.metadata.labels?.['tekton.dev/pipeline'] === 'deploy');
          const cloudDeploy = deployRuns.length
            ? toCloudDeploySnapshot(
                deployRuns,
                (await optional<ListResponse<RawTaskRun>>(`/apis/tekton.dev/v1/namespaces/app-${name}-cicd/taskruns`))
                  ?.items,
              )
            : undefined;
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
            created: toCreated(
              x.spec?.crossplane?.resourceRefs,
              [...(repos?.items ?? []), ...(files?.items ?? []), ...(cicds?.items ?? [])],
              store
                ? {
                    name: store.metadata.name,
                    ready: store.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') ?? false,
                  }
                : undefined,
            ),
            secrets: toSecrets(store, stores !== undefined),
            catalog,
            cicdApp: cicdArgo,
            cloudDeploy,
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
      refreshPending(
        xrs.map(x => parseTenantsRepo(x.metadata.annotations?.['terasky.backstage.io/source-info'])).find(Boolean) ??
          TENANTS_REPO_BY_CLUSTER[XR_CLUSTER],
      );
      items.push(...toPendingInputs(pendingCache.list, new Set(xrs.map(x => x.metadata.name)), XR_CLUSTER, now));
      const kept = items.filter(i => {
        const p = deriveProvisioning(i, now);
        // Stalled ones stay: the tab lists them apart from the in-flight ones, the strip hides them.
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
  }, [discoveryApi, fetchApi, catalogApi]);

  return state;
}

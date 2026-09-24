import { useEffect, useMemo, useState } from 'react';
import type {
  V1Container,
  V1Deployment,
  V1Pod,
  V1Service,
  V2HorizontalPodAutoscaler,
} from '@kubernetes/client-node';
import type {
  ClusterObjects,
  DeploymentFetchResponse,
  FetchResponse,
  HorizontalPodAutoscalersFetchResponse,
  IngressesFetchResponse,
  PodFetchResponse,
  ServiceFetchResponse,
} from '@backstage/plugin-kubernetes-common';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useCustomResources, useKubernetesObjects } from '@backstage/plugin-kubernetes-react';
import type {
  CanaryProgress,
  CanaryStepDef,
  CanaryStepSummary,
  EnvironmentSummary,
  K8sResourceRef,
  PodSummary,
  ServiceSummary,
  WorkloadDetail,
} from './types';

// Ported from packages/app/src/modules/glidepath/GlidepathPage.tsx (its
// buildEnvironments/matchers) rather than imported from it - the handoff is
// explicit that Tower reimplements this family of modules' UI instead of
// mounting them, and glidepath itself must stay untouched. The one
// substantive change from the original: the env label reads hangar.io/env.
// Used to also fall back to platform.io/env during the naming rebrand's
// transition window (Tier 1, 2026-09-07, renamed the chart *templates* but
// hadn't been redeployed to every live cluster yet - see
// HANDOFF-tower-module.md). That transition is over: every resource-emitting
// chart (airframe-application etc.) now stamps hangar.io/* only, and the
// real 2026-09-10 bug was elsewhere anyway - the kubernetes-ingestor patch's
// `backstage.io/kubernetes-label-selector` (see .yarn/patches) still
// computed platform.io/app, so the Kubernetes plugin's own label-selector
// query matched nothing at the source, before this fallback ever mattered.
// Dropping the fallback here now that the domain is hangar.io everywhere,
// not just preferred.
const ROLLOUT_MATCHER = { group: 'argoproj.io', apiVersion: 'v1alpha1', plural: 'rollouts' };
const HTTPROUTE_MATCHER = { group: 'gateway.networking.k8s.io', apiVersion: 'v1', plural: 'httproutes' };
const GATEWAY_MATCHER = { group: 'gateway.networking.k8s.io', apiVersion: 'v1', plural: 'gateways' };
// PodDisruptionBudget isn't one of the Kubernetes plugin's default fetched
// object types (confirmed against @backstage/plugin-kubernetes-common's
// FetchResponse union - no 'poddisruptionbudgets' member), so it's fetched
// the same way Rollout/HTTPRoute/Gateway already are: as a named custom
// resource. Best-effort like those two - a PDB is optional per app, and a
// missing RBAC grant for policy/v1 (not yet confirmed live on any cluster)
// should read as "no PDB configured", not an error.
const PDB_MATCHER = { group: 'policy', apiVersion: 'v1', plural: 'poddisruptionbudgets' };

// The rest of "everything in the namespace" (2026-09-17 bug report: the old
// resource list only covered the Kubernetes plugin's default fetched types
// plus the 4 above - real RBAC/SA/NetworkPolicy objects were invisible).
// Same custom-resource matcher mechanism as the 4 above - each just names a
// group/apiVersion/plural and the backend fetches it with the identical
// per-entity namespace+label-selector scoping every other resource here
// already gets (confirmed against KubernetesFetcher's buildResourcePath:
// `group: ''` correctly builds the core `/api/v1/...` path, not an
// `/apis//v1/...` one, so a core-group matcher like ServiceAccount works
// the same way as an actual CRD matcher). ServiceAccount/NetworkPolicy/
// Endpoints are part of the stock `view` ClusterRole already bound to
// backstage-ingestor on every cluster; Role/RoleBinding/ExternalSecret/
// ServiceMonitor each need their own dedicated grant instead (RBAC objects
// are deliberately excluded from `view`'s aggregation; the other two are
// CRDs `view` was never extended to cover) - see gitops-cluster-*'s own
// 00-bootstrap/backstage-ingestor-rbac/rbac.yaml (backstage-rbac-viewer,
// backstage-topology-resource-viewer). All correctly declared there as of
// 2026-09-17 - but 2026-09-22 kiac-prod's host relocation confirmed live
// that ONLY the older grants in that same file (view/crd-viewer/
// crossplane-browse/argo-rollouts-viewer) actually made it onto the
// rebuilt cluster; these three ClusterRole/ClusterRoleBinding pairs plus
// backstage-gateway-api-viewer (added 2026-09-06, also missing) never got
// (re)applied during bootstrap, so all four read/list/watch calls 403'd
// there until reapplied by hand to match kiac-dev's already-correct state.
// Same class of gap re-checked and confirmed already fixed on kind-prod
// (kiac-prod's full replacement, decommissioned the same day - see
// app-config.yaml's own decommission note) - all four grants present there
// too as of this writing, so this isn't a currently-recurring issue, just a
// bootstrap step worth double-checking again on any future cluster rebuild.
//
// Namespace itself is deliberately NOT here - it's cluster-scoped, and this
// fetcher unconditionally nests every matcher under `/namespaces/<ns>/`
// (see buildResourcePath), which produces an invalid
// `/api/v1/namespaces/<ns>/namespaces` path for it. Fetched separately, as
// a single raw GET, by useNamespaceResource.ts instead.
const SERVICEACCOUNT_MATCHER = { group: '', apiVersion: 'v1', plural: 'serviceaccounts' };
const NETWORKPOLICY_MATCHER = { group: 'networking.k8s.io', apiVersion: 'v1', plural: 'networkpolicies' };
const ENDPOINTS_MATCHER = { group: '', apiVersion: 'v1', plural: 'endpoints' };
const ROLE_MATCHER = { group: 'rbac.authorization.k8s.io', apiVersion: 'v1', plural: 'roles' };
const ROLEBINDING_MATCHER = { group: 'rbac.authorization.k8s.io', apiVersion: 'v1', plural: 'rolebindings' };
// v1beta1 removed upstream (external-secrets.io serves only v1 now,
// confirmed live on both kiac-dev and kiac-prod (now kind-prod, kiac-prod
// decommissioned 2026-09-22): `served=false` for v1beta1 on the
// externalsecrets CRD on each) - this was 404ing independently of the RBAC
// gap above, on every cluster, regardless of the relocation.
const EXTERNALSECRET_MATCHER = { group: 'external-secrets.io', apiVersion: 'v1', plural: 'externalsecrets' };
const SERVICEMONITOR_MATCHER = { group: 'monitoring.coreos.com', apiVersion: 'v1', plural: 'servicemonitors' };

// Same per-item TypeMeta gap as RESOURCE_API_VERSION above, for these 7
// kinds - useCustomResources' own list responses don't reliably self-carry
// apiVersion on each item either (2026-09-17 bug: ServiceAccount/
// NetworkPolicy/Endpoints YAML views were still missing it after the first
// fix, which only covered the *other* fetch path). Each matcher above
// already declares its own real group/apiVersion, so this is derived from
// them rather than duplicated as separate literals.
function groupedApiVersion(matcher: { group: string; apiVersion: string }): string {
  return matcher.group ? `${matcher.group}/${matcher.apiVersion}` : matcher.apiVersion;
}
const EXTRA_KIND_API_VERSION: Record<string, string> = {
  ServiceAccount: groupedApiVersion(SERVICEACCOUNT_MATCHER),
  NetworkPolicy: groupedApiVersion(NETWORKPOLICY_MATCHER),
  Endpoints: groupedApiVersion(ENDPOINTS_MATCHER),
  Role: groupedApiVersion(ROLE_MATCHER),
  RoleBinding: groupedApiVersion(ROLEBINDING_MATCHER),
  ExternalSecret: groupedApiVersion(EXTERNALSECRET_MATCHER),
  ServiceMonitor: groupedApiVersion(SERVICEMONITOR_MATCHER),
};

// No deep parsing needed for any of these - they only ever end up as a
// generic K8sResourceRef in the resource gallery, never feed a typed
// EnvironmentSummary field the way Rollout/HTTPRoute/PDB do.
interface NamedNamespacedResource {
  apiVersion?: string;
  metadata?: { name?: string; namespace?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
}

interface RolloutCanaryStep {
  setWeight?: number;
  pause?: { duration?: string | number };
  analysis?: { templates?: Array<{ templateName?: string }> };
  setCanaryScale?: unknown;
  experiment?: unknown;
}

interface RolloutCanarySpec {
  steps?: RolloutCanaryStep[];
  canaryService?: string;
  stableService?: string;
  // Background analysis, not a step - see CanaryProgress.backgroundAnalysisTemplates.
  analysis?: { templates?: Array<{ templateName?: string }> };
}

interface RolloutBlueGreenSpec {
  activeService?: string;
  previewService?: string;
  autoPromotionEnabled?: boolean;
  scaleDownDelaySeconds?: number;
}

interface RolloutResource {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: {
    replicas?: number;
    template?: { spec?: { containers?: V1Container[] } };
    strategy?: { canary?: RolloutCanarySpec; blueGreen?: RolloutBlueGreenSpec };
  };
  status?: {
    replicas?: number;
    availableReplicas?: number;
    phase?: 'Healthy' | 'Progressing' | 'Degraded' | 'Paused' | string;
    // Argo Rollouts' own real "why this phase" explanation - see
    // EnvironmentSummary.rolloutMessage's own comment on why this is worth
    // reading now (2026-09-18: "canary error messages need to surface
    // better").
    message?: string;
    currentStepIndex?: number;
    currentPodHash?: string;
    // The live pointer to the current background AnalysisRun (see
    // RolloutCanarySpec.analysis) - distinct from currentStepAnalysisRunStatus,
    // which only ever tracks a per-step analysis.
    canary?: { currentBackgroundAnalysisRunStatus?: { name?: string } };
  };
}

interface HttpRouteResource {
  apiVersion?: string;
  kind?: string;
  metadata?: { name?: string; namespace?: string; labels?: Record<string, string> };
  spec?: {
    hostnames?: string[];
    parentRefs?: Array<{ name?: string; namespace?: string }>;
  };
}

interface GatewayResource {
  metadata?: { name?: string; namespace?: string };
  spec?: { listeners?: Array<{ protocol?: string; tls?: unknown }> };
}

interface PdbResource {
  apiVersion?: string;
  metadata?: { name?: string; namespace?: string; labels?: Record<string, string> };
  spec?: { minAvailable?: string | number; maxUnavailable?: string | number };
  status?: { currentHealthy?: number; desiredHealthy?: number; disruptionsAllowed?: number };
}

function resolveRouteScheme(
  route: HttpRouteResource,
  routeNamespace: string,
  gateways: GatewayResource[],
): string {
  const parentRef = route.spec?.parentRefs?.[0];
  if (!parentRef) return 'http';
  const gatewayNamespace = parentRef.namespace ?? routeNamespace;
  const gateway = gateways.find(
    g => g.metadata?.name === parentRef.name && g.metadata?.namespace === gatewayNamespace,
  );
  const hasTls = gateway?.spec?.listeners?.some(l => Boolean(l.tls) || l.protocol === 'HTTPS');
  return hasTls ? 'https' : 'http';
}

// Real pod/service detail for the Topology tab - the same objects
// useKubernetesObjects already fetches for the Overview/Releases tabs'
// replica counts, just carried through per-environment instead of collapsed
// into a count. No new backend call: 'services' is one of the Kubernetes
// plugin's default fetched object types, same as 'pods'/'deployments'.
function toPodSummary(pod: V1Pod): PodSummary {
  const statuses = pod.status?.containerStatuses ?? [];
  return {
    name: pod.metadata?.name ?? 'unnamed pod',
    phase: pod.status?.phase,
    ready: statuses.length > 0 && statuses.every(c => c.ready),
    restarts: statuses.reduce((sum, c) => sum + (c.restartCount ?? 0), 0),
    startTime: pod.status?.startTime ? new Date(pod.status.startTime).toISOString() : undefined,
    containers: (pod.spec?.containers ?? []).map(c => c.name),
  };
}

function toServiceSummary(svc: V1Service): ServiceSummary {
  return {
    name: svc.metadata?.name ?? 'unnamed service',
    type: svc.spec?.type,
    clusterIP: svc.spec?.clusterIP,
    ports: (svc.spec?.ports ?? []).map(p => ({
      port: p.port,
      targetPort: p.targetPort as string | number | undefined,
      protocol: p.protocol,
    })),
  };
}

function summarizeCanaryStep(step: RolloutCanaryStep, index: number): CanaryStepSummary {
  if (step.setWeight !== undefined) return { label: `Set weight ${step.setWeight}%` };
  if (step.pause) {
    return {
      label:
        step.pause.duration !== undefined
          ? `Pause ${step.pause.duration}`
          : 'Pause indefinitely (manual promote)',
    };
  }
  if (step.analysis) {
    const names = (step.analysis.templates ?? [])
      .map(t => t.templateName)
      .filter((n): n is string => Boolean(n))
      .join(', ');
    return { label: names ? `Analysis: ${names}` : 'Analysis' };
  }
  if (step.setCanaryScale) return { label: 'Set canary scale' };
  if (step.experiment) return { label: 'Experiment' };
  return { label: `Step ${index + 1}` };
}

// Structured version of the same step, alongside summarizeCanaryStep's
// pre-rendered label - the CI/CD tab's live weight chart/ramp
// (2026-09-11) needs the real numbers, not a string to re-parse.
function toCanaryStepDef(step: RolloutCanaryStep): CanaryStepDef {
  if (step.setWeight !== undefined) return { kind: 'setWeight', weight: step.setWeight };
  if (step.pause) {
    return {
      kind: 'pause',
      pauseDuration: step.pause.duration !== undefined ? String(step.pause.duration) : undefined,
    };
  }
  return {
    kind: 'analysis',
    analysisTemplates: (step.analysis?.templates ?? [])
      .map(t => t.templateName)
      .filter((n): n is string => Boolean(n)),
  };
}

// Rollout status carries currentStepIndex but no standalone "current
// traffic %" field - it's the last setWeight step at or before that index
// (a pause/analysis step doesn't change the weight the previous setWeight
// step already set). Once currentStepIndex has walked past every declared
// step, the rollout has fully promoted to the stable ReplicaSet - 100%.
function currentCanaryWeight(steps: CanaryStepDef[], currentStepIndex: number | undefined): number | undefined {
  if (currentStepIndex === undefined) return undefined;
  if (currentStepIndex >= steps.length) return 100;
  let weight: number | undefined;
  for (let i = 0; i <= currentStepIndex && i < steps.length; i += 1) {
    const step = steps[i];
    if (step.kind === 'setWeight') weight = step.weight;
  }
  return weight;
}

// Argo Rollouts always finishes a canary at 100% traffic once every declared
// step completes, even when the last step isn't itself `setWeight: 100` (a
// declared `[{setWeight:20},{pause},{setWeight:60}]` still ends fully
// promoted - full promotion after the final step is implicit, not a step of
// its own). Without this, the weight chart/ramp had nothing to draw that
// last stretch from, so it visually stopped at whatever % the last real step
// set and never showed traffic actually reaching 100% (2026-09-15 bug).
// `rollout.status.currentStepIndex` reaching the ORIGINAL steps.length is
// exactly Argo Rollouts' own signal for "fully promoted" (see
// currentCanaryWeight's pre-existing `>= steps.length` branch below) - which
// lines up with the appended step landing at that same index in the
// extended array, so no separate index remapping is needed.
function withImpliedFinalStep(steps: CanaryStepDef[]): CanaryStepDef[] {
  const lastWeight = [...steps].reverse().find(s => s.kind === 'setWeight')?.weight;
  if (lastWeight === 100) return steps;
  return [...steps, { kind: 'setWeight', weight: 100, implied: true }];
}

function buildCanaryProgress(canary: RolloutCanarySpec, rollout: RolloutResource): CanaryProgress {
  const steps = withImpliedFinalStep((canary.steps ?? []).map(toCanaryStepDef));
  const currentStepIndex = rollout.status?.currentStepIndex;
  const backgroundAnalysisTemplates = (canary.analysis?.templates ?? [])
    .map(tpl => tpl.templateName)
    .filter((n): n is string => Boolean(n));
  return {
    steps,
    currentStepIndex,
    currentWeight: currentCanaryWeight(steps, currentStepIndex),
    backgroundAnalysisTemplates: backgroundAnalysisTemplates.length > 0 ? backgroundAnalysisTemplates : undefined,
    currentBackgroundAnalysisRunName: rollout.status?.canary?.currentBackgroundAnalysisRunStatus?.name,
  };
}

// The config a user actually needs to reason about a rollout - which
// strategy, and (if canary/blue-green) the concrete steps/services, not just
// the one-word label buildEnvironments already derived. Reads directly off
// the real Rollout/Deployment spec already fetched for replica counts - no
// new backend call. Deployment gets no canary/blueGreen (Kubernetes core has
// no such concept), only strategyKind.
function rolloutStrategyKind(
  canary: RolloutCanarySpec | undefined,
  blueGreen: RolloutBlueGreenSpec | undefined,
): WorkloadDetail['strategyKind'] {
  if (canary) return 'canary';
  if (blueGreen) return 'blueGreen';
  return 'rollingUpdate';
}

function targetCpuUtilizationOf(hpa: V2HorizontalPodAutoscaler): number | undefined {
  return hpa.spec?.metrics?.find(m => m.resource?.name === 'cpu')?.resource?.target?.averageUtilization;
}

function buildPdbSummary(pdb: PdbResource | undefined): WorkloadDetail['pdb'] {
  if (!pdb) return undefined;
  return {
    name: pdb.metadata?.name ?? 'unnamed',
    minAvailable: pdb.spec?.minAvailable,
    maxUnavailable: pdb.spec?.maxUnavailable,
    currentHealthy: pdb.status?.currentHealthy,
    desiredHealthy: pdb.status?.desiredHealthy,
    disruptionsAllowed: pdb.status?.disruptionsAllowed,
  };
}

function buildHpaSummary(hpa: V2HorizontalPodAutoscaler | undefined): WorkloadDetail['hpa'] {
  if (!hpa) return undefined;
  return {
    name: hpa.metadata?.name ?? 'unnamed',
    minReplicas: hpa.spec?.minReplicas,
    maxReplicas: hpa.spec?.maxReplicas,
    targetCpuUtilization: targetCpuUtilizationOf(hpa),
    currentReplicas: hpa.status?.currentReplicas,
  };
}

function buildWorkloadDetail(
  rollout: RolloutResource | undefined,
  deployment: V1Deployment | undefined,
  pdb: PdbResource | undefined,
  hpa: V2HorizontalPodAutoscaler | undefined,
): WorkloadDetail | undefined {
  if (rollout) {
    const canary = rollout.spec?.strategy?.canary;
    const blueGreen = rollout.spec?.strategy?.blueGreen;
    return {
      kind: 'Rollout',
      name: rollout.metadata?.name ?? 'unnamed',
      strategyKind: rolloutStrategyKind(canary, blueGreen),
      canarySteps: canary?.steps?.map(summarizeCanaryStep),
      canaryProgress: canary ? buildCanaryProgress(canary, rollout) : undefined,
      currentPodHash: rollout.status?.currentPodHash,
      canaryServices: canary
        ? { canary: canary.canaryService, stable: canary.stableService }
        : undefined,
      blueGreen: blueGreen
        ? {
            activeService: blueGreen.activeService,
            previewService: blueGreen.previewService,
            autoPromotionEnabled: blueGreen.autoPromotionEnabled,
            scaleDownDelaySeconds: blueGreen.scaleDownDelaySeconds,
          }
        : undefined,
      pdb: buildPdbSummary(pdb),
      hpa: buildHpaSummary(hpa),
      labels: rollout.metadata?.labels,
      annotations: rollout.metadata?.annotations,
      raw: rollout,
    };
  }
  if (deployment) {
    return {
      kind: 'Deployment',
      name: deployment.metadata?.name ?? 'unnamed',
      strategyKind: deployment.spec?.strategy?.type === 'Recreate' ? 'recreate' : 'rollingUpdate',
      pdb: buildPdbSummary(pdb),
      hpa: buildHpaSummary(hpa),
      labels: deployment.metadata?.labels,
      annotations: deployment.metadata?.annotations,
      raw: deployment,
    };
  }
  return undefined;
}

// Human labels for the Kubernetes plugin's own FetchResponse.type strings -
// list items returned by the core-API fetchers typically don't self-carry a
// `kind` field (only the enclosing List does), so this is the only reliable
// way to know what a given object actually is. Deliberately covers every
// type the plugin's default fetch can return (see @backstage/plugin-
// kubernetes-common's FetchResponse union) - the Topology tab's "full
// resource list" is only honest if it doesn't silently skip a type.
const RESOURCE_KIND_LABEL: Partial<Record<FetchResponse['type'], string>> = {
  pods: 'Pod',
  services: 'Service',
  configmaps: 'ConfigMap',
  secrets: 'Secret',
  deployments: 'Deployment',
  limitranges: 'LimitRange',
  resourcequotas: 'ResourceQuota',
  replicasets: 'ReplicaSet',
  horizontalpodautoscalers: 'HorizontalPodAutoscaler',
  jobs: 'Job',
  cronjobs: 'CronJob',
  ingresses: 'Ingress',
  statefulsets: 'StatefulSet',
  daemonsets: 'DaemonSet',
  persistentvolumeclaims: 'PersistentVolumeClaim',
  persistentvolumes: 'PersistentVolume',
};

// Same "list items don't self-carry it" gap as kind above, for apiVersion -
// each of these types has exactly one real apiVersion on this platform (no
// object here is ever fetched at a deprecated/alternate API version), so a
// static lookup is as reliable as reading it off the object would be, and
// unlike kind, nothing else already reconstructs this one to fall back on.
const RESOURCE_API_VERSION: Partial<Record<FetchResponse['type'], string>> = {
  pods: 'v1',
  services: 'v1',
  configmaps: 'v1',
  secrets: 'v1',
  deployments: 'apps/v1',
  limitranges: 'v1',
  resourcequotas: 'v1',
  replicasets: 'apps/v1',
  horizontalpodautoscalers: 'autoscaling/v2',
  jobs: 'batch/v1',
  cronjobs: 'batch/v1',
  ingresses: 'networking.k8s.io/v1',
  statefulsets: 'apps/v1',
  daemonsets: 'apps/v1',
  persistentvolumeclaims: 'v1',
  persistentvolumes: 'v1',
};

interface MinimalK8sObject {
  apiVersion?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
}

// Every real object deployed to this one environment's namespace, across
// every object type the Kubernetes plugin fetches, plus the custom resources
// this module fetches separately (Rollout/HTTPRoute) - the Topology tab's
// "click through and see the full resource list" and "view the raw YAML of
// each resource" both work off this list. Gateways are deliberately excluded
// - they're shared platform infrastructure (one Gateway serves every app's
// namespace via HTTPRoute, confirmed live: gitops-cluster-*'s own
// 50-gateway-routes), not something this app "deployed", the same reasoning
// PromoteDialog's tier split already draws between an app's own resources
// and the platform underneath it.
function collectResources(
  item: ClusterObjects,
  namespace: string,
  rollouts: RolloutResource[],
  httpRoutes: HttpRouteResource[],
  pdbs: PdbResource[],
  extraKinds: Array<{ kind: string; resources: NamedNamespacedResource[] }>,
): K8sResourceRef[] {
  const refs: K8sResourceRef[] = [];

  for (const fetchResponse of item.resources) {
    const kind = RESOURCE_KIND_LABEL[fetchResponse.type];
    if (!kind) continue;
    for (const obj of fetchResponse.resources as MinimalK8sObject[]) {
      if (obj.metadata?.namespace !== namespace) continue;
      refs.push({
        kind,
        apiVersion: obj.apiVersion ?? RESOURCE_API_VERSION[fetchResponse.type],
        name: obj.metadata?.name ?? 'unnamed',
        namespace,
        labels: obj.metadata?.labels,
        annotations: obj.metadata?.annotations,
        raw: obj,
      });
    }
  }

  rollouts
    .filter(r => r.metadata?.namespace === namespace)
    .forEach(r =>
      refs.push({
        kind: 'Rollout',
        apiVersion: r.apiVersion,
        name: r.metadata?.name ?? 'unnamed',
        namespace,
        labels: r.metadata?.labels,
        annotations: r.metadata?.annotations,
        raw: r,
      }),
    );

  httpRoutes
    .filter(r => r.metadata?.namespace === namespace)
    .forEach(r =>
      refs.push({
        kind: 'HTTPRoute',
        apiVersion: r.apiVersion,
        name: r.metadata?.name ?? 'unnamed',
        namespace,
        labels: r.metadata?.labels,
        raw: r,
      }),
    );

  pdbs
    .filter(p => p.metadata?.namespace === namespace)
    .forEach(p =>
      refs.push({
        kind: 'PodDisruptionBudget',
        apiVersion: p.apiVersion,
        name: p.metadata?.name ?? 'unnamed',
        namespace,
        labels: p.metadata?.labels,
        raw: p,
      }),
    );

  extraKinds.forEach(({ kind, resources }) =>
    resources
      .filter(r => r.metadata?.namespace === namespace)
      .forEach(r =>
        refs.push({
          kind,
          apiVersion: r.apiVersion ?? EXTRA_KIND_API_VERSION[kind],
          name: r.metadata?.name ?? 'unnamed',
          namespace,
          labels: r.metadata?.labels,
          annotations: r.metadata?.annotations,
          raw: r,
        }),
      ),
  );

  return refs;
}

function rolloutStrategyLabel(
  rollout: RolloutResource | undefined,
  hasDeployment: boolean,
): string | undefined {
  if (!rollout?.spec?.strategy) return hasDeployment ? 'RollingUpdate' : undefined;
  if (rollout.spec.strategy.canary) return 'Canary';
  if (rollout.spec.strategy.blueGreen) return 'Blue/Green';
  return 'RollingUpdate';
}

function envLabelOf(rollout: RolloutResource | undefined, namespace: string): string {
  return rollout?.metadata?.labels?.['hangar.io/env'] ?? namespace;
}

function buildEnvironments(
  items: ClusterObjects[],
  rolloutsByCluster: Map<string, RolloutResource[]>,
  httpRoutesByCluster: Map<string, HttpRouteResource[]>,
  gatewaysByCluster: Map<string, GatewayResource[]>,
  pdbsByCluster: Map<string, PdbResource[]>,
  extraKindsByCluster: Map<string, Array<{ kind: string; resources: NamedNamespacedResource[] }>>,
): EnvironmentSummary[] {
  const envs: EnvironmentSummary[] = [];

  for (const item of items) {
    const allPods =
      item.resources.find((r): r is PodFetchResponse => r.type === 'pods')?.resources ?? [];
    const allIngresses =
      item.resources.find((r): r is IngressesFetchResponse => r.type === 'ingresses')
        ?.resources ?? [];
    const allDeployments =
      item.resources.find((r): r is DeploymentFetchResponse => r.type === 'deployments')
        ?.resources ?? [];
    const allServices =
      item.resources.find((r): r is ServiceFetchResponse => r.type === 'services')?.resources ?? [];
    const allHpas =
      item.resources.find((r): r is HorizontalPodAutoscalersFetchResponse => r.type === 'horizontalpodautoscalers')
        ?.resources ?? [];
    const rollouts = rolloutsByCluster.get(item.cluster.name) ?? [];
    const httpRoutes = httpRoutesByCluster.get(item.cluster.name) ?? [];
    const gateways = gatewaysByCluster.get(item.cluster.name) ?? [];
    const pdbs = pdbsByCluster.get(item.cluster.name) ?? [];
    const extraKinds = extraKindsByCluster.get(item.cluster.name) ?? [];
    const namespacesSeen = new Set<string>();

    const pushEnv = (
      namespace: string,
      source: { rollout?: RolloutResource; deployment?: V1Deployment },
    ) => {
      if (namespacesSeen.has(namespace)) return;
      namespacesSeen.add(namespace);
      const { rollout, deployment } = source;
      const podList: V1Pod[] = allPods.filter(p => p.metadata?.namespace === namespace);
      const container: V1Container | undefined =
        rollout?.spec?.template?.spec?.containers?.[0] ??
        deployment?.spec?.template?.spec?.containers?.[0] ??
        podList[0]?.spec?.containers?.[0];
      const desiredReplicas = rollout?.spec?.replicas ?? deployment?.spec?.replicas;
      const availableReplicas =
        rollout?.status?.availableReplicas ??
        deployment?.status?.availableReplicas ??
        (desiredReplicas === undefined
          ? podList.filter(p => p.status?.phase === 'Running').length
          : undefined);
      const startTimes = podList
        .map(p => p.status?.startTime)
        .filter((t): t is Date => Boolean(t))
        .map(t => new Date(t).getTime());
      const envLabel = envLabelOf(rollout, namespace);
      const appName = rollout?.metadata?.name ?? deployment?.metadata?.name;
      const httpRoute = httpRoutes.find(r => r.metadata?.namespace === namespace);
      const routeHost = httpRoute?.spec?.hostnames?.[0];
      const ingress = allIngresses.find(i => i.metadata?.namespace === namespace);
      const ingressHost = ingress?.spec?.rules?.[0]?.host;
      let ingressUrl: string | undefined;
      if (httpRoute && routeHost) {
        ingressUrl = `${resolveRouteScheme(httpRoute, namespace, gateways)}://${routeHost}`;
      } else if (ingressHost) {
        ingressUrl = `${ingress?.spec?.tls?.length ? 'https' : 'http'}://${ingressHost}`;
      }
      const strategy = rolloutStrategyLabel(rollout, Boolean(deployment));
      const services = allServices
        .filter(s => s.metadata?.namespace === namespace)
        .map(toServiceSummary);
      // One-per-namespace assumption for both, same as the rollout/httpRoute
      // lookups above - consistent with this codebase's existing per-app-
      // namespace model rather than a new convention.
      const pdb = pdbs.find(p => p.metadata?.namespace === namespace);
      const hpa = allHpas.find(h => h.metadata?.namespace === namespace);
      const workload = buildWorkloadDetail(rollout, deployment, pdb, hpa);
      const resources = collectResources(item, namespace, rollouts, httpRoutes, pdbs, extraKinds);

      envs.push({
        key: `${item.cluster.name}/${namespace}`,
        env: envLabel,
        cluster: item.cluster.name,
        namespace,
        appName,
        argoAppName: appName ? `${appName}-${envLabel}` : undefined,
        image: container?.image,
        desiredReplicas,
        availableReplicas,
        cpuRequest: container?.resources?.requests?.cpu,
        cpuLimit: container?.resources?.limits?.cpu,
        memoryRequest: container?.resources?.requests?.memory,
        memoryLimit: container?.resources?.limits?.memory,
        deployedAt: startTimes.length
          ? new Date(Math.max(...startTimes)).toISOString()
          : undefined,
        rolloutPhase: rollout?.status?.phase,
        rolloutMessage: rollout?.status?.message,
        strategy,
        ingressUrl,
        drift: false,
        pods: podList.map(toPodSummary),
        services,
        workload,
        resources,
      });
    };

    if (rollouts.length > 0) {
      rollouts.forEach(rollout => {
        if (rollout.metadata?.namespace) pushEnv(rollout.metadata.namespace, { rollout });
      });
    } else {
      allDeployments.forEach(deployment => {
        if (deployment.metadata?.namespace) pushEnv(deployment.metadata.namespace, { deployment });
      });
    }
  }

  const imageCounts = new Map<string, number>();
  envs.forEach(e => {
    if (e.image) imageCounts.set(e.image, (imageCounts.get(e.image) ?? 0) + 1);
  });
  const majorityImage = [...imageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const distinctImages = imageCounts.size;

  return envs.map(e => ({
    ...e,
    drift: distinctImages > 1 && !!e.image && e.image !== majorityImage,
  }));
}

export function useTowerEnvironments() {
  const { entity } = useEntity();
  const { kubernetesObjects, loading, error } = useKubernetesObjects(entity);
  const {
    kubernetesObjects: rolloutObjects,
    loading: rolloutsLoading,
    error: rolloutsError,
  } = useCustomResources(entity, [ROLLOUT_MATCHER]);
  const {
    kubernetesObjects: httpRouteObjects,
    loading: httpRoutesLoading,
  } = useCustomResources(entity, [HTTPROUTE_MATCHER]);
  const {
    kubernetesObjects: gatewayObjects,
    loading: gatewaysLoading,
  } = useCustomResources(entity, [GATEWAY_MATCHER]);
  const {
    kubernetesObjects: pdbObjects,
    loading: pdbsLoading,
  } = useCustomResources(entity, [PDB_MATCHER]);
  // One explicit call per extra kind, not a loop - a hook call inside
  // .map()/a loop trips the rules-of-hooks lint even over a fixed-length
  // constant array, so each stays written out.
  const { kubernetesObjects: serviceAccountObjects, loading: serviceAccountsLoading } = useCustomResources(entity, [
    SERVICEACCOUNT_MATCHER,
  ]);
  const { kubernetesObjects: networkPolicyObjects, loading: networkPoliciesLoading } = useCustomResources(entity, [
    NETWORKPOLICY_MATCHER,
  ]);
  const { kubernetesObjects: endpointsObjects, loading: endpointsLoading } = useCustomResources(entity, [
    ENDPOINTS_MATCHER,
  ]);
  const { kubernetesObjects: roleObjects, loading: rolesLoading } = useCustomResources(entity, [ROLE_MATCHER]);
  const { kubernetesObjects: roleBindingObjects, loading: roleBindingsLoading } = useCustomResources(entity, [
    ROLEBINDING_MATCHER,
  ]);
  const { kubernetesObjects: externalSecretObjects, loading: externalSecretsLoading } = useCustomResources(entity, [
    EXTERNALSECRET_MATCHER,
  ]);
  const { kubernetesObjects: serviceMonitorObjects, loading: serviceMonitorsLoading } = useCustomResources(entity, [
    SERVICEMONITOR_MATCHER,
  ]);

  const rolloutsByCluster = useMemo(() => {
    const map = new Map<string, RolloutResource[]>();
    (rolloutObjects?.items ?? []).forEach(item => {
      const rollouts = (item.resources.find(r => r.type === 'customresources')?.resources ??
        []) as RolloutResource[];
      map.set(item.cluster.name, rollouts);
    });
    return map;
  }, [rolloutObjects]);

  const httpRoutesByCluster = useMemo(() => {
    const map = new Map<string, HttpRouteResource[]>();
    (httpRouteObjects?.items ?? []).forEach(item => {
      const routes = (item.resources.find(r => r.type === 'customresources')?.resources ??
        []) as HttpRouteResource[];
      map.set(item.cluster.name, routes);
    });
    return map;
  }, [httpRouteObjects]);

  const gatewaysByCluster = useMemo(() => {
    const map = new Map<string, GatewayResource[]>();
    (gatewayObjects?.items ?? []).forEach(item => {
      const gateways = (item.resources.find(r => r.type === 'customresources')?.resources ??
        []) as GatewayResource[];
      map.set(item.cluster.name, gateways);
    });
    return map;
  }, [gatewayObjects]);

  const pdbsByCluster = useMemo(() => {
    const map = new Map<string, PdbResource[]>();
    (pdbObjects?.items ?? []).forEach(item => {
      const pdbs = (item.resources.find(r => r.type === 'customresources')?.resources ??
        []) as PdbResource[];
      map.set(item.cluster.name, pdbs);
    });
    return map;
  }, [pdbObjects]);

  // One shared map, kind-labeled, rather than 7 more separate byCluster
  // maps threaded individually through buildEnvironments - none of these 7
  // feed a typed EnvironmentSummary field the way rollouts/httpRoutes/pdbs
  // do, they only ever become a generic K8sResourceRef, so there's nothing
  // to gain from keeping them apart.
  const extraKindsByCluster = useMemo(() => {
    const map = new Map<string, Array<{ kind: string; resources: NamedNamespacedResource[] }>>();
    const add = (kind: string, objects: { items?: ClusterObjects[] } | undefined) => {
      (objects?.items ?? []).forEach(item => {
        const resources = (item.resources.find(r => r.type === 'customresources')?.resources ??
          []) as NamedNamespacedResource[];
        const existing = map.get(item.cluster.name) ?? [];
        existing.push({ kind, resources });
        map.set(item.cluster.name, existing);
      });
    };
    add('ServiceAccount', serviceAccountObjects);
    add('NetworkPolicy', networkPolicyObjects);
    add('Endpoints', endpointsObjects);
    add('Role', roleObjects);
    add('RoleBinding', roleBindingObjects);
    add('ExternalSecret', externalSecretObjects);
    add('ServiceMonitor', serviceMonitorObjects);
    return map;
  }, [
    serviceAccountObjects,
    networkPolicyObjects,
    endpointsObjects,
    roleObjects,
    roleBindingObjects,
    externalSecretObjects,
    serviceMonitorObjects,
  ]);

  const environments = useMemo(
    () =>
      buildEnvironments(
        kubernetesObjects?.items ?? [],
        rolloutsByCluster,
        httpRoutesByCluster,
        gatewaysByCluster,
        pdbsByCluster,
        extraKindsByCluster,
      ),
    [kubernetesObjects, rolloutsByCluster, httpRoutesByCluster, gatewaysByCluster, pdbsByCluster, extraKindsByCluster],
  );

  // Same "only the first load blocks" fix as GlidepathPage.tsx's
  // anyLoading/hasLoadedOnce - useKubernetesObjects/useCustomResources flip
  // loading back to true on every background poll tick, not just the first.
  const anyLoading =
    loading ||
    rolloutsLoading ||
    httpRoutesLoading ||
    gatewaysLoading ||
    pdbsLoading ||
    serviceAccountsLoading ||
    networkPoliciesLoading ||
    endpointsLoading ||
    rolesLoading ||
    roleBindingsLoading ||
    externalSecretsLoading ||
    serviceMonitorsLoading;
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!anyLoading) setHasLoadedOnce(true);
  }, [anyLoading]);

  return {
    environments,
    loading: !hasLoadedOnce && anyLoading,
    refreshing: hasLoadedOnce && anyLoading,
    error: error ?? rolloutsError,
  };
}

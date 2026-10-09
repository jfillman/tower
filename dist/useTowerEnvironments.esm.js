import { createContext, createElement, useContext, useMemo, useState, useEffect } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useKubernetesObjects, useCustomResources } from '@backstage/plugin-kubernetes-react';

const ROLLOUT_MATCHER = { group: "argoproj.io", apiVersion: "v1alpha1", plural: "rollouts" };
const HTTPROUTE_MATCHER = { group: "gateway.networking.k8s.io", apiVersion: "v1", plural: "httproutes" };
const GATEWAY_MATCHER = { group: "gateway.networking.k8s.io", apiVersion: "v1", plural: "gateways" };
const PDB_MATCHER = { group: "policy", apiVersion: "v1", plural: "poddisruptionbudgets" };
const SERVICEACCOUNT_MATCHER = { group: "", apiVersion: "v1", plural: "serviceaccounts" };
const NETWORKPOLICY_MATCHER = { group: "networking.k8s.io", apiVersion: "v1", plural: "networkpolicies" };
const ENDPOINTS_MATCHER = { group: "", apiVersion: "v1", plural: "endpoints" };
const ROLE_MATCHER = { group: "rbac.authorization.k8s.io", apiVersion: "v1", plural: "roles" };
const ROLEBINDING_MATCHER = { group: "rbac.authorization.k8s.io", apiVersion: "v1", plural: "rolebindings" };
const EXTERNALSECRET_MATCHER = { group: "external-secrets.io", apiVersion: "v1", plural: "externalsecrets" };
const SERVICEMONITOR_MATCHER = { group: "monitoring.coreos.com", apiVersion: "v1", plural: "servicemonitors" };
function groupedApiVersion(matcher) {
  return matcher.group ? `${matcher.group}/${matcher.apiVersion}` : matcher.apiVersion;
}
const EXTRA_KIND_API_VERSION = {
  ServiceAccount: groupedApiVersion(SERVICEACCOUNT_MATCHER),
  NetworkPolicy: groupedApiVersion(NETWORKPOLICY_MATCHER),
  Endpoints: groupedApiVersion(ENDPOINTS_MATCHER),
  Role: groupedApiVersion(ROLE_MATCHER),
  RoleBinding: groupedApiVersion(ROLEBINDING_MATCHER),
  ExternalSecret: groupedApiVersion(EXTERNALSECRET_MATCHER),
  ServiceMonitor: groupedApiVersion(SERVICEMONITOR_MATCHER)
};
function resolveRouteScheme(route, routeNamespace, gateways) {
  const parentRef = route.spec?.parentRefs?.[0];
  if (!parentRef) return "http";
  const gatewayNamespace = parentRef.namespace ?? routeNamespace;
  const gateway = gateways.find(
    (g) => g.metadata?.name === parentRef.name && g.metadata?.namespace === gatewayNamespace
  );
  const hasTls = gateway?.spec?.listeners?.some((l) => Boolean(l.tls) || l.protocol === "HTTPS");
  return hasTls ? "https" : "http";
}
function toPodSummary(pod) {
  const statuses = pod.status?.containerStatuses ?? [];
  return {
    name: pod.metadata?.name ?? "unnamed pod",
    phase: pod.status?.phase,
    ready: statuses.length > 0 && statuses.every((c) => c.ready),
    restarts: statuses.reduce((sum, c) => sum + (c.restartCount ?? 0), 0),
    startTime: pod.status?.startTime ? new Date(pod.status.startTime).toISOString() : void 0,
    containers: (pod.spec?.containers ?? []).map((c) => c.name)
  };
}
function toServiceSummary(svc) {
  return {
    name: svc.metadata?.name ?? "unnamed service",
    type: svc.spec?.type,
    clusterIP: svc.spec?.clusterIP,
    ports: (svc.spec?.ports ?? []).map((p) => ({
      port: p.port,
      targetPort: p.targetPort,
      protocol: p.protocol
    }))
  };
}
function summarizeCanaryStep(step, index) {
  if (step.setWeight !== void 0) return { label: `Set weight ${step.setWeight}%` };
  if (step.pause) {
    return {
      label: step.pause.duration !== void 0 ? `Pause ${step.pause.duration}` : "Pause indefinitely (manual promote)"
    };
  }
  if (step.analysis) {
    const names = (step.analysis.templates ?? []).map((t) => t.templateName).filter((n) => Boolean(n)).join(", ");
    return { label: names ? `Analysis: ${names}` : "Analysis" };
  }
  if (step.setCanaryScale) return { label: "Set canary scale" };
  if (step.experiment) return { label: "Experiment" };
  return { label: `Step ${index + 1}` };
}
function toCanaryStepDef(step) {
  if (step.setWeight !== void 0) return { kind: "setWeight", weight: step.setWeight };
  if (step.pause) {
    return {
      kind: "pause",
      pauseDuration: step.pause.duration !== void 0 ? String(step.pause.duration) : void 0
    };
  }
  return {
    kind: "analysis",
    analysisTemplates: (step.analysis?.templates ?? []).map((t) => t.templateName).filter((n) => Boolean(n))
  };
}
function currentCanaryWeight(steps, currentStepIndex) {
  if (currentStepIndex === void 0) return void 0;
  if (currentStepIndex >= steps.length) return 100;
  let weight;
  for (let i = 0; i <= currentStepIndex && i < steps.length; i += 1) {
    const step = steps[i];
    if (step.kind === "setWeight") weight = step.weight;
  }
  return weight;
}
function withImpliedFinalStep(steps) {
  const lastWeight = [...steps].reverse().find((s) => s.kind === "setWeight")?.weight;
  if (lastWeight === 100) return steps;
  return [...steps, { kind: "setWeight", weight: 100, implied: true }];
}
function buildCanaryProgress(canary, rollout) {
  const steps = withImpliedFinalStep((canary.steps ?? []).map(toCanaryStepDef));
  const currentStepIndex = rollout.status?.currentStepIndex;
  const backgroundAnalysisTemplates = (canary.analysis?.templates ?? []).map((tpl) => tpl.templateName).filter((n) => Boolean(n));
  return {
    steps,
    currentStepIndex,
    currentWeight: currentCanaryWeight(steps, currentStepIndex),
    backgroundAnalysisTemplates: backgroundAnalysisTemplates.length > 0 ? backgroundAnalysisTemplates : void 0,
    currentBackgroundAnalysisRunName: rollout.status?.canary?.currentBackgroundAnalysisRunStatus?.name
  };
}
function rolloutStrategyKind(canary, blueGreen) {
  if (canary) return "canary";
  if (blueGreen) return "blueGreen";
  return "rollingUpdate";
}
function targetCpuUtilizationOf(hpa) {
  return hpa.spec?.metrics?.find((m) => m.resource?.name === "cpu")?.resource?.target?.averageUtilization;
}
function buildPdbSummary(pdb) {
  if (!pdb) return void 0;
  return {
    name: pdb.metadata?.name ?? "unnamed",
    minAvailable: pdb.spec?.minAvailable,
    maxUnavailable: pdb.spec?.maxUnavailable,
    currentHealthy: pdb.status?.currentHealthy,
    desiredHealthy: pdb.status?.desiredHealthy,
    disruptionsAllowed: pdb.status?.disruptionsAllowed
  };
}
function buildHpaSummary(hpa) {
  if (!hpa) return void 0;
  return {
    name: hpa.metadata?.name ?? "unnamed",
    minReplicas: hpa.spec?.minReplicas,
    maxReplicas: hpa.spec?.maxReplicas,
    targetCpuUtilization: targetCpuUtilizationOf(hpa),
    currentReplicas: hpa.status?.currentReplicas
  };
}
function buildWorkloadDetail(rollout, deployment, pdb, hpa) {
  if (rollout) {
    const canary = rollout.spec?.strategy?.canary;
    const blueGreen = rollout.spec?.strategy?.blueGreen;
    return {
      kind: "Rollout",
      name: rollout.metadata?.name ?? "unnamed",
      strategyKind: rolloutStrategyKind(canary, blueGreen),
      canarySteps: canary?.steps?.map(summarizeCanaryStep),
      canaryProgress: canary ? buildCanaryProgress(canary, rollout) : void 0,
      currentPodHash: rollout.status?.currentPodHash,
      canaryServices: canary ? { canary: canary.canaryService, stable: canary.stableService } : void 0,
      blueGreen: blueGreen ? {
        activeService: blueGreen.activeService,
        previewService: blueGreen.previewService,
        autoPromotionEnabled: blueGreen.autoPromotionEnabled,
        scaleDownDelaySeconds: blueGreen.scaleDownDelaySeconds
      } : void 0,
      pdb: buildPdbSummary(pdb),
      hpa: buildHpaSummary(hpa),
      labels: rollout.metadata?.labels,
      annotations: rollout.metadata?.annotations,
      raw: rollout
    };
  }
  if (deployment) {
    return {
      kind: "Deployment",
      name: deployment.metadata?.name ?? "unnamed",
      strategyKind: deployment.spec?.strategy?.type === "Recreate" ? "recreate" : "rollingUpdate",
      pdb: buildPdbSummary(pdb),
      hpa: buildHpaSummary(hpa),
      labels: deployment.metadata?.labels,
      annotations: deployment.metadata?.annotations,
      raw: deployment
    };
  }
  return void 0;
}
const RESOURCE_KIND_LABEL = {
  pods: "Pod",
  services: "Service",
  configmaps: "ConfigMap",
  secrets: "Secret",
  deployments: "Deployment",
  limitranges: "LimitRange",
  resourcequotas: "ResourceQuota",
  replicasets: "ReplicaSet",
  horizontalpodautoscalers: "HorizontalPodAutoscaler",
  jobs: "Job",
  cronjobs: "CronJob",
  ingresses: "Ingress",
  statefulsets: "StatefulSet",
  daemonsets: "DaemonSet",
  persistentvolumeclaims: "PersistentVolumeClaim",
  persistentvolumes: "PersistentVolume"
};
const RESOURCE_API_VERSION = {
  pods: "v1",
  services: "v1",
  configmaps: "v1",
  secrets: "v1",
  deployments: "apps/v1",
  limitranges: "v1",
  resourcequotas: "v1",
  replicasets: "apps/v1",
  horizontalpodautoscalers: "autoscaling/v2",
  jobs: "batch/v1",
  cronjobs: "batch/v1",
  ingresses: "networking.k8s.io/v1",
  statefulsets: "apps/v1",
  daemonsets: "apps/v1",
  persistentvolumeclaims: "v1",
  persistentvolumes: "v1"
};
function collectResources(item, namespace, rollouts, httpRoutes, pdbs, extraKinds) {
  const refs = [];
  for (const fetchResponse of item.resources) {
    const kind = RESOURCE_KIND_LABEL[fetchResponse.type];
    if (!kind) continue;
    for (const obj of fetchResponse.resources) {
      if (obj.metadata?.namespace !== namespace) continue;
      refs.push({
        kind,
        apiVersion: obj.apiVersion ?? RESOURCE_API_VERSION[fetchResponse.type],
        name: obj.metadata?.name ?? "unnamed",
        namespace,
        labels: obj.metadata?.labels,
        annotations: obj.metadata?.annotations,
        raw: obj
      });
    }
  }
  rollouts.filter((r) => r.metadata?.namespace === namespace).forEach(
    (r) => refs.push({
      kind: "Rollout",
      apiVersion: r.apiVersion,
      name: r.metadata?.name ?? "unnamed",
      namespace,
      labels: r.metadata?.labels,
      annotations: r.metadata?.annotations,
      raw: r
    })
  );
  httpRoutes.filter((r) => r.metadata?.namespace === namespace).forEach(
    (r) => refs.push({
      kind: "HTTPRoute",
      apiVersion: r.apiVersion,
      name: r.metadata?.name ?? "unnamed",
      namespace,
      labels: r.metadata?.labels,
      raw: r
    })
  );
  pdbs.filter((p) => p.metadata?.namespace === namespace).forEach(
    (p) => refs.push({
      kind: "PodDisruptionBudget",
      apiVersion: p.apiVersion,
      name: p.metadata?.name ?? "unnamed",
      namespace,
      labels: p.metadata?.labels,
      raw: p
    })
  );
  extraKinds.forEach(
    ({ kind, resources }) => resources.filter((r) => r.metadata?.namespace === namespace).forEach(
      (r) => refs.push({
        kind,
        apiVersion: r.apiVersion ?? EXTRA_KIND_API_VERSION[kind],
        name: r.metadata?.name ?? "unnamed",
        namespace,
        labels: r.metadata?.labels,
        annotations: r.metadata?.annotations,
        raw: r
      })
    )
  );
  return refs;
}
function rolloutStrategyLabel(rollout, hasDeployment) {
  if (!rollout?.spec?.strategy) return hasDeployment ? "RollingUpdate" : void 0;
  if (rollout.spec.strategy.canary) return "Canary";
  if (rollout.spec.strategy.blueGreen) return "Blue/Green";
  return "RollingUpdate";
}
function envLabelOf(rollout, namespace) {
  return rollout?.metadata?.labels?.["hangar.io/env"] ?? namespace;
}
function buildEnvironments(items, rolloutsByCluster, httpRoutesByCluster, gatewaysByCluster, pdbsByCluster, extraKindsByCluster) {
  const envs = [];
  for (const item of items) {
    const allPods = item.resources.find((r) => r.type === "pods")?.resources ?? [];
    const allIngresses = item.resources.find((r) => r.type === "ingresses")?.resources ?? [];
    const allDeployments = item.resources.find((r) => r.type === "deployments")?.resources ?? [];
    const allServices = item.resources.find((r) => r.type === "services")?.resources ?? [];
    const allHpas = item.resources.find((r) => r.type === "horizontalpodautoscalers")?.resources ?? [];
    const rollouts = rolloutsByCluster.get(item.cluster.name) ?? [];
    const httpRoutes = httpRoutesByCluster.get(item.cluster.name) ?? [];
    const gateways = gatewaysByCluster.get(item.cluster.name) ?? [];
    const pdbs = pdbsByCluster.get(item.cluster.name) ?? [];
    const extraKinds = extraKindsByCluster.get(item.cluster.name) ?? [];
    const namespacesSeen = /* @__PURE__ */ new Set();
    const pushEnv = (namespace, source) => {
      if (namespacesSeen.has(namespace)) return;
      namespacesSeen.add(namespace);
      const { rollout, deployment } = source;
      const podList = allPods.filter((p) => p.metadata?.namespace === namespace);
      const container = rollout?.spec?.template?.spec?.containers?.[0] ?? deployment?.spec?.template?.spec?.containers?.[0] ?? podList[0]?.spec?.containers?.[0];
      const desiredReplicas = rollout?.spec?.replicas ?? deployment?.spec?.replicas;
      const availableReplicas = rollout?.status?.availableReplicas ?? deployment?.status?.availableReplicas ?? (desiredReplicas === void 0 ? podList.filter((p) => p.status?.phase === "Running").length : void 0);
      const startTimes = podList.map((p) => p.status?.startTime).filter((t) => Boolean(t)).map((t) => new Date(t).getTime());
      const envLabel = envLabelOf(rollout, namespace);
      const appName = rollout?.metadata?.name ?? deployment?.metadata?.name;
      const httpRoute = httpRoutes.find((r) => r.metadata?.namespace === namespace);
      const routeHost = httpRoute?.spec?.hostnames?.[0];
      const ingress = allIngresses.find((i) => i.metadata?.namespace === namespace);
      const ingressHost = ingress?.spec?.rules?.[0]?.host;
      let ingressUrl;
      if (httpRoute && routeHost) {
        ingressUrl = `${resolveRouteScheme(httpRoute, namespace, gateways)}://${routeHost}`;
      } else if (ingressHost) {
        ingressUrl = `${ingress?.spec?.tls?.length ? "https" : "http"}://${ingressHost}`;
      }
      const strategy = rolloutStrategyLabel(rollout, Boolean(deployment));
      const services = allServices.filter((s) => s.metadata?.namespace === namespace).map(toServiceSummary);
      const pdb = pdbs.find((p) => p.metadata?.namespace === namespace);
      const hpa = allHpas.find((h) => h.metadata?.namespace === namespace);
      const workload = buildWorkloadDetail(rollout, deployment, pdb, hpa);
      const resources = collectResources(item, namespace, rollouts, httpRoutes, pdbs, extraKinds);
      envs.push({
        key: `${item.cluster.name}/${namespace}`,
        env: envLabel,
        cluster: item.cluster.name,
        namespace,
        deployed: true,
        appName,
        argoAppName: appName ? `${appName}-${envLabel}` : void 0,
        image: container?.image,
        desiredReplicas,
        availableReplicas,
        cpuRequest: container?.resources?.requests?.cpu,
        cpuLimit: container?.resources?.limits?.cpu,
        memoryRequest: container?.resources?.requests?.memory,
        memoryLimit: container?.resources?.limits?.memory,
        deployedAt: startTimes.length ? new Date(Math.max(...startTimes)).toISOString() : void 0,
        rolloutPhase: rollout?.status?.phase,
        rolloutMessage: rollout?.status?.message,
        strategy,
        ingressUrl,
        drift: false,
        pods: podList.map(toPodSummary),
        services,
        workload,
        resources
      });
    };
    if (rollouts.length > 0) {
      rollouts.forEach((rollout) => {
        if (rollout.metadata?.namespace) pushEnv(rollout.metadata.namespace, { rollout });
      });
    } else {
      allDeployments.forEach((deployment) => {
        if (deployment.metadata?.namespace) pushEnv(deployment.metadata.namespace, { deployment });
      });
    }
  }
  const imageCounts = /* @__PURE__ */ new Map();
  envs.forEach((e) => {
    if (e.image) imageCounts.set(e.image, (imageCounts.get(e.image) ?? 0) + 1);
  });
  const majorityImage = [...imageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const distinctImages = imageCounts.size;
  return envs.map((e) => ({
    ...e,
    drift: distinctImages > 1 && !!e.image && e.image !== majorityImage
  }));
}
const CUSTOM_MATCHERS = [
  ROLLOUT_MATCHER,
  HTTPROUTE_MATCHER,
  GATEWAY_MATCHER,
  PDB_MATCHER,
  SERVICEACCOUNT_MATCHER,
  NETWORKPOLICY_MATCHER,
  ENDPOINTS_MATCHER,
  ROLE_MATCHER,
  ROLEBINDING_MATCHER,
  EXTERNALSECRET_MATCHER,
  SERVICEMONITOR_MATCHER
];
const EXTRA_KINDS = [
  "ServiceAccount",
  "NetworkPolicy",
  "Endpoints",
  "Role",
  "RoleBinding",
  "ExternalSecret",
  "ServiceMonitor"
];
function customResourcesByClusterAndKind(items) {
  const out = /* @__PURE__ */ new Map();
  for (const item of items) {
    const byKind = /* @__PURE__ */ new Map();
    for (const response of item.resources) {
      if (response.type !== "customresources") continue;
      for (const obj of response.resources) {
        const kind = obj.kind ?? "";
        byKind.set(kind, [...byKind.get(kind) ?? [], obj]);
      }
    }
    out.set(item.cluster.name, byKind);
  }
  return out;
}
function pickKind(byCluster, kind) {
  const map = /* @__PURE__ */ new Map();
  byCluster.forEach((byKind, cluster) => map.set(cluster, byKind.get(kind) ?? []));
  return map;
}
function useTowerEnvironmentsLive() {
  const { entity } = useEntity();
  const { kubernetesObjects, loading, error } = useKubernetesObjects(entity);
  const {
    kubernetesObjects: customObjects,
    loading: customLoading,
    error: customError
  } = useCustomResources(entity, CUSTOM_MATCHERS);
  const customByCluster = useMemo(() => customResourcesByClusterAndKind(customObjects?.items ?? []), [customObjects]);
  const rolloutsByCluster = useMemo(() => pickKind(customByCluster, "Rollout"), [customByCluster]);
  const httpRoutesByCluster = useMemo(
    () => pickKind(customByCluster, "HTTPRoute"),
    [customByCluster]
  );
  const gatewaysByCluster = useMemo(() => pickKind(customByCluster, "Gateway"), [customByCluster]);
  const pdbsByCluster = useMemo(
    () => pickKind(customByCluster, "PodDisruptionBudget"),
    [customByCluster]
  );
  const extraKindsByCluster = useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    customByCluster.forEach((byKind, cluster) => {
      map.set(
        cluster,
        EXTRA_KINDS.map((kind) => ({ kind, resources: byKind.get(kind) ?? [] }))
      );
    });
    return map;
  }, [customByCluster]);
  const environments = useMemo(
    () => buildEnvironments(
      kubernetesObjects?.items ?? [],
      rolloutsByCluster,
      httpRoutesByCluster,
      gatewaysByCluster,
      pdbsByCluster,
      extraKindsByCluster
    ),
    [kubernetesObjects, rolloutsByCluster, httpRoutesByCluster, gatewaysByCluster, pdbsByCluster, extraKindsByCluster]
  );
  const anyLoading = loading || customLoading;
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!anyLoading) setHasLoadedOnce(true);
  }, [anyLoading]);
  return useMemo(
    () => ({
      environments,
      loading: !hasLoadedOnce && anyLoading,
      refreshing: hasLoadedOnce && anyLoading,
      error: error ?? customError
    }),
    [environments, hasLoadedOnce, anyLoading, error, customError]
  );
}
const TowerEnvironmentsContext = createContext(void 0);
function TowerEnvironmentsProvider({ children }) {
  const value = useTowerEnvironmentsLive();
  return createElement(TowerEnvironmentsContext.Provider, { value }, children);
}
function useTowerEnvironments() {
  const value = useContext(TowerEnvironmentsContext);
  if (!value) throw new Error("useTowerEnvironments must be used inside a TowerEnvironmentsProvider");
  return value;
}

export { TowerEnvironmentsProvider, customResourcesByClusterAndKind, useTowerEnvironments, useTowerEnvironmentsLive };
//# sourceMappingURL=useTowerEnvironments.esm.js.map

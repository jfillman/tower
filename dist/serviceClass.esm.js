const SERVICE_CLASS_ANNOTATION = "hangar.io/service-class";
const DEPLOY_TARGET_ANNOTATION = "hangar.io/deploy-target";
const WORKLOAD_TYPE_ANNOTATION = "hangar.io/workload-type";
const CAP = {
  source: "source",
  // has a GitHub repo: Pull Requests, Notifications
  ci: "ci",
  // built by Glidepath: Pipelines, Glidepath
  releases: "releases",
  // has release records
  images: "images",
  // produces container images
  slo: "slo",
  valuesConfig: "values-config",
  // configured through Helm values files in its repo
  k8sRuntime: "k8s-runtime",
  // runs on a cluster Tower can read: Deployments, Topology
  cloudRuntime: "cloud-runtime",
  // runs on a cloud service; no tab consumes this yet
  autopilot: "autopilot"
};
const CLOUD_TARGET = { adds: [CAP.cloudRuntime], removes: [CAP.valuesConfig] };
const DEPLOY_TARGETS = {
  "k8s-rollout": {
    id: "k8s-rollout",
    label: "Kubernetes",
    provider: "Kubernetes",
    adds: [CAP.k8sRuntime],
    removes: []
  },
  "aws-ecs": { id: "aws-ecs", label: "AWS ECS", provider: "AWS", ...CLOUD_TARGET },
  "aws-lambda": { id: "aws-lambda", label: "AWS Lambda", provider: "AWS", ...CLOUD_TARGET },
  "azure-container-apps": {
    id: "azure-container-apps",
    label: "Azure Container Apps",
    provider: "Azure",
    ...CLOUD_TARGET
  }
};
const SERVICE_CLASSES = {
  "container-app": {
    id: "container-app",
    label: "Container app",
    labelPlural: "Container apps",
    capabilities: [CAP.source, CAP.ci, CAP.releases, CAP.images, CAP.slo, CAP.valuesConfig],
    defaultDeployTarget: "k8s-rollout"
  },
  function: {
    id: "function",
    label: "Function",
    labelPlural: "Functions",
    capabilities: [CAP.source, CAP.ci, CAP.releases, CAP.images]
  },
  "ai-workload": {
    id: "ai-workload",
    label: "AI workload",
    labelPlural: "AI workloads",
    capabilities: [CAP.source, CAP.autopilot]
  }
};
const KIND_DEFAULTS = {
  "kind:nodejsapplication": { cls: "container-app" },
  "kind:springbootapplication": { cls: "container-app" },
  "kind:pythonapplication": { cls: "container-app" },
  "kind:goapplication": { cls: "container-app" },
  "kind:infraservice": { cls: "container-app" },
  "kind:lambdafunction": { cls: "function", target: "aws-lambda" },
  // Azure Functions are hosted on Container Apps, so that is the deploy target.
  "kind:azurefunction": { cls: "function", target: "azure-container-apps" }
};
const kindDefaultsOf = (entity) => {
  for (const tag of entity.metadata.tags ?? []) {
    if (KIND_DEFAULTS[tag]) return KIND_DEFAULTS[tag];
  }
  return void 0;
};
const titleCase = (slug) => {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
};
const PROVIDER_PREFIX = { aws: "AWS", azure: "Azure", gcp: "GCP", k8s: "Kubernetes" };
const providerOf = (targetId) => PROVIDER_PREFIX[targetId.split("-")[0]] ?? "Other";
const pluralOf = (label) => /s$/i.test(label) ? label : `${label}s`;
function classIdOf(entity) {
  const explicit = entity.metadata.annotations?.[SERVICE_CLASS_ANNOTATION]?.trim();
  if (explicit) return explicit;
  if (entity.metadata.annotations?.[WORKLOAD_TYPE_ANNOTATION] === "ai" || entity.spec?.type === "ai-agent") {
    return "ai-workload";
  }
  return kindDefaultsOf(entity)?.cls;
}
function isTowerService(entity) {
  return classIdOf(entity) !== void 0;
}
function serviceClassOf(entity) {
  const id = classIdOf(entity) ?? "container-app";
  const known = SERVICE_CLASSES[id];
  if (known) return known;
  const label = titleCase(id);
  const hasRepo = Boolean(entity.metadata.annotations?.["github.com/project-slug"]);
  return { id, label, labelPlural: pluralOf(label), capabilities: hasRepo ? [CAP.source] : [] };
}
function deployTargetOf(entity) {
  const cls = serviceClassOf(entity);
  const id = entity.metadata.annotations?.[DEPLOY_TARGET_ANNOTATION]?.trim() || kindDefaultsOf(entity)?.target || cls.defaultDeployTarget;
  if (!id) return void 0;
  return DEPLOY_TARGETS[id] ?? {
    id,
    label: titleCase(id),
    provider: providerOf(id),
    adds: [],
    removes: []
  };
}
function capabilitiesOf(entity) {
  const caps = new Set(serviceClassOf(entity).capabilities);
  const target = deployTargetOf(entity);
  target?.adds.forEach((c) => caps.add(c));
  target?.removes.forEach((c) => caps.delete(c));
  return caps;
}
function hasCapabilities(entity, required = []) {
  const caps = capabilitiesOf(entity);
  return required.every((c) => caps.has(c));
}

export { CAP, DEPLOY_TARGETS, DEPLOY_TARGET_ANNOTATION, SERVICE_CLASSES, SERVICE_CLASS_ANNOTATION, WORKLOAD_TYPE_ANNOTATION, capabilitiesOf, deployTargetOf, hasCapabilities, isTowerService, serviceClassOf };
//# sourceMappingURL=serviceClass.esm.js.map

import type { Entity } from '@backstage/catalog-model';

// How Tower decides what a catalog Component is and which tabs it gets.
//
// Nothing here is a closed list of service kinds. A service says what it is with
// two catalog annotations, and Tower only needs a registry entry to make that
// nicer (a label, a default target, a capability set); a class it has never heard
// of still lists, filters and opens, with the capabilities it can infer. So a new
// Airframe XRD (an S3 bucket, a Key Vault, a data lake) needs no Tower release to
// appear. It needs a Tower release only to get tabs of its own.
//
//   hangar.io/service-class   what the service IS: container-app, function,
//                             ai-workload, storage, secret-store, data-lake, ...
//                             Any slug. Free-form on purpose.
//   hangar.io/deploy-target   WHERE it runs: k8s-rollout, aws-ecs, aws-lambda,
//                             azure-container-apps, ... Optional.
//                             Mirrors cicd.yaml's deploy.target, written once at
//                             onboarding by the same XRD parameter. cicd.yaml stays
//                             the source of truth; the Glidepath tab shows it.
//
// A tab declares the capabilities it needs (`requires` in TowerPage). A class
// grants capabilities, and its deploy target adds or removes some (a Lambda has no
// Rollout and no Helm values). That is the whole mechanism: a tab shows when every
// capability it requires is granted.

export const SERVICE_CLASS_ANNOTATION = 'hangar.io/service-class';
export const DEPLOY_TARGET_ANNOTATION = 'hangar.io/deploy-target';
// Contract that predates service-class; still honored so nothing already emitting it breaks.
export const WORKLOAD_TYPE_ANNOTATION = 'hangar.io/workload-type';

export type Capability = string;

export const CAP = {
  source: 'source', // has a GitHub repo: Pull Requests, Notifications
  ci: 'ci', // built by Glidepath: Pipelines, Glidepath
  releases: 'releases', // has release records
  images: 'images', // produces container images
  slo: 'slo',
  valuesConfig: 'values-config', // configured through Helm values files in its repo
  k8sRuntime: 'k8s-runtime', // runs on a cluster Tower can read: Deployments, Topology
  cloudRuntime: 'cloud-runtime', // runs on a cloud service; no tab consumes this yet
  autopilot: 'autopilot',
} as const;

export interface ServiceClassDef {
  id: string;
  label: string;
  labelPlural: string;
  capabilities: Capability[];
  // Used when the entity carries no deploy-target annotation. Keeps every service
  // that predates the annotation exactly as it was.
  defaultDeployTarget?: string;
}

export interface DeployTargetDef {
  id: string;
  label: string;
  // Where it runs, for the second filter. Not used for tabs.
  provider: string;
  adds: Capability[];
  removes: Capability[];
}

const CLOUD_TARGET = { adds: [CAP.cloudRuntime], removes: [CAP.valuesConfig] };

export const DEPLOY_TARGETS: Record<string, DeployTargetDef> = {
  'k8s-rollout': {
    id: 'k8s-rollout',
    label: 'Kubernetes',
    provider: 'Kubernetes',
    adds: [CAP.k8sRuntime],
    removes: [],
  },
  'aws-ecs': { id: 'aws-ecs', label: 'AWS ECS', provider: 'AWS', ...CLOUD_TARGET },
  'aws-lambda': { id: 'aws-lambda', label: 'AWS Lambda', provider: 'AWS', ...CLOUD_TARGET },
  'azure-container-apps': {
    id: 'azure-container-apps',
    label: 'Azure Container Apps',
    provider: 'Azure',
    ...CLOUD_TARGET,
  },
};

export const SERVICE_CLASSES: Record<string, ServiceClassDef> = {
  'container-app': {
    id: 'container-app',
    label: 'Container app',
    labelPlural: 'Container apps',
    capabilities: [CAP.source, CAP.ci, CAP.releases, CAP.images, CAP.slo, CAP.valuesConfig],
    defaultDeployTarget: 'k8s-rollout',
  },
  function: {
    id: 'function',
    label: 'Function',
    labelPlural: 'Functions',
    capabilities: [CAP.source, CAP.ci, CAP.releases, CAP.images],
  },
  'ai-workload': {
    id: 'ai-workload',
    label: 'AI workload',
    labelPlural: 'AI workloads',
    capabilities: [CAP.source, CAP.autopilot],
  },
};

// Entities with these kind tags are classified without any catalog annotation: the original
// application kinds, which predate service-class, and the function XRDs, so those work before
// anyone has taught the catalog ingestor to emit the annotations. An explicit annotation
// always wins over this table.
const KIND_DEFAULTS: Record<string, { cls: string; target?: string }> = {
  'kind:nodejsapplication': { cls: 'container-app' },
  'kind:springbootapplication': { cls: 'container-app' },
  'kind:pythonapplication': { cls: 'container-app' },
  'kind:goapplication': { cls: 'container-app' },
  'kind:infraservice': { cls: 'container-app' },
  'kind:lambdafunction': { cls: 'function', target: 'aws-lambda' },
  // Azure Functions are hosted on Container Apps, so that is the deploy target.
  'kind:azurefunction': { cls: 'function', target: 'azure-container-apps' },
};

const kindDefaultsOf = (entity: Entity) => {
  for (const tag of entity.metadata.tags ?? []) {
    if (KIND_DEFAULTS[tag]) return KIND_DEFAULTS[tag];
  }
  return undefined;
};

const titleCase = (slug: string) => {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
};

// A target Tower has no entry for still says where it runs by its prefix (aws-s3,
// azure-keyvault), so a new service lands under the right provider filter.
const PROVIDER_PREFIX: Record<string, string> = { aws: 'AWS', azure: 'Azure', gcp: 'GCP', k8s: 'Kubernetes' };
const providerOf = (targetId: string) => PROVIDER_PREFIX[targetId.split('-')[0]] ?? 'Other';

const pluralOf = (label: string) => (/s$/i.test(label) ? label : `${label}s`);

function classIdOf(entity: Entity): string | undefined {
  const explicit = entity.metadata.annotations?.[SERVICE_CLASS_ANNOTATION]?.trim();
  if (explicit) return explicit;
  if (entity.metadata.annotations?.[WORKLOAD_TYPE_ANNOTATION] === 'ai' || entity.spec?.type === 'ai-agent') {
    return 'ai-workload';
  }
  return kindDefaultsOf(entity)?.cls;
}

// Tower's Services list is an allow-list: a Component has to declare a class (or
// be one Tower already knew) to show up. A Component someone registered by hand
// in the catalog declares nothing, so stays out.
export function isTowerService(entity: Entity): boolean {
  return classIdOf(entity) !== undefined;
}

export function serviceClassOf(entity: Entity): ServiceClassDef {
  const id = classIdOf(entity) ?? 'container-app';
  const known = SERVICE_CLASSES[id];
  if (known) return known;
  const label = titleCase(id);
  const hasRepo = Boolean(entity.metadata.annotations?.['github.com/project-slug']);
  return { id, label, labelPlural: pluralOf(label), capabilities: hasRepo ? [CAP.source] : [] };
}

export function deployTargetOf(entity: Entity): DeployTargetDef | undefined {
  const cls = serviceClassOf(entity);
  const id =
    entity.metadata.annotations?.[DEPLOY_TARGET_ANNOTATION]?.trim() ||
    kindDefaultsOf(entity)?.target ||
    cls.defaultDeployTarget;
  if (!id) return undefined;
  return (
    DEPLOY_TARGETS[id] ?? {
      id,
      label: titleCase(id),
      provider: providerOf(id),
      adds: [],
      removes: [],
    }
  );
}

export function capabilitiesOf(entity: Entity): Set<Capability> {
  const caps = new Set(serviceClassOf(entity).capabilities);
  const target = deployTargetOf(entity);
  target?.adds.forEach(c => caps.add(c));
  target?.removes.forEach(c => caps.delete(c));
  return caps;
}

export function hasCapabilities(entity: Entity, required: readonly Capability[] = []): boolean {
  const caps = capabilitiesOf(entity);
  return required.every(c => caps.has(c));
}

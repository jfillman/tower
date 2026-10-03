import type { Entity } from '@backstage/catalog-model';
import { CAP, capabilitiesOf, deployTargetOf, hasCapabilities, isTowerService, serviceClassOf } from './serviceClass';

const entity = (spec: Entity['spec'], annotations?: Record<string, string>, tags?: string[]): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'svc', annotations, tags },
  spec,
});

const kind = (k: string) => ['cluster:kind-dev', `kind:${k}`];

describe('isTowerService', () => {
  it('shows the four application XR kinds and InfraService, unchanged from before service-class', () => {
    for (const k of [
      'nodejsapplication',
      'springbootapplication',
      'pythonapplication',
      'goapplication',
      'infraservice',
    ]) {
      expect(isTowerService(entity({ type: 'service' }, undefined, kind(k)))).toBe(true);
    }
  });
  it('shows anything that declares a class, including classes Tower has never heard of', () => {
    expect(isTowerService(entity({ type: 'service' }, { 'hangar.io/service-class': 'data-lake' }))).toBe(true);
  });
  it('shows AI workloads by either legacy marker', () => {
    expect(isTowerService(entity({ type: 'ai-agent' }))).toBe(true);
    expect(isTowerService(entity({ type: 'service' }, { 'hangar.io/workload-type': 'ai' }))).toBe(true);
  });
  it('hides app environments, plumbing XRs, backing-service XRs and hand-registered Components', () => {
    for (const k of [
      'applicationenvironment',
      'tektoncicd',
      'secretstore',
      'slo',
      'rolloutwatch',
      'redis',
      'postgresql',
      'rabbitmq',
    ]) {
      expect(isTowerService(entity({ type: 'service' }, undefined, kind(k)))).toBe(false);
    }
    expect(isTowerService(entity({ type: 'service' }))).toBe(false);
  });
});

describe('serviceClassOf', () => {
  it('maps the legacy kind tags to container-app', () => {
    expect(serviceClassOf(entity({}, undefined, kind('goapplication'))).id).toBe('container-app');
  });
  it('maps both legacy AI markers to ai-workload', () => {
    expect(serviceClassOf(entity({ type: 'ai-agent' })).id).toBe('ai-workload');
    expect(serviceClassOf(entity({}, { 'hangar.io/workload-type': 'ai' })).id).toBe('ai-workload');
  });
  it('prefers the explicit annotation over inference', () => {
    const e = entity({ type: 'ai-agent' }, { 'hangar.io/service-class': 'function' });
    expect(serviceClassOf(e).id).toBe('function');
  });
  it('makes a label for an unregistered class', () => {
    const c = serviceClassOf(entity({}, { 'hangar.io/service-class': 'secret-store' }));
    expect(c.label).toBe('Secret store');
    expect(c.labelPlural).toBe('Secret stores');
  });
  it('does not double the s on a plural-looking slug', () => {
    expect(serviceClassOf(entity({}, { 'hangar.io/service-class': 'analytics' })).labelPlural).toBe('Analytics');
  });
});

describe('function XRD kinds', () => {
  it('classifies the Lambda and Azure function kinds and their targets with no annotation', () => {
    const l = entity({}, undefined, kind('lambdafunction'));
    expect(isTowerService(l)).toBe(true);
    expect(serviceClassOf(l).id).toBe('function');
    expect(deployTargetOf(l)?.id).toBe('aws-lambda');
    const a = entity({}, undefined, kind('azurefunction'));
    expect(serviceClassOf(a).id).toBe('function');
    expect(deployTargetOf(a)).toMatchObject({ id: 'azure-container-apps', provider: 'Azure' });
  });
  it('lets an explicit annotation override the kind default', () => {
    const e = entity({}, { 'hangar.io/deploy-target': 'aws-ecs' }, kind('lambdafunction'));
    expect(deployTargetOf(e)?.id).toBe('aws-ecs');
  });
  it('gives a function no cluster tabs and keeps its pipeline and release tabs', () => {
    const caps = capabilitiesOf(entity({}, undefined, kind('lambdafunction')));
    expect(caps.has(CAP.k8sRuntime)).toBe(false);
    expect(caps.has(CAP.ci) && caps.has(CAP.releases)).toBe(true);
  });
});

describe('deployTargetOf', () => {
  it('defaults a container app to Kubernetes, so existing services are unchanged', () => {
    expect(deployTargetOf(entity({}, undefined, kind('nodejsapplication')))?.id).toBe('k8s-rollout');
  });
  it('files an unregistered target under its provider by prefix, and unknown prefixes under Other', () => {
    const at = (t: string) =>
      deployTargetOf(entity({}, { 'hangar.io/service-class': 'storage', 'hangar.io/deploy-target': t }));
    expect(at('aws-s3')?.provider).toBe('AWS');
    expect(at('azure-keyvault')?.provider).toBe('Azure');
    expect(at('onprem-nas')?.provider).toBe('Other');
  });
  it('has no target for a class with no default and no annotation', () => {
    expect(deployTargetOf(entity({}, { 'hangar.io/service-class': 'storage' }))).toBeUndefined();
  });
  it('reads the annotation, and survives a target Tower does not know', () => {
    const t = deployTargetOf(
      entity({}, { 'hangar.io/service-class': 'function', 'hangar.io/deploy-target': 'gcp-run' }),
    );
    expect(t).toMatchObject({ id: 'gcp-run', label: 'Gcp run', provider: 'GCP' });
  });
});

describe('capabilitiesOf', () => {
  it('gives a legacy container app exactly the tabs it had before', () => {
    const caps = capabilitiesOf(entity({}, undefined, kind('goapplication')));
    for (const c of [CAP.source, CAP.ci, CAP.releases, CAP.images, CAP.slo, CAP.valuesConfig, CAP.k8sRuntime]) {
      expect(caps.has(c)).toBe(true);
    }
  });
  it('takes the cluster and Helm-values tabs away from a container app that deploys to ECS', () => {
    const e = entity({}, { 'hangar.io/service-class': 'container-app', 'hangar.io/deploy-target': 'aws-ecs' });
    const caps = capabilitiesOf(e);
    expect(caps.has(CAP.k8sRuntime)).toBe(false);
    expect(caps.has(CAP.valuesConfig)).toBe(false);
    expect(caps.has(CAP.cloudRuntime)).toBe(true);
    expect(caps.has(CAP.ci)).toBe(true);
  });
  it('gives a Lambda function no cluster tabs', () => {
    const e = entity({}, { 'hangar.io/service-class': 'function', 'hangar.io/deploy-target': 'aws-lambda' });
    expect(hasCapabilities(e, [CAP.k8sRuntime])).toBe(false);
    expect(hasCapabilities(e, [CAP.ci, CAP.releases])).toBe(true);
  });
  it('gives an unregistered class only what it can prove: a repo gets Pull Requests, nothing else', () => {
    const noRepo = entity({}, { 'hangar.io/service-class': 'storage' });
    expect([...capabilitiesOf(noRepo)]).toEqual([]);
    const repo = entity({}, { 'hangar.io/service-class': 'storage', 'github.com/project-slug': 'o/r' });
    expect([...capabilitiesOf(repo)]).toEqual([CAP.source]);
  });
  it('treats no requirements as always satisfied', () => {
    expect(hasCapabilities(entity({}, { 'hangar.io/service-class': 'storage' }))).toBe(true);
  });
});

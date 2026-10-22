import type { Entity } from '@backstage/catalog-model';
import { hasCapabilities } from './serviceClass';
import { TABS, activeTabId } from './TowerPage';

jest.mock('@backstage/plugin-kubernetes', () => ({ isKubernetesAvailable: () => true }));

const entity = (annotations?: Record<string, string>, tags?: string[]): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'svc', annotations, tags },
  spec: { type: 'service' },
});
const tabsFor = (e: Entity) => TABS.filter(t => hasCapabilities(e, t.requires));
const ids = (e: Entity) => tabsFor(e).map(t => t.id);

describe('which tabs a service gets', () => {
  it('a Kubernetes container app keeps the tabs it had (plus Environments), with the Rollout Deployments tab', () => {
    const e = entity(undefined, ['kind:goapplication']);
    expect(ids(e)).toEqual([
      'overview',
      'pull-requests',
      'pipelines',
      'deployments',
      'releases',
      'topology',
      'images',
      'slos',
      'notifications',
      'configure',
    ]);
    expect(tabsFor(e).find(t => t.id === 'deployments')!.Component.name).toBe('DeploymentsTab');
  });

  it.each(['aws-ecs', 'aws-lambda', 'azure-container-apps'])(
    'a service deploying to %s gets the cloud Deployments tab',
    target => {
      const e = entity({ 'hangar.io/service-class': 'function', 'hangar.io/deploy-target': target });
      expect(tabsFor(e).filter(t => t.id === 'deployments')).toHaveLength(1);
      expect(tabsFor(e).find(t => t.id === 'deployments')!.Component.name).toBe('CloudDeploymentsTab');
    },
  );

  it('a cloud service gets no cluster or Helm tabs, and keeps the pipeline and release ones', () => {
    const e = entity({ 'hangar.io/service-class': 'function', 'hangar.io/deploy-target': 'aws-lambda' });
    expect(ids(e)).not.toEqual(expect.arrayContaining(['topology']));
    expect(ids(e)).not.toContain('config');
    expect(ids(e)).not.toContain('slos');
    expect(ids(e)).toEqual(expect.arrayContaining(['overview', 'pipelines', 'deployments', 'releases', 'configure']));
  });

  it('an InfraService drops Pipelines, Releases and Images (nothing builds it) and keeps SLOs', () => {
    expect(ids(entity(undefined, ['kind:infraservice']))).toEqual([
      'overview',
      'pull-requests',
      'deployments',
      'topology',
      'slos',
      'notifications',
      'configure',
    ]);
  });

  it('an AI workload gets Overview and Pull Requests; no Glidepath tabs, so no Notifications', () => {
    expect(ids(entity({ 'hangar.io/workload-type': 'ai' }))).toEqual(['overview', 'pull-requests']);
  });

  it('an AI service (a long-running agent Glidepath builds) gets every container-app tab', () => {
    expect(ids(entity({ 'hangar.io/service-class': 'ai-service' }))).toEqual(ids(entity(undefined, ['kind:goapplication'])));
  });

  it('never offers both Deployments tabs for one service', () => {
    for (const target of ['k8s-rollout', 'aws-ecs', 'aws-lambda', 'azure-container-apps', 'something-new']) {
      const e = entity({ 'hangar.io/service-class': 'container-app', 'hangar.io/deploy-target': target });
      expect(tabsFor(e).filter(t => t.id === 'deployments').length).toBeLessThanOrEqual(1);
    }
  });
});

describe('the Configure tab (Environments, shared values, cicd.yaml; 2026-10-22)', () => {
  // [description, deploy-target annotation (none = the Kubernetes default), kind tag, expected Deployments tab]
  it.each([
    ['a Kubernetes app', undefined, 'kind:goapplication', 'DeploymentsTab'],
    ['an ECS service', 'aws-ecs', 'kind:goapplication', 'CloudDeploymentsTab'],
    ['a Lambda function', 'aws-lambda', 'kind:lambdafunction', 'CloudDeploymentsTab'],
    ['an Azure function', 'azure-container-apps', 'kind:azurefunction', 'CloudDeploymentsTab'],
  ])('is offered to %s, since every Glidepath-built service has environments and a cicd.yaml', (_n, target, tag, deployments) => {
    const e = entity(target ? { 'hangar.io/deploy-target': target } : undefined, [tag]);
    // Guard against a vacuous test: the service must really be classed as the kind it claims to be.
    expect(tabsFor(e).find(t => t.id === 'deployments')!.Component.name).toBe(deployments);
    expect(ids(e)).toContain('configure');
  });
});

describe('old tab links (2026-10-22)', () => {
  it.each(['environments', 'config', 'glidepath'])('?tab=%s opens Configure', id => {
    expect(activeTabId(id)).toBe('configure');
  });
  it('leaves every other tab alone', () => {
    expect(activeTabId('releases')).toBe('releases');
  });
});

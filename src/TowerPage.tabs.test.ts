import type { Entity } from '@backstage/catalog-model';
import type { MountVisibility } from './mounts';
import { TABS, activeTabId, visibleTabs } from './TowerPage';

jest.mock('@backstage/plugin-kubernetes', () => ({ isKubernetesAvailable: () => true }));

const entity = (annotations?: Record<string, string>, tags?: string[]): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'svc', annotations, tags },
  spec: { type: 'service' },
});
// No mounted tabs unless a test says so: the Autopilot and Clearance plugins are not installed here.
const tabsFor = (e: Entity, mounted: MountVisibility = {}) => visibleTabs(e, mounted);
const ids = (e: Entity, mounted?: MountVisibility) => tabsFor(e, mounted).map(t => t.id);

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
      'airspace',
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
    expect(ids(e)).not.toContain('airspace');
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
      'airspace',
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

describe('tabs mounted by other plugins (2026-10-31)', () => {
  const mounted: MountVisibility = { agent: true, clearance: true };

  it('an AI workload gets the Agent tab right after Pull requests once the Autopilot plugin mounts it', () => {
    expect(ids(entity({ 'hangar.io/workload-type': 'ai' }), mounted)).toEqual(['overview', 'pull-requests', 'agent']);
  });

  it('an app gets the Clearance tab after SLOs when the Clearance plugin mounts it and finds something to show', () => {
    const e = entity(undefined, ['kind:goapplication']);
    const got = ids(e, mounted);
    expect(got.indexOf('clearance')).toBe(got.indexOf('slos') + 1);
    expect(got).not.toContain('agent');
    // The plugin is installed but says this app is of no interest to it: no tab.
    expect(ids(e, { clearance: false })).not.toContain('clearance');
  });

  it('an infra service and a function are governed too; a plain service kind with a repo as well', () => {
    expect(ids(entity(undefined, ['kind:infraservice']), mounted)).toContain('clearance');
    expect(ids(entity({ 'hangar.io/service-class': 'function', 'hangar.io/deploy-target': 'aws-lambda' }), mounted)).toContain('clearance');
    expect(ids(entity({ 'hangar.io/service-class': 'storage', 'github.com/project-slug': 'o/r' }), mounted)).toEqual(['overview', 'pull-requests', 'clearance']);
    expect(ids(entity({ 'hangar.io/service-class': 'storage' }), mounted)).toEqual(['overview']);
  });

  it('every mounted tab is also gated by a capability, so an app never gets the Agent tab', () => {
    for (const tab of TABS.filter(t => t.mount)) expect(tab.requires?.length).toBeGreaterThan(0);
    expect(ids(entity(undefined, ['kind:goapplication']), { agent: true })).not.toContain('agent');
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

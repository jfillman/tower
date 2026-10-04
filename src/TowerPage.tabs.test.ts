import type { Entity } from '@backstage/catalog-model';
import { hasCapabilities } from './serviceClass';
import { TABS } from './TowerPage';

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
  it('a Kubernetes container app keeps exactly the tabs it had, with the Rollout Deployments tab', () => {
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
      'config',
      'glidepath',
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
    expect(ids(e)).toEqual(expect.arrayContaining(['overview', 'pipelines', 'deployments', 'releases', 'glidepath']));
  });

  it('never offers both Deployments tabs for one service', () => {
    for (const target of ['k8s-rollout', 'aws-ecs', 'aws-lambda', 'azure-container-apps', 'something-new']) {
      const e = entity({ 'hangar.io/service-class': 'container-app', 'hangar.io/deploy-target': target });
      expect(tabsFor(e).filter(t => t.id === 'deployments').length).toBeLessThanOrEqual(1);
    }
  });
});

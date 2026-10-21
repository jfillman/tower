import type { ClusterObjects } from '@backstage/plugin-kubernetes-common';
import { buildEnvironments } from './useTowerEnvironments';

// The objects the Kubernetes plugin returns for skyport-broker on hangar-dev (2026-10-21): the RabbitMQ operator's
// StatefulSet, its pod and Service, labelled with the service's hangar.io/app and hangar.io/env. No Rollout.
const labels = {
  'app.kubernetes.io/component': 'rabbitmq',
  'app.kubernetes.io/name': 'skyport-broker',
  'hangar.io/app': 'skyport-broker',
  'hangar.io/env': 'dev',
  'hangar.io/subcomponent': 'attached-component',
};
const objects = (): ClusterObjects[] =>
  [
    {
      cluster: { name: 'hangar-dev' },
      errors: [],
      podMetrics: [],
      resources: [
        {
          type: 'statefulsets',
          resources: [
            {
              metadata: { name: 'skyport-broker-server', namespace: 'app-skyport-broker-dev', labels },
              spec: { replicas: 1, template: { spec: { containers: [{ name: 'rabbitmq', image: 'rabbitmq:4.1-management' }] } } },
              status: { availableReplicas: 1 },
            },
          ],
        },
        {
          type: 'pods',
          resources: [{ metadata: { name: 'skyport-broker-server-0', namespace: 'app-skyport-broker-dev', labels }, status: { phase: 'Running' } }],
        },
        { type: 'services', resources: [{ metadata: { name: 'skyport-broker', namespace: 'app-skyport-broker-dev', labels }, spec: {} }] },
      ],
    },
  ] as unknown as ClusterObjects[];

const build = (infra: boolean) => buildEnvironments(objects(), new Map(), new Map(), new Map(), new Map(), new Map(), infra);

describe('environments of an InfraService', () => {
  it('come from its StatefulSet, named by its labels, with its Argo CD app', () => {
    const [env] = build(true);
    expect(env).toMatchObject({
      env: 'dev',
      cluster: 'hangar-dev',
      namespace: 'app-skyport-broker-dev',
      appName: 'skyport-broker',
      argoAppName: 'skyport-broker-dev',
      image: 'rabbitmq:4.1-management',
      desiredReplicas: 1,
      availableReplicas: 1,
    });
    expect(env.workload?.kind).toBe('StatefulSet');
    expect(env.services.map(s => s.name)).toEqual(['skyport-broker']);
  });
  it("are not made from an app's attached component", () => {
    expect(build(false)).toEqual([]);
  });
});

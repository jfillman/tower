import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toFleetRun } from '../../fleet/fleetRuns';
import { toReleaseRecord } from '../../fleet/releaseRecords';
import { OpsWallDashboard } from './OpsWallDashboard';

// Render smoke test: the page assembles every panel from the hooks without throwing, and the
// headline numbers and links come out of the model.

const entity = (name: string) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name, tags: ['kind:nodejsapplication'], annotations: { 'github.com/project-slug': `jfillman/${name}` } },
  spec: { owner: 'group:default/platform' },
});

let dora: any;

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: () => ({
    getNotifications: async () => ({
      notifications: [
        { id: 'n1', created: new Date(), payload: { title: 'gate-api deployed to staging', severity: 'normal' } },
      ],
    }),
  }),
}));
jest.mock('@backstage/plugin-kubernetes', () => ({ isKubernetesAvailable: () => true }));
jest.mock('../../useFleetRoster', () => ({
  useFleetRoster: () => ({ entities: [entity('gate-api'), entity('checkin-api')], loading: false }),
}));
jest.mock('../../useFleetEnvironments', () => ({
  useFleetEnvironments: () => ({
    apps: [
      {
        entityRef: 'component:default/gate-api',
        appName: 'gate-api',
        loading: false,
        environments: [
          {
            key: 'staging',
            env: 'staging',
            cluster: 'kind-prod',
            namespace: 'app-gate-api-staging',
            rolloutPhase: 'Degraded',
            rolloutMessage: 'RolloutAborted',
            drift: false,
            pods: [],
            services: [],
            resources: [],
          },
        ],
      },
    ],
    loading: false,
    probes: null,
  }),
}));
jest.mock('../../useFleetSlos', () => ({
  useFleetSlos: () => ({ summary: { total: 2, meetingObjective: 1, loading: false }, slos: [], probes: null }),
}));
jest.mock('../../fleet/useFleetPipelineRuns', () => ({
  useFleetPipelineRuns: () => ({
    loading: false,
    failures: 0,
    updatedAt: Date.now(),
    data: [
      toFleetRun(
        {
          metadata: {
            name: 'ci-0-build-abc',
            namespace: 'app-gate-api-cicd',
            labels: { 'hangar.io/app': 'gate-api', 'hangar.io/stage': 'build', 'tekton.dev/pipeline': 'build' },
          },
          status: {
            conditions: [
              {
                type: 'Succeeded',
                status: 'Unknown',
                reason: 'Running',
                message: 'Tasks Completed: 3 (Failed: 0, Cancelled 0), Incomplete: 5, Skipped: 0',
              },
            ],
            startTime: new Date(Date.now() - 120_000).toISOString(),
          },
        },
        new Map(),
      ),
    ],
  }),
}));
jest.mock('../../fleet/useFleetReleases', () => ({
  useFleetReleaseRecords: () => ({
    loading: false,
    failures: 0,
    updatedAt: Date.now(),
    data: [
      toReleaseRecord({
        metadata: { name: 'release-tracking-c19', namespace: 'app-checkin-api-cicd' },
        data: {
          appName: 'checkin-api',
          env: 'staging',
          cluster: 'kind-prod',
          state: 'proposed',
          prCreatedAt: '2026-10-06T06:04:28Z',
          prUrl: 'https://github.com/jfillman/gitops-checkin-api/pull/9',
        },
      }),
    ],
  }),
  useFleetReleaseEvents: () => ({ loading: false, failures: 0, updatedAt: Date.now(), data: [] }),
}));
jest.mock('../../fleet/useDoraMetrics', () => ({ useDoraMetrics: () => dora }));
jest.mock('../../provisioning/useProvisioning', () => ({ useProvisioning: () => ({ items: [], loading: false }) }));

const renderWall = () =>
  render(
    <MemoryRouter initialEntries={['/tower?view=dashboard']}>
      <OpsWallDashboard />
    </MemoryRouter>,
  );

describe('OpsWallDashboard', () => {
  it('renders every panel with the headline numbers and links', async () => {
    dora = {
      loading: false,
      failures: 0,
      updatedAt: Date.now(),
      source: { cluster: 'kind-dev', namespace: 'observability', service: 'thanos-query-frontend', port: 9090 },
      data: {
        windowDays: 30,
        deploysPerDay: 1.5,
        changeFailureRate: 0.2,
        leadTimeP50Sec: 7200,
        apps: [],
        deploysDaily: [],
        failuresDaily: [],
      },
    };
    renderWall();

    const attention = within(screen.getByLabelText('Needs attention'));
    expect(attention.getByText('staging is degraded')).toBeTruthy();
    expect(attention.getByText('Release PR to staging waiting for merge')).toBeTruthy();

    const pipelines = within(screen.getByLabelText('Pipelines in flight'));
    expect(pipelines.getByText('3/8')).toBeTruthy();
    expect(pipelines.getByText('Run').getAttribute('href')).toBe(
      '/tower?entity=component%3Adefault%2Fgate-api&tab=pipelines&run=ci-0-build-abc',
    );

    expect(screen.getByText('Waiting for approval (1)')).toBeTruthy();
    expect(screen.getAllByText('20%')).toHaveLength(2); // the CFR headline and the DORA tile
    expect(await screen.findByText('gate-api deployed to staging')).toBeTruthy();
  });

  it('says the DORA source is unavailable instead of showing zeros', () => {
    dora = {
      loading: false,
      failures: 1,
      error: 'no endpoints available for service "thanos-query-frontend"',
      source: { cluster: 'kind-dev', namespace: 'observability', service: 'thanos-query-frontend', port: 9090 },
    };
    renderWall();
    expect(
      screen.getByText(/DORA metrics are unavailable: thanos-query-frontend on kind-dev did not answer/),
    ).toBeTruthy();
  });
});

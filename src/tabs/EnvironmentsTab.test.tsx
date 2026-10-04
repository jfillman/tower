import { render, screen, within } from '@testing-library/react';
import { EnvironmentsTab } from './EnvironmentsTab';
import type { EnvironmentSummary } from '../types';

const env = (over: Partial<EnvironmentSummary> & { env: string }): EnvironmentSummary => ({
  key: over.env,
  cluster: 'kind-dev',
  namespace: `app-x-${over.env}`,
  drift: false,
  pods: [],
  services: [],
  resources: [],
  ...over,
});

let ctx: any;
jest.mock('../useReleaseContext', () => ({ useReleaseContext: () => ctx }));

const base = { loading: false, error: undefined, pipelineOrder: { lower: ['dev'], upper: ['staging'] } };

describe('EnvironmentsTab', () => {
  it('lists every environment in order with tier, target, where, health and the live image', () => {
    ctx = {
      ...base,
      environments: [
        env({ env: 'dev', image: 'ghcr.io/o/x:0.1.0-39c3455', deployed: true, deployedAt: new Date().toISOString(), rolloutPhase: 'Healthy', desiredReplicas: 2, availableReplicas: 2 }),
        env({ env: 'staging', cluster: 'kind-prod', deployed: false }),
      ],
    };
    render(<EnvironmentsTab />);
    const rows = screen.getAllByRole('row').slice(1); // drop the header
    expect(rows).toHaveLength(2);
    const dev = within(rows[0]);
    expect(dev.getByText('dev')).toBeTruthy();
    expect(dev.getByText('Ground')).toBeTruthy();
    expect(dev.getByText('Kubernetes')).toBeTruthy();
    expect(dev.getByText('kind-dev')).toBeTruthy();
    expect(dev.getByText('Healthy')).toBeTruthy();
    expect(dev.getByText('0.1.0-39c3455')).toBeTruthy();
    const staging = within(rows[1]);
    expect(staging.getByText('Flight')).toBeTruthy();
    expect(staging.getByText('kind-prod')).toBeTruthy();
    expect(staging.getByText('not deployed yet')).toBeTruthy();
  });

  it('describes a cloud environment by its target and function, and shows a failed deploy as degraded', () => {
    ctx = {
      ...base,
      pipelineOrder: { lower: ['dev'], upper: [] },
      environments: [
        env({
          env: 'dev',
          cluster: 'AWS Lambda',
          image: 'ghcr.io/o/fn:0.0.0-abc1234',
          deployed: true,
          cloud: {
            target: 'aws-lambda',
            targetLabel: 'AWS Lambda',
            resource: { kind: 'Lambda function', name: 'glidepath-smoke-fn', region: 'us-east-1' },
            latest: 'failed',
          },
        }),
      ],
    };
    render(<EnvironmentsTab />);
    expect(screen.getByText('AWS Lambda')).toBeTruthy();
    expect(screen.getByText('glidepath-smoke-fn · us-east-1')).toBeTruthy();
    expect(screen.getByText('Degraded')).toBeTruthy();
  });

  it('says it is read-only and where to edit for now', () => {
    ctx = { ...base, environments: [env({ env: 'dev' })] };
    render(<EnvironmentsTab />);
    expect(screen.getByText(/Read-only for now/)).toBeTruthy();
    expect(screen.getByText(/Glidepath tab/)).toBeTruthy();
  });

  it('shows an empty state when the service has no environments', () => {
    ctx = { ...base, environments: [] };
    render(<EnvironmentsTab />);
    expect(screen.getByText(/No environments yet/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

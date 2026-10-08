import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import fixture from '../__fixtures__/cloudDeployRuns.json';
import { toPipelineRunSummary, type RawPipelineRun, type RawTaskRun } from '../tekton/useTektonPipelineRuns';
import { CloudDeploymentsTab } from './CloudDeploymentsTab';

const real = (fixture as any)['ci-1-deploy-swift-bear-772974f5'];
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

function run(name: string, edit?: (pr: any, trs: any[]) => void) {
  const pr = clone(real.pipelineRun) as RawPipelineRun;
  const trs = clone(real.taskRuns) as RawTaskRun[];
  pr.metadata.name = name;
  edit?.(pr, trs);
  return toPipelineRunSummary(pr, 'kind-dev', new Map(trs.map(t => [t.metadata.name, t])));
}

let mockRuns: ReturnType<typeof run>[] = [];
jest.mock('../tekton/useTektonPipelineRuns', () => ({
  ...jest.requireActual('../tekton/useTektonPipelineRuns'),
  useTektonPipelineRuns: () => ({ loading: false, runs: mockRuns }),
}));
jest.mock('@backstage/plugin-catalog-react', () => ({
  useEntity: () => ({
    entity: { metadata: { name: 'smoke-ecs', annotations: { 'github.com/project-slug': 'jfillman/smoke-ecs' } } },
  }),
}));

let mockDeploy: unknown = { target: 'aws-ecs', environments: [{ name: 'dev', tier: 'ground' }] };
jest.mock('../useConfigData', () => ({
  useCicdConfig: () => ({ loading: false, data: { values: { deploy: mockDeploy } } }),
}));
let mockPin: unknown = { loading: false, data: undefined };
const mockSubmit = jest.fn(async () => ({ prUrl: 'https://github.com/jfillman/smoke-ecs/pull/9', alreadyOpen: false, pin: { tag: 'x' } }));
jest.mock('../environments/releasePins', () => ({
  ...jest.requireActual('../environments/releasePins'),
  usePinState: () => mockPin,
  useSubmitPin: () => ({ loading: false, submit: mockSubmit, reset: jest.fn() }),
}));

function Where() {
  const l = useLocation();
  return <div data-testid="loc">{l.search}</div>;
}
const renderTab = () =>
  render(
    <MemoryRouter initialEntries={['/tower?entity=component:default/smoke-ecs&tab=deployments']}>
      <CloudDeploymentsTab />
      <Where />
    </MemoryRouter>,
  );

describe('CloudDeploymentsTab', () => {
  it('shows the target, resource, what was deployed, and that it reads no live health', () => {
    mockRuns = [run('ci-1-deploy-ok')];
    renderTab();
    expect(screen.getByText('AWS ECS')).toBeTruthy();
    expect(screen.getByText(/ECS service glidepath-smoke · glidepath-smoke · us-east-1/)).toBeTruthy();
    expect(screen.getByText('Last successful deploy')).toBeTruthy();
    expect(screen.getAllByText('0.0.0-4eedae7').length).toBeGreaterThan(0);
    expect(screen.getByText(/commit 4eedae7/)).toBeTruthy();
    expect(screen.getByText(/does not read live health/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /open in console/ }).getAttribute('href')).toContain(
      'console.aws.amazon.com/ecs',
    );
  });

  it('a failed latest deploy says the cloud may still run the previous image, and links to the run', () => {
    mockRuns = [
      run('ci-1-deploy-failed', (pr, trs) => {
        pr.status.startTime = '2026-10-04T05:00:00Z';
        pr.status.completionTime = '2026-10-04T05:01:00Z';
        pr.status.conditions = [{ type: 'Succeeded', status: 'False', reason: 'Failed' }];
        const t = trs.find(x => x.metadata.labels['tekton.dev/pipelineTask'] === 'deploy-aws-ecs')!;
        t.status.conditions = [
          { type: 'Succeeded', status: 'False', reason: 'Failed', message: 'step-update-service exited with code 252' },
        ];
      }),
      run('ci-1-deploy-ok'),
    ];
    renderTab();
    expect(screen.getByText('Latest deploy failed')).toBeTruthy();
    expect(screen.getByText(/deploy-aws-ecs: step-update-service exited with code 252/)).toBeTruthy();
    expect(screen.getByText(/may still be running 0\.0\.0-4eedae7/)).toBeTruthy();
    fireEvent.click(screen.getByText('open the run and its logs'));
    expect(screen.getByTestId('loc').textContent).toContain('tab=pipelines');
    expect(screen.getByTestId('loc').textContent).toContain('run=ci-1-deploy-failed');
  });

  it('shows a deploy in progress', () => {
    mockRuns = [
      run('ci-1-deploy-now', (pr, trs) => {
        pr.status.startTime = new Date().toISOString();
        delete pr.status.completionTime;
        pr.status.conditions = [{ type: 'Succeeded', status: 'Unknown', reason: 'Running' }];
        const gone = trs.findIndex(x => x.metadata.labels['tekton.dev/pipelineTask'] === 'deploy-aws-ecs');
        pr.status.childReferences = (pr.status.childReferences ?? []).filter(
          (c: any) => c.name !== trs[gone].metadata.name,
        );
        trs.splice(gone, 1);
      }),
    ];
    renderTab();
    expect(screen.getByText('Deploying now')).toBeTruthy();
    expect(screen.getByText('No deploy has succeeded yet.')).toBeTruthy();
  });

  it('says so, plainly, when there are no cloud deploys', () => {
    mockRuns = [];
    renderTab();
    expect(screen.getByText(/No cloud deploys yet/)).toBeTruthy();
  });

  it('shows no Flight panel for an app without Flight environments', () => {
    mockDeploy = { target: 'aws-ecs', environments: [{ name: 'dev', tier: 'ground' }] };
    mockRuns = [run('ci-1-deploy-ok')];
    renderTab();
    expect(screen.queryByText('Flight environments')).toBeNull();
  });

  it("shows a cloud Flight environment's pin, and Promote and Roll back open pin PRs", () => {
    mockDeploy = { target: 'aws-ecs', environments: [{ name: 'dev', tier: 'ground' }, { name: 'prod', tier: 'flight' }] };
    mockRuns = [run('ci-1-deploy-ok')];
    const pin = (tag: string, digest: string) => ({ repository: 'ghcr.io/jfillman/smoke-ecs', tag, digest, promotedFrom: 'dev' });
    mockPin = {
      loading: false,
      data: {
        env: 'prod',
        path: 'glidepath/releases/prod.yaml',
        current: pin('2.0.0-bbbbbbb', 'sha256:bbbb'),
        history: [
          { sha: 'c2', date: '2026-10-07T00:00:00Z', message: 'Pin', pin: pin('2.0.0-bbbbbbb', 'sha256:bbbb') },
          { sha: 'c1', date: '2026-10-06T00:00:00Z', message: 'Pin', pin: pin('1.0.0-aaaaaaa', 'sha256:aaaa') },
        ],
        openPr: { url: 'https://github.com/jfillman/smoke-ecs/pull/8' },
      },
    };
    renderTab();
    expect(screen.getByText('Flight environments')).toBeTruthy();
    expect(screen.getByText('2.0.0-bbbbbbb')).toBeTruthy();
    expect(screen.getByText('pin PR open ↗')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Promote to prod' }));
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ env: 'prod', image: expect.stringContaining('ghcr.io/') }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll back to 1.0.0-aaaaaaa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open rollback PR' }));
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ env: 'prod', rollbackTo: 'c1' }));
  });
});

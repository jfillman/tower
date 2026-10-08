import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GlidepathSummaryPanel } from './GlidepathSummaryPanel';

let cicd: any;
jest.mock('./useConfigData', () => ({
  useCicdConfig: () => cicd,
  usePlatformEnvs: () => ({ loading: false, data: { envs: ['dev'] } }),
  usePlatformFile: () => ({ loading: false, data: undefined }),
}));
jest.mock('./PipelineFlowPreview', () => ({ PipelineFlowPreview: ({ name }: { name: string }) => <div>pipeline {name}</div> }));

const renderPanel = () =>
  render(
    <MemoryRouter initialEntries={['/tower?entity=x&tab=pipelines']}>
      <GlidepathSummaryPanel owner="o" appName="app" />
    </MemoryRouter>,
  );

const newShape = { values: { deploy: { environments: [{ name: 'dev', tier: 'ground' }, { name: 'test', tier: 'ground' }, { name: 'staging', tier: 'flight', cluster: 'kind-prod' }, { name: 'prod', tier: 'flight', cluster: 'kind-prod' }] } } };
const oldShape = { values: { deploy: { lowerEnvironments: ['dev'], upperEnvironments: [{ name: 'staging', cluster: 'kind-prod' }, 'prod'], promotionOrder: ['dev', 'staging', 'prod'] } } };

describe('Glidepath at a glance', () => {
  it('always shows every environment in promotion order with its tier, Ground and Flight', () => {
    cicd = { loading: false, data: newShape };
    renderPanel();
    const chain = within(screen.getByLabelText('Environments in promotion order'));
    expect(chain.getAllByText(/^(dev|test|staging|prod)$/).map(e => e.textContent)).toEqual(['dev', 'test', 'staging', 'prod']);
    expect(chain.getAllByText('Ground')).toHaveLength(2);
    expect(chain.getAllByText('Flight')).toHaveLength(2);
  });

  it('does not read the removed environment fields: a file with only those shows the default, dev', () => {
    cicd = { loading: false, data: oldShape };
    renderPanel();
    const chain = within(screen.getByLabelText('Environments in promotion order'));
    expect(chain.getAllByText(/^(dev|staging|prod)$/).map(e => e.textContent)).toEqual(['dev']);
    expect(chain.queryAllByText('Flight')).toHaveLength(0);
  });

  it('says Ground and Flight, never "lower" or "upper", and details each environment', () => {
    cicd = { loading: false, data: newShape };
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.queryByText(/lower env/i)).toBeNull();
    expect(screen.queryByText(/upper env/i)).toBeNull();
    expect(screen.getByText('glidepath/envs/dev.yaml')).toBeTruthy(); // a Ground environment with a values file
    expect(screen.getByText('chart defaults, no values file yet')).toBeTruthy(); // test has none
    expect(screen.getAllByText('kind-prod · gitops values')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByText('glidepath/envs/dev.yaml')).toBeNull();
  });

  it('warns for an environment that no pipeline step reaches', () => {
    cicd = { loading: false, data: { values: { ...newShape.values, pipelines: { ci: { steps: [{ stage: 'deploy', env: 'dev' }, { stage: 'release', env: 'staging' }] } } } } };
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByText('No pipeline step deploys to test.')).toBeTruthy();
    expect(screen.getByText('No pipeline step releases to prod.')).toBeTruthy();
    expect(screen.queryByText('No pipeline step deploys to dev.')).toBeNull();
    expect(screen.queryByText('No pipeline step releases to staging.')).toBeNull();
  });

  it('does not warn when there are no pipelines to judge by', () => {
    cicd = { loading: false, data: newShape };
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.queryByText(/No pipeline step/)).toBeNull();
  });

  it('names the target of a cloud service instead of a values file', () => {
    cicd = { loading: false, data: { values: { deploy: { target: 'aws-lambda', environments: [{ name: 'dev', tier: 'ground' }] } } } };
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByText('AWS Lambda')).toBeTruthy();
  });

  it('keeps the way into Glidepath when cicd.yaml cannot be read', () => {
    cicd = { loading: false, error: 'boom', data: undefined };
    renderPanel();
    expect(screen.getByText(/couldn't load cicd.yaml: boom/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Configure in Glidepath →' })).toBeTruthy();
    expect(screen.queryByLabelText('Environments in promotion order')).toBeNull();
  });
});

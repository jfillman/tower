import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
let cicdData: any;
let submitState: any;
const submitMock = jest.fn();
const resetMock = jest.fn();
jest.mock('../useReleaseContext', () => ({ useReleaseContext: () => ctx }));
const launchMock = jest.fn();
jest.mock('../environments/applicationEnvironment', () => ({
  ...jest.requireActual('../environments/applicationEnvironment'),
  useLaunchApplicationEnvironment: () => ({ state: { status: 'idle' }, launch: launchMock, reset: jest.fn() }),
}));
jest.mock('../useConfigData', () => ({
  useCicdConfig: () => ({ loading: false, data: cicdData }),
  useSubmitCicdConfigChange: () => ({ ...submitState, submit: submitMock, reset: resetMock }),
}));

const base = { loading: false, error: undefined, owner: 'jfillman', appName: 'air-traffic-api' };

beforeEach(() => {
  submitMock.mockReset();
  resetMock.mockReset();
  launchMock.mockReset();
  submitState = { loading: false };
  cicdData = undefined;
});

const k8sOld = () => {
  ctx = {
    ...base,
    pipelineOrder: { lower: ['dev', 'test'], upper: ['staging'] },
    environments: [env({ env: 'dev' }), env({ env: 'test' }), env({ env: 'staging', cluster: 'kind-prod' })],
  };
  cicdData = {
    values: {
      deploy: {
        lowerEnvironments: ['dev', 'test'],
        upperEnvironments: [{ name: 'staging', cluster: 'kind-prod' }],
        promotionOrder: ['dev', 'test', 'staging'],
        strategy: 'rollout',
      },
    },
  };
};

const lambdaNew = () => {
  ctx = {
    ...base,
    pipelineOrder: { lower: ['dev', 'test'], upper: [] },
    environments: [
      env({ env: 'dev', cluster: 'AWS Lambda', image: 'ghcr.io/o/fn:0.0.0-abc', deployed: true,
        cloud: { target: 'aws-lambda', targetLabel: 'AWS Lambda', resource: { kind: 'Lambda function', name: 'app-fn', region: 'us-east-1' }, latest: 'succeeded' } }),
    ],
  };
  cicdData = {
    values: {
      deploy: {
        target: 'aws-lambda',
        lambda: { functionName: 'app-fn', region: 'us-east-1' },
        environments: [{ name: 'dev', tier: 'ground' }, { name: 'test', tier: 'ground' }],
      },
    },
  };
};

// MUI hides the page from assistive tech (aria-hidden) while a dialog is closing, so wait for it to go.
const stageAdd = async (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Stage environment' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};
const stageFlight = async (name: string, cluster?: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  fireEvent.click(screen.getByLabelText(/^Flight/));
  if (cluster) fireEvent.change(screen.getByLabelText('Cluster'), { target: { value: cluster } });
  if (cluster) {
    fireEvent.click(screen.getByRole('button', { name: 'Stage environment' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }
};
const panel = () => within(screen.getByLabelText('Pending changes'));

describe('EnvironmentsTab: reading', () => {
  it('lists every environment in order with tier, target, where, health and the live image', () => {
    ctx = {
      ...base,
      pipelineOrder: { lower: ['dev'], upper: ['staging'] },
      environments: [
        env({ env: 'dev', image: 'ghcr.io/o/x:0.1.0-39c3455', deployed: true, deployedAt: new Date().toISOString(), rolloutPhase: 'Healthy', desiredReplicas: 2, availableReplicas: 2 }),
        env({ env: 'staging', cluster: 'kind-prod', deployed: false }),
      ],
    };
    render(<EnvironmentsTab />);
    const rows = screen.getAllByRole('row').slice(1);
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
        env({ env: 'dev', cluster: 'AWS Lambda', image: 'ghcr.io/o/fn:0.0.0-abc1234', deployed: true,
          cloud: { target: 'aws-lambda', targetLabel: 'AWS Lambda', resource: { kind: 'Lambda function', name: 'glidepath-smoke-fn', region: 'us-east-1' }, latest: 'failed' } }),
      ],
    };
    render(<EnvironmentsTab />);
    expect(screen.getByText('AWS Lambda')).toBeTruthy();
    expect(screen.getByText('glidepath-smoke-fn · us-east-1')).toBeTruthy();
    expect(screen.getByText('Degraded')).toBeTruthy();
  });

  it('is read-only, and says where to edit, when there is no cicd.yaml Tower can edit', () => {
    ctx = { ...base, pipelineOrder: { lower: ['dev'], upper: [] }, environments: [env({ env: 'dev' })] };
    render(<EnvironmentsTab />);
    expect(screen.getByText(/Read-only/)).toBeTruthy();
    expect(screen.getByText(/Glidepath tab/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add environment' })).toBeNull();
    expect(screen.queryByLabelText('Pending changes')).toBeNull();
  });

  it('shows an empty state when the service has no environments', () => {
    ctx = { ...base, pipelineOrder: {}, environments: [] };
    render(<EnvironmentsTab />);
    expect(screen.getByText(/No environments yet/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('EnvironmentsTab: staging a Ground environment', () => {
  it('stages an add, shows the conversion and the follow-up, and the new row', async () => {
    k8sOld();
    render(<EnvironmentsTab />);
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
    await stageAdd('qa');
    expect(panel().getByText('Add environment qa')).toBeTruthy();
    expect(panel().getByText('Ground, after test')).toBeTruthy();
    // an old-shape app is converted as part of the first change, and the panel says so
    expect(panel().getByText(/Convert the environment list to deploy\.environments/)).toBeTruthy();
    // and says what Glidepath does afterwards
    expect(panel().getByText(/platform\/envs\/qa\.yaml/)).toBeTruthy();
    expect(screen.getByText('staged: new')).toBeTruthy();
    const names = screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['dev', 'test', 'qastaged: new', 'staging']);
  });

  it('opens one pull request with the new list in the new shape and none of the old fields', async () => {
    k8sOld();
    render(<EnvironmentsTab />);
    await stageAdd('qa');
    fireEvent.click(screen.getByRole('button', { name: 'Open pull request' }));
    expect(submitMock).toHaveBeenCalledTimes(1);
    const req = submitMock.mock.calls[0][0];
    expect(req.owner).toBe('jfillman');
    expect(req.appName).toBe('air-traffic-api');
    expect(req.patch.deploy).toEqual({
      strategy: 'rollout',
      environments: [
        { name: 'dev', tier: 'ground' },
        { name: 'test', tier: 'ground' },
        { name: 'qa', tier: 'ground' },
        { name: 'staging', tier: 'flight', cluster: 'kind-prod' },
      ],
    });
    expect(req.summary).toEqual(['Convert the environment list to deploy.environments', 'Add environment qa']);
  });

  it('refuses a duplicate name before it can be staged', () => {
    k8sOld();
    render(<EnvironmentsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'dev' } });
    expect(screen.getByText(/listed twice/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Stage environment' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('refuses an invalid name', () => {
    k8sOld();
    render(<EnvironmentsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'QA team' } });
    expect(screen.getByText(/not a valid environment name/)).toBeTruthy();
  });

  it('discards everything staged', async () => {
    k8sOld();
    render(<EnvironmentsTab />);
    await stageAdd('qa');
    fireEvent.click(screen.getByRole('button', { name: 'Discard all' }));
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
    expect(screen.queryByText('staged: new')).toBeNull();
  });
});

describe('EnvironmentsTab: reordering', () => {
  it('moves a Ground environment, stages the new order, and keeps Flight where it is', () => {
    k8sOld();
    render(<EnvironmentsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Move test earlier' }));
    expect(panel().getByText('Change the promotion order')).toBeTruthy();
    expect(panel().getByText('test to dev to staging')).toBeTruthy();
    // order is now test, dev, then Flight: test is first (cannot go earlier), dev is the last Ground one
    // (cannot go later: a Ground environment never passes a Flight one), dev can still go earlier
    const disabled = (name: string) => (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
    expect(disabled('Move test earlier')).toBe(true);
    expect(disabled('Move test later')).toBe(false);
    expect(disabled('Move dev earlier')).toBe(false);
    expect(disabled('Move dev later')).toBe(true);
    expect(screen.queryByRole('button', { name: /Move staging/ })).toBeNull(); // Flight has no order controls yet
  });
});

describe('EnvironmentsTab: a cloud environment\'s own resource', () => {
  it('sets a function for one environment, shows the app-level value as the hint, and stages one line', () => {
    lambdaNew();
    render(<EnvironmentsTab />);
    const testRow = screen.getAllByRole('row').find(r => within(r).queryByText('test'))!;
    fireEvent.click(testRow);
    const field = screen.getByLabelText('functionName') as HTMLInputElement;
    expect(field.placeholder).toBe('app-fn'); // the app-level value
    fireEvent.change(field, { target: { value: 'app-fn-test' } });
    fireEvent.change(field, { target: { value: 'app-fn-test2' } });
    expect(panel().getAllByText('test: lambda.functionName')).toHaveLength(1); // not one per keystroke
    expect(panel().getByText('app-level value to app-fn-test2')).toBeTruthy();
    // a new-shape app is not "converted"
    expect(panel().queryByText(/Convert the environment list/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open pull request' }));
    const req = submitMock.mock.calls[0][0];
    expect(req.patch.deploy).toEqual({
      target: 'aws-lambda',
      lambda: { functionName: 'app-fn', region: 'us-east-1' },
      environments: [{ name: 'dev', tier: 'ground' }, { name: 'test', tier: 'ground', lambda: { functionName: 'app-fn-test2' } }],
    });
  });

  it('offers the target\'s own override field when adding an environment, and stages it', async () => {
    lambdaNew();
    render(<EnvironmentsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'eu' } });
    fireEvent.change(screen.getByLabelText(/functionName \(optional\)/), { target: { value: 'app-fn-eu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stage environment' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open pull request' }));
    expect(submitMock.mock.calls[0][0].patch.deploy.environments[2]).toEqual({ name: 'eu', tier: 'ground', lambda: { functionName: 'app-fn-eu' } });
    // no follow-up about an environment file: a cloud environment has none
    expect(screen.queryByText(/platform\/envs/)).toBeNull();
  });

  it('a Kubernetes environment points to where its values live instead of showing cloud fields', () => {
    k8sOld();
    render(<EnvironmentsTab />);
    fireEvent.click(screen.getAllByRole('row').find(r => within(r).queryByText('test'))!);
    expect(screen.getByText(/platform\/envs\/test\.yaml/)).toBeTruthy();
    expect(screen.queryByLabelText('functionName')).toBeNull();
  });
});

describe('EnvironmentsTab: the result', () => {
  it('shows the opened pull request and clears what was staged when it is closed', async () => {
    k8sOld();
    const { rerender } = render(<EnvironmentsTab />);
    await stageAdd('qa');
    submitState = { loading: false, result: { prUrl: 'https://github.com/jfillman/air-traffic-api/pull/9', alreadyOpen: false } };
    rerender(<EnvironmentsTab />);
    expect(screen.getByText(/pull\/9/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(resetMock).toHaveBeenCalled();
  });
});

describe('EnvironmentsTab: staging a Flight environment', () => {
  it('offers Flight for a Kubernetes app, asks for the cluster, and explains the two pull requests', () => {
    k8sOld();
    render(<EnvironmentsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    expect((screen.getByLabelText(/^Flight/) as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByLabelText('Cluster')).toBeNull(); // only once Flight is chosen
    fireEvent.click(screen.getByLabelText(/^Flight/));
    expect(screen.getByLabelText('Cluster')).toBeTruthy();
    expect(screen.getByText(/opens two pull requests/)).toBeTruthy();
    // clusters this app's Flight environments already use are offered as suggestions
    expect(document.querySelector('datalist#flight-clusters option')?.getAttribute('value')).toBe('kind-prod');
  });

  it('does not offer Flight for a cloud app, and says why', () => {
    lambdaNew();
    render(<EnvironmentsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    expect((screen.getByLabelText(/^Flight/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/no approval path for them/)).toBeTruthy();
  });

  it('will not stage a Flight environment without a cluster', () => {
    k8sOld();
    render(<EnvironmentsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'prod' } });
    fireEvent.click(screen.getByLabelText(/^Flight/));
    expect(screen.getByText(/needs the cluster it runs on/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Stage environment' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists both pull requests in the order they open, and says which to merge first', async () => {
    k8sOld();
    render(<EnvironmentsTab />);
    await stageFlight('prod', 'kind-prod');
    expect(panel().getByText('Add environment prod')).toBeTruthy();
    expect(panel().getByText('Pull requests this opens, in this order')).toBeTruthy();
    expect(panel().getByText(/1\. tenants repo: ApplicationEnvironment request for prod/)).toBeTruthy();
    expect(panel().getByText(/2\. jfillman\/air-traffic-api: cicd\.yaml/)).toBeTruthy();
    expect(panel().getByText(/Merge that one before the cicd\.yaml change/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open pull requests' })).toBeTruthy();
    // a Flight environment goes at the end, after the existing Flight one
    const names = screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['dev', 'test', 'staging', 'prodstaged: new']);
  });

  it('launches the ApplicationEnvironment request first, then submits cicd.yaml with the Flight entry', async () => {
    k8sOld();
    launchMock.mockResolvedValue({ status: 'done', prUrl: 'https://github.com/jfillman/gitops-cluster-dev-tenants/pull/42' });
    render(<EnvironmentsTab />);
    await stageFlight('prod', 'kind-prod');
    fireEvent.click(screen.getByRole('button', { name: 'Open pull requests' }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(launchMock).toHaveBeenCalledWith({ appName: 'air-traffic-api', env: 'prod', cluster: 'kind-prod' });
    expect(launchMock.mock.invocationCallOrder[0]).toBeLessThan(submitMock.mock.invocationCallOrder[0]);
    const envs = submitMock.mock.calls[0][0].patch.deploy.environments;
    expect(envs[envs.length - 1]).toEqual({ name: 'prod', tier: 'flight', cluster: 'kind-prod' });
  });

  it('opens no cicd.yaml change when the request fails, says so, and keeps what was staged', async () => {
    k8sOld();
    launchMock.mockResolvedValue({ status: 'failed', error: 'cluster not registered' });
    render(<EnvironmentsTab />);
    await stageFlight('prod', 'kind-prod');
    fireEvent.click(screen.getByRole('button', { name: 'Open pull requests' }));
    expect(await screen.findByText(/Creating prod failed: cluster not registered/)).toBeTruthy();
    expect(screen.getByText(/Nothing was changed in cicd\.yaml/)).toBeTruthy();
    expect(submitMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText(/Creating prod failed/)).toBeNull());
    expect(panel().getByText('Add environment prod')).toBeTruthy(); // still staged for another try
  });

  it('does not open the request twice when only the cicd.yaml step has to be retried', async () => {
    k8sOld();
    launchMock.mockResolvedValue({ status: 'done', prUrl: 'https://github.com/jfillman/gitops-cluster-dev-tenants/pull/42' });
    submitMock.mockImplementationOnce(async () => {
      submitState = { loading: false, error: 'GitHub is unavailable' };
    });
    resetMock.mockImplementation(() => {
      submitState = { loading: false };
    });
    const { rerender } = render(<EnvironmentsTab />);
    await stageFlight('prod', 'kind-prod');
    fireEvent.click(screen.getByRole('button', { name: 'Open pull requests' }));
    // the request opened, then cicd.yaml failed: both facts are shown
    expect(await screen.findByText(/GitHub is unavailable/)).toBeTruthy();
    expect(screen.getByText(/pull\/42/)).toBeTruthy();
    expect(screen.getByText(/will not be opened again/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    rerender(<EnvironmentsTab />);
    await waitFor(() => expect(screen.queryByText(/GitHub is unavailable/)).toBeNull());
    expect(screen.getByText(/\(already opened\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open pull requests' }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    expect(launchMock).toHaveBeenCalledTimes(1); // not repeated
  });

  it('shows both pull requests and the merge order once everything opened', async () => {
    k8sOld();
    launchMock.mockResolvedValue({ status: 'done', prUrl: 'https://github.com/jfillman/gitops-cluster-dev-tenants/pull/42' });
    submitMock.mockImplementationOnce(async () => {
      submitState = { loading: false, result: { prUrl: 'https://github.com/jfillman/air-traffic-api/pull/9', alreadyOpen: false } };
    });
    render(<EnvironmentsTab />);
    await stageFlight('prod', 'kind-prod');
    fireEvent.click(screen.getByRole('button', { name: 'Open pull requests' }));
    expect(await screen.findByText(/Pull requests opened/)).toBeTruthy();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/1\. ApplicationEnvironment request for prod/)).toBeTruthy();
    expect(dialog.getByText(/pull\/42/)).toBeTruthy();
    expect(dialog.getByText(/2\. cicd\.yaml change/)).toBeTruthy();
    expect(dialog.getByText(/pull\/9/)).toBeTruthy();
    expect(dialog.getByText(/Merge the ApplicationEnvironment request first, then the cicd\.yaml change/)).toBeTruthy();
  });
});

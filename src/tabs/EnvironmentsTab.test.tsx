import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
let platformFile: any;
// Stable objects: the form re-initialises whenever the data object changes, as the real hooks' state does not.
const flightConfig = { loading: false, data: { values: { rollout: { replicas: 2 } }, raw: '', path: 'gitops-air-traffic-api/kind-prod/staging/values.yaml' } };
const envXr = { loading: false, data: { env: 'staging', path: 'p', configMapGenerator: false } };
const configMapFiles = { loading: false, data: { cluster: 'kind-prod', env: 'staging', path: 'p', files: [] } };
const platformSubmitMock = jest.fn();
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
  usePlatformFile: () => platformFile,
  useValuesSchema: () => ({ loading: false, data: undefined }),
  useAppConfig: () => flightConfig,
  useSubmitConfigChange: () => ({ loading: false, submit: jest.fn(), reset: jest.fn() }),
  useEnvXr: () => envXr,
  useSubmitEnvXrChange: () => ({ loading: false, submit: jest.fn(), reset: jest.fn() }),
  useConfigMapFiles: () => configMapFiles,
  useSubmitConfigMapFiles: () => ({ loading: false, submit: jest.fn(), reset: jest.fn() }),
  useSubmitPlatformFileChange: () => ({ loading: false, submit: platformSubmitMock, reset: jest.fn() }),
}));

const tabUi = () => (
  <MemoryRouter initialEntries={['/tower?entity=component:default/air-traffic-api&tab=environments']}>
    <EnvironmentsTab />
  </MemoryRouter>
);
let rerenderFn: (ui: React.ReactElement) => void = () => undefined;
const renderTab = () => {
  const r = render(tabUi());
  rerenderFn = r.rerender;
  return r;
};
const rerenderTab = () => rerenderFn(tabUi());

const base = { loading: false, error: undefined, owner: 'jfillman', appName: 'air-traffic-api' };

beforeEach(() => {
  submitMock.mockReset();
  platformSubmitMock.mockReset();
  platformFile = { loading: false, data: { repo: 'o/air-traffic-api', path: 'platform/envs/test.yaml', values: { envName: 'test', rollout: { replicas: 1 } }, raw: '' } };
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
// The row menu: open it for a row, then pick an item (items can be disabled, so it also reads them).
const openMenu = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
const menuItem = (label: string) => screen.queryByRole('menuitem', { name: label });
const chooseAction = async (name: string, label: string) => {
  openMenu(name);
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
};
const confirmRemoveFromMenu = async (name: string) => {
  openMenu(name);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove…' }));
  fireEvent.change(screen.getByLabelText(`Type ${name} to confirm`), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Stage removal' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};
const openRow = (name: string) => screen.getAllByRole('row').find(r => within(r).queryByText(name))!;
const panel = () => within(screen.getByRole('region', { name: 'Pending changes' }));

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
    renderTab();
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
    renderTab();
    expect(screen.getByText('AWS Lambda')).toBeTruthy();
    expect(screen.getByText('glidepath-smoke-fn · us-east-1')).toBeTruthy();
    expect(screen.getByText('Degraded')).toBeTruthy();
  });

  it('is read-only, and says where to edit, when there is no cicd.yaml Tower can edit', () => {
    ctx = { ...base, pipelineOrder: { lower: ['dev'], upper: [] }, environments: [env({ env: 'dev' })] };
    renderTab();
    expect(screen.getByText(/Read-only/)).toBeTruthy();
    expect(screen.getByText(/Glidepath tab/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add environment' })).toBeNull();
    expect(screen.queryByLabelText('Pending changes')).toBeNull();
  });

  it('shows an empty state when the service has no environments', () => {
    ctx = { ...base, pipelineOrder: {}, environments: [] };
    renderTab();
    expect(screen.getByText(/No environments yet/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('EnvironmentsTab: staging a Ground environment', () => {
  it('stages an add, shows the conversion and the follow-up, and the new row', async () => {
    k8sOld();
    renderTab();
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
    await stageAdd('qa');
    expect(panel().getByText('Add environment qa')).toBeTruthy();
    expect(panel().getByText('Ground, after test')).toBeTruthy();
    // an old-shape app is converted as part of the first change, and the panel says so
    expect(panel().getByText(/Convert the environment list to deploy\.environments/)).toBeTruthy();
    // and says what Glidepath does afterwards
    expect(panel().getByText(/platform\/envs\/qa\.yaml/)).toBeTruthy();
    expect(screen.getByText('staged: new')).toBeTruthy();
    const names = screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[1].textContent);
    expect(names).toEqual(['dev', 'test', 'qastaged: new', 'staging']);
  });

  it('opens one pull request with the new list in the new shape and none of the old fields', async () => {
    k8sOld();
    renderTab();
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
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'dev' } });
    expect(screen.getByText(/listed twice/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Stage environment' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('refuses an invalid name', () => {
    k8sOld();
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'QA team' } });
    expect(screen.getByText(/not a valid environment name/)).toBeTruthy();
  });

  it('discards everything staged', async () => {
    k8sOld();
    renderTab();
    await stageAdd('qa');
    fireEvent.click(screen.getByRole('button', { name: 'Discard all' }));
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
    expect(screen.queryByText('staged: new')).toBeNull();
  });
});

describe('EnvironmentsTab: reordering', () => {
  it('moves a Ground environment from its row menu, stages the new order, and keeps Flight where it is', async () => {
    k8sOld();
    renderTab();
    await chooseAction('test', 'Move earlier');
    expect(panel().getByText('Change the promotion order')).toBeTruthy();
    expect(panel().getByText('test to dev to staging')).toBeTruthy();
    // order is now test, dev, then Flight: test is first (cannot go earlier), dev is the last Ground one
    // (cannot go later: a Ground environment never passes a Flight one), dev can still go earlier
    const disabled = (label: string) => menuItem(label)!.getAttribute('aria-disabled') === 'true';
    openMenu('test');
    expect(disabled('Move earlier')).toBe(true);
    expect(disabled('Move later')).toBe(false);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    openMenu('dev');
    expect(disabled('Move earlier')).toBe(false);
    expect(disabled('Move later')).toBe(true);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // Flight has no order controls yet
    openMenu('staging');
    expect(menuItem('Move earlier')).toBeNull();
  });

  const dragRow = (from: string, to: string) => {
    fireEvent.dragStart(screen.getByRole('img', { name: `Drag ${from} to reorder` }));
    fireEvent.dragOver(openRow(to));
    fireEvent.drop(openRow(to));
  };

  it('drags a Ground environment onto another and stages the same order change', () => {
    k8sOld();
    renderTab();
    dragRow('test', 'dev');
    expect(panel().getByText('test to dev to staging')).toBeTruthy();
  });

  it('does not let a Ground environment be dropped onto a Flight one', () => {
    k8sOld();
    renderTab();
    fireEvent.dragStart(screen.getByRole('img', { name: 'Drag dev to reorder' }));
    fireEvent.drop(openRow('staging'));
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
  });

  it('has no drag handle on a Flight environment', () => {
    k8sOld();
    renderTab();
    expect(screen.queryByRole('img', { name: 'Drag staging to reorder' })).toBeNull();
  });
});

describe('EnvironmentsTab: a cloud environment\'s own resource', () => {
  it('sets a function for one environment, shows the app-level value as the hint, and stages one line', () => {
    lambdaNew();
    renderTab();
    const testRow = screen.getAllByRole('row').find(r => within(r).queryByText('test'))!;
    fireEvent.click(testRow);
    const field = screen.getByLabelText(/^functionName/) as HTMLInputElement;
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
    renderTab();
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
    renderTab();
    fireEvent.click(screen.getAllByRole('row').find(r => within(r).queryByText('test'))!);
    expect(screen.getByRole('tablist', { name: 'Values sections' })).toBeTruthy();
    expect(screen.queryByLabelText(/^functionName/)).toBeNull();
  });
});

describe('EnvironmentsTab: the result', () => {
  it('shows the opened pull request and clears what was staged when it is closed', async () => {
    k8sOld();
    renderTab();
    await stageAdd('qa');
    submitState = { loading: false, result: { prUrl: 'https://github.com/jfillman/air-traffic-api/pull/9', alreadyOpen: false } };
    rerenderTab();
    expect(screen.getByText(/pull\/9/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(resetMock).toHaveBeenCalled();
  });
});

describe('EnvironmentsTab: staging a Flight environment', () => {
  it('offers Flight for a Kubernetes app, asks for the cluster, and explains the two pull requests', () => {
    k8sOld();
    renderTab();
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
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    expect((screen.getByLabelText(/^Flight/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/no approval path for them/)).toBeTruthy();
  });

  it('will not stage a Flight environment without a cluster', () => {
    k8sOld();
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'prod' } });
    fireEvent.click(screen.getByLabelText(/^Flight/));
    expect(screen.getByText(/needs the cluster it runs on/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Stage environment' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists both pull requests in the order they open, and says which to merge first', async () => {
    k8sOld();
    renderTab();
    await stageFlight('prod', 'kind-prod');
    expect(panel().getByText('Add environment prod')).toBeTruthy();
    expect(panel().getByText('Pull requests this opens, in this order')).toBeTruthy();
    expect(panel().getByText('tenants repo')).toBeTruthy();
    expect(panel().getByText('ApplicationEnvironment request for prod')).toBeTruthy();
    expect(panel().getByText('jfillman/air-traffic-api')).toBeTruthy();
    expect(panel().getByText('1')).toBeTruthy(); // numbered in the order they open
    expect(panel().getByText('2')).toBeTruthy();
    expect(panel().getByText(/Merge that one before the cicd\.yaml change/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open pull requests' })).toBeTruthy();
    // a Flight environment goes at the end, after the existing Flight one
    const names = screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[1].textContent);
    expect(names).toEqual(['dev', 'test', 'staging', 'prodstaged: new']);
  });

  it('launches the ApplicationEnvironment request first, then submits cicd.yaml with the Flight entry', async () => {
    k8sOld();
    launchMock.mockResolvedValue({ status: 'done', prUrl: 'https://github.com/jfillman/gitops-cluster-dev-tenants/pull/42' });
    renderTab();
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
    renderTab();
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
    renderTab();
    await stageFlight('prod', 'kind-prod');
    fireEvent.click(screen.getByRole('button', { name: 'Open pull requests' }));
    // the request opened, then cicd.yaml failed: both facts are shown
    expect(await screen.findByText(/GitHub is unavailable/)).toBeTruthy();
    expect(screen.getByText(/pull\/42/)).toBeTruthy();
    expect(screen.getByText(/will not be opened again/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    rerenderTab();
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
    renderTab();
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

describe('EnvironmentsTab: removing a Ground environment', () => {
  const confirmRemove = async (name: string) => {
    openMenu(name);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove…' }));
    fireEvent.change(screen.getByLabelText(`Type ${name} to confirm`), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: 'Stage removal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  };

  it('previews the impact, needs the name typed, and only then stages the removal', () => {
    k8sOld();
    renderTab();
    openMenu('test');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove…' }));
    expect(screen.getByText('platform/envs/test.yaml')).toBeTruthy();
    expect(screen.getByText('app-air-traffic-api-test')).toBeTruthy();
    const stage = screen.getByRole('button', { name: 'Stage removal' }) as HTMLButtonElement;
    expect(stage.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type test to confirm'), { target: { value: 'tes' } });
    expect(stage.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type test to confirm'), { target: { value: 'test' } });
    expect(stage.disabled).toBe(false);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('submits the cicd.yaml change together with the files to delete', async () => {
    k8sOld();
    renderTab();
    await confirmRemove('test');
    expect(panel().getByText('Remove environment test')).toBeTruthy();
    fireEvent.click(panel().getByRole('button', { name: 'Open pull request' }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const req = submitMock.mock.calls[0][0];
    expect(req.patch.deploy.environments.map((e: any) => e.name)).toEqual(['dev', 'staging']);
    expect(req.deleteFiles).toEqual([
      'platform/envs/test.yaml',
      'platform/envs/test.release.yaml',
      'glidepath/envs/test.yaml',
      'glidepath/envs/test.release.yaml',
    ]);
  });

  it('refuses while a pipeline step still names the environment', () => {
    k8sOld();
    cicdData.values.pipelines = { ci: { steps: [{ stage: 'deploy', env: 'test' }] } };
    renderTab();
    openMenu('test');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove…' }));
    expect(screen.getByText(/Pipeline "ci" still has a step for test/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Stage removal' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText('Type test to confirm')).toBeNull();
  });

  it('sends no files for a cloud app and says the cloud resource is kept', async () => {
    lambdaNew();
    renderTab();
    await confirmRemove('test');
    expect(panel().getByText(/not deleted/)).toBeTruthy();
    fireEvent.click(panel().getByRole('button', { name: 'Open pull request' }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0][0].deleteFiles).toBeUndefined();
  });

  it('removing an environment that is only staged just un-stages it', async () => {
    k8sOld();
    renderTab();
    await stageAdd('qa');
    expect(panel().getByText('Add environment qa')).toBeTruthy();
    await confirmRemove('qa');
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
  });

  it('offers no Remove for a Flight environment and shows the manual steps in its Danger zone', () => {
    k8sOld();
    renderTab();
    openMenu('staging');
    expect(menuItem('Remove…')).toBeNull();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.click(openRow('staging'));
    fireEvent.click(screen.getByRole('tab', { name: 'Danger zone' }));
    expect(screen.getByText('Removing a Flight environment')).toBeTruthy();
    expect(screen.getByText('tenants/air-traffic-api/staging/')).toBeTruthy();
    expect(screen.getByText('kind-prod/staging/')).toBeTruthy();
  });
});

describe('EnvironmentsTab: the values of a Ground environment', () => {
  const replicas = () => screen.getByLabelText('Replicas') as HTMLInputElement;

  it('shows the values form of the environment in its row, in sub-tabs, with its own pending-changes panel', () => {
    k8sOld();
    renderTab();
    fireEvent.click(openRow('test'));
    const tabs = within(screen.getByRole('tablist', { name: 'Values sections' })).getAllByRole('tab').map(t => t.textContent);
    expect(tabs).toEqual(['Workload', 'Release', 'Networking', 'Config', 'Access', 'Advanced']);
    expect(replicas().value).toBe('1');
    expect(screen.getByRole('region', { name: 'Pending changes to the values of TEST' })).toBeTruthy();
  });

  it('stages a field edit in the values panel, not in the page panel, and opens a PR for that file only', async () => {
    k8sOld();
    renderTab();
    fireEvent.click(openRow('test'));
    fireEvent.change(replicas(), { target: { value: '3' } });
    expect(panel().getByText(/Nothing staged/)).toBeTruthy(); // the page-level panel is for cicd.yaml
    const values = within(screen.getByRole('region', { name: 'Pending changes to the values of TEST' }));
    expect(values.getByText(/rollout:/)).toBeTruthy();
    fireEvent.click(values.getByRole('button', { name: 'Open pull request' }));
    await waitFor(() => expect(platformSubmitMock).toHaveBeenCalledTimes(1));
    const req = platformSubmitMock.mock.calls[0][0];
    expect(req).toMatchObject({ owner: 'jfillman', appName: 'air-traffic-api', selector: { kind: 'env', env: 'test' } });
    expect(req.patch.rollout.replicas).toBe(3);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('marks the sub-tab that holds a change', () => {
    k8sOld();
    renderTab();
    fireEvent.click(openRow('test'));
    fireEvent.change(replicas(), { target: { value: '3' } });
    expect(within(screen.getByRole('tab', { name: /Workload/ })).getByRole('img', { name: 'has staged changes' })).toBeTruthy();
    expect(within(screen.getByRole('tab', { name: /Networking/ })).queryByRole('img')).toBeNull();
  });

  it('does not offer the values form for an environment that is only staged (its file does not exist yet)', async () => {
    k8sOld();
    renderTab();
    await stageAdd('qa');
    fireEvent.click(openRow('qa'));
    expect(screen.getByText(/is created by a\s+second pull request/)).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Values sections' })).toBeNull();
  });

  it('shows a Flight environment\'s values form and its catalog resource and configmap files under Settings', () => {
    k8sOld();
    renderTab();
    fireEvent.click(openRow('staging'));
    expect(screen.getByRole('tablist', { name: 'Values sections' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getAllByText(/configMapGenerator/i).length).toBeGreaterThan(0);
  });
});

describe('EnvironmentsTab: a release step for a new Flight environment', () => {
  const withPipeline = () => {
    k8sOld();
    cicdData.values.pipelines = {
      ci: { trigger: { branch: 'main' }, steps: [{ stage: 'build' }, { stage: 'deploy', env: 'dev' }, { stage: 'release', env: 'staging' }] },
    };
  };

  it('is offered on, and staged as its own line in the panel', async () => {
    withPipeline();
    renderTab();
    await stageFlight('prod', 'kind-prod');
    expect(panel().getByText('Add a release step for prod')).toBeTruthy();
    expect(panel().getByText(/pipeline ci, after the step for staging/)).toBeTruthy();
  });

  it('sends the pipelines change in the same cicd.yaml patch', async () => {
    withPipeline();
    launchMock.mockResolvedValue({ status: 'done', prUrl: 'https://github.com/o/tenants/pull/1' });
    renderTab();
    await stageFlight('prod', 'kind-prod');
    fireEvent.click(panel().getByRole('button', { name: 'Open pull requests' }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const req = submitMock.mock.calls[0][0];
    expect(req.patch.pipelines.ci.steps.at(-1)).toEqual({ stage: 'release', env: 'prod' });
    expect(req.summary).toContain('Add a release step for prod');
  });

  it('adds no step, and no pipelines change, when it is switched off', async () => {
    withPipeline();
    launchMock.mockResolvedValue({ status: 'done', prUrl: 'https://github.com/o/tenants/pull/1' });
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'prod' } });
    fireEvent.click(screen.getByLabelText(/^Flight/));
    fireEvent.change(screen.getByLabelText('Cluster'), { target: { value: 'kind-prod' } });
    fireEvent.click(screen.getByLabelText('Also add a release step for it to the pipeline'));
    fireEvent.click(screen.getByRole('button', { name: 'Stage environment' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(panel().queryByText('Add a release step for prod')).toBeNull();
    fireEvent.click(panel().getByRole('button', { name: 'Open pull requests' }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0][0].patch.pipelines).toBeUndefined();
  });

  it('says so when there is no pipeline to add it to, and still opens the environment change', async () => {
    k8sOld();
    renderTab();
    await stageFlight('prod', 'kind-prod');
    expect(panel().getByText(/No release step added for prod/)).toBeTruthy();
    expect(panel().queryByText('Add a release step for prod')).toBeNull();
  });

  it('is not offered for a Ground environment', () => {
    withPipeline();
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Add environment' }));
    expect(screen.queryByLabelText('Also add a release step for it to the pipeline')).toBeNull();
  });

  it('un-staging the environment drops its release step too', async () => {
    withPipeline();
    renderTab();
    await stageFlight('prod', 'kind-prod');
    fireEvent.click(panel().getByRole('button', { name: 'Discard all' }));
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
  });
});

describe('EnvironmentsTab: the table', () => {
  it('filters by tier and by cloud, with counts', () => {
    k8sOld();
    renderTab();
    const names = () => screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[1].textContent);
    const filter = within(screen.getByRole('group', { name: 'Filter environments' }));
    expect(filter.getByRole('button', { name: 'All 3' })).toBeTruthy();
    expect(filter.getByRole('button', { name: 'Ground 2' })).toBeTruthy();
    expect(filter.getByRole('button', { name: 'Flight 1' })).toBeTruthy();
    expect(filter.getByRole('button', { name: 'Cloud 0' })).toBeTruthy();
    fireEvent.click(filter.getByRole('button', { name: 'Flight 1' }));
    expect(names()).toEqual(['staging']);
    fireEvent.click(filter.getByRole('button', { name: 'Ground 2' }));
    expect(names()).toEqual(['dev', 'test']);
    fireEvent.click(filter.getByRole('button', { name: 'Cloud 0' }));
    expect(screen.getByText('No environments match this filter.')).toBeTruthy();
  });

  it('counts every row of a cloud app as cloud', () => {
    lambdaNew();
    renderTab();
    expect(screen.getByRole('button', { name: 'Cloud 2' })).toBeTruthy();
  });

  it('keeps a removed environment in its place, struck through, and can undo it', async () => {
    k8sOld();
    renderTab();
    await confirmRemoveFromMenu('test');
    const names = screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[1].textContent);
    expect(names).toEqual(['dev', 'teststaged: remove', 'staging']);
    await chooseAction('test', 'Undo removal');
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
    expect(screen.queryByText('staged: remove')).toBeNull();
  });

  it('shows the four sections of a row and starts a cloud environment on Settings, a Kubernetes one on Values', () => {
    lambdaNew();
    renderTab();
    fireEvent.click(openRow('test'));
    const tabs = within(screen.getByRole('tablist', { name: 'test sections' })).getAllByRole('tab').map(t => t.textContent);
    expect(tabs).toEqual(['Settings', 'Values', 'Promotion', 'Danger zone']);
    expect(screen.getByRole('tab', { name: 'Settings' }).getAttribute('aria-selected')).toBe('true');
  });

  it('says in Promotion whether a pipeline step reaches the environment', () => {
    k8sOld();
    cicdData.values.pipelines = { ci: { steps: [{ stage: 'deploy', env: 'dev' }, { stage: 'release', env: 'staging' }] } };
    renderTab();
    fireEvent.click(openRow('dev'));
    fireEvent.click(screen.getByRole('tab', { name: 'Promotion' }));
    expect(screen.getByText(/Deploy step in pipeline "ci"/)).toBeTruthy();
    fireEvent.click(openRow('test'));
    fireEvent.click(screen.getByRole('tab', { name: 'Promotion' }));
    expect(screen.getByText(/No pipeline step deploys to test/)).toBeTruthy();
  });

  it('tags each cloud field with where its value comes from', () => {
    lambdaNew();
    cicdData.values.deploy.environments[1].lambda = { functionName: 'app-fn-test' };
    renderTab();
    fireEvent.click(openRow('test'));
    expect(within(screen.getByText('functionName').closest('label')!).getByText('set here')).toBeTruthy();
    expect(within(screen.getByText('region').closest('label')!).getByText('app-level')).toBeTruthy();
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigTab } from './ConfigTab';

const selectors: any[] = [];
const files: Record<string, any> = {
  base: { loading: false, data: { values: { rollout: { replicas: 1 } }, raw: 'rollout:\n  replicas: 1\n', path: 'glidepath/base.yaml' } },
  'pr-env': { loading: false, data: { values: { rollout: { replicas: 2 } }, raw: 'rollout:\n  replicas: 2\n', path: 'glidepath/pr-env.yaml' } },
};
jest.mock('../useReleaseContext', () => ({ useReleaseContext: () => ({ owner: 'o', appName: 'boarding-api', loading: false }) }));
jest.mock('../values/annotatedValues', () => ({ ...jest.requireActual('../values/annotatedValues'), useChartValues: () => undefined }));
jest.mock('../values/componentCatalog', () => ({ ...jest.requireActual('../values/componentCatalog'), useComponentCatalog: () => undefined }));
const DEFAULT_DEPLOY = { environments: [{ name: 'dev', tier: 'ground' }, { name: 'staging', tier: 'flight', cluster: 'kind-prod' }, { name: 'prod', tier: 'flight', cluster: 'kind-prod' }] };
let deploy: any = DEFAULT_DEPLOY;
const flightTargets: any[] = [];
const submitFlight = jest.fn();
jest.mock('../useConfigData', () => ({
  useCicdConfig: () => ({ loading: false, data: { values: { deploy } } }),
  useFlightBase: (target: any) => {
    flightTargets.push(target);
    return { loading: false, data: { values: { rollout: { replicas: 3 } }, raw: 'rollout:\n  replicas: 3\n', path: 'kind-prod/base.yaml' } };
  },
  useSubmitFlightBase: () => ({ loading: false, submit: submitFlight, reset: jest.fn() }),
  usePlatformFile: (target: any) => {
    selectors.push(target.selector);
    return files[target.selector.kind];
  },
  useSubmitPlatformFileChange: () => ({ loading: false, submit: jest.fn(), reset: jest.fn() }),
  useValuesSchema: () => ({ loading: false, data: undefined }),
}));

const renderTab = (url = '/tower?tab=config') => render(<MemoryRouter initialEntries={[url]}><ConfigTab /></MemoryRouter>);

const sectionTabs = () => within(screen.getByRole('tablist', { name: 'App configuration sections' })).getAllByRole('tab').map(t => t.textContent);

describe('App Configuration', () => {
  beforeEach(() => {
    deploy = DEFAULT_DEPLOY;
  });

  it('has Ground shared values, Flight shared values per cluster and Preview environments, each with the values form', () => {
    renderTab();
    expect(sectionTabs()).toEqual(['Ground shared values', 'Flight shared values', 'Preview environments']);
    expect(screen.getByText('glidepath/base.yaml')).toBeTruthy();
    expect(selectors[selectors.length - 1]).toEqual({ kind: 'base' });
    expect((screen.getByRole('spinbutton', { name: /^Replicas$/ }) as HTMLInputElement).value).toBe('1');
    fireEvent.click(screen.getByRole('tab', { name: 'Preview environments' }));
    expect(selectors[selectors.length - 1]).toEqual({ kind: 'pr-env' });
    expect((screen.getByRole('spinbutton', { name: /^Replicas$/ }) as HTMLInputElement).value).toBe('2');
    fireEvent.click(screen.getByRole('tab', { name: 'Flight shared values' }));
    expect(flightTargets[flightTargets.length - 1]).toEqual({ owner: 'o', appName: 'boarding-api', cluster: 'kind-prod' });
    expect(screen.getByText('gitops-boarding-api/kind-prod/base.yaml')).toBeTruthy();
    expect((screen.getByRole('spinbutton', { name: /^Replicas$/ }) as HTMLInputElement).value).toBe('3');
  });

  it('names each cluster when Flight environments span several', () => {
    deploy = { environments: [{ name: 'staging', tier: 'flight', cluster: 'kind-prod' }, { name: 'eu', tier: 'flight', cluster: 'kind-eu' }] };
    renderTab();
    expect(sectionTabs()).toEqual([
      'Ground shared values',
      'Flight shared values (kind-prod)',
      'Flight shared values (kind-eu)',
      'Preview environments',
    ]);
  });

  it('edits shared values as raw YAML for an app on its own chart, but keeps the form for the preview template', () => {
    deploy = { chart: { repoURL: 'https://github.com/o/charts.git', path: 'web', targetRevision: 'v1' }, environments: [{ name: 'prod', tier: 'flight', cluster: 'kind-prod' }] };
    renderTab();
    expect(screen.queryByRole('spinbutton', { name: /^Replicas$/ })).toBeNull();
    expect(screen.getByText(/github.com\/o\/charts.git web@v1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Flight shared values' }));
    expect(screen.queryByRole('spinbutton', { name: /^Replicas$/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Preview environments' }));
    expect((screen.getByRole('spinbutton', { name: /^Replicas$/ }) as HTMLInputElement).value).toBe('2');
  });

  it('has the Pending changes panel of the form, and points to the Environments tab for an environment\'s own values', () => {
    renderTab('/tower?tab=config&env=staging');
    expect(screen.getByRole('region', { name: /Pending changes to the values/ })).toBeTruthy();
    expect(screen.getByText(/staging's own values moved/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Environments tab' })).toBeTruthy();
  });
});

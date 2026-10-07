import { fireEvent, render, screen } from '@testing-library/react';
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
jest.mock('../useConfigData', () => ({
  
  usePlatformFile: (target: any) => {
    selectors.push(target.selector);
    return files[target.selector.kind];
  },
  useSubmitPlatformFileChange: () => ({ loading: false, submit: jest.fn(), reset: jest.fn() }),
  useValuesSchema: () => ({ loading: false, data: undefined }),
}));

const renderTab = (url = '/tower?tab=config') => render(<MemoryRouter initialEntries={[url]}><ConfigTab /></MemoryRouter>);

describe('App Configuration', () => {
  it('has Shared values (glidepath/base.yaml) and Preview environments (glidepath/pr-env.yaml), each with the values form', () => {
    renderTab();
    expect(screen.getAllByRole('tab', { name: /^(Shared values|Preview environments)$/ }).map(t => t.textContent)).toEqual(['Shared values', 'Preview environments']);
    expect(screen.getByText('glidepath/base.yaml')).toBeTruthy();
    expect(selectors[selectors.length - 1]).toEqual({ kind: 'base' });
    expect((screen.getByRole('spinbutton', { name: /^Replicas$/ }) as HTMLInputElement).value).toBe('1');
    fireEvent.click(screen.getByRole('tab', { name: 'Preview environments' }));
    expect(selectors[selectors.length - 1]).toEqual({ kind: 'pr-env' });
    expect((screen.getByRole('spinbutton', { name: /^Replicas$/ }) as HTMLInputElement).value).toBe('2');
  });

  it('has the Pending changes panel of the form, and points to the Environments tab for an environment\'s own values', () => {
    renderTab('/tower?tab=config&env=staging');
    expect(screen.getByRole('region', { name: /Pending changes to the values/ })).toBeTruthy();
    expect(screen.getByText(/staging's own values moved/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Environments tab' })).toBeTruthy();
  });
});

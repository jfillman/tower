import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { ConfigureTab } from './ConfigureTab';

let mockEntity: Record<string, unknown> = {};
jest.mock('@backstage/plugin-catalog-react', () => ({ useEntity: () => ({ entity: mockEntity }) }));
jest.mock('./EnvironmentsTab', () => ({ EnvironmentsTab: () => <div>environments body</div> }));
jest.mock('./ConfigTab', () => ({ ConfigTab: () => <div>shared values body</div> }));
jest.mock('./GlidepathTab', () => ({
  GlidepathTab: () => {
    // stands in for a PendingPanel holding two staged lines
    jest.requireActual('../configure/stagedScope').useReportStaged(2);
    return <div>pipeline body</div>;
  },
}));
jest.mock('../configure/useSettingFiles', () => ({
  useSettingFiles: () => ({ available: true, loading: false, failed: 0, started: false, files: mockFiles }),
}));
let mockFiles: unknown[] = [];

const k8sApp = { apiVersion: 'backstage.io/v1alpha1', kind: 'Component', metadata: { name: 'svc', tags: ['kind:goapplication'] }, spec: {} };
const lambda = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'fn', annotations: { 'hangar.io/service-class': 'function', 'hangar.io/deploy-target': 'aws-lambda' } },
  spec: {},
};

function Tab() {
  const [params] = useSearchParams();
  return (
    <>
      <ConfigureTab />
      <output data-testid="tab">{params.get('tab')}</output>
      <output data-testid="row">{params.get('row')}</output>
    </>
  );
}
const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Tab />
    </MemoryRouter>,
  );

describe('ConfigureTab (2026-10-22: Environments, App Configuration and Glidepath in one tab)', () => {
  it('opens the sub-tab an old link names, and switches by setting ?tab= to the old id', () => {
    mockEntity = k8sApp;
    renderAt('/?tab=glidepath');
    expect(screen.getByText('pipeline body')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Shared values (base.yaml)' }));
    expect(screen.getByText('shared values body')).toBeTruthy();
    expect(screen.getByTestId('tab').textContent).toBe('config');
  });

  it('starts on Environments for ?tab=configure', () => {
    mockEntity = k8sApp;
    renderAt('/?tab=configure');
    expect(screen.getByText('environments body')).toBeTruthy();
  });

  it('offers no Shared values to a cloud target, and an old link to it falls back to Environments', () => {
    mockEntity = lambda;
    renderAt('/?tab=config');
    expect(screen.queryByRole('tab', { name: /Shared values/ })).toBeNull();
    expect(screen.getByText('environments body')).toBeTruthy();
  });
});

describe('ConfigureTab: staged changes survive switching sub-tabs', () => {
  it('keeps a visited sub-tab mounted, marks it, and names it while you work elsewhere', () => {
    mockEntity = k8sApp;
    renderAt('/?tab=glidepath');
    fireEvent.click(screen.getByRole('tab', { name: 'Environments' }));
    expect(screen.getByText('environments body')).toBeTruthy();
    expect(screen.getByText('pipeline body')).toBeTruthy(); // still mounted, hidden
    expect(screen.getByText(/Staged and not yet opened in Pipeline \(cicd\.yaml\) \(2\)/)).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Pipeline/ }).querySelector('[aria-label="has staged changes"]')).toBeTruthy();
  });
});

describe('ConfigureTab: Find a setting', () => {
  it('lists every file that sets a key and opens the environment row that edits it', () => {
    mockEntity = k8sApp;
    mockFiles = [
      { subtab: 'environments', env: 'prod', label: 'prod values', path: 'gitops-svc/hangar-prod/prod.yaml', values: { rollout: { replicas: 4 } } },
      { subtab: 'config', label: 'Ground shared values', path: 'glidepath/base.yaml', values: { rollout: { replicas: 2 } } },
      { subtab: 'glidepath', label: 'cicd.yaml', path: 'cicd.yaml', values: { build: { cache: true } } },
    ];
    renderAt('/?tab=configure');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a setting' }), { target: { value: 'replicas' } });
    fireEvent.focus(screen.getByRole('searchbox', { name: 'Find a setting' }));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain('rollout.replicas');
    fireEvent.click(screen.getByRole('option', { name: /prod values/ }));
    expect(screen.getByTestId('tab').textContent).toBe('environments');
    expect(screen.getByTestId('row').textContent).toBe('prod');
  });
});

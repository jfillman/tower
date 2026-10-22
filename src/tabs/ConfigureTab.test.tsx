import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { ConfigureTab } from './ConfigureTab';

let mockEntity: Record<string, unknown> = {};
jest.mock('@backstage/plugin-catalog-react', () => ({ useEntity: () => ({ entity: mockEntity }) }));
jest.mock('./EnvironmentsTab', () => ({ EnvironmentsTab: () => <div>environments body</div> }));
jest.mock('./ConfigTab', () => ({ ConfigTab: () => <div>shared values body</div> }));
jest.mock('./GlidepathTab', () => ({ GlidepathTab: () => <div>pipeline body</div> }));

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

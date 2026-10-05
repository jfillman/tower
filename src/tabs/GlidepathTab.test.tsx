import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GlidepathTab, buildCandidateValues, buildFormFromValues } from './GlidepathTab';

const submit = jest.fn();
// A complete file, as a real one is: the form writes every field it has, so a sparse file would read as changed.
const sparse: any = {
      build: { agent: 'nodejs-20' },
      deploy: { lowerEnvironments: ['dev'], upperEnvironments: [{ name: 'staging', cluster: 'kind-prod' }] },
      governance: { sast: true },
};
const cicd = { loading: false, data: { values: buildCandidateValues(buildFormFromValues(sparse), sparse), raw: 'build:\n  agent: nodejs-20\n', path: 'cicd.yaml' } };
jest.mock('../useReleaseContext', () => ({ useReleaseContext: () => ({ owner: 'o', appName: 'boarding-api', loading: false }) }));
jest.mock('../useConfigData', () => ({
  useCicdConfig: () => cicd,
  useSubmitCicdConfigChange: () => ({ loading: false, submit, reset: jest.fn() }),
}));

const renderTab = () => render(<MemoryRouter><GlidepathTab /></MemoryRouter>);
const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));
const pending = () => within(screen.getByRole('region', { name: 'Pending changes to cicd.yaml' }));

beforeEach(() => submit.mockClear());

describe('Glidepath tab', () => {
  it('has the settings in sub-tabs, one section each, and no Platform files section', () => {
    renderTab();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual([
      'Build', 'Test', 'Deploy', 'Preview environments', 'Governance', 'Notifications', 'Secrets', 'Pipelines', 'Advanced',
    ]);
    expect(screen.getByText('Build', { selector: 'p' })).toBeTruthy();
    expect(screen.queryByText('Governance', { selector: 'p' })).toBeNull();
    tab('Governance');
    expect(screen.getByText('Governance', { selector: 'p' })).toBeTruthy();
    expect(screen.queryByText('Build', { selector: 'p' })).toBeNull();
    expect(screen.queryByText('Platform files')).toBeNull();
  });

  it('starts with nothing staged, then lists a change, marks its sub-tab and opens one pull request for cicd.yaml', () => {
    renderTab();
    expect(pending().getByText(/Nothing staged/)).toBeTruthy();
    tab('Governance');
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(pending().getByText('Update governance')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Governance/ }).querySelector('[aria-label="has staged changes"]')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Build/ }).querySelector('[aria-label="has staged changes"]')).toBeNull();
    fireEvent.click(pending().getByRole('button', { name: 'Open pull request' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(Object.keys(submit.mock.calls[0][0].patch)).toEqual(['governance']);
  });

  it('discards what is staged, in every sub-tab', () => {
    renderTab();
    tab('Governance');
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(pending().getByRole('button', { name: 'Discard all' }));
    expect(pending().getByText(/Nothing staged/)).toBeTruthy();
  });

  it('shows the committed file read only under Advanced', () => {
    renderTab();
    tab('Advanced');
    expect(screen.getByText(/agent: nodejs-20/)).toBeTruthy();
  });
});

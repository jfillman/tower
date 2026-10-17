import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BUILD_AGENTS, GlidepathTab, agentOptions, buildCandidateValues, buildFormFromValues } from './GlidepathTab';

const submit = jest.fn();
// A complete file, as a real one is: the form writes every field it has, so a sparse file would read as changed.
const sparse: any = {
      build: { agent: 'nodejs-20' },
      deploy: { environments: [{ name: 'dev', tier: 'ground' }, { name: 'staging', tier: 'flight', cluster: 'example-prod' }] },
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

describe('build agent', () => {
  it('keeps the file\'s agent, known or not, instead of turning it into nodejs-20', () => {
    for (const agent of ['go-1.23', 'python-3.13', 'go-1.24', 'go-1.99']) {
      const values: any = { ...sparse, build: { agent } };
      expect(buildFormFromValues(values).buildAgent).toBe(agent);
      expect((buildCandidateValues(buildFormFromValues(values), values) as any).build.agent).toBe(agent);
    }
  });
  it('offers every agent Glidepath\'s schema allows, plus an unknown current one', () => {
    expect(BUILD_AGENTS).toEqual(expect.arrayContaining(['go-1.22', 'go-1.23', 'go-1.24', 'python-3.12', 'python-3.13']));
    expect(agentOptions('go-1.23')).toEqual([...BUILD_AGENTS]);
    expect(agentOptions('go-1.99')).toEqual([...BUILD_AGENTS, 'go-1.99']);
  });
});

describe('Glidepath tab', () => {
  it('has the settings in sub-tabs, one section each, and no Platform files section', () => {
    renderTab();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual([
      'Build', 'Test', 'Deploy', 'Preview environments', 'Governance', 'Notifications', 'Secrets', 'Pipelines', 'Advanced',
    ]);
    expect(screen.getByText('Build', { selector: 'h2' })).toBeTruthy();
    expect(screen.queryByText('Governance', { selector: 'h2' })).toBeNull();
    tab('Governance');
    expect(screen.getByText('Governance', { selector: 'h2' })).toBeTruthy();
    expect(screen.queryByText('Build', { selector: 'h2' })).toBeNull();
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
    // YamlBlock colours a line in pieces: match on the whole line's text.
    const lines = Array.from(document.querySelectorAll('[data-yaml-line]')).map(e => e.textContent);
    expect(lines).toContain('  agent: nodejs-20');
  });
});

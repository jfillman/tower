import { fireEvent, render, screen, within } from '@testing-library/react';
import { ConfigEditor } from './ValuesForm';
import type { ValuesSource } from './sources';

jest.mock('@backstage/core-components', () => ({
  Progress: () => <div>loading</div>,
  ResponseErrorPanel: ({ error }: { error: Error }) => <div>{String(error)}</div>,
}));
jest.mock('../useConfigData', () => ({ useValuesSchema: () => ({ loading: false, data: undefined }) }));

const submit = jest.fn(async () => undefined);
const resetSubmit = jest.fn();
const refresh = jest.fn();

// A stable object, as the real hooks' state is: the form re-initialises whenever the data object changes.
const data = {
  values: {
    rollout: { replicas: 2, ports: [{ name: 'http', containerPort: 8080 }] },
    autoscaling: { enabled: false, min: 1, max: 3, targetCPUPercent: 70 },
    ingress: { enabled: false },
    env: [{ name: 'LOG_LEVEL', value: 'info' }],
  },
  raw: 'rollout:\n  replicas: 2\n',
  path: 'platform/envs/test.yaml',
};

const source = (over: Partial<ValuesSource> = {}): ValuesSource => ({
  loading: false,
  data,
  refresh,
  submit,
  submitting: false,
  resetSubmit,
  ...over,
});

const renderForm = (src: ValuesSource = source(), layout: 'side' | 'inline' = 'side') =>
  render(<ConfigEditor owner="o" appName="app" source={src} title="TEST" layout={layout} />);

const panel = () => within(screen.getByRole('region', { name: /Pending changes to the values of TEST/, hidden: true }));
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  submit.mockClear();
  resetSubmit.mockClear();
});

describe('values form sub-tabs', () => {
  it('shows only the sections of the selected sub-tab', () => {
    renderForm();
    expect(screen.getByRole('heading', { name: 'Scaling' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Networking' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Environment variables' })).toBeNull();
    fireEvent.click(tab('Networking'));
    expect(screen.getByRole('heading', { name: 'Networking' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Scaling' })).toBeNull();
    fireEvent.click(tab('Config'));
    expect(screen.getByRole('heading', { name: 'Environment variables' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Config maps' })).toBeTruthy();
    fireEvent.click(tab('Access'));
    expect(screen.getByRole('heading', { name: 'Service account' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Secrets' })).toBeTruthy();
  });

  it('puts every raw YAML block in exactly one sub-tab', () => {
    renderForm();
    const where: Record<string, string> = {};
    for (const id of ['Workload', 'Release', 'Networking', 'Config', 'Components', 'Access', 'Advanced']) {
      fireEvent.click(tab(id));
      for (const title of ['Pod template', 'Rollout strategy', 'Custom AnalysisTemplates', 'SLOs', 'Volumes (PVCs)', 'Attached components (YAML)', 'Cron jobs', 'One-off jobs', 'Extra manifests']) {
        if (screen.queryByRole('heading', { name: title })) {
          expect(where[title]).toBeUndefined();
          where[title] = id;
        }
      }
    }
    expect(where).toEqual({
      'Pod template': 'Workload',
      'Rollout strategy': 'Release',
      'Custom AnalysisTemplates': 'Release',
      SLOs: 'Release',
      'Volumes (PVCs)': 'Config',
      'Attached components (YAML)': 'Components',
      'Cron jobs': 'Advanced',
      'One-off jobs': 'Advanced',
      'Extra manifests': 'Advanced',
    });
  });

  it('marks the sub-tab with a change, and only that one', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Replicas'), { target: { value: '5' } });
    expect(within(tab('Workload')).getByRole('img', { name: 'has staged changes' })).toBeTruthy();
    for (const id of ['Release', 'Networking', 'Config', 'Components', 'Access', 'Advanced']) expect(within(tab(id)).queryByRole('img')).toBeNull();
  });
});

describe('values form pending changes', () => {
  it('starts empty with the submit button not offered', () => {
    renderForm();
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
    expect(panel().queryByRole('button', { name: 'Open pull request' })).toBeNull();
  });

  it('lists a change as a readable line and submits the patch and those lines', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Replicas'), { target: { value: '5' } });
    expect(panel().getByText(/rollout: replicas\/resources\/probes\/steps/)).toBeTruthy();
    fireEvent.click(panel().getByRole('button', { name: 'Open pull request' }));
    expect(submit).toHaveBeenCalledTimes(1);
    const [patch, summary] = submit.mock.calls[0] as unknown as [{ rollout: { replicas: number } }, string[]];
    expect(patch.rollout.replicas).toBe(5);
    expect(summary.some(l => l.startsWith('rollout:'))).toBe(true);
  });

  it('lists a change made in another sub-tab alongside the first', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Replicas'), { target: { value: '5' } });
    fireEvent.click(tab('Networking'));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(panel().getByText(/^httpRoute: enabled/)).toBeTruthy();
    // a structural problem in the new change is listed too, and blocks the pull request
    expect(panel().getByText(/HTTPRoute is enabled but has no hostnames set/)).toBeTruthy();
    expect(panel().getByText(/^rollout:/)).toBeTruthy();
  });

  it('discards every staged change, in every sub-tab', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Replicas'), { target: { value: '5' } });
    fireEvent.click(panel().getByRole('button', { name: 'Discard all' }));
    expect((screen.getByLabelText('Replicas') as HTMLInputElement).value).toBe('2');
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
    expect(within(tab('Workload')).queryByRole('img')).toBeNull();
  });

  it('reverting a value by hand clears it, as it never staged it', () => {
    renderForm();
    const replicas = screen.getByLabelText('Replicas');
    fireEvent.change(replicas, { target: { value: '5' } });
    fireEvent.change(replicas, { target: { value: '2' } });
    expect(panel().getByText(/Nothing staged/)).toBeTruthy();
  });

  it('blocks the pull request while a YAML block is invalid, and says which', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Replicas'), { target: { value: '5' } });
    const textarea = screen.getAllByRole('textbox').find(t => t.tagName === 'TEXTAREA') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'a: [' } });
    expect(panel().getByText(/Pod template: fix the YAML syntax error/)).toBeTruthy();
    expect((panel().getByRole('button', { name: 'Open pull request' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the file the pull request is for, and the pull request once opened', () => {
    renderForm(source({ result: { prUrl: 'https://github.com/o/app/pull/9', alreadyOpen: false } }));
    fireEvent.change(screen.getByLabelText('Replicas'), { target: { value: '5' } });
    expect(panel().getByText(/platform\/envs\/test\.yaml\. This file has its own pull request/)).toBeTruthy();
    expect(panel().getByRole('link', { name: 'https://github.com/o/app/pull/9', hidden: true })).toBeTruthy();
  });

  it('disables the button while a submit is in flight', () => {
    renderForm(source({ submitting: true }));
    fireEvent.change(screen.getByLabelText('Replicas'), { target: { value: '5' } });
    expect((panel().getByRole('button', { name: 'Opening…' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('values form source', () => {
  it('shows a spinner while loading and the error when loading failed', () => {
    const { unmount } = renderForm(source({ loading: true, data: undefined }));
    expect(screen.queryByRole('tablist')).toBeNull();
    unmount();
    renderForm(source({ loading: false, data: undefined, error: 'boom' }));
    expect(screen.getByText(/boom/)).toBeTruthy();
  });

  it('refresh goes to the source', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the full committed YAML under Advanced', () => {
    renderForm();
    fireEvent.click(tab('Advanced'));
    fireEvent.click(screen.getByText(/View full committed YAML/));
    expect(screen.getByText(/replicas: 2/)).toBeTruthy();
  });
});

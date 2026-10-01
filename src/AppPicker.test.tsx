import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppPicker } from './AppPicker';

const entities = [
  { name: 'baggage-api', type: 'service' },
  { name: 'gate-assign-svc', type: 'service' },
  { name: 'ops-copilot', type: 'ai-agent' },
].map(e => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: e.name, namespace: 'default', description: `${e.name} description` },
  spec: { type: e.type, owner: 'team-a' },
}));

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: () => ({ getEntities: async () => ({ items: entities }) }),
}));
jest.mock('@backstage/plugin-kubernetes', () => ({ isKubernetesAvailable: () => true }));

const pressed = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) }).getAttribute('aria-pressed');

describe('AppPicker home', () => {
  beforeEach(() => localStorage.clear());

  it('filters by workload type and shows counts', async () => {
    render(<AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />);
    await screen.findByText('baggage-api');
    expect(screen.getByRole('button', { name: /^All\s*3$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Container apps\s*2$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^AI workloads\s*1$/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^AI workloads/ }));
    expect(screen.queryByText('baggage-api')).toBeNull();
    expect(screen.getByText('ops-copilot')).toBeTruthy();
  });

  it('keeps starred services visible through the filter and search, and persists stars', async () => {
    render(<AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />);
    await screen.findByText('baggage-api');
    fireEvent.click(screen.getByRole('button', { name: /^Star component:default\/baggage-api/ }));
    expect(JSON.parse(localStorage.getItem('tower.starredApps')!)).toEqual(['component:default/baggage-api']);

    fireEvent.click(screen.getByRole('button', { name: /^AI workloads/ }));
    expect(screen.getByText('baggage-api')).toBeTruthy(); // pinned despite the AI filter
    expect(screen.getByText('Starred')).toBeTruthy();
  });

  it('toggles cards and list and remembers the choice', async () => {
    const { unmount } = render(<AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />);
    await screen.findByText('baggage-api');
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(within(screen.getByRole('table')).getByText('gate-assign-svc')).toBeTruthy();
    expect(localStorage.getItem('tower.viewMode')).toBe('list');
    expect(pressed('List')).toBe('true');
    unmount();

    render(<AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
  });

  it('selects a service when its row is clicked', async () => {
    const onSelect = jest.fn();
    render(<AppPicker onSelect={onSelect} onOpenDashboard={jest.fn()} />);
    fireEvent.click(await screen.findByText('gate-assign-svc'));
    expect(onSelect).toHaveBeenCalledWith('component:default/gate-assign-svc');
  });
});

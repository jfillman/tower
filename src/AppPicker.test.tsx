import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppPicker } from './AppPicker';

const entities = [
  { name: 'baggage-api', type: 'service', tags: ['kind:nodejsapplication'] },
  { name: 'gate-assign-svc', type: 'service', tags: ['kind:goapplication'] },
  { name: 'gate-assign-svc-kind-prod-proofing', type: 'service', tags: ['kind:applicationenvironment'] },
  { name: 'ops-copilot', type: 'ai-agent', tags: [] },
].map(e => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: e.name, namespace: 'default', description: `${e.name} description`, tags: e.tags },
  spec: { type: e.type, owner: 'team-a' },
}));

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: () => ({ getEntities: async () => ({ items: entities }) }),
}));
const mockProvisioning = { items: [] as any[], loading: false };
jest.mock('./provisioning/useProvisioning', () => ({ useProvisioning: () => mockProvisioning }));
jest.mock('@backstage/plugin-kubernetes', () => ({ isKubernetesAvailable: () => true }));

const pressed = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) }).getAttribute('aria-pressed');

describe('AppPicker home', () => {
  beforeEach(() => {
    localStorage.clear();
    mockProvisioning.items = [];
  });

  it('filters by workload type and shows counts', async () => {
    render(
      <MemoryRouter>
        <AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />
      </MemoryRouter>,
    );
    await screen.findByText('baggage-api');
    expect(screen.getByRole('button', { name: /^All\s*3$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Container apps\s*2$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^AI workloads\s*1$/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^AI workloads/ }));
    expect(screen.queryByText('baggage-api')).toBeNull();
    expect(screen.getByText('ops-copilot')).toBeTruthy();
  });

  it('starred follows the workload filter but not the text search, and stars persist', async () => {
    render(
      <MemoryRouter>
        <AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />
      </MemoryRouter>,
    );
    await screen.findByText('baggage-api');
    fireEvent.click(screen.getByRole('button', { name: /^Star component:default\/baggage-api/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Star component:default\/ops-copilot/ }));
    expect(JSON.parse(localStorage.getItem('tower.starredApps')!).sort()).toEqual([
      'component:default/baggage-api',
      'component:default/ops-copilot',
    ]);
    expect(screen.getByText('Starred')).toBeTruthy();

    // A text search does not hide starred services.
    fireEvent.change(screen.getByPlaceholderText('Search services…'), { target: { value: 'gate' } });
    expect(screen.getByText('baggage-api')).toBeTruthy();
    expect(screen.getByText('ops-copilot')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search services…'), { target: { value: '' } });

    // The workload filter does: starred container apps leave the AI view.
    fireEvent.click(screen.getByRole('button', { name: /^AI workloads/ }));
    expect(screen.queryByText('baggage-api')).toBeNull();
    expect(screen.getByText('ops-copilot')).toBeTruthy();
  });

  it('toggles cards and list and remembers the choice', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />
      </MemoryRouter>,
    );
    await screen.findByText('baggage-api');
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(within(screen.getByRole('table')).getByText('gate-assign-svc')).toBeTruthy();
    expect(localStorage.getItem('tower.viewMode')).toBe('list');
    expect(pressed('List')).toBe('true');
    unmount();

    render(
      <MemoryRouter>
        <AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
  });

  it('hides application environments from the list and the counts', async () => {
    render(
      <MemoryRouter>
        <AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />
      </MemoryRouter>,
    );
    await screen.findByText('baggage-api');
    expect(screen.queryByText('gate-assign-svc-kind-prod-proofing')).toBeNull();
    expect(screen.getByRole('button', { name: /^All\s*3$/ })).toBeTruthy();
  });

  it('selects a service when its row is clicked', async () => {
    const onSelect = jest.fn();
    render(
      <MemoryRouter>
        <AppPicker onSelect={onSelect} onOpenDashboard={jest.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('gate-assign-svc'));
    expect(onSelect).toHaveBeenCalledWith('component:default/gate-assign-svc');
  });

  it('shows the in-flight strip and opens the Provisioning tab for a service', async () => {
    const created = Date.now() - 30000;
    mockProvisioning.items = [
      {
        xr: {
          kind: 'NodeJSApplication',
          name: 'fare-quote-api',
          namespace: 'x',
          cluster: 'kind-dev',
          createdAt: created,
          conditions: [],
        },
      },
    ];
    render(
      <MemoryRouter>
        <AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />
      </MemoryRouter>,
    );
    await screen.findByText('baggage-api');
    expect(screen.getByRole('region', { name: 'Provisioning in flight' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Provisioning\s*1/ })).toBeTruthy();

    fireEvent.click(within(screen.getByRole('region', { name: 'Provisioning in flight' })).getByText('fare-quote-api'));
    expect(await screen.findByText('Request accepted')).toBeTruthy();
    expect(screen.getByText('First build and checks')).toBeTruthy();
    expect(screen.queryByText('baggage-api')).toBeNull();
  });
});

describe('AppPicker with classes Tower has never heard of', () => {
  const extra = [
    { name: 'resize-fn', ann: { 'hangar.io/service-class': 'function', 'hangar.io/deploy-target': 'aws-lambda' } },
    { name: 'lake-raw', ann: { 'hangar.io/service-class': 'data-lake', 'hangar.io/deploy-target': 'aws-s3' } },
    { name: 'checkout-ecs', ann: { 'hangar.io/service-class': 'container-app', 'hangar.io/deploy-target': 'aws-ecs' } },
  ].map(e => ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: e.name, namespace: 'default', annotations: e.ann },
    spec: { type: 'service', owner: 'team-a' },
  }));

  beforeAll(() => {
    entities.push(...(extra as any[]));
  });
  afterAll(() => {
    entities.splice(entities.length - extra.length, extra.length);
  });
  beforeEach(() => localStorage.clear());

  it('builds a chip per class from the data and filters by where services run', async () => {
    render(
      <MemoryRouter>
        <AppPicker onSelect={jest.fn()} onOpenDashboard={jest.fn()} />
      </MemoryRouter>,
    );
    await screen.findByText('resize-fn');
    expect(screen.getByRole('button', { name: /^Functions\s*1$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Data lakes\s*1$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Container apps\s*3$/ })).toBeTruthy();

    // Second filter appears because services run on more than one provider.
    fireEvent.click(screen.getByRole('button', { name: /^AWS\s*3$/ }));
    expect(screen.queryByText('baggage-api')).toBeNull();
    expect(screen.getByText('resize-fn')).toBeTruthy();
    expect(screen.getByText('checkout-ecs')).toBeTruthy();

    // The two filters combine.
    fireEvent.click(screen.getByRole('button', { name: /^Container apps/ }));
    expect(screen.queryByText('resize-fn')).toBeNull();
    expect(screen.getByText('checkout-ecs')).toBeTruthy();
  });
});

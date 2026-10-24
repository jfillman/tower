import { fireEvent, render, screen } from '@testing-library/react';
import { AirspaceStrips } from './AirspaceStrips';
import { AirspaceRadar } from './AirspaceRadar';
import { MapView } from './MapView';
import { airspaceValuesOf, buildAppAirspace } from './model';
import { toServiceGraph } from './queries';

// hangar-dev's service graph on 2026-10-23, plus an undeclared caller.
const GRAPH = toServiceGraph(
  [
    { metric: { client: 'flight-api-dev', server: 'postgresql-rw', connection_type: 'database' }, value: 0.29 },
    { metric: { client: 'flight-api-dev', server: 'boarding-api-dev', connection_type: 'messaging_system' }, value: 0.03 },
    { metric: { client: 'user', server: 'flight-api-dev', connection_type: 'virtual_node' }, value: 0.18 },
    { metric: { client: 'checkin-api-dev', server: 'flight-api-dev', connection_type: '' }, value: 1.5 },
  ],
  [],
  [],
);
const VALUES = airspaceValuesOf({
  networkPolicy: { allowIngressFrom: [{ namespace: 'app-boarding-api-dev', ports: [8080] }] },
  components: [
    { type: 'postgresql', name: 'postgresql' },
    { type: 'rabbitmq', name: 'rabbitmq' },
  ],
});
const AIRSPACE = buildAppAirspace({ app: 'flight-api', env: 'dev', graph: GRAPH, values: VALUES });

describe('Airspace views', () => {
  it('Strips: one section per direction, the undeclared caller first, Open links to other apps', () => {
    const onOpen = jest.fn();
    render(<AirspaceStrips airspace={AIRSPACE} valuesKnown onOpenApp={onOpen} />);
    expect(screen.getByRole('heading', { name: 'Inbound' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Owned infrastructure' })).toBeTruthy();
    const rows = screen.getAllByRole('row').map(r => r.textContent ?? '');
    const inboundRows = rows.filter(r => /checkin-api|boarding-api|Ingress/.test(r) && !/Messaging/.test(r));
    expect(inboundRows[0]).toContain('checkin-api');
    expect(inboundRows[0]).toContain('Seen, not declared');
    expect(rows.some(r => r.includes('postgresql') && r.includes('Owned'))).toBe(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open →' })[0]);
    expect(onOpen).toHaveBeenCalledWith('checkin-api');
  });

  it('Radar: a node opens its detail in the inspector', () => {
    render(<AirspaceRadar airspace={AIRSPACE} valuesKnown />);
    fireEvent.click(screen.getByRole('button', { name: /^checkin-api/ }));
    expect(screen.getAllByText('Seen, not declared').length).toBeGreaterThan(1);
    expect(screen.getByText('inbound')).toBeTruthy();
  });

  it('Radar: the legend lists only the edge states on the graph, each drawn with the edge\'s own line', () => {
    render(<AirspaceRadar airspace={AIRSPACE} valuesKnown />);
    const legend = screen.getByRole('list', { name: 'Edge legend' });
    const items = Array.from(legend.querySelectorAll('li')).map(li => ({
      label: li.textContent,
      dash: li.querySelector('line')?.getAttribute('stroke-dasharray') ?? null,
    }));
    // checkin-api undeclared, boarding-api declared but silent inbound, the broker hop, ingress, owned postgresql/rabbitmq.
    expect(items.map(i => i.label)).toEqual(['Seen, not declared', 'Declared · no traffic', 'Via broker', 'Ingress', 'Owned']);
    expect(items.find(i => i.label === 'Seen, not declared')?.dash).toBe('6 5');
    expect(items.find(i => i.label === 'Declared · no traffic')?.dash).toBe('2 5');
    expect(items.find(i => i.label === 'Owned')?.dash).toBeNull();
    // The explainer opens to say what each one means and what to do.
    expect(screen.queryByRole('definition')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /What the lines mean/ }));
    const defs = screen.getAllByRole('definition').map(d => d.textContent ?? '');
    expect(defs).toHaveLength(5);
    expect(defs[0]).toContain('Seen in traffic but not declared');
    expect(defs[0]).toContain('allowIngressFrom');
  });

  it('Map: draws the env and lists a node’s edges', () => {
    render(<MapView graph={GRAPH} env="dev" knownApps={['flight-api', 'boarding-api', 'checkin-api']} onOpenApp={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^flight-api/ }));
    expect(screen.getByText('→ postgresql-rw')).toBeTruthy();
    expect(screen.getByText('← checkin-api-dev')).toBeTruthy();
  });
});

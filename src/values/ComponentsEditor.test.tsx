import { useState } from 'react';
import { load } from 'js-yaml';
import { fireEvent, render, screen, within } from '@testing-library/react';
import catalogJson from './__fixtures__/componentCatalog.json';
import { ComponentsEditor, dumpComponents, parseComponents } from './ComponentsEditor';
import type { ComponentDefinition } from './componentCatalog';

const defs = catalogJson as unknown as ComponentDefinition[];

// What boarding-api's staging values file has today.
const STAGING = `- type: redis
  name: cache
  spec:
    size: small
    persistence: false
- type: rabbitmq
  name: board-mq
  spec:
    mode: attach
    brokerRef:
      name: skyport-broker
      namespace: app-skyport-broker-staging
    vhost: flights
    queuePrefix: boarding
    consume:
      - flights.events
`;

function Harness({ initial = STAGING, catalog = defs, noCatalog = false }: { initial?: string; catalog?: ComponentDefinition[]; noCatalog?: boolean }) {
  const [text, setText] = useState(initial);
  return (
    <>
      <ComponentsEditor text={text} onChange={setText} defs={noCatalog ? undefined : catalog} />
      <pre data-testid="yaml">{text}</pre>
    </>
  );
}
const yaml = () => load(screen.getByTestId('yaml').textContent ?? '') as any;
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('parse and dump', () => {
  it('round-trips the staging components exactly, in the order the files use', () => {
    const rows = parseComponents(STAGING)!;
    expect(rows.map(r => [r.type, r.name])).toEqual([['redis', 'cache'], ['rabbitmq', 'board-mq']]);
    expect(load(dumpComponents(rows))).toEqual(load(STAGING));
    expect(dumpComponents(rows).startsWith('- type: redis\n  name: cache')).toBe(true);
  });
  it('is empty text for no components, undefined for text that is not a list, and tolerant of odd entries', () => {
    expect(parseComponents('')).toEqual([]);
    expect(dumpComponents([])).toBe('');
    expect(parseComponents('a: 1')).toBeUndefined();
    expect(parseComponents('- [')).toBeUndefined();
    expect(parseComponents('- 5')).toEqual([{ name: '', type: '', spec: {} }]);
  });
  it('writes no spec for a component that has none', () => {
    expect(dumpComponents([{ type: 'redis', name: 'c', spec: {} }])).toBe('- type: redis\n  name: c');
  });
});

describe('ComponentsEditor', () => {
  it('draws one card per component with the fields of its type, and the mode\'s fields only', () => {
    render(<Harness />);
    expect((field('Component 1 size') as unknown as HTMLSelectElement).value).toBe('small');
    expect(screen.getByLabelText('Component 1 persistence')).toBeTruthy();
    // rabbitmq in attach mode: no broker-only fields
    expect(field('Component 2 vhost').value).toBe('flights');
    expect(field('Component 2 queuePrefix').value).toBe('boarding');
    expect(field('Component 2 brokerRef name').value).toBe('skyport-broker');
    expect((field('Component 2 consume') as unknown as HTMLTextAreaElement).value).toBe('flights.events');
    expect(screen.queryByLabelText('Component 2 vhosts')).toBeNull();
    expect(screen.queryByLabelText('Component 2 instances')).toBeNull();
  });

  it('edits one field and leaves everything else in the YAML as it was', () => {
    render(<Harness />);
    fireEvent.change(field('Component 2 vhost'), { target: { value: 'airports' } });
    const out = yaml();
    expect(out[1].spec.vhost).toBe('airports');
    expect(out[1].spec.brokerRef).toEqual({ name: 'skyport-broker', namespace: 'app-skyport-broker-staging' });
    expect(out[0]).toEqual({ type: 'redis', name: 'cache', spec: { size: 'small', persistence: false } });
  });

  it('edits a nested field, a list (one per line), a switch and a select', () => {
    render(<Harness />);
    fireEvent.change(field('Component 2 brokerRef namespace'), { target: { value: 'app-skyport-broker-prod' } });
    fireEvent.change(field('Component 2 consume') as unknown as HTMLElement, { target: { value: 'flights.events\nflights.delays\n' } });
    fireEvent.click(field('Component 1 persistence'));
    fireEvent.change(field('Component 1 size'), { target: { value: 'medium' } });
    const out = yaml();
    expect(out[1].spec.brokerRef.namespace).toBe('app-skyport-broker-prod');
    expect(out[1].spec.consume).toEqual(['flights.events', 'flights.delays']);
    expect(out[0].spec).toEqual({ size: 'medium', persistence: true });
  });

  it('leaves an emptied field out of the YAML instead of writing an empty string', () => {
    render(<Harness />);
    fireEvent.change(field('Component 2 queuePrefix'), { target: { value: '' } });
    expect('queuePrefix' in yaml()[1].spec).toBe(false);
  });

  it('changing the mode swaps the fields and removes what belonged to the other mode', () => {
    render(<Harness />);
    fireEvent.change(field('Component 2 mode'), { target: { value: 'broker' } });
    const out = yaml();
    expect(out[1].spec).toEqual({ mode: 'broker' });
    expect(screen.getByLabelText('Component 2 vhosts')).toBeTruthy();
    expect(screen.queryByLabelText('Component 2 vhost')).toBeNull();
  });

  it('marks what is required in the current mode', () => {
    render(<Harness />);
    const label = (f: string) => screen.getByLabelText(`Component 2 ${f}`).closest('div')!.parentElement!.textContent;
    expect(label('vhost')).toContain('vhost *');
    expect(label('queuePrefix')).not.toContain('queuePrefix *');
    expect(screen.getByText(/brokerRef \*/)).toBeTruthy();
  });

  it('shows what each component hands the app, with the real Secret and ConfigMap names', () => {
    render(<Harness />);
    const card = within(screen.getByLabelText('Component 2 name').closest('div')!.parentElement as HTMLElement);
    expect(card.getByText(/ConfigMap board-mq-connection, key host/)).toBeTruthy();
    expect(card.getByText(/Secret board-mq-user-credentials, key password/)).toBeTruthy();
    expect(screen.getAllByText(/a plain value/).length).toBeGreaterThan(0);
  });

  it('adds a component of a chosen type with a free name, starting a modal type in attach mode', () => {
    render(<Harness initial="" />);
    expect(screen.getByText(/No components yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Component type to add'), { target: { value: 'rabbitmq' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add component' }));
    expect(yaml()).toEqual([{ type: 'rabbitmq', name: 'rabbitmq', spec: { mode: 'attach' } }]);
    fireEvent.change(screen.getByLabelText('Component type to add'), { target: { value: 'rabbitmq' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add component' }));
    expect(yaml().map((c: any) => c.name)).toEqual(['rabbitmq', 'rabbitmq-2']);
  });

  it('removes a component and renames one', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Component 1 name'), { target: { value: 'sessions' } });
    expect(yaml()[0].name).toBe('sessions');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(yaml().map((c: any) => c.name)).toEqual(['board-mq']);
  });

  it('says so, and offers no form, for a type airframe does not know, keeping it as it was', () => {
    render(<Harness initial={'- type: kafka\n  name: events\n  spec:\n    partitions: 3\n'} />);
    expect(screen.getByText(/"kafka" is not a component type airframe knows/)).toBeTruthy();
    expect(screen.queryByLabelText('Component 1 partitions')).toBeNull();
    fireEvent.change(screen.getByLabelText('Component 1 name'), { target: { value: 'events2' } });
    expect(yaml()).toEqual([{ type: 'kafka', name: 'events2', spec: { partitions: 3 } }]);
  });

  it('falls back to the YAML when the catalog is not available or the text is not a list', () => {
    const { unmount } = render(<Harness noCatalog />);
    expect(screen.getByText(/component catalog could not be loaded/)).toBeTruthy();
    unmount();
    render(<Harness initial="not: a list" />);
    expect(screen.getByText(/not a YAML list the form can edit/)).toBeTruthy();
  });
});

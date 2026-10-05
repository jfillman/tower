import catalogJson from './__fixtures__/componentCatalog.json';
import {
  catalogOutputs,
  componentProblems,
  currentMode,
  fieldMode,
  fieldNames,
  modesOf,
  newSpec,
  pruneForMode,
  requiredFields,
  visibleFields,
  type ComponentDefinition,
} from './componentCatalog';

// The real definitions, generated from airframe's xrds/*.hangar.yaml and *.meta.yaml.
const defs = catalogJson as unknown as ComponentDefinition[];
const def = (t: string) => defs.find(d => d.type === t)!;

describe('what the real definitions give', () => {
  it('covers the five component types', () => {
    expect(defs.map(d => d.type)).toEqual(['dex', 'mongodb', 'postgresql', 'rabbitmq', 'redis']);
  });
  it('hides the field the chart sets itself', () => {
    for (const d of defs) expect(fieldNames(d)).not.toContain('environmentRef');
    expect(fieldNames(def('redis'))).toEqual(['size', 'persistence']);
  });
  it('knows which components have modes', () => {
    expect(modesOf(def('rabbitmq'))).toEqual(['broker', 'attach']);
    expect(modesOf(def('dex'))).toEqual(['server', 'attach']);
    expect(modesOf(def('redis'))).toEqual([]);
  });
});

describe('modes', () => {
  const rabbit = def('rabbitmq');
  it('reads the mode a field belongs to from its description', () => {
    expect(fieldMode(rabbit, 'vhosts')).toBe('broker');
    expect(fieldMode(rabbit, 'brokerRef')).toBe('attach');
    expect(fieldMode(rabbit, 'queuePrefix')).toBe('attach');
    expect(fieldMode(rabbit, 'mode')).toBeUndefined();
  });
  it('shows only the fields of the mode in force', () => {
    expect(visibleFields(rabbit, { mode: 'attach' })).toEqual(['mode', 'brokerRef', 'vhost', 'queuePrefix', 'publish', 'consume']);
    expect(visibleFields(rabbit, { mode: 'broker' })).toEqual(['mode', 'size', 'instances', 'storageSize', 'vhosts', 'allowedNamespaces']);
  });
  it('a component without modes shows every field', () => {
    expect(visibleFields(def('postgresql'), {})).toEqual(['size', 'instances', 'storageSize', 'databaseName']);
  });
  it('reads the mode set, else the default, and a stray value is not a mode', () => {
    expect(currentMode(rabbit, { mode: 'attach' })).toBe('attach');
    expect(currentMode(rabbit, { mode: 'nonsense' })).toBeUndefined();
    expect(currentMode(def('redis'), {})).toBeUndefined();
  });
  it('prunes what belongs to the other mode when the mode changes, and keeps the rest', () => {
    const spec = { mode: 'broker', size: 'small', vhosts: ['flights'], brokerRef: { name: 'b', namespace: 'n' }, queuePrefix: 'x' };
    expect(pruneForMode(rabbit, spec)).toEqual({ mode: 'broker', size: 'small', vhosts: ['flights'] });
  });
  it('a new component of a modal type starts as attach, since apps attach to shared infrastructure', () => {
    expect(newSpec(rabbit)).toEqual({ mode: 'attach' });
    expect(newSpec(def('dex'))).toEqual({ mode: 'attach' });
    expect(newSpec(def('redis'))).toEqual({});
  });
});

describe('required fields', () => {
  it('combines the schema\'s required with the validations\' per-mode requirements', () => {
    expect(requiredFields(def('rabbitmq'), { mode: 'attach' })).toEqual(['mode', 'brokerRef', 'vhost']);
    expect(requiredFields(def('rabbitmq'), { mode: 'broker' })).toEqual(['mode']);
    expect(requiredFields(def('dex'), { mode: 'attach' })).toEqual(['mode', 'serverRef']);
    expect(requiredFields(def('redis'), {})).toEqual([]);
  });
});

describe('componentProblems', () => {
  const ok = [
    { name: 'cache', type: 'redis', spec: { persistence: false, size: 'small' } },
    { name: 'board-mq', type: 'rabbitmq', spec: { mode: 'attach', brokerRef: { name: 'skyport-broker', namespace: 'app-skyport-broker-staging' }, vhost: 'flights', queuePrefix: 'boarding', consume: ['flights.events'] } },
  ];
  it('accepts the boarding-api staging components as they are', () => {
    expect(componentProblems(defs, ok)).toEqual([]);
  });
  it('asks for what attach mode requires, naming the mode', () => {
    expect(componentProblems(defs, [{ name: 'mq', type: 'rabbitmq', spec: { mode: 'attach' } }])).toEqual([
      'Component mq: brokerRef is required when mode is attach.',
      'Component mq: vhost is required when mode is attach.',
    ]);
  });
  it('asks for the parts of a nested field', () => {
    expect(componentProblems(defs, [{ name: 'mq', type: 'rabbitmq', spec: { mode: 'attach', brokerRef: { name: 'b' }, vhost: 'v' } }])).toEqual(['Component mq: brokerRef.namespace is required.']);
  });
  it('checks enums and numbers', () => {
    expect(componentProblems(defs, [{ name: 'c', type: 'redis', spec: { size: 'huge' } }])).toEqual(['Component c: size must be one of small, medium, large.']);
    expect(componentProblems(defs, [{ name: 'db', type: 'postgresql', spec: { instances: 2 } }])).toEqual([]);
    expect(componentProblems(defs, [{ name: 'db', type: 'postgresql', spec: { instances: 5 } }])).toEqual(['Component db: instances must be one of 1, 2, 3.']);
    expect(componentProblems(defs, [{ name: 'db', type: 'postgresql', spec: { instances: 1.5 } }]).length).toBeGreaterThan(0);
  });
  it('checks names: required, shape and uniqueness', () => {
    expect(componentProblems(defs, [{ name: '', type: 'redis', spec: {} }])).toEqual(['Component (unnamed): needs a name.']);
    expect(componentProblems(defs, [{ name: 'Bad_Name', type: 'redis', spec: {} }])[0]).toMatch(/the name must be lowercase/);
    const dup = componentProblems(defs, [{ name: 'a', type: 'redis', spec: {} }, { name: 'a', type: 'mongodb', spec: {} }]);
    expect(dup).toEqual(['Component a: the name is used by more than one component.', 'Component a: the name is used by more than one component.']);
  });
  it('reports a type airframe does not know', () => {
    expect(componentProblems(defs, [{ name: 'x', type: 'kafka', spec: {} }])).toEqual(['Component x: "kafka" is not a component type airframe knows.']);
  });
  it('does not judge a field that belongs to the other mode', () => {
    expect(componentProblems(defs, [{ name: 'mq', type: 'rabbitmq', spec: { mode: 'broker', instances: 3, brokerRef: { name: 'only-name' } } }])).toEqual([]);
  });
});

describe('catalogOutputs', () => {
  it('lists a component type\'s outputs from the catalog, and nothing for an unknown type or no catalog', () => {
    expect(catalogOutputs(defs, 'rabbitmq')).toEqual(['username', 'password', 'host', 'port', 'vhost']);
    expect(catalogOutputs(defs, 'kafka')).toBeUndefined();
    expect(catalogOutputs(undefined, 'redis')).toBeUndefined();
  });
});

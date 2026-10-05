import { COMPONENT_OUTPUTS, declaredComponents, matchComponentOutput, outputsOf } from './components';

const comps = [
  { name: 'board-mq', type: 'rabbitmq' },
  { name: 'cache', type: 'redis' },
];

describe('matchComponentOutput', () => {
  it('recognises the hand-written references from the boarding-api staging file (the AF-COMP-003 warnings)', () => {
    expect(matchComponentOutput(comps, 'configMapKeyRef', 'board-mq-connection', 'host')).toEqual({ name: 'board-mq', output: 'host' });
    expect(matchComponentOutput(comps, 'configMapKeyRef', 'board-mq-connection', 'vhost')).toEqual({ name: 'board-mq', output: 'vhost' });
    expect(matchComponentOutput(comps, 'secretKeyRef', 'board-mq-user-credentials', 'username')).toEqual({ name: 'board-mq', output: 'username' });
    expect(matchComponentOutput(comps, 'secretKeyRef', 'board-mq-user-credentials', 'password')).toEqual({ name: 'board-mq', output: 'password' });
  });
  it('does not match another name, key or kind', () => {
    expect(matchComponentOutput(comps, 'secretKeyRef', 'my-secret', 'password')).toBeUndefined();
    expect(matchComponentOutput(comps, 'secretKeyRef', 'board-mq-user-credentials', 'nope')).toBeUndefined();
    expect(matchComponentOutput(comps, 'secretKeyRef', 'board-mq-connection', 'host')).toBeUndefined(); // it is a ConfigMap
    expect(matchComponentOutput([], 'secretKeyRef', 'board-mq-user-credentials', 'password')).toBeUndefined();
  });
});

describe('declaredComponents and outputsOf', () => {
  it('reads name and type, skipping malformed entries', () => {
    expect(declaredComponents([{ name: 'a', type: 'redis' }, { name: 'b' }, 'x', null, { type: 'redis' }])).toEqual([{ name: 'a', type: 'redis' }]);
    expect(declaredComponents(undefined)).toEqual([]);
  });
  it('lists the outputs of a known type and none for an unknown one', () => {
    expect(outputsOf('rabbitmq')).toEqual(['username', 'password', 'host', 'port', 'vhost']);
    expect(outputsOf('nonsense')).toEqual([]);
  });
  it('every non-literal output names an object and a key', () => {
    for (const [type, outs] of Object.entries(COMPONENT_OUTPUTS)) {
      for (const [name, o] of Object.entries(outs)) {
        if (o.kind !== 'literal') expect([type, name, Boolean(o.object && o.key)]).toEqual([type, name, true]);
      }
    }
  });
});

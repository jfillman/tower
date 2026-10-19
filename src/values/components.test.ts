import { COMPONENT_OUTPUTS, declaredComponents, matchComponentOutput, outputsOf, withoutComponentEnv, componentEnvRows, envNameFor, renameComponentEnv, wiredOutputs } from './components';

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

describe('withoutComponentEnv', () => {
  const row = (name: string, kind: string, extra: Partial<{ component: string; refName: string; refKey: string }> = {}) => ({
    name,
    kind,
    component: '',
    refName: '',
    refKey: '',
    ...extra,
  });

  it('drops the env rows that read from the removed component, and only those', () => {
    const rows = [
      row('REDIS_URL', 'component', { component: 'cache' }),
      row('REDIS_PASSWORD', 'secret', { refName: 'cache-connection', refKey: 'password' }),
      row('MQ_HOST', 'component', { component: 'board-mq' }),
      row('OTHER_SECRET', 'secret', { refName: 'cache-connection-old', refKey: 'password' }),
      row('LOG_LEVEL', 'value'),
    ];
    const { kept, dropped } = withoutComponentEnv(rows, { name: 'cache', type: 'redis' });
    expect(dropped).toEqual(['REDIS_URL', 'REDIS_PASSWORD']);
    expect(kept.map(r => r.name)).toEqual(['MQ_HOST', 'OTHER_SECRET', 'LOG_LEVEL']);
  });
});

describe('wiring a component into env vars', () => {
  const env = (name: string, component = '', output = '') => ({ name, kind: component ? 'component' : 'value', component, output });

  it('names a variable <COMPONENT>_<OUTPUT>', () => {
    expect(envNameFor('redis', 'url')).toBe('REDIS_URL');
    expect(envNameFor('board-mq', 'vhost')).toBe('BOARD_MQ_VHOST');
    expect(envNameFor('oauth', 'clientSecret')).toBe('OAUTH_CLIENT_SECRET');
  });

  it('adds one per unread output and never overwrites a name in use', () => {
    const rows = [env('REDIS_PASSWORD'), env('CACHE', 'redis', 'url')];
    const { add, skipped } = componentEnvRows(rows, 'redis', ['host', 'port', 'url', 'password']);
    expect(add).toEqual([
      { name: 'REDIS_HOST', component: 'redis', output: 'host' },
      { name: 'REDIS_PORT', component: 'redis', output: 'port' },
    ]);
    expect(skipped).toEqual(['REDIS_PASSWORD']);
  });

  it('lists which variables read each output, and follows a rename', () => {
    const rows = [env('A', 'redis', 'url'), env('B', 'redis', 'url'), env('C', 'mq', 'host'), env('D')];
    expect(wiredOutputs(rows, 'redis')).toEqual({ url: ['A', 'B'] });
    expect(renameComponentEnv(rows, 'redis', 'cache').map(r => r.component)).toEqual(['cache', 'cache', 'mq', '']);
  });
});

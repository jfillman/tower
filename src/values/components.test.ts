import { COMPONENT_OUTPUTS, declaredComponents, matchComponentOutput, outputsOf, withoutComponentEnv, componentEnvRows, envNameFor, envProfileFor, PROFILE_ENV, renameComponentEnv, wiredOutputs } from './components';

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

  it('picks the naming profile from the app kind', () => {
    expect(envProfileFor('springbootapplication')).toBe('spring-boot');
    for (const k of ['nodejsapplication', 'pythonapplication', 'goapplication']) expect(envProfileFor(k)).toBe('drivers');
    expect(envProfileFor('infraservice')).toBeUndefined();
    expect(envProfileFor(undefined)).toBeUndefined();
  });

  it('only names outputs a component type really has', () => {
    for (const types of Object.values(PROFILE_ENV)) {
      for (const [type, outputs] of Object.entries(types)) {
        for (const output of Object.keys(outputs)) expect(outputsOf(type)).toContain(output);
      }
    }
  });

  const all = (type: string) => outputsOf(type);
  const names = (r: { add: Array<{ name: string }> }) => r.add.map(a => a.name);

  it('wires a Spring Boot app under the names Spring binds, leaving what the URL already carries', () => {
    const pg = componentEnvRows([], 'flight-db', all('postgresql'), { type: 'postgresql', profile: 'spring-boot' });
    expect(names(pg)).toEqual(['SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD', 'SPRING_DATASOURCE_URL']);
    expect(pg.add.find(a => a.name === 'SPRING_DATASOURCE_URL')?.output).toBe('jdbcUri');
    expect(pg.left).toEqual(['host', 'port', 'database', 'uri']);
    expect(names(componentEnvRows([], 'mq', all('rabbitmq'), { type: 'rabbitmq', profile: 'spring-boot' }))).toEqual([
      'SPRING_RABBITMQ_USERNAME', 'SPRING_RABBITMQ_PASSWORD', 'SPRING_RABBITMQ_HOST', 'SPRING_RABBITMQ_PORT', 'SPRING_RABBITMQ_VIRTUAL_HOST',
    ]);
    const redis = componentEnvRows([], 'cache', all('redis'), { type: 'redis', profile: 'spring-boot' });
    expect(names(redis)).toEqual(['SPRING_DATA_REDIS_HOST', 'SPRING_DATA_REDIS_PORT', 'SPRING_DATA_REDIS_PASSWORD']);
    expect(redis.left).toEqual(['url']);
    // Boot 4 binds only spring.mongodb.uri, Boot 3 only spring.data.mongodb.uri.
    expect(names(componentEnvRows([], 'docs', all('mongodb'), { type: 'mongodb', profile: 'spring-boot' }))).toEqual(['SPRING_MONGODB_URI', 'SPRING_DATA_MONGODB_URI']);
    // No profile names for Dex in a Spring app: every output, <COMPONENT>_<OUTPUT>.
    expect(names(componentEnvRows([], 'oauth', all('dex'), { type: 'dex', profile: 'spring-boot' }))).toEqual([
      'OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'OAUTH_ISSUER', 'OAUTH_TOKEN_URL', 'OAUTH_JWKS_URL',
    ]);
  });

  it('wires a driver-based app\'s PostgreSQL under libpq\'s names', () => {
    const pg = componentEnvRows([], 'db', all('postgresql'), { type: 'postgresql', profile: 'drivers' });
    expect(names(pg)).toEqual(['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'DATABASE_URL']);
    expect(pg.left).toEqual(['jdbcUri']);
    expect(names(componentEnvRows([], 'cache', all('redis'), { type: 'redis', profile: 'drivers' }))).toEqual(['CACHE_HOST', 'CACHE_PORT', 'CACHE_URL', 'CACHE_PASSWORD']);
  });

  it('wires every output when asked, and falls back to <COMPONENT>_<OUTPUT> when a profile name is taken', () => {
    const rest = componentEnvRows([], 'flight-db', ['host', 'uri'], { type: 'postgresql', profile: 'spring-boot', all: true });
    expect(names(rest)).toEqual(['FLIGHT_DB_HOST', 'FLIGHT_DB_URI']);
    expect(rest.left).toEqual([]);
    // A second database in the same app: the first one already has SPRING_DATASOURCE_*.
    const first = [env('SPRING_DATASOURCE_URL', 'db', 'jdbcUri'), env('SPRING_DATASOURCE_USERNAME', 'db', 'username')];
    const second = componentEnvRows(first, 'reports-db', ['jdbcUri', 'username'], { type: 'postgresql', profile: 'spring-boot' });
    expect(names(second)).toEqual(['REPORTS_DB_JDBC_URI', 'REPORTS_DB_USERNAME']);
  });

  it('lists which variables read each output, and follows a rename', () => {
    const rows = [env('A', 'redis', 'url'), env('B', 'redis', 'url'), env('C', 'mq', 'host'), env('D')];
    expect(wiredOutputs(rows, 'redis')).toEqual({ url: ['A', 'B'] });
    expect(renameComponentEnv(rows, 'redis', 'cache').map(r => r.component)).toEqual(['cache', 'cache', 'mq', '']);
  });
});

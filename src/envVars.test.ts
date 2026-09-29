import { buildEnvValue, describeValueFrom, parseEnvRows } from './envVars';

const secretRef = (name: string, key: string) => ({ secretKeyRef: { name, key } });

describe('env rows', () => {
  it('round-trips literal values unchanged', () => {
    const env = [{ name: 'A', value: '1' }, { name: 'B', value: 'two' }];
    expect(buildEnvValue(parseEnvRows(env))).toEqual(env);
  });

  it('keeps a valueFrom entry through a load and save (the bug: it used to be dropped)', () => {
    const env = [
      { name: 'PLAIN', value: 'x' },
      { name: 'DB_HOST', valueFrom: secretRef('flight-db-app', 'host') },
      { name: 'DB_PASSWORD', valueFrom: secretRef('flight-db-app', 'password') },
    ];
    const saved = buildEnvValue(parseEnvRows(env));
    expect(saved).toEqual(env);
    expect(saved[1]).not.toHaveProperty('value');
  });

  it('editing a literal leaves the valueFrom entries untouched', () => {
    const rows = parseEnvRows([
      { name: 'PLAIN', value: 'x' },
      { name: 'DB_HOST', valueFrom: secretRef('flight-db-app', 'host') },
    ]);
    rows[0] = { ...rows[0], value: 'changed' };
    expect(buildEnvValue(rows)).toEqual([
      { name: 'PLAIN', value: 'changed' },
      { name: 'DB_HOST', valueFrom: secretRef('flight-db-app', 'host') },
    ]);
  });

  it('removing a valueFrom row removes it, deliberately', () => {
    const rows = parseEnvRows([{ name: 'DB_HOST', valueFrom: secretRef('s', 'k') }, { name: 'A', value: '1' }]);
    expect(buildEnvValue(rows.filter(r => r.name !== 'DB_HOST'))).toEqual([{ name: 'A', value: '1' }]);
  });

  it('renaming a valueFrom row keeps its source', () => {
    const rows = parseEnvRows([{ name: 'DB_HOST', valueFrom: secretRef('s', 'k') }]);
    rows[0] = { ...rows[0], name: 'PGHOST' };
    expect(buildEnvValue(rows)).toEqual([{ name: 'PGHOST', valueFrom: secretRef('s', 'k') }]);
  });

  it('drops rows with no name, as before', () => {
    expect(buildEnvValue([{ name: '  ', value: 'x' }, { name: 'A', value: '1' }])).toEqual([{ name: 'A', value: '1' }]);
  });

  it('coerces a non-string literal to a string and tolerates a missing value', () => {
    expect(parseEnvRows([{ name: 'N', value: 5 }, { name: 'M' }])).toEqual([
      { name: 'N', value: '5' },
      { name: 'M', value: '' },
    ]);
  });

  it('yields no rows for a missing or malformed env', () => {
    expect(parseEnvRows(undefined)).toEqual([]);
    expect(parseEnvRows({ not: 'a list' })).toEqual([]);
    expect(parseEnvRows([null, 7, 'x'])).toEqual([
      { name: '', value: '' },
      { name: '', value: '' },
      { name: '', value: '' },
    ]);
  });

  it('a non-object valueFrom is treated as a literal, not preserved', () => {
    expect(parseEnvRows([{ name: 'A', value: '1', valueFrom: 'nope' }])).toEqual([{ name: 'A', value: '1' }]);
  });
});

describe('describeValueFrom', () => {
  it('names the Secret and key', () => {
    expect(describeValueFrom(secretRef('flight-db-app', 'host'))).toBe('Secret flight-db-app / host');
  });
  it('handles configMapKeyRef, fieldRef and unknown shapes', () => {
    expect(describeValueFrom({ configMapKeyRef: { name: 'c', key: 'k' } })).toBe('ConfigMap c / k');
    expect(describeValueFrom({ fieldRef: { fieldPath: 'metadata.name' } })).toBe('field metadata.name');
    expect(describeValueFrom({ resourceFieldRef: {} })).toBe('valueFrom (set in values.yaml)');
  });
});

import { flatten, searchSettings, type SettingFile } from './settingIndex';

const file = (label: string, values: unknown, subtab: SettingFile['subtab'] = 'environments'): SettingFile => ({ subtab, label, path: `${label}.yaml`, values });

describe('flatten', () => {
  it('lists every key path, lists as [n]', () => {
    expect(flatten({ a: { b: 1 }, l: [{ c: 2 }] }).map(x => x.key)).toEqual(['a', 'a.b', 'l', 'l[0]', 'l[0].c']);
  });
});

describe('searchSettings (Find a setting)', () => {
  const files = [
    file('prod', { rollout: { replicas: 4, steps: [{ setWeight: 20 }] }, image: { tag: '1.42.0' } }),
    file('cicd', { build: { cache: true }, deploy: { environments: [{ name: 'prod', cluster: 'hangar-prod' }] } }, 'glidepath'),
  ];
  it('ranks an exact last segment first', () => {
    expect(searchSettings(files, 'replicas')[0]).toMatchObject({ key: 'rollout.replicas', value: '4' });
  });
  it('needs every word in the path', () => {
    expect(searchSettings(files, 'rollout weight').map(h => h.key)).toEqual(['rollout.steps[0].setWeight']);
  });
  it('finds a value too, after the key matches', () => {
    expect(searchSettings(files, 'hangar-prod').map(h => h.key)).toEqual(['deploy.environments[0].cluster']);
    expect(searchSettings(files, '1.42.0')[0].key).toBe('image.tag');
  });
  it('says nothing for one character', () => {
    expect(searchSettings(files, 'r')).toEqual([]);
  });
});

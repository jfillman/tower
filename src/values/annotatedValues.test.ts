import { load } from 'js-yaml';
import fixture from './__fixtures__/chartValues.json';
import { annotateValues, mergeValues, type ChartValues } from './annotatedValues';

const chart = fixture as unknown as ChartValues;
// A trimmed copy of boarding-api's staging file.
const FILE = {
  appName: 'boarding-api',
  cluster: 'kind-prod',
  envName: 'staging',
  rollout: { replicas: 2, ports: [{ name: 'http', containerPort: 8080 }], serviceAccount: undefined },
  env: [{ name: 'LOG_LEVEL', value: 'info' }],
};

describe('mergeValues', () => {
  it('merges maps key by key and replaces lists whole, like Helm', () => {
    expect(mergeValues({ a: { b: 1, c: 2 }, l: [1, 2] }, { a: { b: 9 }, l: [3] })).toEqual({ a: { b: 9, c: 2 }, l: [3] });
  });
  it('lets a null in the file win over a default map', () => {
    expect(mergeValues({ rollout: { replicas: 1 } }, { rollout: null })).toEqual({ rollout: null });
  });
});

describe('annotateValues', () => {
  const text = annotateValues(chart, JSON.parse(JSON.stringify(FILE)));
  const parsed = load(text) as Record<string, any>;

  it('is valid YAML whose content is exactly defaults merged with the file', () => {
    expect(parsed).toEqual(mergeValues(chart.defaults, JSON.parse(JSON.stringify(FILE))));
  });
  it('marks what the file sets, and only that', () => {
    const marked = text.split('\n').filter(l => l.includes('# set here'));
    expect(marked.some(l => l.startsWith('appName: boarding-api'))).toBe(true);
    expect(marked.some(l => l.trim().startsWith('replicas: 2'))).toBe(true);
    expect(marked.some(l => l.startsWith('devClusterName'))).toBe(false);
  });
  it('carries the schema description above each field', () => {
    const i = text.split('\n').findIndex(l => l.startsWith('appName:'));
    const above = text.split('\n').slice(Math.max(0, i - 6), i).join(' ');
    expect(above).toContain('DNS-1123 label');
  });
  it('still shows the committed values, undescribed, when the chart could not be read', () => {
    const bare = annotateValues(undefined, { appName: 'x', extra: { a: 1 } });
    expect(load(bare)).toEqual({ appName: 'x', extra: { a: 1 } });
    expect(bare).toContain('appName: x  # set here');
  });
});

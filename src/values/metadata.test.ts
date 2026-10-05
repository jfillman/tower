import { METADATA_FIELDS, metadataProblems, reservedKeyProblem } from './metadata';

describe('reservedKeyProblem', () => {
  it('reserves the labels the chart stamps, for every label field', () => {
    for (const f of ['labels', 'podLabels', 'serviceLabels'] as const) {
      expect(reservedKeyProblem(f, 'app.kubernetes.io/name')).toMatch(/chart owns/);
      expect(reservedKeyProblem(f, 'hangar.io/env')).toMatch(/chart owns/);
      expect(reservedKeyProblem(f, 'helm.sh/chart')).toMatch(/chart owns/);
      expect(reservedKeyProblem(f, 'team')).toBeUndefined();
      expect(reservedKeyProblem(f, 'example.com/hangar.io/x')).toBeUndefined();
    }
  });
  it('reserves checksum annotations, and only for annotation fields', () => {
    for (const f of ['annotations', 'podAnnotations', 'serviceAnnotations'] as const) {
      expect(reservedKeyProblem(f, 'checksum/secrets')).toMatch(/chart-owned/);
      expect(reservedKeyProblem(f, 'prometheus.io/scrape')).toBeUndefined();
      expect(reservedKeyProblem(f, 'app.kubernetes.io/name')).toBeUndefined(); // an annotation may use that prefix
    }
    expect(reservedKeyProblem('podLabels', 'checksum/secrets')).toBeUndefined();
  });
});

describe('metadataProblems', () => {
  it('reports reserved keys, duplicates and a value without a key, and ignores blank rows', () => {
    expect(
      metadataProblems('podLabels', 'Pod labels', [
        { key: 'hangar.io/app', value: 'x' },
        { key: 'team', value: 'a' },
        { key: 'team', value: 'b' },
        { key: '', value: 'orphan' },
        { key: '', value: '' },
      ]),
    ).toEqual([
      'Pod labels: "hangar.io/app" is a label the chart owns (app.kubernetes.io/*, hangar.io/* and helm.sh/chart are reserved).',
      'Pod labels: "team" is listed twice.',
      'Pod labels: a value has no key.',
    ]);
    expect(metadataProblems('annotations', 'x', [{ key: 'a', value: '1' }])).toEqual([]);
  });
});

describe('METADATA_FIELDS', () => {
  it('covers all six chart fields once, each with a noun matching its kind', () => {
    expect(METADATA_FIELDS.map(f => f.field).sort()).toEqual(['annotations', 'labels', 'podAnnotations', 'podLabels', 'serviceAnnotations', 'serviceLabels']);
    for (const f of METADATA_FIELDS) expect(f.noun).toBe(f.field.toLowerCase().endsWith('labels') ? 'label' : 'annotation');
  });
});

import { describeChart, ownChartOf } from './ownChart';

describe('ownChartOf', () => {
  const sample = { repoURL: 'https://github.com/jfillman/glidepath', path: 'charts/conformance-sample', targetRevision: 'v1' };
  it('is nothing for Airframe at any version', () => {
    expect(ownChartOf(undefined, 'dev')).toBeUndefined();
    expect(ownChartOf({ chart: { targetRevision: 'v0.3.200' } } as never, 'dev')).toBeUndefined();
  });
  it('is the chart an environment renders when it is not Airframe', () => {
    expect(ownChartOf({ environments: [{ name: 'canary', tier: 'ground', chart: sample }] } as never, 'canary')).toEqual(sample);
    expect(ownChartOf({ environments: [{ name: 'canary', tier: 'ground', chart: sample }] } as never, 'dev')).toBeUndefined();
    expect(describeChart(sample)).toBe('https://github.com/jfillman/glidepath charts/conformance-sample@v1');
  });
  it('is nothing for a cloud target', () => {
    expect(ownChartOf({ target: 'aws-lambda', chart: sample } as never, 'dev')).toBeUndefined();
  });
});

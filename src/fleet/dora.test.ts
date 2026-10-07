import {
  appSelector,
  buildDoraSnapshot,
  changeFailureBand,
  deployFrequencyBand,
  doraQueries,
  leadTimeBand,
} from './dora';

describe('dora queries', () => {
  it('match the Grafana executive dashboard for the whole fleet', () => {
    const q = doraQueries(30);
    expect(q.deploys).toBe('sum(increase(dora_deployments_total[30d]))');
    expect(q.failures).toBe('sum(increase(dora_releases_total{outcome="failed"}[30d]))');
    expect(q.leadTimeP50).toBe('histogram_quantile(0.5, sum(rate(dora_lead_time_seconds_bucket[30d])) by (le))');
    expect(q.deploysPrevious).toBe('sum(increase(dora_deployments_total[30d] offset 30d))');
  });

  it('limit to the filtered apps, and an empty filter matches nothing', () => {
    expect(appSelector(['gate-api', 'flight-api'])).toBe('{app=~"flight-api|gate-api"}');
    expect(doraQueries(7, ['gate-api']).failures).toBe(
      'sum(increase(dora_releases_total{app=~"gate-api",outcome="failed"}[7d]))',
    );
    expect(appSelector([])).toBe('{app="__none__"}');
  });
});

describe('dora bands (dora-executive.json thresholds)', () => {
  it('deploy frequency per day', () => {
    expect(deployFrequencyBand(0.5)).toBe('poor');
    expect(deployFrequencyBand(1)).toBe('fair');
    expect(deployFrequencyBand(7)).toBe('good');
    expect(deployFrequencyBand(undefined)).toBe('neutral');
  });
  it('lead time', () => {
    expect(leadTimeBand(3600)).toBe('good');
    expect(leadTimeBand(2 * 86400)).toBe('fair');
    expect(leadTimeBand(8 * 86400)).toBe('poor');
  });
  it('change failure rate', () => {
    expect(changeFailureBand(0.1)).toBe('good');
    expect(changeFailureBand(0.2)).toBe('fair');
    expect(changeFailureBand(0.3)).toBe('poor');
  });
});

describe('buildDoraSnapshot', () => {
  it('derives rates and per-app rows, treating NaN (no data) as unknown', () => {
    const s = buildDoraSnapshot(30, {
      scalar: {
        deploys: 45,
        deploysPrevious: 30,
        failures: 6,
        releases: 40,
        failuresPrevious: NaN,
        releasesPrevious: 0,
        leadTimeP50: 7200,
        restoreP50: NaN,
      },
      deploysByApp: [
        { app: 'gate-api', value: 9.0000001 },
        { app: 'idle-api', value: 0 },
      ],
      releasesByAppOutcome: [
        { app: 'gate-api', outcome: 'succeeded', value: 8 },
        { app: 'gate-api', outcome: 'failed', value: 2 },
      ],
      leadTimeP50ByApp: [{ app: 'gate-api', value: 3600 }],
      restoreP50ByApp: [{ app: 'gate-api', value: NaN }],
      deploysDaily: [],
      failuresDaily: [],
    });
    expect(s.deploysPerDay).toBe(1.5);
    expect(s.deploysPerDayPrevious).toBe(1);
    expect(s.changeFailureRate).toBe(0.15);
    expect(s.changeFailureRatePrevious).toBeUndefined();
    expect(s.restoreP50Sec).toBeUndefined();
    expect(s.apps).toEqual([
      {
        app: 'gate-api',
        deploys: 9,
        failures: 2,
        releases: 10,
        changeFailureRate: 0.2,
        leadTimeP50Sec: 3600,
        restoreP50Sec: undefined,
      },
    ]);
  });
});

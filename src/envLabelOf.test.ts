import { envLabelOf } from './useTowerEnvironments';

describe('envLabelOf', () => {
  const labels = (env: string) => ({ metadata: { labels: { 'hangar.io/env': env } } });

  it('reads the Rollout first, then a plain Deployment, and the namespace only as a last resort', () => {
    expect(envLabelOf(labels('staging') as never, 'app-x-staging', labels('other'))).toBe('staging');
    expect(envLabelOf(undefined, 'app-skyport-auth-dev', labels('dev'))).toBe('dev');
    expect(envLabelOf(undefined, 'app-skyport-auth-dev', { metadata: {} })).toBe('app-skyport-auth-dev');
    expect(envLabelOf(undefined, 'app-skyport-auth-dev')).toBe('app-skyport-auth-dev');
  });
});

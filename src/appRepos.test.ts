import type { Entity } from '@backstage/catalog-model';
import { appRepos, appTypeOf } from './appRepos';

const entity = (tags: string[]): Entity => ({ apiVersion: 'v1', kind: 'Component', metadata: { name: 'x', tags } });

describe('appRepos', () => {
  it('an InfraService has no source repo; its gitops repo and CI namespace are infra-flavoured', () => {
    expect(appTypeOf(entity(['kind:infraservice']))).toBe('infra');
    expect(appRepos('skyport-broker', 'infra')).toEqual({
      type: 'infra',
      gitopsRepo: 'gitops-infra-skyport-broker',
      configRepo: 'gitops-infra-skyport-broker',
      cicdNamespace: 'infra-skyport-broker-cicd',
    });
  });
  it('an app keeps <name>, gitops-<name>, app-<name>-cicd', () => {
    expect(appTypeOf(entity(['kind:nodejsapplication']))).toBe('app');
    expect(appRepos('gate-api', 'app')).toEqual({
      type: 'app',
      sourceRepo: 'gate-api',
      gitopsRepo: 'gitops-gate-api',
      configRepo: 'gate-api',
      cicdNamespace: 'app-gate-api-cicd',
    });
  });
});

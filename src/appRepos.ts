import type { Entity } from '@backstage/catalog-model';
import { useAsyncEntity } from '@backstage/plugin-catalog-react';

// An Airframe InfraService (a shared component such as a broker) has no source repo of its own: its cicd.yaml and
// its environments' values live in gitops-infra-<name> (Airframe's InfraService composition and
// ApplicationEnvironment spec.appType: infra), and its CI namespace is infra-<name>-cicd. Every other service is an
// app: source repo <name>, gitops-<name>, app-<name>-cicd. Environment namespaces follow the same prefix:
// app-<name>-<env>, or infra-<name>-<env> for an InfraService (glidepath#148, 2026-10-21; they were app- before).
export type AppType = 'app' | 'infra';

const INFRA_KIND_TAG = 'kind:infraservice';

export function appTypeOf(entity: Entity | undefined): AppType {
  return entity?.metadata.tags?.includes(INFRA_KIND_TAG) ? 'infra' : 'app';
}

export interface AppRepos {
  type: AppType;
  /** The source repo's name, or undefined for an InfraService (it has none). */
  sourceRepo?: string;
  gitopsRepo: string;
  /** Where cicd.yaml and Ground environment files live: the source repo, or an InfraService's gitops repo. */
  configRepo: string;
  cicdNamespace: string;
}

export function appRepos(appName: string, type: AppType): AppRepos {
  if (type === 'infra') {
    const gitopsRepo = `gitops-infra-${appName}`;
    return { type, gitopsRepo, configRepo: gitopsRepo, cicdNamespace: `infra-${appName}-cicd` };
  }
  return { type, sourceRepo: appName, gitopsRepo: `gitops-${appName}`, configRepo: appName, cicdNamespace: `app-${appName}-cicd` };
}

/** The namespace an environment of `appName` runs in: <type>-<name>-<env>. */
export function envNamespace(appName: string, type: AppType | undefined, env: string): string {
  return `${type === 'infra' ? 'infra' : 'app'}-${appName}-${env}`;
}

/**
 * The type of the app `appName` names, read off the page's entity when it is that app (its project-slug's repo
 * half). Outside an entity page, or for another app, 'app'.
 */
export function useAppType(appName: string | undefined): AppType {
  const { entity } = useAsyncEntity();
  const slugRepo = entity?.metadata.annotations?.['github.com/project-slug']?.split('/')[1];
  return appName && slugRepo === appName ? appTypeOf(entity) : 'app';
}

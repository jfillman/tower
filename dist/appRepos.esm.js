import { useAsyncEntity } from '@backstage/plugin-catalog-react';

const INFRA_KIND_TAG = "kind:infraservice";
function appTypeOf(entity) {
  return entity?.metadata.tags?.includes(INFRA_KIND_TAG) ? "infra" : "app";
}
function appRepos(appName, type) {
  if (type === "infra") {
    const gitopsRepo = `gitops-infra-${appName}`;
    return { type, gitopsRepo, configRepo: gitopsRepo, cicdNamespace: `infra-${appName}-cicd` };
  }
  return { type, sourceRepo: appName, gitopsRepo: `gitops-${appName}`, configRepo: appName, cicdNamespace: `app-${appName}-cicd` };
}
function envNamespace(appName, type, env) {
  return `${type === "infra" ? "infra" : "app"}-${appName}-${env}`;
}
function useAppType(appName) {
  const { entity } = useAsyncEntity();
  const slugRepo = entity?.metadata.annotations?.["github.com/project-slug"]?.split("/")[1];
  return appName && slugRepo === appName ? appTypeOf(entity) : "app";
}

export { appRepos, appTypeOf, envNamespace, useAppType };
//# sourceMappingURL=appRepos.esm.js.map

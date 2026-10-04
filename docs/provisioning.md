# Provisioning progress

After a user creates an Airframe application, the Tower home page shows how far along it is.

- **In-flight strip** on the Services tab: one row per service being provisioned, with a segmented progress bar, the current step and time remaining. Click a row to open it.
- **Provisioning tab**: one service at a time, with every step, how long each took against its typical duration, and what is still waiting. Deep link: `/tower?view=provisioning&service=<name>`.

## Where the status comes from

Tower reads these through the Kubernetes proxy on the dev cluster, with its existing read-only identity:

| Step | Signal |
|---|---|
| Request PR merged | The request PR's state: open until a person merges it. Its open and merge times are remembered from the pending phase, so the duration stays after the XR appears (shown blank, never zero, if the page never saw it pending) |
| Request applied | The application XR exists, which means ArgoCD applied the merged request (it polls about every 3 minutes). Duration is merge time to XR creation. The XR (`catalog.hangar.io`: NodeJS, SpringBoot, Python, Go). Links the **request PR** in the tenants repo named by the XR's `terasky.backstage.io/source-info` annotation, found by its title `Create <Kind> [Resource] <name>` through the backend's `/request-pr` route |
| Dev cluster chosen | XR condition `DevClusterReady` |
| CI/CD onboarded | XR condition `CicdOnboarded` **and** the `<app>-cicd` ArgoCD Application Synced and Healthy, read from the `argocd` namespace with a read-only `applications` grant (`backstage-argocd-application-viewer`, gitops-cluster-dev `00-bootstrap/backstage-ingestor-rbac`). Backstage's ArgoCD plugin cannot be used: it only knows the argocd-apps instances, and this app is in the platform instance. Without the grant the step falls back to the condition alone |
| Repositories and starter files | The XR's `Repository` and `RepositoryFile` objects (label `crossplane.io/composite=<name>`); done when every one the XR composes is `Ready`. Falls back to XR `Ready` if they cannot be read. Links the source and GitOps repos from the Repository objects' `htmlUrl` |
| Available in the Backstage catalog | A `Component` named after the service exists, looked up through the catalog API. The ingestor makes it from the XR on its next sync, and until then Tower has no entity to open. Runs alongside the steps around it. If the lookup cannot answer, it waits, unless a build already ran |
| Application onboarding PRs | The two PRs Glidepath opens, "Onboarding: re-sync ..." on the source repo and on `gitops-<name>`, read from the backend's `/pull-requests` route. Done when both are merged, or as soon as the app's own build run or a Rollout exists. **A person merges these**, and merging the source one is what starts the first build |
| Infisical secrets resources | The app's `SecretStore` XR in `app-<name>-cicd` (`spec.appRef.name = <name>`): `Ready`, or failed on `Synced=False`. Links the Infisical project from the `Project` object's external name. An app with no SecretStore does not hold the provision open once it has built |
| First build and checks | Earliest PipelineRun of the `build` pipeline (label `tekton.dev/pipeline=build`) in `app-<name>-cicd`. Glidepath's own runs in that namespace (`onboarding-resync`, `values-check`) are ignored: they finish before any build exists and used to mark this step, and the onboarding step with it, done too early; progress is tasks finished out of tasks in the pipeline. Starts by itself on the source onboarding PR's merge |
| Running healthy in dev | Rollout in `app-<name>-dev`: `Healthy` with all replicas available. New apps get `platform/envs/dev.yaml` and a deploy-to-dev stage from onboarding; if a built app has no rollout after 5 minutes the step says which of those is missing |

GitHub-backed lookups (request PR, onboarding PRs) are not polled at the 6 second Kubernetes cadence: they refresh every 45 seconds, and stop once both onboarding PRs are merged.

A service counts as in flight if its XR is under 24 hours old and not finished. One that was built more than 4 hours ago but has no rollout on the dev cluster is treated as stalled and dropped, which covers apps that deploy elsewhere (Backstage itself deploys to kind-prod). A finished one stays in the strip for 15 minutes.

The logic lives in `src/provisioning/deriveProvisioning.ts` and is pure, so it is tested against conditions copied from a live XR.

## Known limits

- **The Infisical project link needs a read grant** on `projects.project.infisical.m.hangar.io` (the `backstage-infisical-project-viewer` ClusterRole in `gitops-cluster-dev`'s `backstage-ingestor-rbac`). Without it the step still tracks the SecretStore but has no link. The link path (`/projects/secret-management/<id>/overview`) is a redirect Infisical v0.158's router defines, not one verified in a browser. The UI is reached over the gateway's http listener.
- **Per-resource progress needs a read grant.** The `backstage-github-mr-viewer` ClusterRole (read-only on `repo.github.m.upbound.io` repositories and repositoryfiles) lives in `gitops-cluster-dev`'s `backstage-ingestor-rbac`. On a cluster without it, the step falls back to waiting for the whole XR to be Ready.
- **Typical durations are estimates**, hard-coded in `TYPICAL_SEC`, until Tower records history.
- **Cluster and CI/CD durations on old XRs are not meaningful.** Crossplane resets those condition times on re-reconcile. They are accurate for a service watched while it is being created.
- **A stalled service moves to a "Stalled" group on the tab** (built more than 4 hours ago, no rollout on the dev cluster) and leaves the strip and the tab badge. It either deploys elsewhere (Backstage itself deploys to kind-prod) or the deploy is stuck; Tower cannot tell which. It drops out entirely when the XR is 24 hours old.
- **"What gets created"** lists the XR's `resourceRefs` with readiness for the GitHub repositories/files and the CI/CD child XR, plus the app's SecretStore. Kinds Tower cannot read show as "not tracked".
- **The scaffolder link comes from the Backstage app, not the template source.** The ingestor hardcodes the generated templates' success output, so a catalog processor (`towerProvisioningLink.ts` in the backstage repo) appends "Track provisioning in Tower" to the four application templates, pointing at the deep link above.
- **Provisioning reads only the `kind-dev` cluster**, so XRs on kind-prod are not discovered.

## Before the XR exists

An XR appears only after the request PR is merged and Argo applies it, so for that stretch (a person
merging, then Argo syncing) there is nothing on the cluster to read. Tower asks the backend's
`GET /pending-requests?owner&repo` for open "Create <Kind> Resource <name>" PRs in the cluster's tenants
repo, plus ones merged in the last 30 minutes, and lists each as a service whose only running step is
"Request PR merged" ("Merge the request PR to start provisioning"); once merged, "Request applied" runs
("Merged. ArgoCD polls the repo about every 3 minutes, then creates the resource"). Every later step waits. When the XR appears it replaces the pending item under the
same name. The tenants repo comes from an existing XR's `source-info` annotation, falling back to a
per-cluster default in `useProvisioning.ts`. This needs the backend route, so Tower and the backend ship together.

## Function XRs and cloud deploys

`LambdaFunction` and `AzureFunction` XRs are tracked like the application kinds, with three differences, because
a function has no GitOps repo and no Rollout:

- **One onboarding PR, not two.** Only the source repo has one. The step is titled "Application onboarding PR"
  and is done when that PR merges. (The backend already treats a missing `gitops-<name>` repo as empty.)
- **The repos step** says "Source repo created", with no GitOps repo.
- **The last step is "Deployed to <target>"**, not "Running healthy in dev". It follows the deploy stage's own
  run: waiting for it to start, running, done (with an "Open in console" link) or failed (with the failing task
  and Tekton's message). It reads the same deploy runs as the cloud Deployments tab (cloud-deploys.md).

The same last step applies to an *application* XR that deploys to a cloud target (a Go app on `aws-ecs`):
without it that app would wait forever for a Rollout that will never exist. The cloud deploy counts as the
deployed proof for the "stalled" test too. Kubernetes apps are unchanged.

TaskRuns are fetched only for an app that already has a `deploy` PipelineRun, so an app with nothing deployed
yet costs no extra requests.

Not verified against a live function provision: the unit tests use the real captured ECS deploy and edits of
it, and the XRD has not been provisioned on a cluster yet.

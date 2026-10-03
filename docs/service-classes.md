# Service classes and tabs

Tower does not keep a list of the kinds of service it supports. A service says what it is
with two annotations on its catalog Component, and Tower works out the rest.

| Annotation | Meaning | Example values |
|---|---|---|
| `hangar.io/service-class` | what the service is. Any slug. | `container-app`, `function`, `ai-workload`, `storage`, `secret-store`, `data-lake` |
| `hangar.io/deploy-target` | where it runs. Optional. | `k8s-rollout`, `aws-ecs`, `aws-lambda`, `azure-container-apps`, `azure-functions` |

`deploy-target` mirrors `deploy.target` in the service's `cicd.yaml`. The XRD writes both
from one parameter at onboarding. `cicd.yaml` stays the source of truth; Tower reads the
annotation because the tab bar needs it before any file is fetched.

Services that predate these annotations keep working. The four application kinds and
InfraService are inferred as `container-app` on `k8s-rollout`. The older
`hangar.io/workload-type: ai` and `spec.type: ai-agent` markers are inferred as
`ai-workload`.

## Which services Tower lists

A Component is listed when it declares a class or is one of the inferred legacy kinds.
A Component registered by hand in the catalog declares nothing and stays out. A service
that runs on a cluster is listed only while Kubernetes can see it; any other service is
listed as soon as the catalog has it.

## Which tabs a service gets

Each tab declares the capabilities it needs (`requires` in `TowerPage.tsx`). A class
grants capabilities. A deploy target adds or removes some. A tab shows when the service
has all of the ones it requires; a tab with none required always shows.

| Capability | Granted by | Tabs that need it |
|---|---|---|
| `source` | classes with a GitHub repo | Pull Requests, Notifications |
| `ci` | classes built by Glidepath | Pipelines, Glidepath |
| `releases` | container-app, function | Releases |
| `images` | container-app, function | Images |
| `slo` | container-app | SLOs (also needs `k8s-runtime`) |
| `values-config` | container-app; removed by cloud targets | App Configuration |
| `k8s-runtime` | the `k8s-rollout` target | Deployments, Topology, SLOs |
| `cloud-runtime` | every cloud target | none yet |
| `autopilot` | ai-workload | Autopilot |

A class Tower has no entry for gets a label made from its slug, no capabilities, and
`source` if its Component has a `github.com/project-slug`. It still lists, filters and
opens on Overview.

## Adding a kind of service

- **No Tower change:** the XRD emits the two annotations. The service appears, gets its
  own filter chip, and shows Overview (and Pull Requests if it has a repo).
- **To give it a nicer label or capabilities:** add an entry to `SERVICE_CLASSES` in
  `src/serviceClass.ts`.
- **To give it tabs of its own:** add the tab to `TABS` with the capability it needs, and
  grant that capability from the class.
- **A new deploy target:** add an entry to `DEPLOY_TARGETS`. Without one it still works,
  filed under its provider by prefix (`aws-`, `azure-`, `gcp-`).

## Not built yet

Cloud targets have no Deployments view. `cloud-runtime` is granted but no tab consumes it;
the per-target Deployments adapter is the next piece.

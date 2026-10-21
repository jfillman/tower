# Service classes and tabs

Tower does not keep a list of the kinds of service it supports. A service says what it is
with two annotations on its catalog Component, and Tower works out the rest.

| Annotation | Meaning | Example values |
|---|---|---|
| `hangar.io/service-class` | what the service is. Any slug. | `container-app`, `function`, `infra-service`, `ai-workload`, `ai-service`, `storage`, `secret-store`, `data-lake` |
| `hangar.io/deploy-target` | where it runs. Optional. | `k8s-rollout`, `aws-ecs`, `aws-lambda`, `azure-container-apps` |

`deploy-target` mirrors `deploy.target` in the service's `cicd.yaml`. The XRD writes both
from one parameter at onboarding. `cicd.yaml` stays the source of truth; Tower reads the
annotation because the tab bar needs it before any file is fetched.

Services that predate these annotations keep working. The four application kinds are
inferred as `container-app` on `k8s-rollout`, and InfraService as `infra-service` on
`k8s-rollout`. `LambdaFunction` and
`AzureFunction` are inferred as `function` on `aws-lambda` and `azure-container-apps`
(Azure Functions are hosted on Container Apps), so they work before the catalog ingestor
emits the annotations. An explicit annotation always wins. The older
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
| `source` | classes with a GitHub repo | Pull Requests, Notifications (with `ci`) |
| `ci` | classes onboarded to Glidepath (a `cicd.yaml`) | Pipelines, Environments, Notifications, Glidepath |
| `build` | container-app, function, ai-service: a source repo Glidepath builds | Pipelines (with `ci`) |
| `releases` | container-app, function, ai-service | Releases |
| `images` | container-app, function, ai-service | Images |
| `slo` | container-app, infra-service, ai-service | SLOs (also needs `k8s-runtime`) |
| `values-config` | container-app, infra-service, ai-service; removed by cloud targets | App Configuration |
| `k8s-runtime` | the `k8s-rollout` target | Deployments, Topology, SLOs |
| `cloud-runtime` | every cloud target | Deployments (the cloud variant, see cloud-deploys.md) |
| `autopilot` | ai-workload, ai-service | no tab yet: the agent definition on Overview |

An **infra-service** (an Airframe InfraService such as a broker) has no source repo, build,
image or release records: it gets `source`, `ci`, `values-config` and `slo` but not `build`,
`releases` or `images`. Its own filter chip on the Services list is "Infra services".

An **ai-workload** is an Autopilot agent in an ephemeral shape (task, session, scheduled, event,
team): it runs as `AgentRun`s and leaves nothing deployed. An **ai-service** is the long-running
*service* shape that Glidepath builds from its own repo and deploys like a container app. Both show
the agent's definition on Overview (see below). The Autopilot Agent tab is not built, so no tab
requires `autopilot` until it is.

## Tabs by service type

| Tab | Container app (Kubernetes) | Container app (cloud) | Function | Infra service | AI workload | AI service |
|---|---|---|---|---|---|---|
| Overview | yes | yes | yes | yes | yes (agent definition, no environments) | yes (with agent definition) |
| Pull Requests | yes | yes | yes | yes (gitops-infra repo) | yes | yes |
| Pipelines | yes | yes | yes | | | yes |
| Deployments | Rollout variant | cloud variant | cloud variant | Rollout variant (StatefulSet) | | Rollout variant |
| Releases | yes | yes | yes | | | yes |
| Environments | yes | yes | yes | yes | | yes |
| Topology | yes | | | yes | | yes |
| Images | yes | yes | yes | | | yes |
| SLOs | yes | | | yes | | yes |
| Notifications | yes | yes | yes | yes | | yes |
| App Configuration | yes | | | yes (no preview section) | | yes |
| Glidepath | yes | yes | yes | yes (deploy, governance, notifications, secrets, advanced) | | yes |

"Container app (cloud)" is `aws-ecs` or `azure-container-apps`; "Function" is `aws-lambda` (LambdaFunction) or
`azure-container-apps` (AzureFunction). The table is asserted by `src/TowerPage.tabs.test.ts`.

Within a tab, an InfraService also gets less: App Configuration has no Preview environments section (nothing
builds its pull requests) and the Glidepath tab shows only the sections its `cicd.yaml` uses. The tab-by-tab
analysis is in the [Tower service types spec](https://claude.ai/artifact/TchwwJAoV7wjPdGWqcLnev).

## An agent's definition

An AI workload or AI service shows its Autopilot definition on Overview: shape, identity, tier ceiling, models,
network, compute, framework, triggers, the tools it may call through Clearance, the service APIs it may reach and
its limits. Tower reads it through the backend's `/agent-definition` route from the Component's own repo
(`github.com/project-slug`), at the path in `hangar.io/agent-definition` or `agent.yaml` at the root. The route reads
only `agent.yaml` or a YAML file under `agents/`, and refuses a file without a `name` and one of the six `kind`s.
Runs and cost join it when the Autopilot backend exposes them.

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

Live health for cloud targets. The cloud Deployments tab shows what Glidepath deployed, not whether
the service is up; see cloud-deploys.md.

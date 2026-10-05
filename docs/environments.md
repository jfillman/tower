# Environments tab

One table of every environment of a service, in promotion order, for Kubernetes and cloud services
alike. Design, decisions and the phased plan: glidepath `docs/admin/envs-overhaul-requirements.md` and
`docs/admin/adr/0019-environments-as-one-config-model.md`.

## What it shows

Each row: the environment, its tier (**Ground** deploys on every push, **Flight** only through an
approved release), the target (Kubernetes, AWS Lambda, ...), where it runs (the cluster, or the function /
service and region), health, the live image and when it was deployed. An environment `cicd.yaml` declares but
nothing has deployed to says "not deployed yet". Preview (`pr-N`) environments are not listed. The order and
tiers come from the app's own `cicd.yaml`, in either shape (`deploy.environments`, or the older
`lowerEnvironments` / `upperEnvironments` / `promotionOrder`).

## Editing: staged, then one pull request

Edits do not submit anything. They are **staged**, and the **Pending changes** panel lists them all, with
anything that would be refused (the same rules as the chart and schema: names, duplicates, no cluster on a
Ground environment, no Flight on a cloud target, an override only for the app's own target). **Open pull
request** turns the staged changes into one change to `cicd.yaml` (the existing Glidepath change route,
reviewed and merged like any other). Nothing is written until you merge it.

What can be staged so far:

| Change | What it does |
|---|---|
| **Add environment** (Ground) | Adds the environment to `deploy.environments`. After the PR merges, Glidepath's onboarding resync opens a second PR that adds `platform/envs/<name>.yaml` (the panel says so up front). A cloud environment has no such file. |
| **Add environment** (Flight, Kubernetes apps) | Needs the cluster it runs on (any registered upper cluster; ones this app already uses are suggested). Opens **two** pull requests, in this order: an ApplicationEnvironment request on the tenants repo (through Backstage's existing template, launched via the scaffolder API as you), then the `cicd.yaml` change. Merge the request first, so the environment exists when `cicd.yaml` names it; Crossplane then adds its gitops directory and the Application. If the request fails, nothing is changed in `cicd.yaml` and what you staged is kept. If `cicd.yaml` fails after the request opened, retrying does not open the request again. By default the same `cicd.yaml` change also adds a `release` step for it to the app's main pipeline (the one with the most deploy and release steps), right after the step for the environment before it (at the end if that one has no step). Untick *Also add a release step* to edit the pipeline yourself in the Glidepath tab. Nothing is added when the service has no pipeline with steps, or a pipeline already has a step for the environment; the panel says so. Not offered for a cloud target (it has no approval path for Flight yet). |
| **Reorder** (drag the handle, or Move earlier / later in the row menu) | Changes the declared promotion order, for Ground and for Flight environments. A Ground environment never moves past a Flight one. Reordering Flight environments does not reorder the pipeline's release steps (the panel says so): edit those in the Glidepath tab. |
| **Remove** (✕, Ground only) | A dialog previews the impact and asks you to type the environment's name. On a Kubernetes app the **same** pull request removes the environment from `cicd.yaml` and deletes its `platform/envs/<name>.yaml` and `<name>.release.yaml` (and the `glidepath/` equivalents), whichever exist. After it merges Argo CD prunes the Application `<app>-<name>` and the namespace `app-<app>-<name>`, deleting everything running in it. Refused while a pipeline step still names the environment (remove the step in the Glidepath tab first); the backend re-checks this and only accepts `envs/<env>[.release].yaml` paths. On a cloud app only `cicd.yaml` changes: the cloud resource is **not** deleted. Removing an environment you only just staged simply un-stages it. |
| **Duplicate** (row menu) | Opens the Add dialog as a copy of the row: same tier, same cluster (Flight) and same settings; you give it a name. A cloud environment keeps its other settings but not the resource it points at (two environments on one function would deploy over each other). **Copy the values** (Kubernetes apps): for a Ground copy its `platform/envs/<name>.yaml` is created in the **same** pull request from the source's values (its image excluded); Glidepath's onboarding resync only scaffolds a missing file, so it never overwrites it. A Flight copy's values file is written by Crossplane after the request merges; once it exists use **Copy values from** in its Values tab. |
| **Copy values from** (Values tab) | Loads another environment's values into the form as staged edits (nothing is saved until the pull request merges; Discard all undoes it). `rollout.image` is never copied. Works between any two Kubernetes environments, Ground or Flight. |
| **A cloud environment's own resource** (click the row) | Sets this environment's `lambda` / `ecs` / `azureContainerApps` fields (for example the function name). An empty field uses the app-level value, shown as its hint. |

| **Values** (click the row, Kubernetes apps) | The environment's chart values as a form in seven sub-tabs: **Workload** (deployment, scaling, resources, service, health checks, availability, rollout strategy and pod template), **Release** (canary steps, notifications, custom AnalysisTemplates, SLOs), **Networking**, **Config** (environment variables, config maps, volumes), **Components** (attached Redis, RabbitMQ, PostgreSQL and the rest as a form drawn from airframe's own component schemas: a card per component, its mode, its required fields, and what it hands the app; the raw YAML stays underneath), **Access** (service account, secrets) and **Advanced** (cron jobs, one-off jobs, extra manifests, the full committed YAML). A dot marks a sub-tab that holds a change. A Ground environment's values are `platform/envs/<name>.yaml`; a Flight environment's are `gitops-<app>/<cluster>/<name>/values.yaml`. Either file has its **own** pull request (a different file from `cicd.yaml`), so the form has its own Pending changes panel under it, pinned to the bottom of the screen, and is not part of the page's panel. A Ground environment you only just staged has no file yet (the onboarding pull request creates it), so the row says so instead. |
| **Full values (annotated)** | *View full values (annotated)*, above the sub-tabs of any values form (an environment's row, App Configuration), shows the chart's defaults with that environment's file laid over them, each field with its description from airframe's schema and `# set here` on what the file sets. Your staged changes are included as you make them. It reads the chart from airframe's main branch, so it can run slightly ahead of the version an environment is pinned to. |
| **What the form edits** (beyond the basics) | **Environment variables** are a value, a ConfigMap key, a Secret key, or **From component** (`fromComponent: {name, output}`, with the outputs each component type offers). A hand-written reference that is really a component's own output (airframe-validate's AF-COMP-003 warning) gets a one-click *Use component X.output instead*. **Networking** has the NetworkPolicy gateway namespace, extra ingress sources and egress destinations (namespace or CIDR, pod labels, ports) and the raw extra rules; annotations for Ingress and HTTPRoute; ServiceMonitor labels. **Pod template** (Workload) and **Rollout strategy** (Release) are separate raw-YAML panels, each with an example. The chart supports custom labels and annotations only on the Namespace, ServiceAccount, Ingress, HTTPRoute and ServiceMonitor: there is no field for pod, Rollout or Service annotations, so none is offered. Empty fields show ghost text (italic): *e.g.* for an example, *default:* for what applies when it is left empty. |
| **Labels, templates and SLOs** | **Labels and annotations** (Workload tab): extra labels and annotations on the pods, the Rollout and the Service (chart v0.3.115+); a label the chart owns (`app.kubernetes.io/*`, `hangar.io/*`, `helm.sh/chart`) or a `checksum/*` annotation is refused before a pull request opens. **Canary analysis templates**: each template a step uses is either *declared in this file* (under Custom AnalysisTemplates) or a *cluster template* (`clusterScope: true`); Argo looks a reference up in the app's namespace unless it is marked, and rejects the whole Rollout when it is missing. Tower checks every reference (steps, `canaryAnalysis`, blueGreen analyses) against the file and the cluster's ClusterAnalysisTemplates, shows a standing warning on the Release tab and blocks the pull request. **Common SLOs** (Release tab): toggles for readiness availability, liveness availability and health-check latency, each offered only when Prometheus has data for the workload (checked live; kind-prod runs no Prometheus, so they show *cannot check* there). Turning one on adds its entry to the `slos:` YAML below it. Request-based SLOs need request metrics that are not scraped on these clusters, so they are not offered. |
| **Flight settings** | A Flight environment's Settings sub-tab also holds its catalog resource (`ApplicationEnvironment`'s `configMapGenerator`) and its configmap source files. |
**An app still on the older shape is converted by its first change.** Tower always writes
`deploy.environments`, so the first staged change to such an app also replaces `lowerEnvironments`,
`upperEnvironments` and `promotionOrder` with one list (keeping the same environments and order). That
conversion is shown as the first line of the panel, never done silently.

**Flight environments are not removed by Tower.** Deleting the ApplicationEnvironment XR deletes none of the
files it wrote (they deliberately have no delete policy, after an earlier data-loss incident), and the file in
the tenants repo is what keeps the Application alive, so a partial automated removal could leave a live
Application. The row's Danger zone lists the manual steps in order.

The values form is the one App Configuration used to hold alone; it now takes a *source* (`src/values/sources.ts`) so the same form edits a
Ground or a Flight environment, or one of the app-wide files (`platform/base.yaml`, `platform/pr-env.yaml`) on the App Configuration tab.
The Glidepath tab is the same shape for `cicd.yaml`: sub-tabs (Build, Test, Deploy, Preview environments, Governance, Notifications,
Secrets, Pipelines, Advanced), a dot on the ones with a staged change, and one Pending changes panel for its single pull request. The ApplicationEnvironment launcher is `src/environments/applicationEnvironment.ts`.

## The table

Filter chips (All / Ground / Flight / Cloud, with counts) sit above a panel of rows: drag handle (Ground rows that can move), name
with a *staged* chip, tier, target, where, health, live image with its age, and an actions menu (Edit details, Move
earlier / later, Remove, Undo removal). A row staged for removal stays in place, struck through, until the change is opened.
Clicking a row opens four sub-tabs: **Settings** (a cloud environment's resource fields with a "set here" / "app-level" tag; for
Kubernetes the read-only facts), **Values**, **Promotion** (how it deploys and which pipeline step reaches it) and **Danger zone**.
Drag a handle onto another Ground row to reorder, or use the menu. The layout follows the mockup; the shared pieces are in
[the design system](design-system.md).

## After you open a pull request

Opening the pull request does not make the environment appear: it exists when the change merges. Tower remembers what you submitted
(in the browser, per service) and keeps it visible until `cicd.yaml` shows the result:

- The new environment stays in the table, marked **PR open**; an environment with a removal pull request open is marked **removal PR open**.
- The **Open pull requests** panel lists each pull request (the `cicd.yaml` one and, for a Flight environment, its ApplicationEnvironment
  request) with **Check again** and **Dismiss**. The tab asks again every half minute while any is open, and **Refresh** in the header asks now.
- Expanding such a row shows **provisioning progress**: for a Flight environment the `cicd.yaml` change, the request pull request,
  Crossplane applying it, the files written to GitHub (n of m), the Infisical secret store (with a link to the project once ready), the
  values file, and the first deploy; for a Ground one the `cicd.yaml` change, the onboarding pull request, the values file and the deploy.
  Links go to the pull requests, the GitOps repo, the file and the Infisical project. An environment that exists but is not fully
  provisioned shows the same steps collapsed above its sub-tabs.
- **The Values tab waits for the file.** Until the environment's values file exists (a Flight environment's is written by Crossplane,
  a Ground one's by the onboarding pull request) the tab says so instead of showing a form, for Ground and Flight alike.

## Where the code is

- `src/values/`: `ValuesForm.tsx` (the form, its sub-tabs and its pending panel), `sources.ts` (Flight / Ground), `FlightPanels.tsx`, `styles.ts`.
- `src/environments/`: `submitted.ts` (remembered pull requests), `lifecycle.ts` (the provisioning steps, pure) and `useEnvLifecycle.ts` (reads GitHub, the ApplicationEnvironment XR, its files and the SecretStore).
- `src/environments/stagedChanges.ts`: the pure model (read either shape, apply staged changes, validate,
  build the `deploy` block, describe the changes). Heavily tested; the rules live here, not in the component.
- `src/tabs/EnvironmentsTab.tsx`: state and handlers; `src/tabs/environments/`: `RowDetail` (the sub-tabs), `PendingChanges`, `dialogs`, `shared`.
- `src/ui/`: the shared kit.
- `src/environmentRows.ts`: the read-only row builder.

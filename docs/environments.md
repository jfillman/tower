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
| **Add environment** (Flight, Kubernetes apps) | Needs the cluster it runs on (any registered upper cluster; ones this app already uses are suggested). Opens **two** pull requests, in this order: an ApplicationEnvironment request on the tenants repo (through Backstage's existing template, launched via the scaffolder API as you), then the `cicd.yaml` change. Merge the request first, so the environment exists when `cicd.yaml` names it; Crossplane then adds its gitops directory and the Application. If the request fails, nothing is changed in `cicd.yaml` and what you staged is kept. If `cicd.yaml` fails after the request opened, retrying does not open the request again. The release step in the pipeline that deploys to it is not added: edit the pipeline in the Glidepath tab. Not offered for a cloud target (it has no approval path for Flight yet). |
| **Reorder** (↑ ↓, Ground only) | Changes the promotion order. A Ground environment never moves past a Flight one. |
| **Remove** (✕, Ground only) | A dialog previews the impact and asks you to type the environment's name. On a Kubernetes app the **same** pull request removes the environment from `cicd.yaml` and deletes its `platform/envs/<name>.yaml` and `<name>.release.yaml` (and the `glidepath/` equivalents), whichever exist. After it merges Argo CD prunes the Application `<app>-<name>` and the namespace `app-<app>-<name>`, deleting everything running in it. Refused while a pipeline step still names the environment (remove the step in the Glidepath tab first); the backend re-checks this and only accepts `envs/<env>[.release].yaml` paths. On a cloud app only `cicd.yaml` changes: the cloud resource is **not** deleted. Removing an environment you only just staged simply un-stages it. |
| **A cloud environment's own resource** (click the row) | Sets this environment's `lambda` / `ecs` / `azureContainerApps` fields (for example the function name). An empty field uses the app-level value, shown as its hint. |

| **Values of a Ground environment** (click the row, Kubernetes apps) | Shows `platform/envs/<name>.yaml` as YAML (the same chart values as App Configuration, minus `rollout.image`) with its own **Open PR for this file** button. It is a *different file* from `cicd.yaml`, so it has its own pull request and is not part of the Pending changes panel. Only the fields App Configuration also allows are written. A Ground environment you only just staged has no file yet (the onboarding pull request creates it), so the row says so instead. |
| **Values of a Flight environment** (click the row) | Links to App Configuration with that environment preselected (`?tab=config&env=<name>`), which keeps its own form, pull-request flow and prod warnings. |

**An app still on the older shape is converted by its first change.** Tower always writes
`deploy.environments`, so the first staged change to such an app also replaces `lowerEnvironments`,
`upperEnvironments` and `promotionOrder` with one list (keeping the same environments and order). That
conversion is shown as the first line of the panel, never done silently.

**Flight environments are not removed by Tower.** Deleting the ApplicationEnvironment XR deletes none of the
files it wrote (they deliberately have no delete policy, after an earlier data-loss incident), and the file in
the tenants repo is what keeps the Application alive, so a partial automated removal could leave a live
Application. The row's Danger zone lists the manual steps in order.

Not here yet: the full App Configuration *form* for a Ground environment. Its values are edited as YAML (the same
editor as the Glidepath tab's Platform files); generalising App Configuration's form to platform files is a larger change. The ApplicationEnvironment launcher is `src/environments/applicationEnvironment.ts`.

## Where the code is

- `src/environments/stagedChanges.ts`: the pure model (read either shape, apply staged changes, validate,
  build the `deploy` block, describe the changes). Heavily tested; the rules live here, not in the component.
- `src/tabs/EnvironmentsTab.tsx`: the table, row editors, the Pending changes panel and the Add dialog.
- `src/environmentRows.ts`: the read-only row builder.

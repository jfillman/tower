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
| **A cloud environment's own resource** (click the row) | Sets this environment's `lambda` / `ecs` / `azureContainerApps` fields (for example the function name). An empty field uses the app-level value, shown as its hint. |

**An app still on the older shape is converted by its first change.** Tower always writes
`deploy.environments`, so the first staged change to such an app also replaces `lowerEnvironments`,
`upperEnvironments` and `promotionOrder` with one list (keeping the same environments and order). That
conversion is shown as the first line of the panel, never done silently.

Not here yet: deleting an environment, and the values of a Kubernetes environment (Glidepath tab / App
Configuration). The ApplicationEnvironment launcher is `src/environments/applicationEnvironment.ts`.

## Where the code is

- `src/environments/stagedChanges.ts`: the pure model (read either shape, apply staged changes, validate,
  build the `deploy` block, describe the changes). Heavily tested; the rules live here, not in the component.
- `src/tabs/EnvironmentsTab.tsx`: the table, row editors, the Pending changes panel and the Add dialog.
- `src/environmentRows.ts`: the read-only row builder.

# Security model: what Tower may change, and who may ask

Tower is a window onto the platform and a small set of levers on it. This page describes every lever, who may pull
it, and the guardrails behind each one, in Tower, in Backstage's backend, in Argo CD and in the cluster.

## Principles

1. **Git is the source of truth.** Configuration, promotions, releases, rollbacks and cloud pins all happen as pull
   requests to a git repository, reviewed and gated like any change. Tower never edits a cluster object directly to
   change what an environment runs.
2. **Delegated, not direct.** Tower and its backend hold **no Kubernetes write permissions on any cluster**. Sync,
   force sync, terminate and Rollout actions run through Argo CD, as one narrowly scoped Argo CD account. Argo CD
   checks that the resource belongs to the Application and records the operation.
3. **The server decides, not the request.** Whether an environment is Ground or Flight comes from the app's
   `cicd.yaml`, read on the server. Whether a sync prunes comes from the Application's own policy in Argo CD. Which
   releases a rollback may target comes from the release records. A crafted request cannot widen any of these.
4. **Owners act on their own apps; Flight asks for more.** Every write needs the app's owning team. Actions that can
   change a Flight (upper) environment's running state outside a reviewed PR need an admin.
5. **Every write is audited**, including a refusal. The riskiest are also announced to everyone.
6. **Refuse rather than half-succeed.** A release to an environment that runs no workload is refused before any PR
   exists, and the chart refuses to render a release that would report nothing.

## Who may do what

Each action is a Backstage permission on the app's catalog entity (`towerPermissions.ts` in the backstage repo).
Owners are the Component's `spec.owner`, which comes from the app's ownership annotation. Admins are members of
`group:default/admins`. Anyone else, and any service token, gets a 403.

| Action | Permission | Ground | Flight | Audit |
|---|---|---|---|---|
| Argo CD refresh / hard refresh | `tower.argo.refresh` | owners | owners | medium |
| Argo CD sync | `tower.argo.sync` / `tower.argo.sync.flight` | owners | **admins only** | medium / high |
| Argo CD force sync | `tower.argo.force` / `tower.argo.force.flight` | owners | **admins only** | high |
| Terminate a running sync | `tower.argo.terminate` | owners | owners | medium |
| Rollout: resume, pause, abort, retry, restart pods | `tower.rollout.action` | owners | owners | medium (Flight: high) |
| Restart one pod (Topology → a pod) | `tower.pod.restart` | owners | owners, **never the last ready pod** | medium (Flight: high, announced) |
| Rollout: promote, promote full (skip analysis) | `tower.rollout.bypass` | owners | owners, **as a bypass** | critical on Flight |
| Promote / first deploy (opens a release PR) | `tower.release.promote` | owners | owners | medium |
| Roll back (opens a rollback release PR) | `tower.release.rollback` | n/a | owners | high |
| Cloud release pin (promote or roll back) | `tower.release.pin` | owners | owners | medium |
| Edit values, shared values, env XR, ConfigMap files, `cicd.yaml` (opens a PR) | `tower.config.edit` | owners | owners | medium |
| Edit a release record's human context | `tower.release-record.edit` | owners | owners | medium |
| Delete old images (Images tab → Clean up old images) | `tower.images.prune` | owners | owners | high |

- The `.flight` permissions are **grant-only**: ownership never satisfies them. Today only admins hold them.
- An environment the server cannot place in either tier is treated as Flight, the stricter one.
- A Rollout action on a Flight environment that skips canary analysis is audited `critical` and broadcast as a
  break-glass bypass. Every Rollout action sends a notification to everyone.
- The request's GitHub owner must match the entity's `github.com/project-slug`, so a request cannot point an action
  at a different repository.
- Tower asks `/argo/capabilities` (and the Rollout action list) which actions you may run, and greys out the rest
  with the reason. That is a convenience: the write routes check again.

## Argo CD: what Tower's account can do

All Argo CD actions run as one account, `backstage`, on each cluster's application Argo CD. Its policy is three
roles:

| Role | Grants | Scope |
|---|---|---|
| `role:readonly` | `get` (read; Refresh is a read with a refresh flag) | everything |
| `role:tower-sync` | `sync` (also covers force sync and terminate) | app projects only |
| `role:tower-rollout` | `action/argoproj.io/Rollout/*` | app projects only |
| `role:tower-pod` | `delete//Pod/*`: delete a Pod, nothing else | app projects only |

"App projects only" is enforced with **deny rules for the platform projects** (`default`, `idp-onboarding`). In
Argo CD RBAC a deny overrides an allow, so this holds however app projects are named, with no list to maintain when
an app is onboarded. It is checked with `argocd admin settings rbac can`: sync on an app environment is allowed, on
an onboarding Application it is denied, and deleting anything but a Pod (a Deployment, a Service, the Application) is
denied everywhere.

Tower never uses Argo CD to delete anything but a single pod, roll back to an earlier Argo CD revision (that would fight automated
sync and bypass the git rollback), or change an Application's spec.

## Environment Applications

Every environment's Argo CD Application (Ground and Flight) has:

- **automated sync with self-heal**: drift in the cluster is reverted to git;
- **prune**: a resource the chart stops rendering is deleted, so git is the whole truth. Argo CD's default
  `allowEmpty: false` refuses a sync that would delete everything, and a chart render failure blocks the sync before
  anything is pruned;
- **`preserveResourcesOnDeletion`** on the ApplicationSets: deleting or replacing the generator does not delete a
  running environment.

## Release guardrails Tower relies on

Tower's release actions open PRs; Glidepath's gates decide whether they merge.

- **Every release PR runs the release gates**: static analysis, image scan, SBOM, provenance (signed commit and
  image, SLSA attestation) and policy. A gate that is not implemented yet is shown as a stub, never as a pass.
- **A rollback is an ordinary release.** Its eligibility (the image is one of the environment's last five healthy
  releases) is recomputed by the gates, not taken from the PR. On an eligible rollback the content gates (static
  analysis, image scan, SBOM) report as *advisory* without blocking, because that image already ran there.
  **Integrity gates (provenance, signatures) still block.**
- **No workload, no release.** An environment whose values say it runs no service (`rollout.enabled: false`, or
  the older `rollout: null`) is refused by `open-release-pr` (Flight) and `deploy-manifests` (Ground) before any PR
  or commit, and by Tower's Promote. The chart's release-tracking guard fails the render if a release is tracked
  where no workload runs.
- **Bypass merges are visible.** Skipping a failed gate is possible only as a break-glass merge, which the PR's
  checks keep showing as failed.

## Audit

Every write route emits a `tower-write` event through Backstage's auditor (the backend log). It records the user, the
permission, the app entity, the environment, cluster and tier where they apply, extra facts (force, prune, rollback
target), and the outcome. A refusal is audited too.

Severity is `medium` by default, `high` for the `.flight` permissions, rollback, force sync and Flight Rollout
actions, and `critical` for a Flight analysis bypass.

## Image pruning

Images tab → **Clean up old images** deletes an app's old package versions from the registry. It covers only the
app's own packages (`<app>`, `<app>-pr`, `<app>/cache`). Platform images (`glidepath-*`, `function-*`,
`provider-*`, `airframe-*`, `charts/*`) are refused whatever the app is called.

- **Plan first.** The plan lists every release it would delete, and the reason each other release is kept. The
  delete runs only that plan: the backend re-plans and, if anything changed, refuses and shows the new plan.
- **Always kept:**
  - anything running in a pod on any cluster;
  - anything in a ReplicaSet a Deployment or Rollout can scale back to;
  - anything named in the app repo's `glidepath/` files or the gitops repo, on the default branch or any open PR;
  - each environment's last five releases that reached healthy (the rollback window), and any release in flight;
  - a PR image whose tag is an open PR's head;
  - anything younger than 14 days, and the 10 newest builds. Build cache: the 20 newest layers and anything under
    14 days.
- **A release goes whole**: its index, platform images, signature, attestation and referrers, so nothing is left
  half-deleted.
- **The credential** is a classic token with only `read:packages` and `delete:packages` (user-owned packages accept
  nothing narrower). It is held by the backend from Infisical, never by the browser. Without it the plan still shows
  and Prune is disabled.
- At most 300 versions per run, paced. The run is audited `high` and announced to everyone.

## What Tower never does

- **No pod exec or shell.** Not on any environment today. A break-glass design (time-boxed, two-person approval,
  recorded, debug containers rather than exec, enforced by admission policy) is proposed, not built.
- **No direct Kubernetes writes**: no scale, patch or delete of workloads from Tower. Restarting goes through Argo
  CD: *Restart pods* on the Rollout (rolling), or *Restart pod* for one pod. A pod delete skips the
  PodDisruptionBudget, so the backend counts the pod's ready siblings first: the last ready pod is refused on Flight
  and needs an explicit "restart anyway, accepting downtime" on Ground.
- **No direct commits to an environment's running configuration.** Every change is a PR.
- **No standing credentials in the browser.** The browser talks only to Backstage's backend, which holds the
  Argo CD and GitHub credentials.

## Trying it out

The development org (`examples/org.dev.yaml` in the backstage repo) has two test users: `guest`
(team-flight-ops) and `skyport-dev` (team-skyport, which owns sky-marshall). On sky-marshall, guest gets a 403 from
every write route and sees the Argo CD panel and Rollout controls greyed out with the reason. skyport-dev can use the
Ground actions, and is refused Flight sync and force sync.

## Known gaps

- Release PRs to gitops repositories are on a plan without branch protection, so a break-glass merge is possible
  for anyone with write access to the repository. The PR keeps its failed checks visible.
- Merging a release PR from Tower is not offered; merge it on GitHub.
- Image pruning does not scan the cluster repositories. Platform deployments defined there, such as Backstage
  itself, are protected by the running-pod and ReplicaSet rules, not by their git history.

# Security model: what Tower may change, and who may ask

Tower is a window onto the platform and a small set of levers on it. This page describes every lever, who may pull
it, and the guardrails behind each one, in Tower, in Backstage's backend, in Argo CD and in the cluster.

Every rule here is also in Hangar's [business rules register](https://github.com/<owner>/hangar/blob/main/docs/policy/business-rules.md), with the rules of every other component.
A change to a rule updates that page too.

## Principles

1. **Git is the source of truth.** Configuration, promotions, releases, rollbacks and cloud pins all happen as pull
   requests to a git repository, reviewed and gated like any change. Tower never edits a cluster object directly to
   change what an environment runs.
2. **Delegated, not direct.** Tower and its backend hold **no standing Kubernetes write permissions on any cluster**.
   Sync, force sync, terminate and Rollout actions run through Argo CD, as one narrowly scoped Argo CD account. Argo CD
   checks that the resource belongs to the Application and records the operation. There are two exceptions. Both are
   held to their exact shape by admission policies in the cluster, and on <dev-cluster> both are held only by
   `hangar:<prod-cluster>:tower-actor`, whose token is minted for each action ([Cluster credentials](credentials/index.md)):
   - Tekton Re-run and Cancel, and a Flight promotion's or rollback's run: only a call to glidepath-api, through
     <dev-cluster>'s service proxy. glidepath-api authorizes it (a SubjectAccessReview on its own resources), audits
     it, and creates or patches the PipelineRun as its own ServiceAccount; `glidepath-api-pipelinerun-shape` allows
     only Glidepath's own run shape in an `app-` or `infra-` `-cicd` namespace, and on an existing run only a cancel.
     It refuses any PipelineRun write from `tower-actor`, which holds no Tekton grant (until P6, 2026-10-30, it
     created and patched PipelineRuns itself).
   - [Break-glass](break-glass/index.md): the only standing right is to bind one of two debug roles to itself, for one
     session, in one namespace.
3. **The server decides, not the request.** Whether an environment is Ground or Flight comes from the app's
   `cicd.yaml`, read on the server. Whether a sync prunes comes from the Application's own policy in Argo CD. Which
   releases a rollback may target comes from the release records. A crafted request cannot widen any of these.
4. **Owners act on their own apps; Flight asks for more.** Every write needs the app's owning team. Actions that can
   change a Flight (upper) environment's running state outside a reviewed PR need an admin.
5. **Every write is audited**, including a refusal. The riskiest are also announced to everyone.
6. **Refuse rather than half-succeed.** A release to an environment that runs no workload is refused before any PR
   exists, and the chart refuses to render a release that would report nothing.
7. **The Kubernetes proxy is read-only.** Tower reads clusters through Backstage's `/api/kubernetes/proxy`, which runs
   as Backstage's own identity and does no ownership check, so the backend refuses anything but GET (and any WebSocket
   upgrade) on it. Every write goes through an owner-gated route.
8. **No stored cluster credential.** On <prod-cluster>, Backstage is its in-cluster ServiceAccount. On <dev-cluster>, reads use
   the pod's own projected token (600 s, rotated by the kubelet), and writes use a `tower-actor` token minted for each
   action. <dev-cluster> trusts <prod-cluster>'s ServiceAccount issuer and maps those two tokens to two users with separate RBAC.
   Nothing long-lived exists to leak, and deleting one entry in <dev-cluster>'s authentication config revokes everything in
   seconds. See [Cluster credentials](credentials/index.md).

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
| Tekton Re-run a PipelineRun | `tower.pipeline.rerun` | owners | owners | medium |
| Tekton Cancel a running PipelineRun | `tower.pipeline.cancel` | owners | owners | medium |
| Edit a release record's after-release notes, or the next release's draft (summary, notes, owner, risk) | `tower.release-record.edit` | owners | owners | medium |
| Change an app's release mode (Hand-flown / Assisted): opens a PR to the platform's release-modes file | `tower.release.mode` | admins only | admins only | medium |
| Delete old images (Images tab → Clean up old images) | `tower.images.prune` | owners | owners | high |
| Break-glass debug session (Topology → a pod → Debug) | `tower.breakglass.request` | owners | owners, **after a second person approves** | high (Flight request: medium) |
| Approve or deny a Flight break-glass request | `tower.breakglass.approve` | n/a | owners other than the requester, admins | high |
| End someone else's break-glass session | `tower.breakglass.terminate` | admins | admins, and the session's approver | high |
| Break glass: a Flight session with no second person | `tower.breakglass.self` | n/a | admins | **critical**, announced to everyone |
| Review a glass-broken session after it ends | `tower.breakglass.approve`, or membership of `glidepath.breakglass.reviewers` (review only) | n/a | owners other than the requester, admins, the fallback reviewers group | high |

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

## Release records: what the backend does on its own

Two scheduled tasks in Backstage's backend write to GitHub without a user asking, with the backend's GitHub
integration credential ([Release records](release-records/index.md#where-it-lives-and-what-runs-on-its-own)):

- **Only PRs, statuses and Releases.** The record and outcome are PRs to `gitops-<app>`, on `release-record-*` and
  `release-record-outcome-*` branches that the release gates skip. Nothing merges them; the record is in the history
  only once a person merges the PR. The sign-off status is a commit status on the release PR.
- **A GitHub Release is opt-in per release**, set by an owner in the draft, and published only once the release is
  healthy in production. It never creates a tag at a commit other than the image's, and never moves or replaces a tag.
- **Only owners and admins sign off.** An approval on a Hand-flown release PR counts only from a member of the app's
  owning team or an admin (matched by GitHub login to the Backstage User), and never from whoever merges or opened it.
  A collaborator with access to the gitops repository can review, but that review is not a sign-off.
- **The sign-off is a soft gate.** The status cannot block a merge (see Known gaps); a merge without a sign-off that
  counts is announced at high severity and stays on the record.
- **Announcements go to everyone** through Backstage notifications, with the app, the release name, the PR and who
  signed off. They carry nothing a signed-in user cannot already read.

The draft is the one direct commit: **Save** writes `glidepath/releases/next.yaml` in the app repo with the
backend's credential, naming the user in the commit message (`tower.release-record.edit`, audited). When the release
is recorded, the record poll deletes the file the same way, when it opens the record PR. Glidepath builds nothing
for a push that only touches `glidepath/`, and no environment reads that file. A release mode changes only through a
PR to `release-modes.yaml`, which only admins may open (`tower.release.mode`).

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

## Break-glass debug sessions

A recorded, time-boxed shell in a hardened debug container on one pod, for when logs, metrics and the resource tree
cannot answer the question. It has its own guide: [Break-glass debugging](break-glass/index.md) (for users) and the
[break-glass admin guide](break-glass/admin/index.md). The guardrails, in brief:

- **Never exec.** A separate debug container (the signed, digest-pinned Tower debug image), non-root, read-only, every
  capability dropped. On Flight the cluster refuses `kubectl exec` into app namespaces to everyone but operators.
- **Process access reaches the app's environment by default.** It shows the app's files and environment only when the
  app runs as the debug container's user, 65532, and airframe runs every Rollout as 65532 by default (v0.3.141). An app
  that opts out (`rollout.podSecurityContext: null`) runs as its image's user. See
  [Options](break-glass/options.md#process-access-live-pod-only).
- **Two people on Flight.** An owner other than the requester, or an admin, approves; the cluster refuses a grant whose
  approver is the requester. An admin may [break the glass](break-glass/glass-broken.md) instead: announced to
  everyone, audited `critical`, and reviewed afterwards by someone else.
- **No standing rights.** Backstage can only create RoleBindings to two debug roles; per session it binds one to itself,
  in one namespace, with an expiry, and deletes it at the end. The browser never holds a Kubernetes credential.
- **Enforced in the cluster, failing closed**: native ValidatingAdmissionPolicies on both tiers (on Ground compiled by
  Kyverno from `ValidatingPolicy`, so they do not depend on Kyverno staying up). They also check the debug image's
  cosign signature (tower's own build workflow), admit process access only for the session the pod's annotation names,
  limit Backstage's pod patch to that annotation, and expire every grant and copy pod by label even if Backstage is
  gone (Kyverno's cleanup controller on both clusters).
- **Time-boxed and recorded**: 15 to 60 minutes plus one 15-minute extension; every byte recorded with a SHA-256 into
  an object-locked, versioned bucket (no delete or overwrite for a year, root included), the hash anchored in the
  platform's Rekor; playable in Tower; every step audited. A session that cannot be recorded never starts.
- **Fewer eyes on Secrets.** A session with volume or process access is *sensitive*: its recording is for admins, the
  approver, the reviewer and the requester, not every owner. A copy of a Flight pod holds the app by default, so the
  copy does no production work.
- **Reviews do not stall.** A glass-broken session's reviewers are reminded after a day and the admins alerted after
  three; a fallback reviewers group covers an app whose only owner is the one admin.

See [Guardrails](break-glass/guardrails.md) for every layer and what it stops.

## What Tower never does

- **No exec into an app container**, on any environment. Break-glass (above) uses a separate debug container.
- **No direct Kubernetes writes** (outside a break-glass session's own debug container and copy pod): no scale,
  patch or delete of workloads from Tower. Restarting goes through Argo
  CD: *Restart pods* on the Rollout (rolling), or *Restart pod* for one pod. A pod delete skips the
  PodDisruptionBudget, so the backend counts the pod's ready siblings first: the last ready pod is refused on Flight
  and needs an explicit "restart anyway, accepting downtime" on Ground.
- **No direct commits to an environment's running configuration.** Every change is a PR (The release draft is a
  direct commit, to a file no environment reads.)
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
- The Hand-flown sign-off is a commit status, not a required check: GitHub Free cannot require one on a private
  repository, so a release PR can merge without it. Tower announces it and records it instead.
- Break-glass has its own limits and open items: see
  [what it does not protect against](break-glass/guardrails.md#what-break-glass-does-not-protect-against) and
  [still open](break-glass/admin/design.md#still-open).
- Image pruning does not scan the cluster repositories. Platform deployments defined there, such as Backstage
  itself, are protected by the running-pod and ReplicaSet rules, not by their git history.

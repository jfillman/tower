# Deployments ("Ground Control")

The Deployments tab answers four questions for one environment at a time: what is being deployed, is it healthy,
**what is wrong and what do I do about it**, and what can I do from here. You should not need to know Argo CD or
Argo Rollouts to read it.

## Plain-language troubleshooting

The banner at the top of each environment turns live signals into one sentence about what is happening and what to
try. It is the first thing to read when something looks off.

It reads only real signals: Argo CD's sync and health status, the delivery's six steps (below), the Rollout's own
status and canary weight straight from Kubernetes, the pods' container states, and the namespace's warning events.
It never invents a detail it has no live source for (no "about 2 minutes left" countdowns).

It is an ordered rule table: **worst and most specific first, first match wins**, so a real failure is never hidden
behind a calmer "in progress" reading. Each rule is there because a real incident needed it.

| # | What you see | When | Tone |
|---|---|---|---|
| 1 | **A required guardrail failed** | A release gate on the PR did not pass. Points at the Release gates panel and its report. Nothing has synced. | problem |
| 2 | **The canary rollout failed** | The Rollout is `Degraded`, read from Kubernetes rather than inferred, because Argo CD can keep reporting a running sync long after the canary has failed. Shows Argo Rollouts' own reason, such as the analysis or step that failed. | problem |
| 3 | **The image cannot be pulled** · **A container keeps crashing** · **A container ran out of memory** · **A container is missing configuration** · **A pod cannot be scheduled** · … (or *N problems are keeping this environment's pods from running*) | Pods cannot start while the Rollout is not Healthy. Otherwise a canary stuck on Pending pods looks like an ordinary rollout in progress. One entry per cause, worst first, each with what to try (below). | problem |
| 4 | **Kubernetes is warning: *reason*** | No pod to inspect, but a recent (under 10 minutes) blocking warning says why: `FailedCreate`, `FailedScheduling`, `FailedMount`, `FailedAttachVolume`, `InvalidImageName`, `ErrImagePull`. Probe failures and back-offs are left out; they are noise during a normal rollout. | problem |
| 5 | **ArgoCD reports this environment as *Degraded*** | Health went bad after the sync finished, so it is a real problem and not a mid-apply dip. Shows the last operation's message. | problem |
| 6 | **Canary rollout in progress: step *n* of *m*, *x*% traffic** | Mid-canary. Explains that Argo CD's "Progressing" is because of the canary and that no action is needed. | live |
| 7 | **A sync is currently being applied** | Argo CD is applying manifests and the delivery steps agree it has not finished. Argo CD's own "Running" phase is not trusted alone, because it can outlive the work. | live |
| 8 | **Out of sync, but automated sync is on** / **Cluster state does not match what git declares** | Out of sync: either Argo CD will heal it on its own, or automated sync is off and you should press Sync. | info / problem |
| 9 | **Couldn't reach ArgoCD for this environment** | No status at all. The facts may be stale rather than wrong; often RBAC or connectivity rather than the release. | info |
| 10 | **Synced and healthy** | Nothing needs attention. | ok |

**What to try, per pod problem** (shown under the banner, from `deployment/problems.ts`):

| Problem | First thing to try |
|---|---|
| The image cannot be pulled | Check that the tag exists in the registry and the namespace's registry credentials are valid. A first release that has not set `release.image` yet shows up here too. |
| The image name is invalid | Usually an empty tag: the first release has not set `release.image`. |
| A container keeps crashing | Read its logs (Topology, the pod, Logs) and the last exit reason shown. |
| A container ran out of memory | Raise `resources.limits.memory` (Values → Workload) or find what is using it. A crash loop caused by memory is reported once, as this. |
| A container is missing configuration | A ConfigMap, Secret or key the container refers to does not exist in the namespace. |
| A container cannot be created or started | The message says why: often a command that does not exist in the image. |
| A container is taking long to start | Still being created after several minutes: usually a volume or Secret that cannot be mounted. |
| A pod cannot be scheduled | No node can take it: requests above what any node offers, a taint, or an affinity rule. |
| A pod was evicted | Node memory or disk pressure. |

The details under the banner (pod problems, grouped warnings, the namespace's events) appear only when something is
wrong. A calm "Synced and healthy" shows nothing extra.

When logs, metrics and events are not enough, **Topology → the pod → Debug** opens a recorded, time-boxed shell in a
debug container, on a copy of the pod or on the live pod (Ground environments only for now). See
[Security: break-glass debug sessions](security.md#break-glass-debug-sessions).

## The delivery path

Each environment shows its release as six steps, each with a detail panel:

**PR created → Guardrails → PR merged → Application sync → Rollout starts → Rollout completes**

- **Guardrails** lists every release gate on the PR, its result and its report. A rollback's content checks run as
  *advisory*: they report without blocking (see [security.md](security.md#release-guardrails-tower-relies-on)).
- **Rollout starts** and **Rollout completes** hold the Rollout controls and, on a Flight environment, Roll back.
- The release record (Releases tab) follows the same release through its states: progressing, healthy,
  superseded, rolled back, aborted, degraded.

## Every action explains itself

Nothing in this tab is a bare button:

- **"Which one?"** next to the Argo CD actions opens a guide: what each action does, when to use it, and what can go
  wrong. Every button's tooltip carries the same text.
- **Rollout actions** each have a one-line explanation (below). Destructive ones (Abort, Restart pods, Promote,
  Promote full) ask for confirmation, and say so out loud when they skip canary analysis.
- **Force sync** names, before it runs, the out-of-sync resources it will delete and recreate. It is disabled when
  nothing is out of sync.
- **A button you may not use is greyed out with the reason**, for example "On a Flight environment only an admin
  may do this". Tower asks the backend what you may do (`/argo/capabilities`, the Rollout action list), and the
  backend still checks every request.
- **The workload status** (App Configuration → Values → Workload → Deployment) says what the release file asks for
  and what is actually running, so a canary in progress or an unsynced change shows as a difference instead of being
  hidden.

## Argo CD controls

| Action | What it does | Ground | Flight |
|---|---|---|---|
| Refresh / Hard refresh | Re-compare live state with git (hard: also bypass Argo CD's manifest cache). Applies nothing. | owners | owners |
| Sync | Apply git's state, **following the Application's own prune policy**. Environment Applications prune, so anything git no longer declares is removed, as the next automatic sync would. There is no separate "Sync with prune". | owners | admins |
| Force sync | Delete and recreate what a patch cannot change (an immutable field). Whatever is replaced is briefly down. | owners | admins |
| Terminate sync | Stop the running sync (a hook that never finishes, a resource that never gets healthy). Shown only while a sync runs. | owners | owners |

An environment whose workload is turned off still has its Argo CD Application, so these stay available.

## Rollout controls

Delegated through Argo CD's built-in Rollout actions, so Tower itself holds no Kubernetes permissions. Argo CD's own
logic decides which actions the Rollout's current state allows; Tower's permissions decide who may run them. All need
the app's owning team, and every action sends a notification to everyone (Abort and the bypasses at high severity).

| Action | What it does | On Flight |
|---|---|---|
| Resume | Continue a paused canary to its next step. | |
| Pause | Hold the canary at its current step. | |
| Abort | Stop the canary and send all traffic back to the stable version. Git still asks for the new version, so the Rollout stays aborted until a rollback replaces it or someone retries. | |
| Retry | Start an aborted canary again from its first step. | |
| Restart pods | Restart the current version's pods a few at a time. Changes nothing in git. | |
| Promote (skip current step) | Skip the current step and its analysis. | **bypass**: audited critical |
| Promote full | Skip every remaining step and analysis. | **bypass**: audited critical |

## Roll back (Flight)

Abort stops a bad canary now; **Roll back** is the durable fix. It opens an ordinary release PR that puts an earlier
image back, so git stops asking for the bad one.

- The choices are the environment's earlier images among its **last five releases that reached healthy**, read from
  the release records on the server, never from the request.
- A reason is required. It goes on the PR and the release record.
- On an eligible rollback, the content checks (static analysis, image scan, SBOM) report without blocking, since
  the image already ran healthy there. **Integrity checks (provenance, signatures) and approvals still block.**
- When it is healthy, the release it replaced is marked *rolled back*, and a "Release rolled back" notification goes
  out.

## Environments that run no workload

The Deployment switch (App Configuration → Values → Workload) says whether an environment runs a service at all
(`rollout.enabled`). An environment that is off runs only Jobs, CronJobs and components. Releases and promotions to it
are refused before any PR or commit. Turning it off removes the Rollout and Service on the next sync; turning it back
on brings them back with its next release.

# Configuration reference

Everything break-glass reads, sets or names, in one place. Source of truth: backstage
`packages/backend/src/breakglass.ts` and `breakglassSpec.ts`.

## Backend configuration (`app-config`)

| Key | Default | Meaning |
|---|---|---|
| `glidepath.breakglass.groundClusters` | `[kind-dev]` | Clusters whose environments are Ground when the app's `cicd.yaml` does not name the environment (infra services). Every other cluster is Flight. |
| `glidepath.breakglass.recordings.endpoint` | `http://minio.dev.kiac.local:8080` | S3 endpoint of the recordings store (path-style). |
| `glidepath.breakglass.recordings.bucket` | `tower-breakglass` | Where new recordings go. Set it to the object-locked `tower-breakglass-v2` once the key's policy covers it; a session refuses to start if the first object cannot be written. |
| `glidepath.breakglass.recordings.legacyBucket` | `tower-breakglass` when `bucket` is another | Where rows without a `recording_bucket` (written before phase B) are read from. |
| `glidepath.breakglass.anchor.rekorUrl` | `http://rekor.dev.kiac.local:8080` | The Rekor the recording hashes are anchored in. |
| `glidepath.breakglass.anchor.privateKey` | none | The anchor key (ECDSA, PEM). Prefer the environment variable below. |
| `glidepath.breakglass.reviewers` | `[group:default/admins]` | Groups whose members may **review** a glass-broken session on any app (never approve or start one), besides the app's owners and the admins. This platform: `[group:default/breakglass-reviewers]` (examples/org.yaml). |
| `glidepath.breakglass.recordings.region` | `us-east-1` | S3 region (MinIO ignores it; the SDK needs one). |
| `glidepath.breakglass.recordings.accessKeyId` / `.secretAccessKey` | none | The store's key. Prefer the environment variables below. |
| `glidepath.breakglass.recordings.retentionDays` | `365` | How long the bucket keeps a recording. Shown to users, and used to tell an expired recording from a missing one. **Must match the bucket's lifecycle rule**; the backend deletes nothing itself. |

Clusters come from `kubernetes.clusterLocatorMethods` (the cluster `name` is what break-glass uses).

## Environment variables

| Variable | Meaning |
|---|---|
| `TOWER_BREAKGLASS_MINIO_ACCESS_KEY` | Recordings store access key (takes precedence over config). From ExternalSecret `backstage-breakglass-minio`. |
| `TOWER_BREAKGLASS_MINIO_SECRET_KEY` | Its secret. |
| `TOWER_BREAKGLASS_ANCHOR_KEY` | The anchor key (ECDSA P-256 private key, PEM), from ExternalSecret `backstage-breakglass-anchor`. Without it recordings are stored but not anchored. |

If either is missing, every session is refused (*recordings are not configured*). They are read at startup and, while
still unset, again on each request; a changed key needs a Backstage restart.

## Fixed limits

Compiled into the backend; changing one is a code change (and, for the TTLs, a policy change on both clusters).

| Limit | Value | Where it applies |
|---|---|---|
| Durations | 15, 30, 60 minutes | `DURATIONS`; anything else is a 400 |
| Free extension | +15 minutes, once, requester only | `EXTENSION_MINUTES` |
| Cleanup TTL label | duration + 15: `30m`, `45m`, `75m` | `ttlLabel()`; the policies accept `15m` to `75m` |
| Request lifetime (Flight) | 30 minutes | `REQUEST_TTL_MS` |
| Start window after approval | 10 minutes | `START_WINDOW_MS` |
| Idle limit | 10 minutes without input or output | `IDLE_MS` |
| Disconnect limit | 2 minutes without a terminal | `DETACHED_MS` |
| Debug container start | 120 seconds | `READY_TIMEOUT_MS` |
| Recording checkpoint | every 60 seconds with new events | `CHECKPOINT_MS` |
| Recording size | 64 MB, then the session ends | `MAX_RECORDING_BYTES` |
| Sweep | every 15 seconds | `SWEEP_MS` |
| Reason, notes | 2000 characters | `MAX_REASON` |
| Ticket link | `http(s)`, 500 characters | `parseSessionRequest` |
| Open sessions or requests per person | 1 | `unfinishedFor()` |
| Session list per environment | newest 50 | `store.list()` |

## Debug container

| Setting | Value |
|---|---|
| Image | `ghcr.io/jfillman/tower-debug@sha256:5554edfd06b79c0bb295d4df063107016abc48334614c9e34440bc099b497b8c` (`DEBUG_IMAGE`) |
| Name | `debug-<session id>` |
| Command | `sh`, stdin and TTY |
| User, group | 65532, 65532, `runAsNonRoot: true` |
| Security | `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `privileged: false`, capabilities drop `ALL` |
| Process access | `targetContainerName: <app container>` (live mode only) |
| Volume access | the app container's volumes at `/pod-volumes/<volume>`, `readOnly: true`; never `hostPath` or the projected ServiceAccount token |
| Copy mode token | an `emptyDir` (`breakglass-<id>-no-token`, 1Mi) mounted read-only over `/var/run/secrets/kubernetes.io/serviceaccount` in the debug container |

## Labels and annotations

On objects break-glass creates. The policies read several of these; do not rename one without changing the policies.

| Key | On | Value |
|---|---|---|
| `cleanup.kyverno.io/ttl` | RoleBinding, copy pod | `30m` / `45m` / `75m`; Kyverno's cleanup controller deletes the object that long after creation |
| `app.kubernetes.io/managed-by` | RoleBinding | `tower-breakglass` |
| `hangar.io/breakglass-session` | RoleBinding, copy pod | session id |
| `hangar.io/breakglass-requester` | RoleBinding, copy pod | the requester's entity ref |
| `hangar.io/breakglass-approver` | RoleBinding (Flight) | the approver's entity ref |
| `hangar.io/breakglass-glass-broken` | RoleBinding (glass broken) | `"true"`; never together with an approver |
| `hangar.io/breakglass-expires-at` | RoleBinding | the session's planned end (ISO time) |
| `hangar.io/breakglass-copy` | copy pod | `"true"` |
| `hangar.io/breakglass-copy-of` | copy pod | the original pod's name |
| `hangar.io/app`, `hangar.io/env` | copy pod | the app and environment (the copy keeps no other label) |

Names: RoleBinding `tower-breakglass-<id>`; copy pod `<original pod, shortened>-debug-<id>` (the id stays inside the
63-character hostname). Session ids are 12 lowercase base-36 characters.

Labels **read** from the cluster: `hangar.io/app` and `hangar.io/env` on the namespace (must match the request), and
`hangar.io/ephemeral-env: "true"` on the namespace (a PR preview, so Ground).

## Permissions

All are resource permissions on the app's catalog entity (`towerPermissions.ts`).

| Permission | Who | Used for |
|---|---|---|
| `tower.breakglass.request` | owners, admins | request or open a session; start, extend and end your own; list the environment's sessions; play and download recordings |
| `tower.breakglass.approve` | owners, admins (never your own request) | approve or deny (with the keep-the-pod waiver on a live Flight request); review a glass-broken session (never your own) |
| (membership of `glidepath.breakglass.reviewers`) | the fallback reviewers | review a glass-broken session only; audited as `tower.breakglass.review` with `fallbackReviewer: true` |
| `tower.breakglass.terminate` | admins (grant-only) | end someone else's session (the approver may also end the one they approved) |
| `tower.breakglass.self` | admins (grant-only) | break the glass: a Flight session with no second person |

"Grant-only" means ownership never satisfies it (`towerGrantOnlyPermissions`); today only `group:default/admins` holds
those.

## Audit events

Through Backstage's auditor (the backend log).

| `eventId` | `meta.permission` / action | Severity |
|---|---|---|
| `tower-write` | `tower.breakglass.request` (a Ground open, or a Flight request) | high on Ground, medium for a Flight request |
| `tower-write` | `tower.breakglass.self` (glass broken) | critical |
| `tower-write` | `tower.breakglass.approve` (approve, deny, review) | high |
| `tower-write` | `tower.breakglass.request` with `phase: start` / `phase: extend` | high / medium |
| `tower-write` | `tower.breakglass.terminate` (an admin ends someone else's) | high |
| `tower-write` | `tower.breakglass.session`, `action: end` | high (critical if glass broken); medium for a request that never opened |
| `tower-breakglass-recording` | `purpose: play` or `download` | medium |

Each records the initiator, the app entity, the environment and the facts of the action (mode, options, pod, duration,
reason, ticket, approver, end reason, recording key and SHA-256, whether the pod was restarted). A refusal is audited as
a failed event with its reason.

## Notifications

Topic `breakglass`. Links open the environment in Tower (`/tower?entity=…&tab=topology&env=…`).

| Title | To | Severity |
|---|---|---|
| *Break-glass request on <app> <env>: approval needed* | the app's owner group and admins, except the requester | high |
| *Break-glass approved / denied on <app> <env>* | the requester | high |
| *Break-glass request on <app> <env> ended* (expired) | the requester | high |
| *Glass broken on <app> <env>* | everyone | critical |
| *Break-glass review due on <app> <env>* | the owner group and admins, except the requester | high |
| *Your glass-broken session on <app> <env> was reviewed* | the requester | high |
| *Break-glass: <pod> still has its debug container* / *was not restarted* | the requester | high |

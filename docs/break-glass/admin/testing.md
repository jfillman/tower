# Testing and verification

Break-glass is verified at three levels: unit tests for the pure logic, policy checks against the real API servers,
and end-to-end sessions as Backstage's real identity. Each change to it should pass all three that it touches.

## Unit tests

| Where | Run | Covers |
|---|---|---|
| backstage `packages/backend/src/breakglass.test.ts` | `cd packages/backend && CI=1 yarn backstage-cli package test src/breakglass.test.ts` | object shapes (RoleBinding, debug container, copy pod, volume mounts, token shadow), request parsing, the store against real SQLite (claims, migrations from every earlier schema), `sweepAction`, `settleDebugState`, `tierFor`, `reviewRefusal`, retention |
| tower `src/tabs/topology/BreakglassPanel.test.tsx`, `castPlayback.test.ts` | `CI=1 yarn backstage-cli package test src/tabs/topology` | the panel in every state (Ground, Flight requester and approver, extension, glass broken, review), the player, the cast parser and hash |

Set `CI=1`: without it the Backstage CLI runs tests in watch mode and never exits. In the backstage repo also run
`yarn tsc` from a clean cache before merging; Jest does not type-check.

## Policy checks with server-side dry runs

A dry run goes through admission like a real request, so it tests the **live** policies without creating anything.

**As Backstage**, for rules that depend on the requester (RoleBindings, pod deletes):

```bash
SA=system:serviceaccount:backstage:backstage-ingestor   # kind-prod
# kiac-dev: --as=hangar:kind-prod:tower-actor --as-group=hangar:kind-prod, and a User subject:
#   subjects: [{kind: User, apiGroup: rbac.authorization.k8s.io, name: hangar:kind-prod:tower-actor}]
cat <<EOF | kubectl --context kind-prod --as=$SA create --dry-run=server -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: tower-breakglass-drytest
  namespace: app-sky-marshall-staging
  labels: {cleanup.kyverno.io/ttl: "90m"}
  annotations: {hangar.io/breakglass-requester: "user:default/a", hangar.io/breakglass-approver: "user:default/b"}
roleRef: {apiGroup: rbac.authorization.k8s.io, kind: ClusterRole, name: tower-breakglass-debug-copy}
subjects: [{kind: ServiceAccount, name: backstage-ingestor, namespace: backstage}]
EOF
# expect: denied … cleanup.kyverno.io/ttl of 15m to 75m
```

**As yourself**, for rules matched by labels (copy pods): the Flight debug-container policy does not depend on who asks,
so an admin's dry run exercises it with no grant needed. Vary one field per run and expect exactly one outcome:

| Case | Expect |
|---|---|
| tower-debug digest, TTL `75m`, hardened | created (server dry run) |
| image by tag (`:latest`) | denied: hardened like an ephemeral debug container |
| TTL `90m` | denied: TTL of 15m to 75m |
| `runAsGroup: 0`, or a capability added, or a writable mount | denied |
| `hostNetwork: true` (Flight) | denied: no host namespaces |

On kiac-dev the debug-container rules exempt `system:masters`, so test them as Backstage under a real copy grant: create a
`tower-breakglass-<name>` RoleBinding with a `15m` TTL as Backstage, run the dry runs as Backstage, delete the binding.

## Testing a policy rule in isolation

Before changing a rule, test the exact CEL on kiac-dev without touching the live policies:

1. Extract the rule into a throwaway ValidatingAdmissionPolicy, bound with `matchResources.namespaceSelector` to a
   scratch namespace only.
2. **Rename the prefix it matches** (for example `celtest-` instead of `tower-breakglass-`). Otherwise the live
   policies match your test objects too, and an "allowed" case is refused by them, not by your rule.
3. Dry-run every allow and every deny case into the scratch namespace.
4. Delete the namespace, the policy and the binding.

For example, the glass-broken approver rule (kind-prod#270) was tested this way against eight cases: a distinct
approver, glass broken with no approver (both admitted); approver equal to the requester, glass broken plus an approver,
glass broken `"false"`, neither, no requester, no annotations (all refused).

## End-to-end, without touching production Backstage

The local harness runs a Backstage backend (and optionally the app) on your machine, acting **as Backstage's real
identity** on each cluster, so the real RBAC and the real policies apply.

1. **A worktree** of the backstage repo with dependencies installed, and an `app-config.local.yaml` (gitignored).
2. **Impersonating proxies**, one per cluster:

   ```bash
   kubectl --context kiac-dev  --as=hangar:kind-prod:tower-actor --as-group=hangar:kind-prod proxy --port=8013 --reject-paths='^/never$' &
   kubectl --context kind-prod --as=system:serviceaccount:backstage:backstage-ingestor        proxy --port=8014 --reject-paths='^/never$' &
   ```

   `--reject-paths` replaces kubectl proxy's default, which blocks `attach` and `exec`. Point the config's clusters
   (`kind-dev`, `kind-prod`) at `http://localhost:8013` and `:8014`.
3. **A throwaway recordings store**: a MinIO pod in a scratch namespace on kiac-dev, port-forwarded to `:9000`, with a
   `tower-breakglass` bucket. Set `glidepath.breakglass.recordings.endpoint: http://127.0.0.1:9000` and the
   `TOWER_BREAKGLASS_MINIO_*` variables to its own (generated) credentials. Never the real key.
4. **A file-backed database** (`backend.database.client: better-sqlite3`, `connection.directory: <dir>`) so sessions
   survive a restart.
5. **Switching people**: the guest provider's `auth.providers.guest.userEntityRef` decides who you are. Restart the
   backend between people (requester, approver, reviewer) and keep the database.
6. **Catalog stubs** for the apps under test (a Component with `spec.owner` and `github.com/project-slug`), plus
   `examples/org.yaml` for users and groups.
7. Start with `GLIDEPATH_NOTIFY_TOKEN=<random>` (the backend needs it) and drive the routes with a small script:
   guest refresh for a token, then `POST /api/glidepath/breakglass/sessions`, a WebSocket to `/attach` with the token as
   the subprotocol, `POST …/end`.

What was verified this way (2026-10-10 to 10-11), each against the real policies:

| Flow | Result |
|---|---|
| Ground copy and live, with process and volume access | opened; `uid=65532`; writes refused; the token absent in copy mode; cleaned up |
| Flight two-person | self-approve 403, start-before-approval 409, approve → start → attach → end; deny path |
| Exit and reconnect | `exit` ends the session; a dropped stream offers Reconnect |
| Unmanaged pod recycle | deleted directly, admitted by `tower-breakglass-pod-delete` |
| Infra service (skyport-auth dev) | Ground by cluster; extension once, second refused |
| Glass broken | non-admin 403; refused by the old policy before #270 synced (fail closed, still review-due); self-review 403; review 400 without note, 200, then 409 |
| Recording player | played in a browser with *SHA-256 matches the session record* |

**Not run live:** the 30-minute request expiry and the 10-minute start window (unit-tested in `sweepAction`; live would
mean waiting).

## After every deploy

1. The backend pod runs the new image and logs no break-glass warnings.
2. The live policies contain the change (not just *Synced*).
3. One real session per tier touched, ending with a clean namespace (no `tower-breakglass-*` RoleBinding, no copy
   pod, no live pod still carrying a debug container) and a recording that plays and matches its hash.

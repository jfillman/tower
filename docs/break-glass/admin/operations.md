# Operations runbook

Day-to-day checks and the incidents you are most likely to meet. Commands assume `kubectl` contexts `kiac-dev` (Ground)
and `kind-prod` (Flight).

## See what is open

**In Tower:** the environment's **Break-glass** card under Pods in Topology (and any pod's Debug panel) lists its
sessions, newest first. The **Break-glass** strip on the Tower home page and the Ops Wall shows what the signed-in
person can act on across every app (`GET /api/glidepath/breakglass/queue`: requests to decide, approvals to start,
reviews due).

**Across everything**, in Backstage's database (`backstage_plugin_glidepath` on kind-prod's Postgres):

```bash
kubectl --context kind-prod -n backstage exec backstage-postgres-postgresql-0 -- sh -c \
  'PGPASSWORD="$(cat $POSTGRES_PASSWORD_FILE)" psql -U "$POSTGRES_USER" -d backstage_plugin_glidepath -c "
   select id, app, env, state, tier, mode, requester, approver, glass_broken, review_state, expires_at
   from breakglass_sessions where state <> '\''ended'\'' or review_state = '\''due'\'' order by created_at desc"'
```

**In the clusters**, what a session left (normally nothing once it ends):

```bash
for c in kiac-dev kind-prod; do
  kubectl --context $c get rolebindings -A -l app.kubernetes.io/managed-by=tower-breakglass
  kubectl --context $c get pods -A -l hangar.io/breakglass-copy=true
  kubectl --context $c get pods -A -o json | jq -r '.items[] | select(any(.spec.ephemeralContainers[]?; .name|startswith("debug-")))
    | "\(.metadata.namespace)/\(.metadata.name)"'
done
```

The last command lists live pods that still carry a debug container (a last ready pod whose recycle was skipped, or a
recycle that failed). Restart them from Tower (*Restart pods* on the Rollout) when it is safe.

## End someone else's session

Admins (`tower.breakglass.terminate`) and the session's approver may end it: on the environment's **Break-glass**
card (under Pods in Topology), every active session shows **End** to them, with a confirm naming the session's user.
The API does the same, with your Backstage token (from the browser's developer tools, any request's `Authorization`
header):

```bash
curl -sS -X POST -H "Authorization: Bearer $TOKEN" https://backstage.<domain>/api/glidepath/breakglass/sessions/<id>/end
```

The record says *terminated by <you>*, and the cleanup runs as usual.

## A grant or copy pod outlived its session

The record's notes say *RoleBinding not deleted* or *copy pod not deleted*.

- **Ground:** Kyverno's cleanup controller deletes it once its `cleanup.kyverno.io/ttl` passes (session length + 15
  minutes from creation). Check the controller is running if it does not.
- **Flight:** no cleanup controller yet. Delete it by hand:

  ```bash
  kubectl --context kind-prod -n <ns> delete rolebinding tower-breakglass-<id>
  kubectl --context kind-prod -n <ns> delete pod -l hangar.io/breakglass-copy=true
  ```

## Backstage restarted, or crashed, mid-session

Expected behaviour, no action needed: the terminal lives in the backend process, so the session ends. Within 15 seconds
of starting, the new process's sweep finds the active row with no terminal, ends it (*backend restarted during the
session*), deletes the copy pod or recycles the live pod, deletes the grant, and takes the recording from the last
one-minute checkpoint.

Backstage must run **one replica**: a terminal's WebSocket must reach the process that holds its session. With two,
an attach can land on the wrong one (it answers *410 Gone*).

## Every session is refused by the cluster

The message contains *is forbidden: ValidatingAdmissionPolicy '<policy>' … denied request: <rule>*.

1. Read the rule's message; it names the check. Most often it is a change that landed out of order: the backend uses a
   value (a new image digest, a new TTL) the policy does not accept yet, or the policy was narrowed before the backend
   changed. See [Changing a policy](policies.md#changing-a-policy-without-an-outage).
2. Check the live policy is the version you expect (Argo CD may say Synced against an older revision):

   ```bash
   kubectl --context kind-prod get validatingadmissionpolicy <policy> -o yaml | less
   kubectl --context kind-prod -n argocd get app tower-breakglass \
     -o jsonpath='{.status.sync.status} {.status.sync.revision} {.status.operationState.phase}{"\n"}'
   ```
3. If Argo CD's operation is stuck (phase `Running` or `Terminating` for many minutes with no progress), clear it and
   let auto-sync run:

   ```bash
   kubectl --context kind-prod -n argocd patch app tower-breakglass --type merge -p '{"operation":null}'
   kubectl --context kind-prod -n argocd annotate app tower-breakglass argocd.argoproj.io/refresh=hard --overwrite
   ```

## Every pod create in the cluster is refused

If the refusal names a `tower-breakglass` policy, a match condition is erroring (see
[Writing CEL that fails closed safely](policies.md#writing-cel-that-fails-closed-safely)). Fix forward with a `has()`
guard. If you must stop the bleeding first, delete that policy's **binding** (not the policy): break-glass then loses
that guard until the fixed binding is back, so also make sure no session is open.

```bash
kubectl --context <cluster> delete validatingadmissionpolicybinding <policy>        # Flight
kubectl --context kiac-dev delete validatingpolicies.policies.kyverno.io <policy>   # Ground (Kyverno removes vpol-<policy>)
```

## Release a new debug image

1. Change `debug-image/` in jfillman/tower and merge. The **Debug image** workflow builds amd64 + arm64, pushes, signs
   with cosign, and prints the digest in its summary.
2. Verify the signature:

   ```bash
   cosign verify ghcr.io/jfillman/tower-debug@sha256:<new> \
     --certificate-identity-regexp '^https://github.com/jfillman/tower/.github/workflows/debug-image.yml@refs/heads/main$' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com
   ```
3. **Widen** both clusters' policies to accept old and new: kind-prod's `variables.images` list; kiac-dev's
   `debugImage` variable (make it a list, `c.image in [...]`, the way kind-prod does). Merge, and check the live policies.
4. **Switch** the backend: `DEBUG_IMAGE` in backstage `breakglassSpec.ts`; release; merge the kind-prod bump.
5. **Narrow**: once no pod uses the old digest, drop it from both policies:

   ```bash
   for c in kiac-dev kind-prod; do kubectl --context $c get pods -A -o json | jq -r --arg d "<old digest>" \
     '.items[] | select(any((.spec.containers[]?, .spec.ephemeralContainers[]?); .image|contains($d))) | .metadata.name'; done
   ```

## Rotate the recordings key

1. Create a new key in the MinIO console with the same put/get policy ([Setup step 4](setup.md#4-the-recordings-store)).
2. Replace both values in Infisical. The ExternalSecret refreshes hourly (or annotate it to force a refresh).
3. Restart Backstage (it reads the key at startup); no session should be open (it would end).
4. Disable the old key in MinIO.

## Fetch and verify a recording by hand

```bash
# the key is <app>/<env>/<id>.cast; the expected hash is the row's recording_sha256
mc cp <alias>/tower-breakglass/sky-marshall/staging/<id>.cast .
shasum -a 256 <id>.cast
```

## Audit

Every break-glass action is a `tower-write` (or `tower-breakglass-recording`) audit event in the backend log:

```bash
kubectl --context kind-prod -n backstage logs deploy/backstage --since=24h \
  | grep -E '"eventId":"tower-(write|breakglass-recording)"' | grep breakglass \
  | jq -c '{t: .timestamp, sev: .severityLevel, perm: .meta.permission, who: .meta.initiator, app: .meta.app // .meta.entityRef,
            env: .meta.env, action: (.meta.action // .meta.phase // .meta.decision), status: .status}'
```

Severity *critical* marks glass-broken sessions. The session rows are the durable record; the log is the trail of every
attempt, including refusals.

## Reviews due

The **Break-glass** strip on the Tower home page lists the reviews the signed-in person can do, across apps, and marks
one **overdue** after 72 hours. For everyone's, the database (the first query above shows `review_state = 'due'`).
Each is owed a review by an owner of the app other than the requester, or an admin.

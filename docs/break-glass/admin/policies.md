# Admission policies

Backstage's own checks are the first lock. These policies are the second, inside each cluster's API server, so that a
bug in the backend, or a compromised Backstage, still cannot widen what a session may do. They all **fail closed**.

| Policy | Ground (kiac-dev) | Flight (kind-prod) | Guards |
|---|---|---|---|
| `tower-breakglass-rolebinding` | ✓ | ✓ (+ approver rule) | the only grant Backstage may create |
| `tower-breakglass-debug-container` | ✓ | ✓ (+ host namespaces) | what runs in a debug container or copy pod |
| `tower-breakglass-pod-delete` | ✓ | ✓ | which pods Backstage may delete |
| `tower-breakglass-no-exec` | n/a | ✓ | exec and attach in app namespaces |

**Ground** writes them as Kyverno `ValidatingPolicy` (gitops-cluster-dev `30-policy/kyverno-policies/tower-breakglass.yaml`)
with `autogen.validatingAdmissionPolicy.enabled: true`. Kyverno compiles each into a native
ValidatingAdmissionPolicy, `vpol-<name>`, and registers no webhook, so the API server enforces it even while Kyverno is
down. (They were `ClusterPolicy` webhooks until 2026-10-11; Kyverno 1.19 deprecates `ClusterPolicy`, and the webhooks
made break-glass unavailable whenever Kyverno lost its lease on a busy node.)

**Flight** writes them directly as ValidatingAdmissionPolicy + binding (gitops-cluster-kind-prod
`30-policy/breakglass/policies.yaml`, Argo CD app `tower-breakglass`, sync wave `-1`).

## tower-breakglass-rolebinding

**Matches** `CREATE` and `UPDATE` of `rolebindings` where the name starts with `tower-breakglass-`, or the writer is
Backstage. Every other RoleBinding write skips it.

| Rule | Message |
|---|---|
| Backstage may create only `tower-breakglass-*` bindings | *Backstage may only create RoleBindings named tower-breakglass-\*.* |
| `roleRef` is ClusterRole `tower-breakglass-debug-live` or `-copy` | *…binds tower-breakglass-debug-live or -copy (a ClusterRole)…* |
| exactly one subject: Backstage's ServiceAccount on this cluster | *…has <ns>/backstage-ingestor as its only subject.* |
| label `cleanup.kyverno.io/ttl` is `15m`, `30m`, `45m`, `60m` or `75m` | *…carries cleanup.kyverno.io/ttl of 15m to 75m (a session plus its one 15-minute extension).* |
| the namespace is labelled `hangar.io/app` | *…may only be created in an app namespace (labelled hangar.io/app).* |
| **Flight only:** a requester annotation, and either an approver annotation that differs from it, or `hangar.io/breakglass-glass-broken: "true"` with no approver | *A Flight break-glass RoleBinding names an approver who is not the requester, or is marked glass broken … with no approver.* |

Kubernetes' own RBAC escalation check adds one more: Backstage can bind only roles it is allowed to `bind`, which the
binder role limits to the two debug roles by `resourceNames`.

## tower-breakglass-debug-container

**Matches** `UPDATE` of `pods/ephemeralcontainers`, and `CREATE` of pods labelled `hangar.io/breakglass-copy`. Every
other pod create skips it.

Every debug container (an ephemeral container, or a `debug-*` container in a copy pod) must have:

| Rule | Why |
|---|---|
| `image` is exactly the pinned digest | no other image, no tag (a tag can move) |
| `runAsNonRoot: true` and a non-zero `runAsGroup` | the spike's busybox ran with group 0 by default |
| `allowPrivilegeEscalation: false` | no setuid escalation |
| `readOnlyRootFilesystem: true` | nothing written in the debug container |
| `privileged` absent or false | |
| capabilities drop `ALL`, add none | no `NET_RAW`, `SYS_PTRACE`, … |
| every `volumeMount` has `readOnly: true` | volume access can read, never write |

Copy pods additionally must carry a `cleanup.kyverno.io/ttl` label of `15m` to `75m` (this rule applies to admins too,
so even an admin's copy expires). On Flight a copy pod also may not use `hostNetwork`, `hostPID` or `hostIPC`.

Ground exempts `system:masters` from the container rules (an operator's own `kubectl debug`) and applies them only in
`hangar.io/app` namespaces. **Flight applies them to everyone, in every namespace**: an operator's own
`kubectl debug` on kind-prod must also use the Tower debug image, hardened. `--profile=restricted` alone does not set a
group or a read-only root, so add them:

```bash
cat > debug-custom.json <<'EOF'
{"securityContext": {"runAsUser": 65532, "runAsGroup": 65532, "runAsNonRoot": true, "allowPrivilegeEscalation": false,
  "readOnlyRootFilesystem": true, "capabilities": {"drop": ["ALL"]}}}
EOF
kubectl debug -it <pod> -n <ns> --image=ghcr.io/jfillman/tower-debug@sha256:<digest> \
  --profile=restricted --custom=debug-custom.json -- sh
```

## tower-breakglass-pod-delete

**Matches** `DELETE` of pods by Backstage only.

Both debug roles include `delete pods` for the length of a session (copy mode deletes its copy; live mode restarts a pod
Argo CD does not manage). Without this policy, a session's grant would reach every pod in the namespace. The rule: the
pod being deleted (`oldObject`) is a copy pod (`hangar.io/breakglass-copy: "true"`) or carries an ephemeral container
named `debug-*`.

## tower-breakglass-no-exec (Flight)

**Matches** `CONNECT` on `pods/exec` and `pods/attach` in namespaces labelled `hangar.io/app`, for anyone not in
`kubeadm:cluster-admins` or `system:masters`.

| Rule | Message |
|---|---|
| exec is allowed only to ServiceAccounts other than Backstage (operators such as CNPG exec into their own pods) | *No exec into Flight pods. Use a Tower break-glass session (a recorded debug container) instead.* |
| attach is allowed to other ServiceAccounts, and to Backstage only on a container named `debug-*` | *Attaching to a Flight pod is only for a break-glass debug container, through Tower.* |

This makes "never exec on Flight" a cluster fact, not a Tower convention. People keep `kubectl logs`, port-forward and
everything else their RBAC allows.

## Writing CEL that fails closed safely

With `failurePolicy: Fail`, a CEL **evaluation error** refuses the request. In a match condition that is scoped too
widely, one error refuses every request the policy matches, cluster-wide.

This happened on kiac-dev on 2026-10-11: a match condition read `request.subResource` unguarded. On a plain pod
create that field is **absent** (not empty), the expression errored, and every pod create in the cluster was refused
for about ten minutes. The rules that came out of it:

1. **Guard every optional field with `has()`** before reading it, in match conditions, variables and validations:
   `has(request.subResource) && request.subResource == 'ephemeralcontainers'`. That includes `object.metadata.labels`,
   `.annotations`, `request.userInfo.username`, `object.subjects`, `c.securityContext` and its children.
2. **Scope each policy with match conditions** to break-glass objects only (name prefix, label, or Backstage's
   username), so an error can only ever affect break-glass.
3. **On `DELETE`, the object is `oldObject`**; `object` is null.
4. **A Kyverno policy on Pods alone also autogenerates controller variants** (Deployment, Job, …) and is then served
   from a webhook instead of a VAP. `tower-breakglass-pod-delete` sets `autogen.podControllers.controllers: []`.

## Changing a policy without an outage

1. **Test the exact CEL first**, on kiac-dev, in a throwaway policy bound to a scratch namespace (see
   [Testing](testing.md#testing-a-policy-rule-in-isolation)). Cover every allow and every deny.
2. **Widen before you narrow.** When a value changes (the image digest, the TTL list), first make the policy accept
   both old and new, deploy, then switch the backend, then drop the old value. kind-prod's debug-container policy keeps
   the allowed images in a list variable (`variables.images`) for this. Doing it in the other order refuses every
   session in between.
3. **Order on Flight:** the policy PR merges and syncs **before** the backstage bump that relies on it. Check that the
   live object changed, not just that Argo CD says *Synced* (Argo CD can report Synced against the previous revision):

   ```bash
   kubectl get validatingadmissionpolicy tower-breakglass-rolebinding -o yaml | grep <new text>
   kubectl -n argocd get app tower-breakglass -o jsonpath='{.status.sync.revision}'
   ```
4. **Dry-run against the live policy** as Backstage after it syncs (see [Testing](testing.md)).

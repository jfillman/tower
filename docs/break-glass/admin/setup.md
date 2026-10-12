# Setup: enabling break-glass on a cluster

Break-glass needs five things on each cluster it reaches, plus a recordings store and backend configuration once.
Work through them in order; each step ends with a check. The two clusters in this lab are already set up; this page
is how they were set up, and how to add a third.

| Step | Once or per cluster | Repository |
|---|---|---|
| [1. Prerequisites](#1-prerequisites) | per cluster | n/a |
| [2. Admission policies](#2-admission-policies) | per cluster, **before** the RBAC | the cluster's gitops repo |
| [3. RBAC](#3-rbac) | per cluster | the cluster's gitops repo |
| [4. The recordings store](#4-the-recordings-store) | once | gitops-cluster-dev, Infisical, kind-prod |
| [5. Backend configuration](#5-backend-configuration) | once (plus the cluster's tier) | backstage `app-config` |
| [6. Permissions](#6-permissions) | once | backstage catalog |
| [7. Verify](#7-verify-end-to-end) | per cluster | n/a |

## 1. Prerequisites

- **Kubernetes 1.30 or later** (ValidatingAdmissionPolicy is GA; on Flight it must match `CONNECT` on `pods/exec`).
  kind-prod runs 1.37.
- **Ephemeral containers** enabled (default since 1.25).
- **App namespaces labelled** `hangar.io/app: <app>` and `hangar.io/env: <env>`. Airframe's environment composition
  does this. Break-glass refuses any namespace whose labels do not name the app and environment requested, and the
  policies refuse grants outside namespaces labelled `hangar.io/app`. PR preview namespaces also carry
  `hangar.io/ephemeral-env: "true"` (that is what makes them Ground).
- **Backstage can reach the cluster**: an entry in `kubernetes.clusterLocatorMethods` (its `name` is the cluster name
  break-glass uses) and a ServiceAccount identity there.
- **Argo CD's `backstage` account may delete pods** (`role:tower-pod`, the same grant Tower's *Restart pod* uses). Live
  mode recycles the pod through it. Without it, the backend falls back to deleting the pod directly under the session's
  grant, which the policy allows only for a pod with a debug container.

## 2. Admission policies

Install the policies **before** the RBAC that they constrain: the moment Backstage can bind a debug role, the policy
must already be there to narrow it. On kind-prod the Argo CD app orders this with sync waves (policies at `-1`, RBAC at
`0`).

What each rule does, and how to edit one without an outage, is in [Admission policies](policies.md).

### Ground cluster (Kyverno 1.19+)

- Apply `30-policy/kyverno-policies/tower-breakglass.yaml`: three `policies.kyverno.io/v1` `ValidatingPolicy`
  resources with `autogen.validatingAdmissionPolicy.enabled: true`. Kyverno compiles each into a native
  ValidatingAdmissionPolicy named `vpol-<name>` and registers **no webhook** for it, so the API server enforces it even
  when Kyverno is down.
- Apply `30-policy/kyverno-policies/tower-breakglass-rbac.yaml`: aggregated ClusterRoles that let Kyverno's controllers
  read `pods/ephemeralcontainers` and let its **cleanup controller** delete expired RoleBindings and pods (it has no
  delete on those kinds by default). The cleanup controller acts on the `cleanup.kyverno.io/ttl` label.
- Replace the literal username `hangar:kind-prod:tower-actor` (kiac-dev's federated write identity, see
  [Cluster credentials](../../credentials/index.md)) with Backstage's write identity on the new cluster, everywhere it
  appears. That includes the RoleBinding policy's subject check, which expects a `User` subject there.

Check:

```bash
kubectl get validatingpolicies.policies.kyverno.io | grep tower-breakglass     # READY true
kubectl get validatingadmissionpolicy | grep vpol-tower-breakglass              # three
```

### Flight cluster (no Kyverno needed)

- Apply `30-policy/breakglass/policies.yaml`: four hand-written ValidatingAdmissionPolicies with their bindings
  (`tower-breakglass-rolebinding`, `-debug-container`, `-pod-delete`, `-no-exec`).
- Replace `system:serviceaccount:backstage:backstage-ingestor` with Backstage's identity on the new cluster.
- `tower-breakglass-no-exec` exempts `kubeadm:cluster-admins` and `system:masters` (operators) and other
  ServiceAccounts (operators such as CNPG exec into their own pods). Check that your operators' group is one of these.

Check:

```bash
kubectl get validatingadmissionpolicy,validatingadmissionpolicybinding | grep tower-breakglass   # four of each
```

## 3. RBAC

Apply the cluster's `breakglass-rbac.yaml` / `rbac.yaml`, with the ClusterRoleBinding's subject set to Backstage's
ServiceAccount there:

| Object | Grants |
|---|---|
| ClusterRole `tower-breakglass-debug-live` | `pods`: get, list, delete · `pods/ephemeralcontainers`: get, patch, update · `pods/attach`: get, create |
| ClusterRole `tower-breakglass-debug-copy` | `pods`: get, list, create, delete · `pods/attach`: get, create |
| ClusterRole `tower-breakglass-binder` | `rolebindings`: get, list, create, delete · `clusterroles`: `bind`, resourceNames the two roles above |
| ClusterRoleBinding with the binder role | on kiac-dev `tower-actor-breakglass-binder` (`tower-actor-rbac.yaml`), to the User `hangar:kind-prod:tower-actor`; on kind-prod `backstage-ingestor-breakglass-binder`, to Backstage's ServiceAccount |

The debug roles are **never bound at rest**. Backstage binds one to itself, per session, in one namespace.

Check, as Backstage (replace the identity and namespace):

```bash
SA=system:serviceaccount:backstage:backstage-ingestor; NS=app-sky-marshall-staging   # kind-prod
# kiac-dev: AS="--as=hangar:kind-prod:tower-actor --as-group=hangar:kind-prod"; NS=app-sky-marshall-dev
kubectl auth can-i create rolebindings -n $NS --as=$SA              # yes
kubectl auth can-i create pods/attach -n $NS --as=$SA               # no
kubectl auth can-i patch pods/ephemeralcontainers -n $NS --as=$SA   # no
kubectl auth can-i delete pods -n $NS --as=$SA                      # no
```

## 4. The recordings store

Once, on kiac-dev's MinIO (the store is off the Flight cluster on purpose: recordings should not live only on the
cluster they record).

1. **Bucket.** gitops-cluster-dev `40-observability/minio/create-breakglass-locked-bucket-job.yaml` creates
   `tower-breakglass-v2` **with object lock** (versioned), a default retention of **365 days in governance mode**, and a
   lifecycle rule expiring current and noncurrent versions after 365 days. Check it: `mc retention info
   <alias>/tower-breakglass-v2`, then try `mc rm --version-id <v> …` as root: *WORM protected*. (The first bucket,
   `tower-breakglass`, from `create-breakglass-bucket-job.yaml`, is unlocked and keeps the recordings written before
   phase B until they expire; the backend reads those rows from it as `recordings.legacyBucket`.) Both Jobs use the MinIO *server* image's
   `mc`: `quay.io/minio/mc` no longer pulls.)
2. **Access key**, by hand in the MinIO console (a service account of the root user with an *embedded* policy), with
   exactly this policy: put and get on both buckets, plus reading a named version in the locked one; never list, delete
   or bypass-governance. (Extended to the second bucket on 2026-10-12 with `mc admin user svcacct edit <key> --policy`
   as root inside the MinIO pod; `mc admin user svcacct info <key> --policy` shows it.)

   ```json
   {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:GetObjectVersion"],
     "Resource":["arn:aws:s3:::tower-breakglass/*","arn:aws:s3:::tower-breakglass-v2/*"]}]}
   ```
3. **Infisical.** Plant the key and secret as `tower-breakglass-minio-access-key` and
   `tower-breakglass-minio-secret-key` (kind-prod, `platform-cicd-kind-prod`, shared). Never paste them anywhere else.
4. **The anchor key** (phase B). Generate an ECDSA P-256 private key and plant it as `tower-breakglass-anchor-key`
   (same project): `openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt`. The ExternalSecret
   `backstage-breakglass-anchor` mounts it as `TOWER_BREAKGLASS_ANCHOR_KEY`. The public half travels in every Rekor
   entry, so rotating the key invalidates nothing. Without it, recordings are stored but not anchored (the record says
   so), and the sweep anchors them once the key appears, for a day after each session's end.
5. **Rekor route.** gitops-cluster-dev `60-gateway-routes/rekor-httproute.yaml` exposes `rekor.dev.kiac.local`; the
   kind-prod Backstage Deployment's `hostAliases` maps it like `minio.dev.kiac.local`.
6. **Into Backstage.** gitops-cluster-kind-prod `60-backstage/backstage/breakglass-minio-external-secret.yaml` syncs them
   into Secret `backstage-breakglass-minio`; the Deployment maps them to `TOWER_BREAKGLASS_MINIO_ACCESS_KEY` and
   `TOWER_BREAKGLASS_MINIO_SECRET_KEY`.

Without both variables the backend refuses every session with *recordings are not configured*.

Check:

```bash
mc ilm rule ls <alias>/tower-breakglass          # Expiration 365 days, Enabled
kubectl -n backstage get externalsecret backstage-breakglass-minio   # SecretSynced
```

## 5. Backend configuration

Defaults suit this lab; set only what differs. Full list in the [configuration reference](configuration.md).

```yaml
glidepath:
  breakglass:
    groundClusters: [kind-dev]          # clusters whose undeclared environments are Ground; all others are Flight
    recordings:
      endpoint: http://minio.dev.kiac.local:8080
      bucket: tower-breakglass-v2          # the object-locked bucket; rows written before it read from legacyBucket
      legacyBucket: tower-breakglass       # default when bucket is not the first one
      region: us-east-1
      retentionDays: 365                # must match the bucket's lifecycle rule; shown to users
    anchor:
      rekorUrl: http://rekor.dev.kiac.local:8080   # the default; the key comes from TOWER_BREAKGLASS_ANCHOR_KEY
```

**A new Ground cluster** must be added to `groundClusters`, or infra services on it are treated as Flight (apps with a
`cicd.yaml` take its declared tier regardless).

## 6. Permissions

- **Owners** come from the catalog: the Component's `spec.owner`, through the permission policy's owner rule. Nothing to
  configure per app.
- **Admins** are members of `group:default/admins`. They hold every Tower permission, including the grant-only
  `tower.breakglass.terminate` and `tower.breakglass.self` (glass broken).
- **A second person** for Flight needs a second user who owns the app. In this lab that is `riley-roooo`
  (team-skyport). Add users in backstage `examples/org.yaml`.

## 7. Verify end to end

1. **At rest** (step 3's checks): Backstage cannot attach, patch ephemeral containers, or delete pods.
2. **Policies refuse what they should**, as Backstage, with server-side dry runs. The [testing guide](testing.md)
   has scripts for each case: a 90-minute TTL, an unpinned image, a root group, an extra capability, another subject, a
   non-app namespace, a self-approved Flight grant.
3. **A real session** from Tower on a test app: Ground copy mode, then live mode; on Flight, a request approved by
   a second user. After each, check the namespace is clean:

   ```bash
   kubectl -n $NS get rolebindings,pods -l app.kubernetes.io/managed-by=tower-breakglass   # grants: none left
   kubectl -n $NS get pods -l hangar.io/breakglass-copy=true                              # copies: none left
   ```

   and that the session's recording plays with *SHA-256 matches the session record*.

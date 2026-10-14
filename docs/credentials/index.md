# Cluster credentials: how Tower reaches kiac-dev

Tower's backend (Backstage, on kind-prod) reads and writes kiac-dev without any stored Kubernetes credential.

- kiac-dev's API server trusts kind-prod's ServiceAccount token issuer.
- A token that kind-prod issues *for kiac-dev* is accepted there.
- **Reads** use the Backstage pod's own token, which the kubelet rotates.
- **Writes** use a token minted for one action and then dropped.
- Each of the two identities gets only its own permissions, and admission policies check every write.

This page explains the design, the configuration, and how to operate, verify and troubleshoot it. The background and
the rollout record are in `~/tech/SPEC-tower-cluster-credentials.md`. The cluster-side mechanism is generic and lives in
apron (`docs/cluster-identity.md`, `components.clusterIdentity`).

> **Until 2026-10-12** Tower used one `kubernetes.io/service-account-token` for kiac-dev.
>
> - It never expired.
> - It lived in four places: kiac-dev, Infisical, a kind-prod Secret, and the process environment.
> - It was sent without TLS verification.
> - It could create PipelineRuns in any namespace, which made it cluster-admin-equivalent.
> - Any signed-in user could use it through the Kubernetes proxy.
>
> That token and everything that carried it are deleted.

![How Tower reaches kiac-dev without a stored token: reads with the pod's projected token, writes with a tower-actor token minted per action; kiac-dev validates both against kind-prod's published keys, maps them to two users with separate RBAC, and runs writes through admission policies](diagrams/01-identity-flow.png)

## The two identities

| | Reader | Writer (actor) |
|---|---|---|
| **kiac-dev username** | `hangar:kind-prod:backstage-ingestor` | `hangar:kind-prod:tower-actor` |
| **Group** | `hangar:kind-prod` | `hangar:kind-prod` |
| **kind-prod ServiceAccount** | `backstage/backstage-ingestor` (the Backstage pod's own) | `backstage/tower-actor` (no pod runs as it, no RBAC on kind-prod, automount off) |
| **Token** | projected volume at `/var/run/secrets/hangar/kiac-dev/token`: audience `kiac-dev`, 600 s, bound to the pod, refreshed by the kubelet at 80% | `TokenRequest` per write action: audience `kiac-dev`, 600 s, held in memory for that action only. Not bound to the pod: Kubernetes binds a token only to a pod running as the same ServiceAccount, and none runs as `tower-actor` |
| **Used by** | the Kubernetes proxy (Tower's reads, the catalog ingestor), the pollers (recent activity, SLO transitions, release records, pipeline history), the provenance trust reads (Fulcio root, Rekor key) | Tekton Re-run and Cancel, release and rollback runs, break-glass (grant, debug container, attach, cleanup) |
| **kiac-dev RBAC** | 13 read bindings in gitops-cluster-dev `00-bootstrap/backstage-ingestor-rbac/rbac.yaml`: `view`, CRDs, Crossplane, Rollouts, Gateway API, GitHub MRs, Infisical projects, RBAC objects, topology resources, Argo CD Applications, and the Rekor, Prometheus and Tekton Results service proxies. No write verb. | `tower-actor-rbac.yaml`: `view`, `backstage-tekton-rerun` (create/patch PipelineRuns) and `tower-breakglass-binder` (create/delete `tower-breakglass-*` RoleBindings, bind the two debug roles) |

On kind-prod Backstage is simply its in-cluster ServiceAccount (`system:serviceaccount:backstage:backstage-ingestor`),
with its usual short-lived token. Nothing on this page changes that.

## A write, end to end

![A Tower write, end to end: Tower posts a Re-run, the backend checks ownership, mints a ten-minute tower-actor token on kind-prod, reads the source run and creates the copy on kiac-dev, where the token is verified, RBAC applied and the shape policy admits it](diagrams/02-write-sequence.png)

1. **The browser** posts to the backend's own route (`/api/glidepath/tekton/rerun` or `/cancel`). Tower never writes
   through the Kubernetes proxy, which refuses anything but GET.
2. **The backend** checks the permission on the app's catalog entity (`tower.pipeline.rerun` / `.cancel`: owners or
   admins). It audits the decision either way, and mints nothing for a refused request.
3. **`towerActor.ts`** asks kind-prod for a `tower-actor` token. Backstage's ServiceAccount may create tokens for that
   one name only (Role `tower-actor-token-minter`).
4. **kiac-dev's API server** checks the token against kind-prod's published keys and the claim rules (below). It maps
   the token to `hangar:kind-prod:tower-actor` and applies that user's RBAC. `tower-pipelinerun-shape` then admits
   only Glidepath's own run shape.

Break-glass works the same way. It mints a fresh token for each step (activation, attach, state reads, the end of the
session), because a session can outlive a 10-minute token. Its RoleBinding's subject is the
`hangar:kind-prod:tower-actor` user, which the backend learns from a `SelfSubjectReview`.

## Guardrails

![What stands between a misused credential and kiac-dev: a read-only proxy, owner-gated write routes, no stored credential, trust rules at kiac-dev, split RBAC and fail-closed admission policies; what remains is owner-gated, recorded Glidepath runs, cancels and debug grants](diagrams/03-guardrail-layers.png)

| Control | Enforced by | Where it lives |
|---|---|---|
| The Kubernetes proxy is read-only: GET/HEAD/OPTIONS, no WebSocket upgrades, however the path is spelled | Backstage root router | backstage `packages/backend/src/kubernetesProxyGuard.ts` |
| Each write needs the app's ownership, and is audited | Backstage permission framework | backstage `towerPermissions.ts`, `permissionPolicy.ts`, `glidepathProvenance.ts` (`/tekton/*`), `breakglass.ts` |
| Only `tower-actor` tokens can be minted, and only by Backstage | kind-prod RBAC | gitops-cluster-kind-prod `60-backstage/backstage/tower-actor.yaml` |
| The issuer is kind-prod's; the token has audience `kiac-dev`, comes from namespace `backstage`, belongs to `backstage-ingestor` or `tower-actor`, and lives `exp - iat ≤ 600` s | kiac-dev API server (`--authentication-config`) | gitops-cluster-dev `00-bootstrap/cluster-identity/authentication-config.yaml` (installed as `/etc/kubernetes/authn/config.yaml` on the node) |
| The reader can't write; the actor holds only the two write grants | kiac-dev RBAC | gitops-cluster-dev `00-bootstrap/backstage-ingestor-rbac/rbac.yaml`, `tower-actor-rbac.yaml`, `breakglass-rbac.yaml` |
| PipelineRuns: only in an app's `-cicd` namespace, a cluster-resolver `pipelineRef` into `platform-catalog`, SA `pipeline-runner`, no inline spec, no `taskRunSpecs`, podTemplate `hostAliases` only, no PaC annotations. Updates may only cancel. | kiac-dev admission (`vpol-tower-pipelinerun-shape`) | gitops-cluster-dev `30-policy/kyverno-policies/tower-identity-writes.yaml` |
| RoleBinding deletes: `tower-breakglass-*` only | kiac-dev admission (`vpol-tower-rolebinding-delete`) | same file |
| Break-glass grants, debug containers, pod deletes and annotations | kiac-dev admission (`vpol-tower-breakglass-*`) | `30-policy/kyverno-policies/tower-breakglass.yaml`; see [Admission policies](../break-glass/admin/policies.md) |
| No `kubernetes.io/service-account-token` Secrets in `backstage-system` | kiac-dev admission (`vpol-no-long-lived-sa-tokens`) | `30-policy/kyverno-policies/no-long-lived-sa-tokens.yaml` |
| The API server's certificate is verified | Backstage (`caData` / `caFile`) | backstage `app-config.yaml` (the `kind-dev` and `kind-prod` entries) |

**What remains.** Code running inside the Backstage backend can mint actor tokens. What those tokens can do is bounded
by the policies: Glidepath-shaped runs, cancels and debug grants. Each one is gated on ownership in the routes and
recorded. Writing as each user's own identity (spec phase 5) is what would narrow it further.

## Configuration

### Backstage: `app-config.yaml`

```yaml
kubernetes:
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: kind-dev
          url: https://kiac-dev-control-plane:6443        # the node name, which is in the API server certificate
          authProvider: serviceAccount
          authMetadata:
            hangar.io/token-file: /var/run/secrets/hangar/kiac-dev/token   # reads
            hangar.io/actor-service-account: backstage/tower-actor         # writes, minted per action
            hangar.io/actor-audience: kiac-dev
            hangar.io/actor-issuer-cluster: kind-prod                       # the entry that mints it
          serviceAccountToken: unused-the-token-file-is-used                # never sent; see below
          caData: <kiac-dev cluster CA, base64 PEM>
        - name: kind-prod
          url: https://kubernetes.default.svc
          authProvider: serviceAccount
          caFile: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
```

- **`hangar.io/token-file`.** `kubernetesAuthStrategies.ts` replaces the `serviceAccount` strategy with one that reads
  this file on every request (and otherwise behaves like the stock strategy). It also re-registers every stock
  strategy, because adding any strategy replaces the plugin's default map. `clusterAccess.ts` uses client-node's
  `tokenFile` provider, which re-reads the file every 60 s.
- **The three `actor` keys** must be set together. `towerActor.ts` `writeKubeConfig()` uses them. Without them, writes
  fall back to the entry's fixed token, which is the placeholder, so they are refused: the setup fails closed.
- **The placeholder `serviceAccountToken` must stay.** `@backstage/plugin-kubernetes-backend`'s proxy (0.21.10,
  `KubernetesProxy.getClusterForRequest`) treats a `serviceAccount` cluster with **no** `serviceAccountToken` as the
  pod's own cluster when Backstage runs in-cluster, and rewrites its URL to `kubernetes.default.svc`. Removing the
  placeholder sends every kind-dev read to kind-prod. That happened for 21 minutes on 2026-10-12, as 401s on every
  kind-dev proxy read. A local harness can't reproduce it, because it doesn't run in-cluster.

### kind-prod: `60-backstage/backstage/`

- **`deployment.yaml`:**
  - the `kiac-dev-token` projected volume (audience `kiac-dev`, `expirationSeconds: 600`), mounted at
    `/var/run/secrets/hangar/kiac-dev`;
  - the `kiac-dev-control-plane` hostAlias.
- **`tower-actor.yaml`:** the `tower-actor` ServiceAccount and the minter Role and RoleBinding.
- **kind-prod's API server** signs tokens as `https://hangarplatform.dev/oidc/kind-prod`. Its first
  `--service-account-issuer` is that URL; the default stays as a second, accepted issuer; and `--api-audiences` lists
  both (`00-bootstrap/cluster-identity/README.md`).

### kiac-dev: gitops-cluster-dev

- **`00-bootstrap/cluster-identity/authentication-config.yaml`:** the trust rules. It's node-level, so Argo CD doesn't
  sync it; it's installed with apron `hack/cluster-identity.sh trust`.
- **`00-bootstrap/backstage-ingestor-rbac/`:** the reader's and the actor's RBAC (`rbac.yaml`,
  `tower-actor-rbac.yaml`, `breakglass-rbac.yaml`).
- **`30-policy/kyverno-policies/`:** `tower-identity-writes.yaml`, `tower-breakglass.yaml`, `no-long-lived-sa-tokens.yaml`.

### The issuer's public keys

The keys are served by hangar's site at `https://hangarplatform.dev/oidc/kind-prod/.well-known/openid-configuration`
and `/jwks.json`. They're public keys only; the source is hangar `web/public/oidc/kind-prod/`.

## Operations

**Verify the trust end to end.** This is read-only: it mints a token on kind-prod and presents it to kiac-dev with no
other credential.

```bash
apron/hack/cluster-identity.sh verify --from-context kind-prod --namespace backstage \
  --service-account backstage-ingestor --audience kiac-dev --to-context kiac-dev
# accepted as hangar:kind-prod:backstage-ingestor; wrong audience, 20-minute token, backstage/default refused
```

**Is Backstage authenticating?** kiac-dev counts JWT authentications per issuer.
`apiserver_authentication_jwt_authenticator_latency_seconds_count{result="success"}` keeps rising while Backstage
reads:

```bash
kubectl --context kiac-dev get --raw /metrics | grep '^apiserver_authentication_jwt_authenticator_latency_seconds_count'
```

**Kill switch.** Edit `/etc/kubernetes/authn/config.yaml` on kiac-dev's control-plane node and delete the kind-prod
`jwt` entry. The API server reloads the file within seconds, and every kind-prod token stops working, readers and
actors alike. To restore it, run `hack/cluster-identity.sh trust` again with the file from gitops-cluster-dev.

**Narrower revocation.**
- Remove a user's bindings in gitops-cluster-dev.
- Or remove `tower-actor` from the trust file's ServiceAccount list, which stops writes and keeps reads.
- Or drop the minter Role on kind-prod.

**If kind-prod's signing key changes** (a recreated cluster, or a rotated `sa.key`), republish the keys before
anything else, or kiac-dev refuses every token:

```bash
apron/hack/cluster-identity.sh publish --context kind-prod --issuer https://hangarplatform.dev/oidc/kind-prod \
  --out <hangar>/web/public/oidc/kind-prod
```

**A recreated kind-prod** also needs its issuer flags again (apron `components.clusterIdentity` /
`hack/cluster-identity.sh issuer`). **A recreated kiac-dev** needs the trust file again (`trust`), plus its new CA in
the `kind-dev` entry's `caData`.

**Local harness.** The old kiac-dev ServiceAccount is gone. Impersonate the federated users instead:

```bash
kubectl --context kiac-dev --as=hangar:kind-prod:tower-actor --as-group=hangar:kind-prod proxy --port=8013 --reject-paths='^/never$'
```

`tower-actor` can read (`view`) and write. Use `hangar:kind-prod:backstage-ingestor` to check that something works
read-only.

## Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| Every kind-dev proxy read returns 401, and kiac-dev's JWT counters don't move | The proxy is sending the request to kind-prod: the `kind-dev` entry has no `serviceAccountToken` (the in-cluster rewrite above) | `serviceAccountToken` placeholder present in the deployed `app-config.yaml` |
| kind-dev reads return 401, and kiac-dev logs `oidc: …` errors | The token was refused: wrong audience, a lifetime over 600 s, another ServiceAccount, or keys not fetchable | `kubectl --context kiac-dev logs -n kube-system -l component=kube-apiserver \| grep 'Unable to authenticate'`; `verify` above |
| kind-dev reads fail with `socket disconnected before secure TLS connection was established` | The laptop forward to kiac-dev is stale (not auth) | `ssh laptop 'curl -sk -m4 -o /dev/null -w "%{http_code}" https://192.168.1.78:6443/version'` |
| Reads fail with `unable to verify the first certificate` | The `caData` is wrong (kiac-dev was recreated) | Compare it with kiac-dev's `kube-root-ca.crt` |
| A Re-run or Cancel returns 403 with `…is not allowed tower.pipeline.rerun…` | The user doesn't own the app | Expected; admins and owners only |
| A write fails with `TokenRequest … forbidden` | The minter Role or the `tower-actor` ServiceAccount is missing on kind-prod | `kubectl --context kind-prod -n backstage get sa tower-actor; get role tower-actor-token-minter` |
| A write is `denied request: …` | An admission policy refused its shape | The message names the rule; see the table above |

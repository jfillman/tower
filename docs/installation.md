# Installation

## Prerequisites

- Backstage 1.17+
- Access to a Kubernetes cluster running:
  - ArgoCD (for sync/promotion controls)
  - Tekton Pipelines (for CI/CD visibility)
  - External Secrets Operator (optional, for secret visibility)
  - Crossplane (optional, for resource composition visibility)

## Install Tower into Backstage

Tower needs the **new frontend system** (`createApp({ features: [...] })` from `@backstage/frontend-defaults`). It is
a versioned package installed from a git tag on this repo; there is no npm registry (see `RELEASING.md`).

### 1. Add the package

```bash
yarn workspace app add "@jfillman/tower@<owner>/tower#vX.Y.Z"   # <owner>: where this repo lives
```

### 2. Register Tower and the Hangar sign-in page

Edit `packages/app/src/App.tsx`:

```typescript
import { createApp } from '@backstage/frontend-defaults';
import { createHangarSignInModule, githubSignInProvider, towerPlugin } from '@jfillman/tower';

export default createApp({
  features: [
    // ...your other features
    towerPlugin,
    createHangarSignInModule({
      providers: [githubSignInProvider],
      guest: process.env.NODE_ENV === 'development',
    }),
  ],
});
```

`towerPlugin` brings its own route (`/tower`), sidebar entry and icon; there is no nav wiring.

### 3. Build and run

```bash
yarn start   # http://localhost:3000, Tower at /tower
```

## Sign-in page

`createHangarSignInModule` replaces Backstage's stock sign-in page with the Hangar one: the dial mark and wordmark,
the product family (Tower, Glidepath, Airframe, Apron, Autopilot), and one sign-in box. It follows the user's light
or dark theme.

- **One sign-in page per app.** The module overrides the app's `sign-in-page` extension. Remove any other
  `SignInPageBlueprint` module from `features`, or the app fails to start with a duplicate extension.
- **Providers are yours.** Pass the auth providers your backend runs. `githubSignInProvider` is ready-made; any other
  OAuth provider is an object:

  ```typescript
  import { microsoftAuthApiRef } from '@backstage/core-plugin-api';

  createHangarSignInModule({
    providers: [
      githubSignInProvider,
      { id: 'microsoft-auth-provider', title: 'Microsoft', apiRef: microsoftAuthApiRef, message: 'Company accounts only' },
    ],
  });
  ```

  The first provider gets the amber primary button. Keep `id` stable: it is how the page remembers the provider
  between visits.
- **Guest is for local development.** `guest: true` adds "Continue as guest". It needs the backend guest provider
  (`@backstage/plugin-auth-backend-module-guest-provider`), which refuses sign-in outside `NODE_ENV=development`.
  The legacy guest token (no auth backend) is not offered.
- **Sessions carry over.** The page remembers the provider under the same browser key as the stock page, and
  `githubSignInProvider` uses the stock GitHub id, so a user signed in before the switch stays signed in. Signing
  out forgets the provider.
- `tagline` replaces the line under the wordmark.

## Configuration

Tower reads cluster configuration from:
- Kubernetes API access (`kubernetes.clusterLocatorMethods` in Backstage's `app-config.yaml`)
- ArgoCD API endpoint (configurable via env or backstage.io labels)
- Tekton dashboard URL (auto-discovered or configured)

### Cluster access

Don't give Backstage a long-lived ServiceAccount token for any cluster.

- **The cluster Backstage runs in:** use the pod's own in-cluster identity (`authProvider: serviceAccount`, no token,
  `caFile` set to the in-cluster CA).
- **Every other cluster:** make that cluster trust the home cluster's ServiceAccount issuer (apron
  `components.clusterIdentity`). Then point the entry at:
  - a projected token file for reads (`authMetadata` `hangar.io/token-file`);
  - an actor ServiceAccount that is minted per write (`hangar.io/actor-*`).
- **On a managed cloud cluster** (EKS, GKE, AKS), use the provider's workload-identity exchange instead.

The full setup, including a `serviceAccountToken` placeholder the Kubernetes plugin needs, is in
[Cluster credentials](credentials/index.md).

### Environment Variables

```bash
# ArgoCD
ARGOCD_API=https://argocd.example.com
ARGOCD_TOKEN=<token>  # Optional, uses RBAC by default

# Tekton
TEKTON_DASHBOARD=https://tekton.example.com
TEKTON_NAMESPACE=tekton-pipelines

# Cluster identification
CLUSTER_NAME=prod
CLUSTER_DOMAIN=example.com
```

### Backstage Configuration

Tower can also be configured via `app-config.yaml`:

```yaml
tower:
  argocdUrl: https://argocd.example.com
  tektonUrl: https://tekton.example.com
  clusterName: prod
```

### Clusters and links

Tower names no cluster, GitHub owner or lab host. It reads them from `tower:` in app-config; a cluster's name is its
registry name, which is also its kubectl context and its `kubernetes.clusterLocatorMethods` entry:

```yaml
tower:
  # The control-plane (dev) cluster: Tekton, Glidepath's release records, Airframe's app XRs. Required for the
  # Pipelines, Ops Wall and Provisioning views; they say so when it is missing.
  controlPlaneCluster: <dev-cluster>
  clusters:                                # all optional; an unset value hides its link or lookup
    <dev-cluster>:
      tenantsRepo: <owner>/<tenants-repo>  # the registry record's tenantsRepo, where XR requests are opened
      infisicalUrl: https://<infisical-ui>
      grafanaUrl: https://<grafana>
    <prod-cluster>:
      grafanaUrl: https://<grafana>
  airframe:                                # the fleet's default environment chart
    repoURL: https://github.com/<owner>/airframe.git
```

### DORA metrics source (Ops Wall)

The Ops Wall's DORA panel queries dora-exporter's series (`dora_deployments_total`, `dora_releases_total`,
`dora_lead_time_seconds`, `dora_time_to_restore_seconds_experimental`) with PromQL, through the Kubernetes proxy of
the cluster named here. Its windows are 7, 30 and 90 days, so point it at the long-term query layer (Thanos Query,
Mimir), not a Prometheus with short local retention:

```yaml
tower:
  dora:
    metrics:
      cluster: <dev-cluster> # as registered in kubernetes.clusterLocatorMethods
      namespace: observability
      service: thanos-query-frontend
      port: 9090
```

Without this block Tower uses `kube-prometheus-stack-prometheus:9090` in `observability` on `tower.controlPlaneCluster`. The
Kubernetes plugin's identity needs `get` on `services/proxy` for that Service.

### Release records

Release records need Backstage's backend from the backstage repo (routes under `/api/glidepath/release-*` and the
`release-signoff-poll` / `release-record-poll` tasks) and Backstage's notifications backend for the announcements.
The backend uses its GitHub integration credential, which needs, on the app repos, `gitops-<app>` repos and the
release-modes repo: read contents, issues, milestones, PRs and reviews; write contents (the draft, and branches for
PRs); open PRs; set commit statuses; and create releases (only for apps that opt in to GitHub Releases).

```yaml
tower:
  # Where each app's release mode lives. Defaults shown (owner: the app's GitHub owner).
  releaseModes:
    repo: gitops-cluster-dev-tenants
    path: release-modes.yaml
  # Jira keys (ABC-123) in PR titles, bodies and branches link here. Unset: no Jira links.
  jira:
    baseUrl: https://your-org.atlassian.net
```

`release-modes.yaml` does not need to exist: every app is Assisted until an admin changes one, and the first change
opens the PR that creates it. Only `group:default/admins` gets `tower.release.mode`; it is never granted to owners.

## Verification

After installation, Tower should be available in the Backstage sidebar. Verify by:

1. Navigating to `/tower` in your Backstage instance
2. Checking that you see the Overview tab loading
3. Confirming that Releases and Pipelines tabs appear once cluster data loads

If Tower doesn't appear, check:
- Browser console for module load errors
- Backstage backend logs for API connectivity issues
- Kubernetes connectivity (in-cluster vs. external access): see the troubleshooting table in [Cluster credentials](credentials/index.md)

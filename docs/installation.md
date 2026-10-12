# Installation

## Prerequisites

- Backstage 1.17+
- Access to a Kubernetes cluster running:
  - ArgoCD (for sync/promotion controls)
  - Tekton Pipelines (for CI/CD visibility)
  - External Secrets Operator (optional, for secret visibility)
  - Crossplane (optional, for resource composition visibility)

## Install Tower into Backstage

### 1. Copy the plugin into your Backstage app

```bash
# From your Backstage app directory:
cp -r tower/plugin/src/tower packages/app/src/modules/
```

### 2. Import Tower into your app module

Edit `packages/app/src/App.tsx`:

```typescript
import { towerRoutes } from './modules/tower';

// Add to your routes
<Route path="/tower/*" element={<towerRoutes />} />
```

### 3. Add Tower to your navigation

Edit `packages/app/src/modules/nav/Nav.tsx` (or your nav component):

```typescript
import { TowerIcon } from './modules/tower';

// In your navigation items:
<NavLink to="/tower" label="Tower">
  <TowerIcon />
</NavLink>
```

### 4. Update dependencies

Tower requires these Backstage packages:

```bash
yarn workspace app add @backstage/core-components @backstage/core-plugin-api
```

### 5. Build and run

```bash
# Build the app
yarn build

# Run in development
yarn dev

# Tower will be available at http://localhost:3000/tower
```

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

### DORA metrics source (Ops Wall)

The Ops Wall's DORA panel queries dora-exporter's series (`dora_deployments_total`, `dora_releases_total`,
`dora_lead_time_seconds`, `dora_time_to_restore_seconds_experimental`) with PromQL, through the Kubernetes proxy of
the cluster named here. Its windows are 7, 30 and 90 days, so point it at the long-term query layer (Thanos Query,
Mimir), not a Prometheus with short local retention:

```yaml
tower:
  dora:
    metrics:
      cluster: kind-dev # as registered in kubernetes.clusterLocatorMethods
      namespace: observability
      service: thanos-query-frontend
      port: 9090
```

Without this block Tower uses `kube-prometheus-stack-prometheus:9090` in `observability` on the Tekton cluster. The
Kubernetes plugin's identity needs `get` on `services/proxy` for that Service.

## Verification

After installation, Tower should be available in the Backstage sidebar. Verify by:

1. Navigating to `/tower` in your Backstage instance
2. Checking that you see the Overview tab loading
3. Confirming that Releases and Pipelines tabs appear once cluster data loads

If Tower doesn't appear, check:
- Browser console for module load errors
- Backstage backend logs for API connectivity issues
- Kubernetes connectivity (in-cluster vs. external access): see the troubleshooting table in [Cluster credentials](credentials/index.md)

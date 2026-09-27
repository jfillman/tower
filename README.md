<div align="center">
  <img src="brand/marks/tower-tile.svg" width="88" height="88" alt="Tower mark" />
  <h1>Tower</h1>
  <p><i>Release orchestration and operational intelligence for Backstage.</i></p>
</div>

Tower is a Backstage plugin that brings visibility and control to cloud-native platforms built on Crossplane, ArgoCD, and Tekton. It provides release orchestration, promotion workflows, and operational dashboards for managing infrastructure-as-code deployments.

Part of the [Hangar](https://github.com/jfillman/hangar) platform. Brand files: [docs/brand/](docs/brand/README.md).

## Features

Tabs, in the order of a change's lifecycle: Overview, Pull Requests, Pipelines, Deployments, Releases, Topology,
Images, SLOs, Notifications, App Configuration, Glidepath. Plus fleet dashboards (Fleet Grid, Ops Wall).

- **Release Records**: structured release history, persisted as git commits, with compare and export
- **Release matrix**: which release is live in which environment, along the app's real promotion order
- **Deployments ("Ground Control")**: pipeline DAG per environment, rollout topology, ArgoCD Refresh and Sync, Tekton Re-run and Cancel
- **App Configuration and Glidepath**: edit environment values and `cicd.yaml` through a real GitOps PR, never a direct commit
- **SLOs, topology, images, notifications**: burn rate, live objects, artifact catalog, a time-sliced event feed

## Installation

### Prerequisites

- Backstage 1.17+
- Access to a Kubernetes cluster running:
  - ArgoCD (for sync/promotion controls)
  - Tekton Pipelines (for CI/CD visibility)
  - External Secrets Operator (optional, for secret visibility)
  - Crossplane (optional, for resource composition visibility)

### Install Tower into Backstage

1. **Copy the plugin into your Backstage app**

```bash
# From your Backstage app directory:
cp -r tower/plugin/src/tower packages/app/src/modules/
```

2. **Import Tower into your app module**

Edit `packages/app/src/App.tsx`:

```typescript
import { towerRoutes } from './modules/tower';

// Add to your routes
<Route path="/tower/*" element={<towerRoutes />} />
```

3. **Add Tower to your navigation**

Edit `packages/app/src/modules/nav/Nav.tsx` (or your nav component):

```typescript
<NavLink to="/tower" label="Tower">
  <TowerIcon />
</NavLink>
```

4. **Update dependencies**

Tower requires these Backstage packages:

```bash
yarn workspace app add @backstage/core-components @backstage/core-plugin-api
```

### Configuration

Tower reads cluster configuration from:
- Kubernetes API access (assumes in-cluster or configured kubeconfig)
- ArgoCD API endpoint (configurable via env or backstage.io labels)
- Tekton dashboard URL (auto-discovered or configured)

Example environment variables:

```bash
ARGOCD_API=https://argocd.example.com
TEKTON_DASHBOARD=https://tekton.example.com
CLUSTER_NAME=prod
```

## Development

### Local Setup

```bash
# Install dependencies
yarn install

# Run Backstage in dev mode
yarn dev

# Tower plugin will be available at http://localhost:3000/tower
```

### Building the Backstage App

```bash
# From your Backstage app root
yarn build

# Plugin will be included in the built app
```

## Architecture

Tower is built as a Backstage **frontend module** and consists of:

- **Core Tabs** — Overview, Releases, Pull Requests, Pipelines, Config
- **Components** — Release Record UI, Pipeline flow visualization, ArgoCD sync controls
- **Hooks** — Data fetching (Kubernetes API, ArgoCD), release persistence, environment caching
- **Utilities** — YAML editing, log parsing, schema validation

See `docs/` for detailed architecture and implementation notes.

## Patches & Customization

Tower may include patches or customizations to Backstage core components:

- See `docs/patches.md` for applied Backstage patches
- UI customizations documented in `docs/ui-customizations.md`

## Related Repos

- [Hangar](https://github.com/jfillman/hangar) — IDP core platform
- [Glidepath](https://github.com/jfillman/glidepath) — CI/CD engine (Tekton, PaC, cosign)
- [Airframe](https://github.com/jfillman/airframe) — Crossplane XRDs and Compositions
- [Backstage](https://github.com/jfillman/backstage) — Backstage base app (Tower is built as a module within)

## License

Same as Hangar — see [LICENSE](../hangar/LICENSE) for details.

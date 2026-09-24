# Tower

Release orchestration and operational intelligence for Backstage.

Tower is a Backstage plugin that brings visibility and control to cloud-native platforms built on Crossplane, ArgoCD, and Tekton. It provides release orchestration, promotion workflows, and operational dashboards for managing infrastructure-as-code deployments.

Part of the [Hangar](https://github.com/jfillman/hangar) Internal Developer Platform ecosystem.

## Features

- **Release Records** — structured, queryable release history with deployment promotion workflows
- **Pipeline Execution** — visibility into Tekton pipeline runs, task logs, and execution timeline  
- **Operational Dashboards** — fleet-wide environment status, SLO tracking, and deployment health
- **ArgoCD Integration** — sync status, application health, and manual sync controls
- **Promotion Workflows** — tier-aware environment promotion with approval gates
- **Real-time Events** — namespace events, activity feeds, and live updates

## Quick Links

- [Installation Guide](installation.md) — Getting Tower running in your Backstage instance
- [Architecture](architecture.md) — How Tower is structured and designed
- [Components Reference](components.md) — Details on each major component
- [Patches](patches.md) — Backstage customizations applied by Tower

## Related Projects

- [Hangar](https://github.com/jfillman/hangar) — IDP core platform
- [Glidepath](https://github.com/jfillman/glidepath) — CI/CD engine (Tekton, PaC, cosign)
- [Airframe](https://github.com/jfillman/airframe) — Crossplane XRDs and Compositions

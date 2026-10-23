# Airspace

Who an app talks to, and whether that matches what it declares. One tab per app (**Airspace**, after Topology) and
one fleet page (**Airspace →** on Tower's home: Map, Contracts, Drift).

## What it does

- **Strips** (the default) lists one environment's connections in three sections: **Inbound** (who calls the app),
  **Outbound** (what it calls) and **Owned infrastructure** (its components). Each row shows whether it is declared,
  its traffic, p95, errors and a state.
- **Radar** shows the same data as a graph: callers on the left, calls on the right, owned components below. Click a
  node for its detail. The View filter switches between the two, and Tower remembers the choice in your browser.
- **Map** (fleet) draws every connection of one environment on one cluster, laid out as ingress, then apps by call
  depth, then whatever they call that is not an app (databases, caches, external hosts).
- **Contracts** (fleet) lists the catalog's `kind: API` entities. For each one it shows the registered definition
  (operations for OpenAPI), who provides and consumes it (catalog relations), who was seen calling the provider, and
  the operations the provider served in traffic.
- **Drift** (fleet) lists, for every app with traffic, the connections that are seen but not declared and the ones
  that are declared but silent.

## Guardrails

- **Read only.** Airspace changes nothing. A declaration is still edited in the environment's values file, through
  Configure and a pull request.
- **No guessing.** If the values file can't be read, nothing is called declared, owned or undeclared. Traffic still
  shows, and a note says why. A connection that is not between two Hangar apps (an external host, a database the
  values file does not list) is shown as seen, never as drift.
- **Amber means someone should look.** Only *Seen, not declared* is amber. Silent declarations are grey, and ingress
  and broker traffic are blue.
- **Few GitHub calls.** The service graph comes from each cluster's own Prometheus and refreshes every minute.
  - The per-app tab reads one values file per environment you select, through the Glidepath backend.
  - Fleet Drift reads one values file per app that has traffic, when you open it.
  - Refresh reads them all again.

## Where the data comes from

| Source | What it gives | Where |
|---|---|---|
| Observed | Edges with rate, p95 and errors | `traces_service_graph_request_total{client, server, connection_type}`, `..._request_server_seconds_bucket` and `..._request_failed_total` in the cluster's Prometheus. Tempo's metrics generator writes them from the traces that OpenTelemetry auto-instrumentation sends |
| Declared | Which apps may call the app | `networkPolicy.allowIngressFrom` / `allowEgressTo` namespace peers in the environment's values file (`app-<name>-<env>`) |
| Composed | What the app owns | `components[]` in the values file |
| Contracts | API definitions and relations | The catalog's API entities: an app's own, plus the ones the kubernetes-ingestor publishes for every Airframe XRD (type `crd`) |
| Operations seen | Span names a service served | `traces_span_metrics_calls_total{span_kind="SPAN_KIND_SERVER"}` from the collector's span-metrics connector |

The service names in the graph are `<app>-<env>`: Hangar's Instrumentation takes `service.name` from the pod's
`app.kubernetes.io/instance` label. A client of `user` is a request with no traced caller (the gateway, a probe).

Edge states:

| State | Meaning |
|---|---|
| Declared · seen | In the values file and in traffic |
| Seen, not declared | In traffic, between two Hangar apps, with no declaration |
| Declared · no traffic | In the values file, no traffic in the window |
| Via broker | Producer to consumer through a message broker the app attaches to; no NetworkPolicy declaration applies |
| Ingress | Requests with no traced caller |
| Owned | A component in `components[]` |

## Known limits

- **Few app-to-app calls are declared today.** The only declaration is the NetworkPolicy peer list, so expect most
  of them to start out as *Seen, not declared*.
- **p95 is coarse.** It comes from Tempo's server-latency histogram, whose default buckets make low values round to
  the nearest bucket.
- **Some operations show only a method.** Span names depend on the framework: Node.js HTTP spans with no route
  report only the method (`GET`).
- **Not every app shows up in the graph.** An app only appears once it has served or sent traced traffic in the
  window.

## Phase 2 (not built)

- **The spec each environment runs.** Glidepath would extract the API spec from each signed image and attest it, so
  Contracts can show the spec per environment and the diff between them, not only the catalog's registered
  definition.
- **A breaking-change gate.** A spec diff plus the callers of the changed operations would block a promotion that
  breaks a consumer. That needs consumer contract tests to know which response fields a caller reads: runtime traces
  only show which operations it calls.
- **Ops Wall items.** Drift and breaking changes would appear as Needs-Attention items.
- **A first-class declaration.** Declared dependencies would get their own field in Airframe that also generates the
  NetworkPolicy, replacing the raw peer list.

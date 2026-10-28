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
- **Contracts** (fleet) lists the catalog's `kind: API` entities and every app whose images carry a signed spec. For
  each one it shows:
  - the registered definition (operations for OpenAPI), who provides and consumes it (catalog relations), and who was
    seen calling the provider;
  - **Deployed specs**: per environment, the spec signed onto the image that environment runs, with its signature
    status and which operations were seen in traffic;
  - **Diff `<from>` → `<to>`** between two environments' specs, breaking changes first.
- **Drift** (fleet) lists, for every app with traffic, the connections that are seen but not declared and the ones
  that are declared but silent. Above them, **Breaking changes pending**: open release PRs whose api-compat check
  warned or blocked.
- **Release Record → API compatibility** shows a release PR's api-compat check report: the verdict, each breaking
  change with whether the operation is in use, any accepted override, and a link to the diff in Contracts.
- **Ops Wall**: an open release PR whose api-compat check warned or blocked is a Needs-Attention item
  (`api-breaking-pending`; warn → warn, block → high).

## Guardrails

- **Read only.** Airspace changes nothing. A declaration is still edited in the environment's values file, through
  Configure and a pull request.
- **No guessing.** If the values file can't be read, nothing is called declared, owned or undeclared. Traffic still
  shows, and a note says why. A connection that is not between two Hangar apps (an external host, a database the
  values file does not list) is shown as seen, never as drift.
- **Amber means someone should look.** *Seen, not declared*, a breaking change in a diff, a breaking api-compat
  verdict and an unverified spec signature are amber; a blocked release and a contradicted signature are red. Silent
  declarations are grey, and ingress and broker traffic are blue.
- **A spec is only "verified" when its signature is.** The spec comes through the same `/provenance` route and the same
  verification as the build provenance and the SBOM; an unverified one is shown, labelled as such, and the diff says
  it reads it without trusting it.
- **The release check is authoritative.** The diff in Contracts is Tower's own reading; the api-compat check's oasdiff
  report on the release PR decides, and is what the Release Record shows.
- **Few GitHub calls.** The service graph comes from Prometheus (the hub's Thanos, or each cluster's own) and refreshes every minute.
  - The per-app tab reads one values file per environment you select, through the Glidepath backend.
  - Fleet Drift reads one values file per app that has traffic, when you open it.
  - Contracts reads the attestations of each environment's image (provenance route, registry-backed), once per image
    while the view is open.
  - Ops Wall and Drift read the release PRs of apps with a release waiting for a merge, every 5 minutes.
  - Refresh reads them all again.

## Where the data comes from

| Source | What it gives | Where |
|---|---|---|
| Observed | Edges with rate, p95 and errors | `traces_service_graph_request_total{client, server, connection_type}`, `..._request_server_seconds_bucket` and `..._request_failed_total` in the cluster's Prometheus. The OpenTelemetry collector's `servicegraph` connector writes them from the traces that auto-instrumentation sends (Tempo is optional; it only stores traces). The collector drops probe and Prometheus-scrape requests first (by user agent and health paths), so they never count as traffic |
| Declared | Which apps may call the app | `networkPolicy.allowIngressFrom` / `allowEgressTo` namespace peers in the environment's values file (`app-<name>-<env>`) |
| Composed | What the app owns | `components[]` in the values file |
| Contracts | API definitions and relations | The catalog's API entities: an app's own, plus the ones the kubernetes-ingestor publishes for every Airframe XRD (type `crd`) |
| Operations seen | Span names a service served | `traces_span_metrics_calls_total{span_kind="SPAN_KIND_SERVER"}` from the collector's span-metrics connector |
| Deployed spec | The spec an environment runs | The image's in-toto attestation, predicate type `https://hangar.io/attestations/api-spec/v1` (`apiType`, `path`, `sha256`, `specVersion`, `title`, `version`, `spec`), signed by Glidepath's build (`attest-api-spec`, cicd.yaml `api.spec`), read through the backend's `/provenance?image=` for the image the environment's Rollout runs |
| api-compat verdict | A release PR's compatibility report | The `<!-- glidepath:api-compat {JSON} -->` line in the api-compat gate's PR comment (contract version 1), passed through as the gate's message |

**Reading every cluster from the hub.** With `tower.airspace.metrics` set, Tower reads all observed data from one
Prometheus-API query layer instead of each cluster's own Prometheus: the hub's Thanos Query, which receives every
cluster's `traces_*` series (Apron `observability.receive` / `observability.remoteWrite`). Each query is scoped with
`cluster="<name>"`, the external label Apron sets on every cluster's Prometheus. Tower then needs no access to the
other clusters' Prometheus, and the 24h window works on a cluster whose own Prometheus keeps less.

```yaml
tower:
  airspace:
    metrics:
      cluster: hangar-dev            # whose Kubernetes proxy reaches the query layer
      namespace: observability       # default
      service: thanos-query-frontend # default
      port: 9090                     # default
      clusterLabel: cluster          # default
```

The fleet page's cluster list comes from the cluster registry. Without it, Tower falls back to
`tower.controlPlaneCluster` and any `tower.clusters` key that is a cluster name; role keys such as `controlPlane`
(the backend's shape) are never offered as clusters.

The service names in the graph are `<app>-<env>`: Hangar's Instrumentation takes `service.name` from the pod's
`app.kubernetes.io/instance` label. A client of `user` is a request with no traced caller (the gateway, a
port-forward, an uninstrumented client). A database edge is named by the database's host (`postgresql-rw`, `redis-master`), not its database name.

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
- **p95 is coarse.** It comes from the service graph's server-latency histogram, whose default buckets make low values
  round to the nearest bucket.
- **Operations need a route in the span name.** Span names depend on the framework. Spring names spans after the
  route; a plain Node.js `http` server reports only the method (`GET`) unless the app names the span itself, and
  Python's bare `http.server` is not traced at all unless the app opens its own server spans. The Skyport apps do
  both (`tracing.js`, `tracing.py`).
- **Not every app shows up in the graph.** An app only appears once it has served or sent traced traffic in the
  window.

## Phase 2: specs per environment and the api-compat verdict

**Diff rules** (Tower's reading, `src/airspace/apiSpec.ts`). Breaking:
- an operation removed;
- a parameter removed, newly required, or retyped;
- a request body newly required;
- a request field newly required, or added as required;
- a retyped field;
- a response field removed or retyped in a success (2xx) response;
- a success response code removed.

Not breaking: an added operation, an optional parameter or field added, a response field added, a non-success
response removed or any response added, an operation marked deprecated. Local `$ref`s are followed (cycles stop the
walk); schemas are compared to depth 4, arrays as `field[]`.

**Limits.**
- It is not oasdiff: no `oneOf`/`allOf` reasoning, enum narrowing or format changes. The release check's report covers
  those and wins.
- "Seen" is per operation, matched from server span names that carry a route (any parameter name). Traces never say
  which fields a caller reads, and a span that names only a method matches nothing.
- An image built before its app had a spec, or before Glidepath attested specs, carries none: that environment shows
  no spec until a newer build is deployed.
- The api-compat line is read from the gate comment's message. The backend keeps it only when the comment is the
  platform App's own api-compat comment, as it does for the provenance gate's signature line.

**Not built yet.**
- **Connection drift on the Ops Wall.** It needs every app's values file on every poll.
- **A first-class declaration.** Declared dependencies would get their own field in Airframe that also generates the
  NetworkPolicy, replacing the raw peer list.
- **Field-level impact.** Which response fields a caller reads needs consumer contract tests.

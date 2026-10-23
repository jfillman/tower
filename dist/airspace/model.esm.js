function serviceNameOf(app, env) {
  return `${app}-${env}`;
}
function appOfService(service, env) {
  const suffix = `-${env}`;
  return service.endsWith(suffix) && service.length > suffix.length ? service.slice(0, -suffix.length) : void 0;
}
function appOfNamespace(namespace, env) {
  const m = /^(?:app|infra)-(.+)$/.exec(namespace);
  return m ? appOfService(m[1], env) : void 0;
}
function kindOf(connectionType, client) {
  if (client === "user") return "ingress";
  switch (connectionType) {
    case "messaging_system":
      return "messaging";
    case "database":
      return "database";
    case "virtual_node":
      return "peer";
    default:
      return "rpc";
  }
}
const DATABASE_TYPES = /* @__PURE__ */ new Set(["postgresql", "mongodb", "redis", "mysql"]);
function componentKind(type) {
  if (type === "rabbitmq") return "messaging";
  return DATABASE_TYPES.has(type) ? "database" : "peer";
}
const COMPONENT_SERVICE_SUFFIXES = ["", "-rw", "-ro", "-r", "-master", "-replicas", "-headless"];
function componentFor(server, components) {
  return components.find((c) => COMPONENT_SERVICE_SUFFIXES.some((s) => server === `${c.name}${s}`));
}
function asNumberList(v) {
  if (!Array.isArray(v)) return void 0;
  const out = v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  return out.length ? out : void 0;
}
function asPeers(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((p) => Boolean(p) && typeof p === "object").map((p) => ({
    namespace: typeof p.namespace === "string" ? p.namespace : void 0,
    cidr: typeof p.cidr === "string" ? p.cidr : void 0,
    ports: asNumberList(p.ports)
  }));
}
function airspaceValuesOf(values) {
  const np = values?.networkPolicy ?? {};
  const components = Array.isArray(values?.components) ? values.components.filter((c) => Boolean(c) && typeof c === "object").filter((c) => typeof c.name === "string" && typeof c.type === "string").map((c) => ({ type: c.type, name: c.name })) : [];
  return { components, allowIngressFrom: asPeers(np.allowIngressFrom), allowEgressTo: asPeers(np.allowEgressTo) };
}
function statsFor(key, rates, p95s, errors) {
  return { rate: rates.get(key) ?? 0, p95: p95s.get(key), errorRate: errors.get(key) ?? 0 };
}
const edgeKey = (client, server) => `${client}\u2192${server}`;
function buildAppAirspace(input) {
  const { app, env, graph } = input;
  const values = input.values;
  const self = serviceNameOf(app, env);
  const components = values?.components ?? [];
  const hasBroker = components.some((c) => c.type === "rabbitmq");
  const rates = /* @__PURE__ */ new Map();
  const types = /* @__PURE__ */ new Map();
  for (const s of graph.samples) {
    const k = edgeKey(s.client, s.server);
    rates.set(k, (rates.get(k) ?? 0) + s.rate);
    if (!types.has(k)) types.set(k, s.connectionType);
  }
  const inbound = /* @__PURE__ */ new Map();
  const outbound = /* @__PURE__ */ new Map();
  const owned = /* @__PURE__ */ new Map();
  for (const c of components) {
    owned.set(c.name, {
      id: `owned:${c.name}`,
      name: c.name,
      direction: "owned",
      kind: componentKind(c.type),
      state: "composed",
      declared: true,
      componentType: c.type
    });
  }
  for (const [k, ct] of types) {
    const [client, server] = k.split("\u2192");
    const stats = statsFor(k, rates, graph.p95, graph.errors);
    const kind = kindOf(ct, client);
    if (server === self && client !== self) {
      const peerApp = client === "user" ? void 0 : appOfService(client, env);
      const name = client === "user" ? "Ingress" : peerApp ?? client;
      inbound.set(name, {
        id: `in:${client}`,
        name,
        app: peerApp,
        direction: "inbound",
        kind,
        state: "undeclared",
        declared: false,
        observed: stats
      });
    } else if (client === self && server !== self) {
      const component = componentFor(server, components);
      if (component) {
        const row = owned.get(component.name);
        owned.set(component.name, { ...row, observed: addStats(row.observed, stats) });
        continue;
      }
      const peerApp = appOfService(server, env);
      const name = peerApp ?? server;
      outbound.set(name, {
        id: `out:${server}`,
        name,
        app: peerApp,
        direction: "outbound",
        kind,
        state: "undeclared",
        declared: false,
        observed: stats
      });
    }
  }
  if (values) {
    for (const peer of values.allowIngressFrom) {
      const peerApp = peer.namespace ? appOfNamespace(peer.namespace, env) : void 0;
      const name = peerApp ?? peer.namespace ?? peer.cidr ?? "unknown peer";
      const row = inbound.get(name);
      inbound.set(name, {
        ...row ?? { id: `in:decl:${name}`, name, app: peerApp, direction: "inbound", kind: "rpc" },
        state: "ok",
        declared: true,
        ports: peer.ports,
        observed: row?.observed
      });
    }
    for (const peer of values.allowEgressTo) {
      const peerApp = peer.namespace ? appOfNamespace(peer.namespace, env) : void 0;
      const name = peerApp ?? peer.namespace ?? peer.cidr ?? "unknown peer";
      const row = outbound.get(name);
      outbound.set(name, {
        ...row ?? { id: `out:decl:${name}`, name, app: peerApp, direction: "outbound", kind: "rpc" },
        state: "ok",
        declared: true,
        ports: peer.ports,
        observed: row?.observed
      });
    }
  }
  const finish = (rows) => [...rows.values()].map((r) => ({ ...r, state: stateOf(r, values !== void 0, hasBroker) })).sort(byState);
  const inboundRows = finish(inbound);
  const outboundRows = finish(outbound);
  const ownedRows = [...owned.values()].sort((a, b) => a.name.localeCompare(b.name));
  const all = [...inboundRows, ...outboundRows];
  return {
    app,
    env,
    inbound: inboundRows,
    outbound: outboundRows,
    owned: ownedRows,
    drift: {
      undeclared: all.filter((r) => r.state === "undeclared").length,
      silent: all.filter((r) => r.state === "silent").length
    }
  };
}
function addStats(a, b) {
  if (!a) return b;
  return { rate: a.rate + b.rate, errorRate: a.errorRate + b.errorRate, p95: Math.max(a.p95 ?? 0, b.p95 ?? 0) || void 0 };
}
function stateOf(r, valuesKnown, hasBroker) {
  if (r.direction === "owned") return "composed";
  if (r.kind === "ingress") return "ingress";
  const seen = Boolean(r.observed && r.observed.rate > 0);
  if (r.kind === "messaging" && hasBroker) return "broker";
  if (r.declared) return seen ? "ok" : "silent";
  if (!valuesKnown) return "ok";
  return r.app ? "undeclared" : "ok";
}
const STATE_ORDER = { undeclared: 0, silent: 1, ok: 2, broker: 3, ingress: 4, composed: 5 };
function byState(a, b) {
  return STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name);
}
function buildFleetGraph(graph, env, knownApps) {
  const known = new Set(knownApps);
  const idOf = (service) => service;
  const appOf = (service) => {
    const a = appOfService(service, env);
    return a && known.has(a) ? a : void 0;
  };
  const inEnv = (service) => service === "user" || Boolean(appOf(service));
  const rates = /* @__PURE__ */ new Map();
  const kinds = /* @__PURE__ */ new Map();
  for (const s of graph.samples) {
    if (!appOf(s.client) && !appOf(s.server)) continue;
    if (!inEnv(s.client) && !appOf(s.server)) continue;
    const k = edgeKey(s.client, s.server);
    rates.set(k, (rates.get(k) ?? 0) + s.rate);
    kinds.set(k, kindOf(s.connectionType, s.client));
  }
  const edges = [...rates.keys()].map((k) => {
    const [from, to] = k.split("\u2192");
    return { from: idOf(from), to: idOf(to), kind: kinds.get(k), stats: statsFor(k, rates, graph.p95, graph.errors) };
  });
  const ids = /* @__PURE__ */ new Set();
  edges.forEach((e) => {
    ids.add(e.from);
    ids.add(e.to);
  });
  const appIds = [...ids].filter((id) => appOf(id));
  const depth = new Map(appIds.map((id) => [id, 1]));
  for (let pass = 0; pass < appIds.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (!appOf(e.from) || !appOf(e.to) || e.from === e.to) continue;
      const d = (depth.get(e.from) ?? 1) + 1;
      if (d > (depth.get(e.to) ?? 1) && d <= appIds.length) {
        depth.set(e.to, d);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const maxAppColumn = Math.max(1, ...depth.values());
  const nodes = [...ids].map((id) => {
    if (id === "user") return { id, label: "Ingress", role: "ingress", column: 0 };
    const a = appOf(id);
    if (a) return { id, label: a, role: "app", app: a, column: depth.get(id) ?? 1 };
    return { id, label: id, role: "peer", column: maxAppColumn + 1 };
  }).sort((a, b) => a.column - b.column || a.label.localeCompare(b.label));
  return { nodes, edges, columns: maxAppColumn + 2 };
}
function fleetDrift(airspaces) {
  const out = [];
  for (const a of airspaces) {
    for (const r of [...a.inbound, ...a.outbound]) {
      if (r.state !== "undeclared" && r.state !== "silent") continue;
      out.push({
        app: a.app,
        peer: r.name,
        state: r.state,
        direction: r.direction,
        rate: r.observed?.rate ?? 0
      });
    }
  }
  const rank = (d) => d.state === "undeclared" ? 0 : 1;
  return out.sort((x, y) => rank(x) - rank(y) || y.rate - x.rate);
}
function appsInGraph(graph, env, knownApps) {
  const known = new Set(knownApps);
  const out = /* @__PURE__ */ new Set();
  for (const s of graph.samples) {
    for (const svc of [s.client, s.server]) {
      const a = appOfService(svc, env);
      if (a && known.has(a)) out.add(a);
    }
  }
  return [...out].sort();
}
function formatRate(rps) {
  if (rps === void 0 || rps <= 0) return "0/s";
  if (rps >= 100) return `${Math.round(rps)}/s`;
  if (rps >= 1) return `${rps.toFixed(1)}/s`;
  const perMin = rps * 60;
  return perMin >= 1 ? `${perMin.toFixed(perMin >= 10 ? 0 : 1)}/min` : "<1/min";
}
function formatSeconds(s) {
  if (s === void 0 || !Number.isFinite(s)) return "\u2014";
  if (s >= 1) return `${s.toFixed(2)} s`;
  return `${Math.round(s * 1e3)} ms`;
}

export { airspaceValuesOf, appOfNamespace, appOfService, appsInGraph, buildAppAirspace, buildFleetGraph, componentFor, componentKind, edgeKey, fleetDrift, formatRate, formatSeconds, serviceNameOf };
//# sourceMappingURL=model.esm.js.map

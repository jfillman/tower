const COMPONENT_OUTPUTS = {
  redis: {
    host: { kind: "literal" },
    port: { kind: "literal" },
    url: { kind: "literal" },
    password: { kind: "secretKeyRef", object: "{name}-connection", key: "password" }
  },
  postgresql: {
    host: { kind: "secretKeyRef", object: "{name}-app", key: "host" },
    port: { kind: "secretKeyRef", object: "{name}-app", key: "port" },
    username: { kind: "secretKeyRef", object: "{name}-app", key: "username" },
    password: { kind: "secretKeyRef", object: "{name}-app", key: "password" },
    database: { kind: "secretKeyRef", object: "{name}-app", key: "dbname" },
    uri: { kind: "secretKeyRef", object: "{name}-app", key: "uri" },
    jdbcUri: { kind: "secretKeyRef", object: "{name}-app", key: "jdbc-uri" }
  },
  rabbitmq: {
    username: { kind: "secretKeyRef", object: "{name}-user-credentials", key: "username" },
    password: { kind: "secretKeyRef", object: "{name}-user-credentials", key: "password" },
    host: { kind: "configMapKeyRef", object: "{name}-connection", key: "host" },
    port: { kind: "configMapKeyRef", object: "{name}-connection", key: "port" },
    vhost: { kind: "configMapKeyRef", object: "{name}-connection", key: "vhost" }
  },
  mongodb: {
    username: { kind: "secretKeyRef", object: "{name}-app", key: "username" },
    password: { kind: "secretKeyRef", object: "{name}-app", key: "password" },
    uri: { kind: "secretKeyRef", object: "{name}-app", key: "connectionString.standard" },
    uriSrv: { kind: "secretKeyRef", object: "{name}-app", key: "connectionString.standardSrv" }
  },
  dex: {
    clientId: { kind: "secretKeyRef", object: "{name}-oauth-credentials", key: "client-id" },
    clientSecret: { kind: "secretKeyRef", object: "{name}-oauth-credentials", key: "client-secret" },
    issuer: { kind: "secretKeyRef", object: "{name}-oauth-credentials", key: "issuer" },
    tokenUrl: { kind: "secretKeyRef", object: "{name}-oauth-credentials", key: "token-url" },
    jwksUrl: { kind: "secretKeyRef", object: "{name}-oauth-credentials", key: "jwks-url" }
  }
};
const outputsOf = (type) => Object.keys(COMPONENT_OUTPUTS[type] ?? {});
function declaredComponents(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((c) => {
    const name = c?.name;
    const type = c?.type;
    return typeof name === "string" && name && typeof type === "string" && type ? [{ name, type }] : [];
  });
}
function matchComponentOutput(components, kind, refName, refKey) {
  for (const c of components) {
    for (const [output, o] of Object.entries(COMPONENT_OUTPUTS[c.type] ?? {})) {
      if (o.kind === kind && o.object?.replace("{name}", c.name) === refName && o.key === refKey) return { name: c.name, output };
    }
  }
  return void 0;
}
function withoutComponentEnv(rows, component) {
  const kept = [];
  const dropped = [];
  for (const r of rows) {
    const ref = r.kind === "configMap" || r.kind === "secret";
    const belongs = r.kind === "component" && r.component.trim() === component.name || ref && matchComponentOutput([component], r.kind === "configMap" ? "configMapKeyRef" : "secretKeyRef", r.refName.trim(), r.refKey.trim()) !== void 0;
    if (belongs) dropped.push(r.name || "(unnamed)");
    else kept.push(r);
  }
  return { kept, dropped };
}
function envNameFor(component, output) {
  const snake = (v) => v.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  return `${snake(component)}_${snake(output)}`;
}
function componentEnvRows(rows, component, outputs) {
  const add = [];
  const skipped = [];
  const taken = new Set(rows.map((r) => r.name.trim()));
  for (const output of outputs) {
    if (rows.some((r) => r.kind === "component" && r.component.trim() === component && r.output.trim() === output)) continue;
    const name = envNameFor(component, output);
    if (taken.has(name)) {
      skipped.push(name);
      continue;
    }
    taken.add(name);
    add.push({ name, component, output });
  }
  return { add, skipped };
}
function wiredOutputs(rows, component) {
  const out = {};
  for (const r of rows) {
    if (r.kind !== "component" || r.component.trim() !== component || !r.name.trim()) continue;
    (out[r.output.trim()] ??= []).push(r.name.trim());
  }
  return out;
}
function renameComponentEnv(rows, from, to) {
  if (!from || from === to) return rows;
  return rows.map((r) => r.kind === "component" && r.component.trim() === from ? { ...r, component: to } : r);
}

export { COMPONENT_OUTPUTS, componentEnvRows, declaredComponents, envNameFor, matchComponentOutput, outputsOf, renameComponentEnv, wiredOutputs, withoutComponentEnv };
//# sourceMappingURL=components.esm.js.map

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

export { COMPONENT_OUTPUTS, declaredComponents, matchComponentOutput, outputsOf };
//# sourceMappingURL=components.esm.js.map

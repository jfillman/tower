import yaml from 'js-yaml';

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
function openApiOperations(definition) {
  const doc = yaml.load(definition);
  if (!doc || typeof doc !== "object") throw new Error("the definition is empty");
  if (!("openapi" in doc) && !("swagger" in doc)) throw new Error("not an OpenAPI or Swagger document");
  const paths = doc.paths ?? {};
  const out = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== "object") continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!op || typeof op !== "object") continue;
      out.push({
        method: method.toUpperCase(),
        path,
        summary: String(op.summary ?? op.operationId ?? ""),
        deprecated: op.deprecated === true
      });
    }
  }
  return out;
}
const XRD_NAME = /^([a-z0-9]+)-([a-z0-9.-]+)--(v[0-9a-z]+)$/;
function titleOf(name, title, type) {
  if (title && title !== name) return { title };
  const m = type === "crd" ? XRD_NAME.exec(name) : null;
  return m ? { title: m[1], subtitle: `${m[2]}/${m[3]}` } : { title: name };
}
function byKindThenTitle(a, b) {
  return Number(a.type === "crd") - Number(b.type === "crd") || a.title.localeCompare(b.title);
}
function refName(ref) {
  return ref.replace(/^[^:]+:/, "").replace(/^[^/]+\//, "");
}
function contractOf(entity) {
  const spec = entity.spec ?? {};
  const relations = entity.relations ?? [];
  const definition = typeof spec.definition === "string" ? spec.definition : "";
  const type = String(spec.type ?? "unknown");
  let operations = [];
  let parseError;
  if (type === "openapi" && definition) {
    try {
      operations = openApiOperations(definition);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }
  const ns = entity.metadata.namespace ?? "default";
  return {
    ref: `api:${ns}/${entity.metadata.name}`,
    name: entity.metadata.name,
    ...titleOf(entity.metadata.name, entity.metadata.title, type),
    type,
    lifecycle: typeof spec.lifecycle === "string" ? spec.lifecycle : void 0,
    owner: typeof spec.owner === "string" ? spec.owner : void 0,
    description: entity.metadata.description,
    providers: relations.filter((r) => r.type === "apiProvidedBy").map((r) => r.targetRef),
    consumers: relations.filter((r) => r.type === "apiConsumedBy").map((r) => r.targetRef),
    operations,
    parseError,
    definition,
    source: "catalog"
  };
}
function withDeployedSpecs(contracts, byApp) {
  const out = contracts.map((c) => ({ ...c }));
  for (const [app, envs] of byApp) {
    const withSpec = envs.filter((e) => e.spec);
    if (withSpec.length === 0) continue;
    const deployed = { app, envs };
    const host = out.find(
      (c) => c.source === "catalog" && (c.type === "openapi" || c.type === "asyncapi") && c.providers.some((p) => refName(p) === app)
    );
    if (host) {
      host.deployed = deployed;
      continue;
    }
    const top = withSpec[withSpec.length - 1].spec.predicate;
    let operations = [];
    let parseError;
    const definition = yaml.dump(top.spec, { lineWidth: 120, noRefs: true });
    if (top.apiType === "openapi") {
      try {
        operations = openApiOperations(definition);
      } catch (e) {
        parseError = e instanceof Error ? e.message : String(e);
      }
    }
    out.push({
      ref: `deployed:${app}`,
      name: app,
      title: top.title || app,
      subtitle: `signed spec \xB7 ${top.path}`,
      type: top.apiType,
      description: void 0,
      providers: [`component:default/${app}`],
      consumers: [],
      operations,
      parseError,
      definition,
      source: "deployed",
      deployed
    });
  }
  return out.sort(byKindThenTitle);
}

export { byKindThenTitle, contractOf, openApiOperations, refName, titleOf, withDeployedSpecs };
//# sourceMappingURL=contracts.esm.js.map

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z]{2,20}-[a-z]{2,20}$/;
const TRACE = /^[0-9a-f]{32}$/;
function runOriginOf(annotations) {
  const chainId = annotations?.["glidepath.io/origin-chain-id"];
  if (!chainId || !UUID.test(chainId)) return void 0;
  const slug = annotations?.["glidepath.io/origin-chain-slug"];
  const trace = annotations?.["glidepath.io/origin-trace-id"];
  return { chainId, ...slug && SLUG.test(slug) ? { chainSlug: slug } : {}, ...trace && TRACE.test(trace) ? { traceId: trace } : {} };
}
function traceIdOfTraceparent(traceparent) {
  const m = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/.exec(traceparent ?? "");
  return m?.[1];
}

export { runOriginOf, traceIdOfTraceparent };
//# sourceMappingURL=lineage.esm.js.map

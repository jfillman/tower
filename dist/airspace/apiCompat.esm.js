const VERDICTS = ["pass", "warn", "block", "overridden", "no-spec", "no-baseline", "unsupported"];
const MARKER = /<!--\s*glidepath:api-compat\s+(\{[\s\S]*?\})\s*-->/;
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const optStr = (v) => typeof v === "string" && v ? v : void 0;
function sideOf(v) {
  if (!isObj(v)) return void 0;
  return { image: optStr(v.image), digest: optStr(v.digest), specSha256: optStr(v.specSha256), title: optStr(v.title), version: optStr(v.version) };
}
function parseApiCompat(message) {
  const m = message?.match(MARKER);
  if (!m) return void 0;
  let raw;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return void 0;
  }
  if (!isObj(raw) || raw.version !== 1 || !VERDICTS.includes(raw.verdict)) return void 0;
  const breaking = (Array.isArray(raw.breaking) ? raw.breaking : []).filter(isObj).map((b, i) => {
    const op = isObj(b.operation) && typeof b.operation.method === "string" && typeof b.operation.path === "string" ? { method: b.operation.method.toUpperCase(), path: b.operation.path } : void 0;
    return {
      id: optStr(b.id) ?? `change-${i}`,
      level: b.level === "warning" ? "warning" : "error",
      text: optStr(b.text) ?? optStr(b.id) ?? "breaking change",
      operation: op,
      inUse: typeof b.inUse === "boolean" ? b.inUse : null,
      rate: typeof b.rate === "number" && Number.isFinite(b.rate) ? b.rate : null
    };
  });
  const usage = isObj(raw.usage) ? raw.usage : {};
  const override = isObj(raw.override) && typeof raw.override.by === "string" ? { by: raw.override.by, at: optStr(raw.override.at), reason: optStr(raw.override.reason) } : null;
  return {
    version: 1,
    verdict: raw.verdict,
    env: optStr(raw.env) ?? "",
    candidate: sideOf(raw.candidate),
    baseline: sideOf(raw.baseline) ?? null,
    breaking,
    nonBreakingCount: typeof raw.nonBreakingCount === "number" ? raw.nonBreakingCount : 0,
    usage: {
      source: usage.source === "prometheus" ? "prometheus" : "unknown",
      window: optStr(usage.window),
      callers: Array.isArray(usage.callers) ? usage.callers.filter((c) => typeof c === "string") : []
    },
    override
  };
}
function gateIdOf(checkName) {
  return checkName.replace(/^Pipelines as Code(?:\s+CI)?\s*\/\s*/i, "").replace(/-+\s*$/, "").toLowerCase();
}
function apiCompatCheck(checks) {
  return checks?.find((c) => gateIdOf(c.name) === "api-compat");
}
function apiCompatOf(checks) {
  const check = apiCompatCheck(checks);
  return check ? { check, report: parseApiCompat(check.message) } : void 0;
}
const VERDICT_LABEL = {
  pass: "Compatible",
  warn: "Breaking \xB7 warning",
  block: "Breaking \xB7 blocked",
  overridden: "Breaking \xB7 accepted",
  "no-spec": "No spec",
  "no-baseline": "First spec",
  unsupported: "Not compared"
};
const VERDICT_TONE = {
  pass: "ok",
  warn: "warn",
  block: "bad",
  overridden: "warn",
  "no-spec": "neutral",
  "no-baseline": "neutral",
  unsupported: "neutral"
};
const needsAttention = (v) => v === "warn" || v === "block";

export { VERDICT_LABEL, VERDICT_TONE, apiCompatCheck, apiCompatOf, gateIdOf, needsAttention, parseApiCompat };
//# sourceMappingURL=apiCompat.esm.js.map

const METADATA_FIELDS = [
  { field: "podAnnotations", title: "Pod annotations", noun: "annotation", hint: "On every pod: Prometheus scrape hints, Vault or Reloader settings. Changing one rolls the pods." },
  { field: "podLabels", title: "Pod labels", noun: "label", hint: "On every pod, for example cost allocation or team. The selector labels cannot be changed." },
  { field: "annotations", title: "Rollout annotations", noun: "annotation", hint: "On the Rollout object itself, not its pods." },
  { field: "labels", title: "Rollout labels", noun: "label", hint: "On the Rollout object itself, not its pods." },
  { field: "serviceAnnotations", title: "Service annotations", noun: "annotation", hint: "On the Service (and the preview Service for blueGreen), for example a load balancer setting." },
  { field: "serviceLabels", title: "Service labels", noun: "label", hint: "On the Service (and the preview Service for blueGreen)." }
];
const isLabelField = (f) => f === "labels" || f === "podLabels" || f === "serviceLabels";
function reservedKeyProblem(field, key) {
  if (isLabelField(field)) {
    if (key.startsWith("app.kubernetes.io/") || key.startsWith("hangar.io/") || key === "helm.sh/chart") {
      return `"${key}" is a label the chart owns (app.kubernetes.io/*, hangar.io/* and helm.sh/chart are reserved).`;
    }
    return void 0;
  }
  if (key.startsWith("checksum/")) return `"${key}" is a chart-owned annotation (checksum/* rolls the pods when a ConfigMap or Secret entry changes).`;
  return void 0;
}
function metadataProblems(field, title, rows) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const r of rows) {
    const key = r.key.trim();
    if (!key) {
      if (r.value.trim()) out.push(`${title}: a value has no key.`);
      continue;
    }
    const reserved = reservedKeyProblem(field, key);
    if (reserved) out.push(`${title}: ${reserved}`);
    if (seen.has(key)) out.push(`${title}: "${key}" is listed twice.`);
    seen.add(key);
  }
  return out;
}

export { METADATA_FIELDS, metadataProblems, reservedKeyProblem };
//# sourceMappingURL=metadata.esm.js.map

const MAX_VALUE = 60;
function short(v) {
  if (v === null || v === void 0) return String(v);
  if (typeof v === "object") return Array.isArray(v) ? `[${v.length} items]` : "{\u2026}";
  const s = String(v).replace(/\s+/g, " ");
  return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE - 1)}\u2026` : s;
}
function flatten(values, prefix = "") {
  const out = [];
  if (Array.isArray(values)) {
    values.forEach((v, i) => {
      const key = `${prefix}[${i}]`;
      out.push({ key, value: v });
      out.push(...flatten(v, key));
    });
  } else if (values && typeof values === "object") {
    for (const [k, v] of Object.entries(values)) {
      const key = prefix ? `${prefix}.${k}` : k;
      out.push({ key, value: v });
      out.push(...flatten(v, key));
    }
  }
  return out;
}
function searchSettings(files, query, limit = 20) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/);
  const scored = [];
  for (const file of files) {
    for (const { key, value } of flatten(file.values)) {
      const k = key.toLowerCase();
      const scalar = value === null || typeof value !== "object";
      const keyMatch = words.every((w) => k.includes(w));
      const valueMatch = !keyMatch && scalar && String(value).toLowerCase().includes(q);
      if (!keyMatch && !valueMatch) continue;
      const last = k.split(/[.[]/).pop() ?? k;
      let score = k.length;
      if (keyMatch && words.some((w) => last === w || last === `${w}]`)) score -= 1e3;
      if (!keyMatch) score += 500;
      scored.push({ hit: { file, key, value: short(value) }, score });
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.hit);
}

export { flatten, searchSettings };
//# sourceMappingURL=settingIndex.esm.js.map

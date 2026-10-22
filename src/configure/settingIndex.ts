import type { ConfigureSubtab } from '../tabs/ConfigureTab';

// "Find a setting" on the Configure tab (2026-10-22 UI pass): which file sets a key, and to what. A service's
// configuration is spread over cicd.yaml, the shared values files and one values file per environment; a person
// looking for `replicas` had to know which of three tabs (now sub-tabs) to open. Pure functions here; the files are
// read by useSettingFiles.

export interface SettingFile {
  /** Where the finder sends you. */
  subtab: ConfigureSubtab;
  /** The environment row to open, for an environment's own values file. */
  env?: string;
  /** What a person calls it: "prod values", "Ground shared values", "cicd.yaml". */
  label: string;
  path: string;
  values: unknown;
}

export interface SettingHit {
  file: SettingFile;
  /** Dotted key path, list items as [n]: rollout.steps[2].setWeight */
  key: string;
  /** The value, shortened to one line. */
  value: string;
}

const MAX_VALUE = 60;

function short(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'object') return Array.isArray(v) ? `[${v.length} items]` : '{…}';
  const s = String(v).replace(/\s+/g, ' ');
  return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE - 1)}…` : s;
}

/** Every key path in a parsed YAML document with its value (objects too, so a whole block can be found by name). */
export function flatten(values: unknown, prefix = ''): Array<{ key: string; value: unknown }> {
  const out: Array<{ key: string; value: unknown }> = [];
  if (Array.isArray(values)) {
    values.forEach((v, i) => {
      const key = `${prefix}[${i}]`;
      out.push({ key, value: v });
      out.push(...flatten(v, key));
    });
  } else if (values && typeof values === 'object') {
    for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      out.push({ key, value: v });
      out.push(...flatten(v, key));
    }
  }
  return out;
}

/**
 * The keys whose path matches every word of the query (case-insensitive), most specific first: an exact last
 * segment beats a partial one, a shorter path beats a longer one. A scalar value containing the query counts too,
 * ranked after key matches, so "1.42.0" or "hangar-prod" finds where it is set.
 */
export function searchSettings(files: SettingFile[], query: string, limit = 20): SettingHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/);
  const scored: Array<{ hit: SettingHit; score: number }> = [];
  for (const file of files) {
    for (const { key, value } of flatten(file.values)) {
      const k = key.toLowerCase();
      const scalar = value === null || typeof value !== 'object';
      const keyMatch = words.every(w => k.includes(w));
      const valueMatch = !keyMatch && scalar && String(value).toLowerCase().includes(q);
      if (!keyMatch && !valueMatch) continue;
      const last = k.split(/[.[]/).pop() ?? k;
      let score = k.length;
      if (keyMatch && words.some(w => last === w || last === `${w}]`)) score -= 1000;
      if (!keyMatch) score += 500;
      scored.push({ hit: { file, key, value: short(value) }, score });
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map(s => s.hit);
}

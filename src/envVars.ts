// Environment-variable rows for the Config tab's "Environment variables" section.
//
// `env:` entries in values.yaml carry either a literal `value` or a `valueFrom` (for example a
// secretKeyRef to the Secret a PostgreSQL/Redis component created - airframe chart v0.3.88+).
// The form only knows how to edit literals. A `valueFrom` entry is therefore kept as an opaque row:
// shown read-only, carried through a save unchanged, and only removable on purpose. Before this
// module, the form loaded such an entry as an empty value and saved the whole list back as
// name/value pairs, silently dropping the source (the app then started with an empty variable).

export interface EnvRow {
  name: string;
  value: string;
  /** Present for a `valueFrom` entry; passed through untouched on save. */
  valueFrom?: Record<string, unknown>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** values.yaml `env:` -> form rows. Anything that isn't a list yields no rows. */
export function parseEnvRows(list: unknown): EnvRow[] {
  if (!Array.isArray(list)) return [];
  return list.map(item => {
    const e = isPlainObject(item) ? item : {};
    const name = typeof e.name === 'string' ? e.name : '';
    if (isPlainObject(e.valueFrom)) return { name, value: '', valueFrom: e.valueFrom };
    return { name, value: String(e.value ?? '') };
  });
}

/** Form rows -> the `env:` list to write. Rows with no name are dropped, as before. */
export function buildEnvValue(rows: EnvRow[]): Array<Record<string, unknown>> {
  return rows
    .filter(r => r.name.trim())
    .map(r =>
      r.valueFrom
        ? { name: r.name.trim(), valueFrom: r.valueFrom }
        : { name: r.name.trim(), value: r.value },
    );
}

/** A short human description of where a `valueFrom` entry reads from. */
export function describeValueFrom(valueFrom: Record<string, unknown>): string {
  const ref = (key: string) => (isPlainObject(valueFrom[key]) ? (valueFrom[key] as Record<string, unknown>) : undefined);
  const secret = ref('secretKeyRef');
  if (secret) return `Secret ${String(secret.name ?? '?')} / ${String(secret.key ?? '?')}`;
  const cm = ref('configMapKeyRef');
  if (cm) return `ConfigMap ${String(cm.name ?? '?')} / ${String(cm.key ?? '?')}`;
  const field = ref('fieldRef');
  if (field) return `field ${String(field.fieldPath ?? '?')}`;
  return 'valueFrom (set in values.yaml)';
}

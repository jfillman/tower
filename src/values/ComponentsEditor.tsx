import { useState } from 'react';
import Typography from '@material-ui/core/Typography';
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import { useHangarTokens } from '../brand/tokens';
import { Chip } from '../ui';
import { useUi } from '../ui/styles';
import { newSpec, type ComponentDefinition, type ComponentRow, type Spec } from './componentCatalog';
import { SchemaFields } from './SchemaFields';
import { useStyles } from './styles';

// The attached components of an environment (components: in the values file) as a form: one card per component with its fields
// drawn from the XRD, and what it hands the app (the outputs an env entry can take with "From component"). It edits the same
// `components:` YAML the editor below it shows, so nothing is lost and a shape the form cannot draw can still be edited there.

type Raw = Record<string, unknown>;

/** The components of the YAML text, or undefined when it is not a list of components (then the YAML below is the way to edit it). */
export function parseComponents(text: string): ComponentRow[] | undefined {
  if (!text.trim()) return [];
  try {
    const v = loadYaml(text);
    if (!Array.isArray(v)) return undefined;
    return v.map(c => {
      const r = (c && typeof c === 'object' ? c : {}) as Raw;
      const spec = r.spec && typeof r.spec === 'object' && !Array.isArray(r.spec) ? (r.spec as Spec) : {};
      return { name: String(r.name ?? ''), type: String(r.type ?? ''), spec };
    });
  } catch {
    return undefined;
  }
}

/** The YAML for the components, in the order the files already use: type, name, spec. A component with no spec writes none. */
export function dumpComponents(rows: ComponentRow[]): string {
  if (rows.length === 0) return '';
  return dumpYaml(
    rows.map(r => ({ type: r.type, name: r.name, ...(Object.keys(r.spec).length > 0 ? { spec: r.spec } : {}) })),
    { lineWidth: 100 },
  ).trimEnd();
}

const resolve = (template: string | undefined, name: string) => (template ?? '').replace('{name}', name);

export function ComponentsEditor({ text, onChange, defs }: { text: string; onChange: (text: string) => void; defs?: ComponentDefinition[] }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ui = useUi({ t });
  const [addType, setAddType] = useState('');
  const rows = parseComponents(text);

  if (!defs) {
    return <div className={ui.note}>The component catalog could not be loaded, so the form is not available. Edit the components in the YAML below.</div>;
  }
  if (!rows) {
    return <div className={ui.note}>The components below are not a YAML list the form can edit. Fix the YAML first, or keep editing it there.</div>;
  }
  const set = (next: ComponentRow[]) => onChange(dumpComponents(next));
  const update = (i: number, patch: Partial<ComponentRow>) => set(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const uniqueName = (type: string) => {
    let n = type;
    for (let k = 2; rows.some(r => r.name === n); k++) n = `${type}-${k}`;
    return n;
  };

  return (
    <div className={classes.rowList}>
      {rows.length === 0 && <div className={ui.note}>No components yet. Add one to give this environment a Redis, a database or a message broker.</div>}
      {rows.map((r, i) => {
        const def = defs.find(d => d.type === r.type);
        return (
          <div key={i} className={classes.stepCard}>
            <div className={classes.row} style={{ alignItems: 'center' }}>
              <input className={classes.input} aria-label={`Component ${i + 1} name`} placeholder="not set: a name, for example cache" value={r.name} onChange={e => update(i, { name: e.target.value })} style={{ maxWidth: 260 }} />
              <Chip tone="ground">{def?.kind ?? r.type}</Chip>
              <span style={{ flex: 1 }} />
              <button type="button" className={classes.removeBtn} onClick={() => set(rows.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
            {def ? (
              <>
                {def.summary && <div className={ui.note} style={{ margin: '8px 0' }}>{def.summary}</div>}
                <SchemaFields def={def} spec={r.spec} idPrefix={`Component ${i + 1}`} onChange={spec => update(i, { spec })} />
                {Object.keys(def.outputs).length > 0 && r.name && (
                  <div style={{ marginTop: 10 }}>
                    <Typography className={classes.fieldLabel}>What it gives the app</Typography>
                    <div className={ui.note}>
                      Use these as environment variables with <b>From component</b> (Config tab), so a rename cannot break them.
                    </div>
                    <table style={{ marginTop: 4, fontSize: 12, borderCollapse: 'collapse' }}>
                      <tbody>
                        {Object.entries(def.outputs).map(([k, o]) => (
                          <tr key={k}>
                            <td style={{ padding: '2px 14px 2px 0', fontWeight: 600 }}>{k}</td>
                            <td style={{ padding: '2px 0', opacity: 0.8 }}>
                              {o.kind === 'literal' ? 'a plain value' : `${o.kind === 'secretKeyRef' ? 'Secret' : 'ConfigMap'} ${resolve(o.secret ?? o.configMap, r.name)}, key ${o.key}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className={ui.problem} style={{ marginTop: 8 }}>
                &quot;{r.type}&quot; is not a component type airframe knows, so its fields cannot be drawn. Edit it in the YAML below.
              </div>
            )}
          </div>
        );
      })}
      <div className={classes.row}>
        <select className={classes.input} aria-label="Component type to add" value={addType} onChange={e => setAddType(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Choose a type…</option>
          {defs.map(d => (
            <option key={d.type} value={d.type}>
              {d.kind}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={classes.addBtn}
          disabled={!addType}
          onClick={() => {
            const def = defs.find(d => d.type === addType);
            if (!def) return;
            set([...rows, { type: def.type, name: uniqueName(def.type), spec: newSpec(def) }]);
            setAddType('');
          }}
        >
          + Add component
        </button>
      </div>
    </div>
  );
}

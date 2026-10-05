import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import { useStyles, type Cls } from './styles';
import { useHangarTokens } from '../brand/tokens';
import {
  currentMode,
  pruneForMode,
  requiredFields,
  visibleFields,
  type ComponentDefinition,
  type SchemaNode,
  type Spec,
} from './componentCatalog';

// The fields of one component's `spec`, drawn from its XRD schema: a select for an enum, a number box for a number, a switch for
// a boolean, one line per item for a list of strings, a small group for an object of strings. Only the fields of the mode in
// force are shown, and changing the mode removes what belonged to the other one. An empty field is left out of the spec
// rather than written as "" so the file only says what was chosen. Anything of a shape this does not draw is left to the YAML.

const cleanDescription = (d?: string) => (d ?? '').replace(/^\([a-z]+\)\s*/, '').replace(/\s+/g, ' ').trim();
const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function setField(spec: Spec, key: string, value: unknown): Spec {
  const next = { ...spec };
  if (isEmpty(value)) delete next[key];
  else next[key] = value;
  return next;
}

function Scalar({
  node,
  value,
  onChange,
  label,
  classes,
}: {
  node: SchemaNode;
  value: unknown;
  onChange: (v: unknown) => void;
  label: string;
  classes: Cls;
}) {
  const def = node.default;
  const ghost = def !== undefined ? `default: ${String(def)}` : 'not set';
  if (node.enum) {
    const numeric = node.type === 'integer' || node.type === 'number';
    return (
      <select
        className={classes.input}
        aria-label={label}
        value={value === undefined ? '' : String(value)}
        onChange={e => onChange(e.target.value === '' ? undefined : numeric ? Number(e.target.value) : e.target.value)}
      >
        <option value="">{ghost}</option>
        {node.enum.map(o => (
          <option key={String(o)} value={String(o)}>
            {String(o)}
          </option>
        ))}
      </select>
    );
  }
  if (node.type === 'integer' || node.type === 'number') {
    return (
      <input
        className={classes.input}
        type="number"
        aria-label={label}
        placeholder={ghost}
        value={typeof value === 'number' ? value : ''}
        onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    );
  }
  return <input className={classes.input} aria-label={label} placeholder={ghost} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} />;
}

export function SchemaFields({
  def,
  spec,
  onChange,
  idPrefix,
}: {
  def: ComponentDefinition;
  spec: Spec;
  onChange: (spec: Spec) => void;
  idPrefix: string;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const required = new Set(requiredFields(def, spec));
  const fields = visibleFields(def, spec);
  const mode = currentMode(def, spec);

  const change = (key: string, value: unknown) => {
    const next = setField(spec, key, value);
    onChange(key === 'mode' ? pruneForMode(def, next) : next);
  };

  return (
    <div className={classes.grid}>
      {fields.map(f => {
        const node = def.spec.properties?.[f] as SchemaNode;
        const label = `${idPrefix} ${f}`;
        const star = required.has(f) ? ' *' : '';
        const hint = cleanDescription(node.description);
        let control;
        if (node.type === 'boolean') {
          control = (
            <div className={classes.switchRow}>
              <Switch checked={typeof spec[f] === 'boolean' ? (spec[f] as boolean) : node.default === true} inputProps={{ 'aria-label': label }} onChange={e => change(f, e.target.checked)} />
              <Typography className={classes.switchLabel}>{node.default !== undefined ? `default: ${String(node.default)}` : ''}</Typography>
            </div>
          );
        } else if (node.type === 'array' && (node.items?.type ?? 'string') === 'string') {
          const list = Array.isArray(spec[f]) ? (spec[f] as unknown[]).map(String) : [];
          control = (
            <textarea
              className={classes.textarea}
              rows={3}
              aria-label={label}
              placeholder="not set: one per line"
              value={list.join('\n')}
              onChange={e => change(f, e.target.value.split('\n').map(x => x.trim()).filter(Boolean))}
            />
          );
        } else if (node.type === 'object' && node.properties && Object.values(node.properties).every(p => p.type === 'string')) {
          const sub = (spec[f] && typeof spec[f] === 'object' ? spec[f] : {}) as Spec;
          const subRequired = new Set(node.required ?? []);
          control = (
            <div className={classes.rowList}>
              {Object.entries(node.properties).map(([k, n]) => (
                <input
                  key={k}
                  className={classes.input}
                  aria-label={`${label} ${k}`}
                  placeholder={`${k}${subRequired.has(k) ? ' (required)' : ''}`}
                  value={typeof sub[k] === 'string' ? (sub[k] as string) : ''}
                  onChange={e => change(f, setField(sub, k, e.target.value))}
                  title={cleanDescription(n.description)}
                />
              ))}
            </div>
          );
        } else if (node.type === 'string' || node.type === 'integer' || node.type === 'number') {
          control = <Scalar node={node} value={spec[f]} label={label} classes={classes} onChange={v => change(f, v)} />;
        } else {
          control = (
            <Typography className={classes.hint}>
              This field is not drawn here: edit it in the YAML below. Current value: <code>{JSON.stringify(spec[f] ?? null)}</code>
            </Typography>
          );
        }
        return (
          <div key={f} className={classes.field} data-mode={mode}>
            <Typography className={classes.fieldLabel}>
              {f}
              {star}
            </Typography>
            {control}
            {hint && <Typography className={classes.hint}>{hint}</Typography>}
          </div>
        );
      })}
    </div>
  );
}

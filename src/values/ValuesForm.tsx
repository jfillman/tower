import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Typography from '@material-ui/core/Typography';
import Switch from '@material-ui/core/Switch';
import Link from '@material-ui/core/Link';
import { dump as dumpYaml } from 'js-yaml';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useValuesSchema } from '../useConfigData';
import { useHangarTokens } from '../brand/tokens';
import { Button, Subtabs } from '../ui';
import { PendingPanel } from '../ui/PendingPanel';
import { useUi } from '../ui/styles';
import type { ValuesSource } from './sources';
import { RefreshButton } from '../RefreshButton';
import { PrResultDialog } from '../PrResultDialog';
import { YamlBlockEditor, validateYamlBlock } from '../YamlBlockEditor';
import { validateAgainstSchema, type JsonSchema, type SchemaIssue } from '../schemaValidate';
import { deepEqual } from '../deepEqual';
import type { ConfigTopLevelField } from '../types';
import { useStyles, type Cls } from './styles';


// --- probe form (item 1) ----------------------------------------------------

interface ProbeFormState {
  kind: 'none' | 'httpGet' | 'tcpSocket' | 'exec';
  path: string;
  port: string;
  command: string; // exec only, one argument per line
  initialDelaySeconds: number | '';
  periodSeconds: number | '';
  timeoutSeconds: number | '';
  successThreshold: number | '';
  failureThreshold: number | '';
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// Order-independent structural equality - used to derive `dirty` by
// comparing the current form state against a snapshot taken at load time
// (see ConfigEditor's originalForm/originalAdvanced/originalStepsRaw),
// rather than an imperative "has this been touched" flag (2026-09-13 bug:
// "if you enable [a switch] and then disable it, the changes panel still
// thinks there's an edit" - toggling back to the original value must read
// as clean again, which a touched-once flag can never do). Extracted to
// ../deepEqual so the Glidepath tab's own dirty-state tracking can share it.

// --- configMaps / secrets forms (2026-09-13: "unclear how to configure" /
// "I'd like Secrets to be form based" / "ConfigMaps to be more form based") -
// previously raw YAML with a "show example" snippet; now full forms, no YAML
// fallback needed since both shapes are small and fixed (unlike rollout
// steps, which can genuinely go outside what a form can represent). -------

interface ConfigMapRow {
  name: string;
  as: 'volume' | 'env' | 'both';
  mountPath: string;
  source: 'data' | 'existing';
  existingConfigMap: string;
  data: Array<{ key: string; value: string }>;
}

interface SecretRow {
  name: string;
  as: 'env' | 'volume' | 'both';
  key: string;
  mountPath: string;
  shared: boolean;
}

function parseConfigMapRows(v: unknown): ConfigMapRow[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).map(raw => {
    const r = asRecord(raw);
    const hasExisting = typeof r.existingConfigMap === 'string' && r.existingConfigMap.length > 0;
    return {
      name: typeof r.name === 'string' ? r.name : '',
      as: r.as === 'env' || r.as === 'both' ? r.as : 'volume',
      mountPath: typeof r.mountPath === 'string' ? r.mountPath : '',
      source: hasExisting ? 'existing' : 'data',
      existingConfigMap: typeof r.existingConfigMap === 'string' ? r.existingConfigMap : '',
      data: Object.entries(asRecord(r.data)).map(([key, value]) => ({ key, value: String(value ?? '') })),
    };
  });
}

function buildConfigMapsValue(rows: ConfigMapRow[]): unknown[] {
  return rows
    .filter(r => r.name.trim())
    .map(r => {
      const entry: Record<string, unknown> = { name: r.name.trim() };
      if (r.as !== 'volume') entry.as = r.as;
      if (r.as !== 'env' && r.mountPath.trim()) entry.mountPath = r.mountPath.trim();
      if (r.source === 'existing') entry.existingConfigMap = r.existingConfigMap.trim();
      else entry.data = Object.fromEntries(r.data.filter(d => d.key.trim()).map(d => [d.key.trim(), d.value]));
      return entry;
    });
}

function parseSecretRows(v: unknown): SecretRow[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).map(raw => {
    const r = asRecord(raw);
    return {
      name: typeof r.name === 'string' ? r.name : '',
      as: r.as === 'volume' || r.as === 'both' ? r.as : 'env',
      key: typeof r.key === 'string' ? r.key : '',
      mountPath: typeof r.mountPath === 'string' ? r.mountPath : '',
      shared: Boolean(r.shared ?? false),
    };
  });
}

function buildSecretsValue(rows: SecretRow[]): unknown[] {
  return rows
    .filter(r => r.name.trim())
    .map(r => {
      const entry: Record<string, unknown> = { name: r.name.trim() };
      if (r.as !== 'env') entry.as = r.as;
      if (r.as !== 'volume' && r.key.trim()) entry.key = r.key.trim();
      if (r.as !== 'env' && r.mountPath.trim()) entry.mountPath = r.mountPath.trim();
      if (r.shared) entry.shared = true;
      return entry;
    });
}

function parseProbe(raw: unknown): ProbeFormState {
  const p = asRecord(raw);
  const timing = {
    initialDelaySeconds: typeof p.initialDelaySeconds === 'number' ? p.initialDelaySeconds : ('' as const),
    periodSeconds: typeof p.periodSeconds === 'number' ? p.periodSeconds : ('' as const),
    timeoutSeconds: typeof p.timeoutSeconds === 'number' ? p.timeoutSeconds : ('' as const),
    successThreshold: typeof p.successThreshold === 'number' ? p.successThreshold : ('' as const),
    failureThreshold: typeof p.failureThreshold === 'number' ? p.failureThreshold : ('' as const),
  };
  if (p.httpGet) {
    const h = asRecord(p.httpGet);
    return { kind: 'httpGet', path: typeof h.path === 'string' ? h.path : '', port: h.port !== undefined ? String(h.port) : '', command: '', ...timing };
  }
  if (p.tcpSocket) {
    const h = asRecord(p.tcpSocket);
    return { kind: 'tcpSocket', path: '', port: h.port !== undefined ? String(h.port) : '', command: '', ...timing };
  }
  if (p.exec) {
    const h = asRecord(p.exec);
    const cmd = Array.isArray(h.command) ? (h.command as string[]).join('\n') : '';
    return { kind: 'exec', path: '', port: '', command: cmd, ...timing };
  }
  return { kind: 'none', path: '', port: '', command: '', ...timing };
}

function buildProbeValue(p: ProbeFormState): Record<string, unknown> {
  if (p.kind === 'none') return {};
  const timing: Record<string, unknown> = {};
  if (p.initialDelaySeconds !== '') timing.initialDelaySeconds = p.initialDelaySeconds;
  if (p.periodSeconds !== '') timing.periodSeconds = p.periodSeconds;
  if (p.timeoutSeconds !== '') timing.timeoutSeconds = p.timeoutSeconds;
  if (p.successThreshold !== '') timing.successThreshold = p.successThreshold;
  if (p.failureThreshold !== '') timing.failureThreshold = p.failureThreshold;
  const portValue: string | number = /^\d+$/.test(p.port.trim()) ? Number(p.port.trim()) : p.port.trim();
  if (p.kind === 'httpGet') return { httpGet: { path: p.path.trim(), port: portValue }, ...timing };
  if (p.kind === 'tcpSocket') return { tcpSocket: { port: portValue }, ...timing };
  return { exec: { command: p.command.split('\n').map(s => s.trim()).filter(Boolean) }, ...timing };
}

function ProbeFields({ label, probe, onChange, classes }: { label: string; probe: ProbeFormState; onChange: (p: ProbeFormState) => void; classes: Cls }) {
  return (
    <div>
      <Typography className={classes.fieldLabel} style={{ marginBottom: 6 }}>{label}</Typography>
      <div className={classes.grid}>
        <Field label="Type" classes={classes}>
          <select
            className={classes.select}
            value={probe.kind}
            onChange={e => onChange({ ...probe, kind: e.target.value as ProbeFormState['kind'] })}
          >
            <option value="none">None</option>
            <option value="httpGet">HTTP GET</option>
            <option value="tcpSocket">TCP socket</option>
            <option value="exec">Exec command</option>
          </select>
        </Field>
        {probe.kind === 'httpGet' && (
          <>
            <Field label="Path" classes={classes}>
              <input className={classes.input} placeholder="/healthz" value={probe.path} onChange={e => onChange({ ...probe, path: e.target.value })} />
            </Field>
            <Field label="Port" classes={classes}>
              <input className={classes.input} placeholder="3000" value={probe.port} onChange={e => onChange({ ...probe, port: e.target.value })} />
            </Field>
          </>
        )}
        {probe.kind === 'tcpSocket' && (
          <Field label="Port" classes={classes}>
            <input className={classes.input} placeholder="3000" value={probe.port} onChange={e => onChange({ ...probe, port: e.target.value })} />
          </Field>
        )}
      </div>
      {probe.kind === 'exec' && (
        <Field label="Command (one argument per line)" classes={classes}>
          <textarea
            className={classes.textarea}
            rows={3}
            value={probe.command}
            onChange={e => onChange({ ...probe, command: e.target.value })}
            placeholder={'cat\n/tmp/healthy'}
          />
        </Field>
      )}
      {probe.kind !== 'none' && (
        <div className={classes.grid} style={{ marginTop: 10 }}>
          <Field label="Initial delay (s)" classes={classes}>
            <input className={classes.input} type="number" min={0} value={probe.initialDelaySeconds} onChange={e => onChange({ ...probe, initialDelaySeconds: e.target.value === '' ? '' : Number(e.target.value) })} />
          </Field>
          <Field label="Period (s)" classes={classes}>
            <input className={classes.input} type="number" min={1} value={probe.periodSeconds} onChange={e => onChange({ ...probe, periodSeconds: e.target.value === '' ? '' : Number(e.target.value) })} />
          </Field>
          <Field label="Timeout (s)" classes={classes}>
            <input className={classes.input} type="number" min={1} value={probe.timeoutSeconds} onChange={e => onChange({ ...probe, timeoutSeconds: e.target.value === '' ? '' : Number(e.target.value) })} />
          </Field>
          <Field label="Success threshold" classes={classes}>
            <input className={classes.input} type="number" min={1} value={probe.successThreshold} onChange={e => onChange({ ...probe, successThreshold: e.target.value === '' ? '' : Number(e.target.value) })} />
          </Field>
          <Field label="Failure threshold" classes={classes}>
            <input className={classes.input} type="number" min={1} value={probe.failureThreshold} onChange={e => onChange({ ...probe, failureThreshold: e.target.value === '' ? '' : Number(e.target.value) })} />
          </Field>
        </div>
      )}
    </div>
  );
}

// --- canary steps builder (item 6) ------------------------------------------

type StepForm =
  | { kind: 'weight'; weight: number | '' }
  | { kind: 'pause'; duration: string }
  | { kind: 'analysis'; templates: string; extraArgs: Array<{ name: string; value: string }> };

// The one arg every analysis step in this platform's real examples carries
// (Argo Rollouts' own live pod-template-hash value) - generated
// automatically so the builder's Analysis step only has to ask for template
// names. A step can also declare further args a template's own query
// references (e.g. a custom threshold) - see extraArgs on the analysis
// variant above and the "Args" sub-list in StepsBuilder (2026-09-13:
// "it's not clear how to handle parameters to the analysisTemplates").
const STANDARD_ANALYSIS_ARG = { name: 'canary-hash', valueFrom: { podTemplateHashValue: 'Latest' } };

// Returns undefined when any step doesn't fit one of the three plain shapes
// this builder can represent - the caller falls back to a raw YAML editor
// for `rollout.steps` in that case rather than risk silently dropping or
// mangling a step it can't reconstruct (e.g. setCanaryScale, experiment, an
// analysis step whose first arg isn't the standard canary-hash boilerplate).
function parseStepsSimple(steps: unknown): StepForm[] | undefined {
  if (steps === undefined) return [];
  if (!Array.isArray(steps)) return undefined;
  const result: StepForm[] = [];
  for (const raw of steps) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const obj = raw as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length !== 1) return undefined;
    if (keys[0] === 'setWeight') {
      if (typeof obj.setWeight !== 'number') return undefined;
      result.push({ kind: 'weight', weight: obj.setWeight });
    } else if (keys[0] === 'pause') {
      const p = asRecord(obj.pause);
      const pKeys = Object.keys(p);
      if (pKeys.length > 1 || (pKeys.length === 1 && pKeys[0] !== 'duration')) return undefined;
      result.push({ kind: 'pause', duration: typeof p.duration === 'string' ? p.duration : '' });
    } else if (keys[0] === 'analysis') {
      const a = asRecord(obj.analysis);
      const aKeys = new Set(Object.keys(a));
      if (!aKeys.has('templates') || !Array.isArray(a.templates)) return undefined;
      const extraKeys = [...aKeys].filter(k => k !== 'templates' && k !== 'args');
      if (extraKeys.length > 0) return undefined;
      const templateNames = (a.templates as Array<Record<string, unknown>>).map(t =>
        typeof t.templateName === 'string' ? t.templateName : undefined,
      );
      if (templateNames.some(name => name === undefined)) return undefined;

      const extraArgs: Array<{ name: string; value: string }> = [];
      if (a.args !== undefined) {
        if (!Array.isArray(a.args) || a.args.length === 0) return undefined;
        const [first, ...rest] = a.args as Array<Record<string, unknown>>;
        if (JSON.stringify(first) !== JSON.stringify(STANDARD_ANALYSIS_ARG)) return undefined;
        for (const r of rest) {
          if (!r || typeof r !== 'object' || typeof r.name !== 'string' || typeof r.value !== 'string' || Object.keys(r).length !== 2) {
            return undefined;
          }
          extraArgs.push({ name: r.name, value: r.value });
        }
      }
      result.push({ kind: 'analysis', templates: (templateNames as string[]).join(', '), extraArgs });
    } else {
      return undefined;
    }
  }
  return result;
}

function buildStepsValue(steps: StepForm[]): unknown[] {
  return steps.map(s => {
    if (s.kind === 'weight') return { setWeight: s.weight === '' ? 0 : s.weight };
    if (s.kind === 'pause') return s.duration.trim() ? { pause: { duration: s.duration.trim() } } : { pause: {} };
    const templates = s.templates.split(',').map(x => x.trim()).filter(Boolean).map(templateName => ({ templateName }));
    // A fresh object/array literal per step (not a shared constant) -
    // reusing one reference here made js-yaml's dumper emit YAML anchors/
    // aliases (`&ref_0`/`*ref_0`) for the raw-YAML fallback view, since it
    // detects object identity, not just equal content (2026-09-13: "when I
    // look at the raw yaml I see this: args: *ref_0" - confusing even though
    // technically valid YAML).
    const args = [{ name: 'canary-hash', valueFrom: { podTemplateHashValue: 'Latest' } }, ...s.extraArgs.filter(a => a.name.trim()).map(a => ({ name: a.name.trim(), value: a.value }))];
    return { analysis: { templates, args } };
  });
}

function defaultStep(kind: StepForm['kind']): StepForm {
  if (kind === 'weight') return { kind, weight: 50 };
  if (kind === 'pause') return { kind, duration: '30s' };
  return { kind, templates: '', extraArgs: [] };
}

function StepsBuilder({
  steps,
  onChange,
  declaredTemplateNames,
  classes,
}: {
  steps: StepForm[];
  onChange: (s: StepForm[]) => void;
  declaredTemplateNames: string[];
  classes: Cls;
}) {
  const update = (i: number, next: StepForm) => {
    const copy = [...steps];
    copy[i] = next;
    onChange(copy);
  };
  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const copy = [...steps];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  const addStep = (kind: StepForm['kind']) => onChange([...steps, defaultStep(kind)]);
  const updateExtraArg = (i: number, j: number, patch: Partial<{ name: string; value: string }>) => {
    const step = steps[i];
    if (step.kind !== 'analysis') return;
    const nextArgs = [...step.extraArgs];
    nextArgs[j] = { ...nextArgs[j], ...patch };
    update(i, { ...step, extraArgs: nextArgs });
  };
  const removeExtraArg = (i: number, j: number) => {
    const step = steps[i];
    if (step.kind !== 'analysis') return;
    update(i, { ...step, extraArgs: step.extraArgs.filter((_, k) => k !== j) });
  };
  const addExtraArg = (i: number) => {
    const step = steps[i];
    if (step.kind !== 'analysis') return;
    update(i, { ...step, extraArgs: [...step.extraArgs, { name: '', value: '' }] });
  };

  return (
    <div className={classes.rowList}>
      {steps.length === 0 && (
        <Typography className={classes.hint} style={{ marginTop: 0 }}>
          No canary steps set - the platform default sequence will be used.
        </Typography>
      )}
      {steps.map((s, i) => (
        <div key={i} className={classes.stepCard}>
          <div className={classes.row} style={{ alignItems: 'flex-start' }}>
            <Typography className={classes.stepNumber}>{i + 1}.</Typography>
            <div className={classes.stepOrderCol}>
              <button type="button" className={classes.orderBtn} disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                ▲
              </button>
              <button type="button" className={classes.orderBtn} disabled={i === steps.length - 1} onClick={() => move(i, 1)} title="Move down">
                ▼
              </button>
            </div>
            <select
              className={classes.select}
              value={s.kind}
              onChange={e => update(i, defaultStep(e.target.value as StepForm['kind']))}
            >
              <option value="weight">Weight</option>
              <option value="pause">Pause</option>
              <option value="analysis">Analysis</option>
            </select>
            {s.kind === 'weight' && (
              <input
                className={classes.input}
                type="number"
                min={0}
                max={100}
                style={{ width: 80 }}
                value={s.weight}
                onChange={e => update(i, { kind: 'weight', weight: e.target.value === '' ? '' : Number(e.target.value) })}
              />
            )}
            {s.kind === 'pause' && (
              <input
                className={classes.input}
                placeholder="30s (blank = manual/indefinite)"
                value={s.duration}
                onChange={e => update(i, { kind: 'pause', duration: e.target.value })}
              />
            )}
            {s.kind === 'analysis' && (
              <input
                className={classes.input}
                style={{ minWidth: 240 }}
                placeholder="template names, comma-separated"
                value={s.templates}
                onChange={e => update(i, { ...s, templates: e.target.value })}
              />
            )}
            <button type="button" className={classes.removeBtn} onClick={() => remove(i)}>
              Remove
            </button>
          </div>
          {s.kind === 'analysis' && (
            <div style={{ marginTop: 8, paddingLeft: 40 }}>
              <Typography className={classes.fieldLabel}>Args (canary-hash is added automatically)</Typography>
              <div className={classes.rowList} style={{ marginTop: 4 }}>
                {s.extraArgs.map((a, j) => (
                  <div className={classes.row} key={j}>
                    <input className={classes.input} placeholder="arg name" value={a.name} onChange={e => updateExtraArg(i, j, { name: e.target.value })} />
                    <input className={classes.input} placeholder="value" value={a.value} onChange={e => updateExtraArg(i, j, { value: e.target.value })} />
                    <button type="button" className={classes.removeBtn} onClick={() => removeExtraArg(i, j)}>
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className={classes.addBtn} onClick={() => addExtraArg(i)}>
                  + Add arg
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className={classes.addBtn} onClick={() => addStep('weight')}>+ Weight step</button>
        <button type="button" className={classes.addBtn} onClick={() => addStep('pause')}>+ Pause step</button>
        <button type="button" className={classes.addBtn} onClick={() => addStep('analysis')}>+ Analysis step</button>
      </div>
      <Typography className={classes.hint}>
        An analysis step's first arg (canary-hash) is always generated automatically - add more above only if a
        template's own query references another one (e.g. a custom threshold).
        {declaredTemplateNames.length > 0
          ? ` Declared in this file: ${declaredTemplateNames.join(', ')} - a step can also name a platform-wide ClusterAnalysisTemplate not declared here.`
          : ' A step can name any app-declared or platform-wide ClusterAnalysisTemplate.'}
      </Typography>
    </div>
  );
}

// --- configMaps / secrets forms (2026-09-13 items 3-4) ---------------------

function ConfigMapsSection({ rows, onChange, classes }: { rows: ConfigMapRow[]; onChange: (rows: ConfigMapRow[]) => void; classes: Cls }) {
  const update = (i: number, patch: Partial<ConfigMapRow>) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const add = () => onChange([...rows, { name: '', as: 'volume', mountPath: '', source: 'data', existingConfigMap: '', data: [] }]);
  const updateDataRow = (i: number, j: number, patch: Partial<{ key: string; value: string }>) => {
    const row = rows[i];
    const nextData = [...row.data];
    nextData[j] = { ...nextData[j], ...patch };
    update(i, { data: nextData });
  };

  return (
    <div className={classes.rowList}>
      {rows.length === 0 && (
        <Typography className={classes.hint} style={{ marginTop: 0 }}>No config maps configured for this app.</Typography>
      )}
      {rows.map((row, i) => (
        <div key={i} className={classes.rowCard}>
          <div className={classes.rowCardHead}>
            <input className={classes.input} style={{ flex: 1 }} placeholder="name" value={row.name} onChange={e => update(i, { name: e.target.value })} />
            <select className={classes.select} value={row.as} onChange={e => update(i, { as: e.target.value as ConfigMapRow['as'] })}>
              <option value="volume">Mount as volume</option>
              <option value="env">Expose as env vars</option>
              <option value="both">Both</option>
            </select>
            <button type="button" className={classes.removeBtn} onClick={() => remove(i)}>Remove</button>
          </div>
          {row.as !== 'env' && (
            <Field label="Mount path (blank = /config/<name>)" classes={classes}>
              <input className={classes.input} placeholder={`/config/${row.name || '<name>'}`} value={row.mountPath} onChange={e => update(i, { mountPath: e.target.value })} />
            </Field>
          )}
          <div className={classes.radioRow}>
            <label>
              <input type="radio" checked={row.source === 'data'} onChange={() => update(i, { source: 'data' })} /> Managed here
            </label>
            <label>
              <input type="radio" checked={row.source === 'existing'} onChange={() => update(i, { source: 'existing' })} /> Existing ConfigMap
            </label>
          </div>
          {row.source === 'existing' ? (
            <Field label="Existing ConfigMap name" classes={classes}>
              <input className={classes.input} value={row.existingConfigMap} onChange={e => update(i, { existingConfigMap: e.target.value })} />
            </Field>
          ) : (
            <div>
              <Typography className={classes.fieldLabel}>{row.as === 'env' ? 'Data (env var name → value)' : 'Data (file name → contents)'}</Typography>
              <div className={classes.rowList} style={{ marginTop: 4 }}>
                {row.data.map((d, j) => (
                  <div className={classes.row} key={j} style={{ alignItems: 'flex-start' }}>
                    <input
                      className={classes.input}
                      placeholder={row.as === 'env' ? 'ENABLE_NEW_CHECKOUT' : 'app-config.yaml'}
                      value={d.key}
                      onChange={e => updateDataRow(i, j, { key: e.target.value })}
                    />
                    <textarea
                      className={classes.textarea}
                      style={{ flex: 1 }}
                      rows={2}
                      placeholder="contents"
                      value={d.value}
                      onChange={e => updateDataRow(i, j, { value: e.target.value })}
                    />
                    <button type="button" className={classes.removeBtn} onClick={() => update(i, { data: row.data.filter((_, k) => k !== j) })}>
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className={classes.addBtn} onClick={() => update(i, { data: [...row.data, { key: '', value: '' }] })}>
                  + Add entry
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      <button type="button" className={classes.addBtn} onClick={add}>+ Add config map</button>
    </div>
  );
}

function SecretsSection({ rows, onChange, classes }: { rows: SecretRow[]; onChange: (rows: SecretRow[]) => void; classes: Cls }) {
  const update = (i: number, patch: Partial<SecretRow>) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const add = () => onChange([...rows, { name: '', as: 'env', key: '', mountPath: '', shared: false }]);

  return (
    <div className={classes.rowList}>
      {rows.length === 0 && (
        <Typography className={classes.hint} style={{ marginTop: 0 }}>No secrets configured for this app.</Typography>
      )}
      {rows.map((row, i) => (
        <div key={i} className={classes.rowCard}>
          <div className={classes.rowCardHead}>
            <input
              className={classes.input}
              style={{ flex: 1 }}
              placeholder="Infisical property name, e.g. db-password"
              value={row.name}
              onChange={e => update(i, { name: e.target.value })}
            />
            <select className={classes.select} value={row.as} onChange={e => update(i, { as: e.target.value as SecretRow['as'] })}>
              <option value="env">Env var</option>
              <option value="volume">Mounted file</option>
              <option value="both">Both</option>
            </select>
            <button type="button" className={classes.removeBtn} onClick={() => remove(i)}>Remove</button>
          </div>
          <div className={classes.grid}>
            {row.as !== 'volume' && (
              <Field label="Env var name (blank = NAME uppercased)" classes={classes}>
                <input className={classes.input} placeholder={row.name ? row.name.toUpperCase() : 'DB_PASSWORD'} value={row.key} onChange={e => update(i, { key: e.target.value })} />
              </Field>
            )}
            {row.as !== 'env' && (
              <Field label="Mount path (blank = /secrets/<name>)" classes={classes}>
                <input className={classes.input} placeholder={`/secrets/${row.name || '<name>'}`} value={row.mountPath} onChange={e => update(i, { mountPath: e.target.value })} />
              </Field>
            )}
          </div>
          <div className={classes.switchRow}>
            <Switch checked={row.shared} onChange={e => update(i, { shared: e.target.checked })} />
            <Typography className={classes.switchLabel}>Read from this app's shared Infisical store (reused across every env on this cluster)</Typography>
          </div>
        </div>
      ))}
      <button type="button" className={classes.addBtn} onClick={add}>+ Add secret</button>
      <Typography className={classes.hint}>
        References only - the actual secret values live in Infisical and are never edited here.
      </Typography>
    </div>
  );
}

// --- form-state shape and defaults (mirrors airframe-application's own
// values.yaml defaults - see that file's comments for why each default is
// what it is) --------------------------------------------------------------

interface FormState {
  replicas: number | '';
  ports: Array<{ name: string; containerPort: number | '' }>;
  resourcesRequestsCpu: string;
  resourcesRequestsMemory: string;
  resourcesLimitsCpu: string;
  resourcesLimitsMemory: string;
  liveness: ProbeFormState;
  readiness: ProbeFormState;
  autoscalingEnabled: boolean;
  autoscalingMin: number | '';
  autoscalingMax: number | '';
  autoscalingTargetCPUPercent: number | '';
  ingressEnabled: boolean;
  ingressHost: string;
  ingressPath: string;
  ingressPathType: string;
  ingressTls: boolean;
  httpRouteEnabled: boolean;
  httpRouteHostnames: string;
  httpRouteParentRefs: Array<{ name: string; namespace: string }>;
  networkPolicyEnabled: boolean;
  networkPolicyAllowIngressFromIngressController: boolean;
  pdbEnabled: boolean;
  pdbMinAvailable: string;
  pdbMaxUnavailable: string;
  serviceMonitorEnabled: boolean;
  serviceMonitorPath: string;
  serviceMonitorInterval: string;
  slackEnabled: boolean;
  slackChannel: string;
  envVars: Array<{ name: string; value: string }>;
  configMaps: ConfigMapRow[];
  secrets: SecretRow[];
  serviceAccountCreate: boolean;
  serviceAccountName: string;
  serviceAccountAnnotations: Array<{ key: string; value: string }>;
  serviceAccountImagePullSecrets: Array<{ name: string }>;
}

type AdvancedKey =
  | 'rolloutAdvanced'
  | 'analysisTemplates'
  | 'volumes'
  | 'cronJobs'
  | 'jobs'
  | 'components'
  | 'slos'
  | 'extraManifests';

const VOLUMES_EXAMPLE = `- name: uploads
  size: 10Gi
  mountPath: /data/uploads
  # storageClassName: standard   # omit for the cluster default
  # accessModes: [ReadWriteOnce] # default if omitted`;

const CRONJOBS_EXAMPLE = `- name: nightly-cleanup
  schedule: "0 2 * * *"
  command: ["./cleanup.sh"]
  concurrencyPolicy: Forbid`;

const JOBS_EXAMPLE = `- name: db-migrate
  command: ["./migrate.sh"]
  hook: true   # re-runs on every release (Helm pre-upgrade hook)`;

const ANALYSIS_TEMPLATES_EXAMPLE = `- name: checkout-conversion-rate
  args:
    - name: canary-hash   # Argo Rollouts supplies the value; declare the NAME here
  metrics:
    - name: conversion-rate
      successCondition: "result[0] >= 0.95"
      provider:
        prometheus:
          address: http://kube-prometheus-stack-prometheus.observability.svc.cluster.local:9090
          query: |
            sum(rate(checkout_completed_total{pod=~".*-{{args.canary-hash}}-.*"}[5m]))`;

const ROLLOUT_ADVANCED_EXAMPLE = `# canaryAnalysis: a background AnalysisTemplate that runs for the whole
# canary revision (a SIBLING of the steps builder above, not one of its
# steps):
canaryAnalysis:
  templates:
    - templateName: pod-health-check
  args:
    - name: canary-hash
      valueFrom: { podTemplateHashValue: Latest }
  startingStep: 1`;

const EXTRA_MANIFESTS_EXAMPLE = `- apiVersion: v1
  kind: ConfigMap
  metadata:
    name: some-one-off-thing
  data:
    key: value`;

const COMPONENTS_EXAMPLE = `# Attached-tier components (backing services this app runs alongside). Each entry
# renders one XR per environment; spec.environmentRef is stamped automatically -
# don't set it by hand.
- type: redis          # kinds: redis (installed), oauth-server, database, queue (declared, not yet available)
  name: cache
  spec:
    size: small        # small | medium | large
    persistence: false # true = survive a pod restart (a real PVC)`;

const SLOS_EXAMPLE = `# Service level objectives (rendered via Sloth into multi-window burn-rate alerts).
- name: checkout-api-liveness-availability
  service: checkout-api
  objective: 99          # percent
  indicator:
    type: availability   # or: latency (needs latencyThreshold + a histogram with that le bucket)
    metric: prober_probe_total
    totalFilter: 'namespace="app-checkout-api-prod",container="checkout-api",probe_type="Liveness"'
    errorFilter: 'result!="successful"'`;

const ADVANCED_META: Record<
  AdvancedKey,
  { title: string; hint: string; example?: string; field: ConfigTopLevelField | 'rollout'; promoted?: boolean }
> = {
  // `promoted` sections render as regular sections, not behind the "Show advanced" toggle.
  components: {
    title: 'Attached components',
    hint: 'Backing services provisioned alongside this app in this environment (Redis today; OAuth server, database and queue are declared kinds without an installed composition yet). Each entry needs a type and a name; spec is the kind\'s own settings.',
    example: COMPONENTS_EXAMPLE,
    field: 'components',
    promoted: true,
  },
  slos: {
    title: 'SLOs',
    hint: 'Service level objectives for this environment. Availability SLOs are the portable choice - latency SLOs need a histogram exposing the exact threshold bucket.',
    example: SLOS_EXAMPLE,
    field: 'slos',
    promoted: true,
  },
  rolloutAdvanced: {
    title: 'Rollout strategy & pod template',
    hint: 'strategy, canaryAnalysis, blueGreen, command/args, security contexts, extraContainers, podSpec. Canary steps, probes, replicas, resources, and the Service\'s ports have their own fields above and are merged back in on submit.',
    example: ROLLOUT_ADVANCED_EXAMPLE,
    field: 'rollout',
  },
  analysisTemplates: {
    title: 'Custom AnalysisTemplates',
    hint: 'App-specific analysis templates referenced by name from the canary steps above.',
    example: ANALYSIS_TEMPLATES_EXAMPLE,
    field: 'analysisTemplates',
  },
  volumes: { title: 'Volumes (PVCs)', hint: 'Persistent volume claims mounted into the main container.', example: VOLUMES_EXAMPLE, field: 'volumes' },
  cronJobs: { title: 'Cron jobs', hint: 'Scheduled batch tasks (nightly cleanup, reports, ...).', example: CRONJOBS_EXAMPLE, field: 'cronJobs' },
  jobs: { title: 'One-off jobs', hint: 'e.g. a pre-install DB-migration hook Job.', example: JOBS_EXAMPLE, field: 'jobs' },
  extraManifests: {
    title: 'Extra manifests',
    hint: 'Last-resort escape hatch: a raw list of arbitrary Kubernetes objects.',
    example: EXTRA_MANIFESTS_EXAMPLE,
    field: 'extraManifests',
  },
};

// `ports` is deliberately excluded here - it's the Service resource's own
// port list (workload/service.yaml renders one Service port per
// rollout.ports entry, port == containerPort, no separate Service-level
// port field exists in this chart at all), and has its own curated "Service"
// section below rather than living in this raw passthrough (2026-09-16:
// "how do i configure the service, especially its port?" - buried in raw
// YAML wasn't discoverable).
const ROLLOUT_ADVANCED_KEYS = [
  'strategy',
  'canaryAnalysis',
  'blueGreen',
  'command',
  'args',
  'podSecurityContext',
  'containerSecurityContext',
  'extraContainers',
  'podSpec',
] as const;

const DEFAULT_PORTS: FormState['ports'] = [{ name: 'http', containerPort: 8080 }];

function dumpOrBlank(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v) && v.length === 0) return '';
  if (typeof v === 'object' && Object.keys(v as object).length === 0) return '';
  return dumpYaml(v, { lineWidth: 100 }).trimEnd();
}

function parseAnnotationRows(v: unknown): Array<{ key: string; value: string }> {
  const rec = asRecord(v);
  return Object.entries(rec).map(([key, value]) => ({ key, value: String(value ?? '') }));
}

function buildFormState(values: Partial<Record<ConfigTopLevelField, unknown>>): FormState {
  const rollout = asRecord(values.rollout);
  const resources = asRecord(rollout.resources);
  const requests = asRecord(resources.requests);
  const limits = asRecord(resources.limits);
  const autoscaling = asRecord(values.autoscaling);
  const ingress = asRecord(values.ingress);
  const httpRoute = asRecord(values.httpRoute);
  const networkPolicy = asRecord(values.networkPolicy);
  const pdb = asRecord(values.podDisruptionBudget);
  const serviceMonitor = asRecord(values.serviceMonitor);
  const notifications = asRecord(values.notifications);
  const slack = asRecord(notifications.slack);
  const envList = Array.isArray(values.env) ? (values.env as Array<{ name: string; value: string }>) : [];
  const serviceAccount = asRecord(values.serviceAccount);
  const imagePullSecrets = Array.isArray(serviceAccount.imagePullSecrets)
    ? (serviceAccount.imagePullSecrets as Array<{ name?: string }>).map(s => ({ name: s.name ?? '' }))
    : [];

  const portsList = Array.isArray(rollout.ports)
    ? (rollout.ports as Array<{ name?: string; containerPort?: number }>).map(
        (p): { name: string; containerPort: number | '' } => ({
          name: p.name ?? '',
          containerPort: typeof p.containerPort === 'number' ? p.containerPort : '',
        }),
      )
    : undefined;

  return {
    replicas: typeof rollout.replicas === 'number' ? rollout.replicas : 2,
    ports: portsList && portsList.length > 0 ? portsList : DEFAULT_PORTS,
    resourcesRequestsCpu: typeof requests.cpu === 'string' ? requests.cpu : '',
    resourcesRequestsMemory: typeof requests.memory === 'string' ? requests.memory : '',
    resourcesLimitsCpu: typeof limits.cpu === 'string' ? limits.cpu : '',
    resourcesLimitsMemory: typeof limits.memory === 'string' ? limits.memory : '',
    liveness: parseProbe(rollout.livenessProbe),
    readiness: parseProbe(rollout.readinessProbe),
    autoscalingEnabled: Boolean(autoscaling.enabled ?? false),
    autoscalingMin: typeof autoscaling.min === 'number' ? autoscaling.min : 2,
    autoscalingMax: typeof autoscaling.max === 'number' ? autoscaling.max : 10,
    autoscalingTargetCPUPercent: typeof autoscaling.targetCPUPercent === 'number' ? autoscaling.targetCPUPercent : 70,
    ingressEnabled: Boolean(ingress.enabled ?? false),
    ingressHost: typeof ingress.host === 'string' ? ingress.host : '',
    ingressPath: typeof ingress.path === 'string' ? ingress.path : '/',
    ingressPathType: typeof ingress.pathType === 'string' ? ingress.pathType : 'Prefix',
    ingressTls: Boolean(ingress.tls ?? false),
    httpRouteEnabled: Boolean(httpRoute.enabled ?? false),
    httpRouteHostnames: Array.isArray(httpRoute.hostnames) ? (httpRoute.hostnames as string[]).join(', ') : '',
    httpRouteParentRefs: Array.isArray(httpRoute.parentRefs)
      ? (httpRoute.parentRefs as Array<{ name: string; namespace?: string }>).map(p => ({
          name: p.name ?? '',
          namespace: p.namespace ?? '',
        }))
      : [],
    networkPolicyEnabled: Boolean(networkPolicy.enabled ?? true),
    networkPolicyAllowIngressFromIngressController: Boolean(networkPolicy.allowIngressFromIngressController ?? true),
    pdbEnabled: Boolean(pdb.enabled ?? false),
    pdbMinAvailable: pdb.minAvailable !== undefined && pdb.minAvailable !== null ? String(pdb.minAvailable) : '1',
    pdbMaxUnavailable: pdb.maxUnavailable !== undefined && pdb.maxUnavailable !== null ? String(pdb.maxUnavailable) : '',
    serviceMonitorEnabled: Boolean(serviceMonitor.enabled ?? true),
    serviceMonitorPath: typeof serviceMonitor.path === 'string' ? serviceMonitor.path : '/metrics',
    serviceMonitorInterval: typeof serviceMonitor.interval === 'string' ? serviceMonitor.interval : '30s',
    slackEnabled: Boolean(slack.enabled ?? false),
    slackChannel: typeof slack.channel === 'string' ? slack.channel : '',
    envVars: envList.map(e => ({ name: e.name ?? '', value: String(e.value ?? '') })),
    configMaps: parseConfigMapRows(values.configMaps),
    secrets: parseSecretRows(values.secrets),
    serviceAccountCreate: Boolean(serviceAccount.create ?? true),
    serviceAccountName: typeof serviceAccount.name === 'string' ? serviceAccount.name : '',
    serviceAccountAnnotations: parseAnnotationRows(serviceAccount.annotations),
    serviceAccountImagePullSecrets: imagePullSecrets,
  };
}

function buildAdvancedYaml(values: Partial<Record<ConfigTopLevelField, unknown>>): Record<AdvancedKey, string> {
  const rollout = asRecord(values.rollout);
  const rolloutAdvanced: Record<string, unknown> = {};
  for (const key of ROLLOUT_ADVANCED_KEYS) {
    if (rollout[key] !== undefined) rolloutAdvanced[key] = rollout[key];
  }
  return {
    rolloutAdvanced: dumpOrBlank(rolloutAdvanced),
    analysisTemplates: dumpOrBlank(values.analysisTemplates),
    volumes: dumpOrBlank(values.volumes),
    cronJobs: dumpOrBlank(values.cronJobs),
    jobs: dumpOrBlank(values.jobs),
    components: dumpOrBlank(values.components),
    slos: dumpOrBlank(values.slos),
    extraManifests: dumpOrBlank(values.extraManifests),
  };
}

// The chart's own documented "fails fast" invariants (see airframe-
// application/values.yaml's ingress:/httpRoute:/autoscaling: comments) -
// checked here so a config change that would fail the Helm render is caught
// before a PR is even opened, not after ArgoCD tries to sync it. Kept
// alongside the generic values.schema.json validation (see
// buildPatchAndSummary/schemaIssues) rather than replaced by it - these give
// the specific, plain-language message worth showing first.
function validateBeforeSubmit(form: FormState, rolloutEnabled: boolean): string[] {
  const errors: string[] = [];
  if (rolloutEnabled) {
    const namedPorts = form.ports.filter(p => p.name.trim());
    if (namedPorts.length === 0) {
      errors.push('Service needs at least one named port (this becomes the Service/ingress target).');
    }
    for (const p of namedPorts) {
      if (p.containerPort === '' || p.containerPort < 1 || p.containerPort > 65535) {
        errors.push(`Service port "${p.name.trim()}" needs a valid containerPort (1-65535).`);
      }
    }
    const dupeNames = namedPorts.map(p => p.name.trim()).filter((n, i, arr) => arr.indexOf(n) !== i);
    if (dupeNames.length > 0) {
      errors.push(`Service port names must be unique - duplicate: ${Array.from(new Set(dupeNames)).join(', ')}.`);
    }
  }
  if (form.ingressEnabled && !form.ingressHost.trim()) {
    errors.push('Ingress is enabled but has no host set.');
  }
  if (form.httpRouteEnabled && !form.httpRouteHostnames.trim()) {
    errors.push('HTTPRoute is enabled but has no hostnames set.');
  }
  if (form.httpRouteEnabled && form.httpRouteParentRefs.length === 0) {
    errors.push('HTTPRoute is enabled but has no parentRefs set.');
  }
  if (form.autoscalingEnabled && form.autoscalingMin !== '' && form.autoscalingMax !== '' && form.autoscalingMin > form.autoscalingMax) {
    errors.push('Autoscaling min replicas is greater than max replicas.');
  }
  if (form.pdbEnabled && form.pdbMinAvailable.trim() && form.pdbMaxUnavailable.trim()) {
    errors.push('PodDisruptionBudget: set at most one of minAvailable/maxUnavailable, not both.');
  }
  return errors;
}

export type ValuesTab = 'workload' | 'release' | 'networking' | 'config' | 'access' | 'advanced';

const VALUES_TABS: Array<{ id: ValuesTab; label: string }> = [
  { id: 'workload', label: 'Workload' },
  { id: 'release', label: 'Release' },
  { id: 'networking', label: 'Networking' },
  { id: 'config', label: 'Config' },
  { id: 'access', label: 'Access' },
  { id: 'advanced', label: 'Advanced' },
];

// Which sub-tab each raw-YAML block lives in.
const ADVANCED_TAB: Record<AdvancedKey, ValuesTab> = {
  rolloutAdvanced: 'workload',
  analysisTemplates: 'release',
  slos: 'release',
  volumes: 'config',
  components: 'config',
  cronJobs: 'advanced',
  jobs: 'advanced',
  extraManifests: 'advanced',
};

/**
 * One environment's chart values as a form, split into sub-tabs, with its own pending-changes panel. `source` says
 * where the values are read from and where the pull request goes (see ./sources.ts). `layout="side"` puts the panel
 * beside the form (App Configuration); `"inline"` puts it below (inside an Environments row, which already has the
 * page's own pending-changes panel for cicd.yaml).
 */
export function ConfigEditor({
  owner,
  appName,
  source,
  title,
  prod = false,
  layout = 'side',
}: {
  owner: string;
  appName: string;
  source: ValuesSource;
  /** Names what is being edited in the panel, for example "TEST (kind-dev)". */
  title: string;
  prod?: boolean;
  layout?: 'side' | 'inline';
}) {
  const tokens = useHangarTokens();
  const classes = useStyles({ t: tokens });
  const ui = useUi({ t: tokens });
  const cfg = source;
  const submitCfg = { loading: source.submitting, result: source.result, error: source.submitError, reset: source.resetSubmit };
  const schema = useValuesSchema(owner);
  const [tab, setTab] = useState<ValuesTab>('workload');

  const [form, setForm] = useState<FormState | undefined>(undefined);
  const [originalForm, setOriginalForm] = useState<FormState | undefined>(undefined);
  // A `rollout: null` environment is a normal, deliberate state (2026-09-16:
  // "someone might deploy just a job or cronjob or another XR... the config
  // tab must allow for the toggling on/off of our deployment resource") -
  // not something the chart itself needs a new field for (values-yaml.yaml's
  // own composition already treats `rollout: null` as the complete "no
  // Rollout/Service/HPA/PDB" signal). This is a UI-only toggle deciding
  // whether buildPatchAndSummary submits the built rollout object or null -
  // the form fields below stay in their own state regardless of this
  // toggle's position, so switching it off and back on within the same
  // editing session doesn't lose anything typed in.
  const [rolloutEnabled, setRolloutEnabled] = useState(true);
  const [originalRolloutEnabled, setOriginalRolloutEnabled] = useState(true);
  const [advanced, setAdvanced] = useState<Record<AdvancedKey, string> | undefined>(undefined);
  const [originalAdvanced, setOriginalAdvanced] = useState<Record<AdvancedKey, string> | undefined>(undefined);
  const [stepsMode, setStepsMode] = useState<'simple' | 'raw'>('simple');
  const [stepsSimple, setStepsSimple] = useState<StepForm[]>([]);
  const [stepsRaw, setStepsRaw] = useState('');
  const [originalStepsRaw, setOriginalStepsRaw] = useState('');
  const [showRawFile, setShowRawFile] = useState(false);
  const [exampleOpen, setExampleOpen] = useState<Set<AdvancedKey>>(new Set());

  useEffect(() => {
    if (cfg.data) {
      const builtForm = buildFormState(cfg.data.values);
      const builtAdvanced = buildAdvancedYaml(cfg.data.values);
      setForm(builtForm);
      setOriginalForm(builtForm);
      setAdvanced(builtAdvanced);
      setOriginalAdvanced(builtAdvanced);
      // Helm/Sprig truthiness: `rollout: {}` is truthy (an explicit, if
      // empty, object), only `rollout: null`/absent is falsy - matching the
      // chart's own `{{- if .Values.rollout }}` gate exactly, not just
      // "does asRecord give me something to read fields from".
      const rolloutIsSet = (cfg.data.values.rollout !== undefined && cfg.data.values.rollout !== null);
      setRolloutEnabled(rolloutIsSet);
      setOriginalRolloutEnabled(rolloutIsSet);
      const rollout = asRecord(cfg.data.values.rollout);
      const simple = parseStepsSimple(rollout.steps);
      setStepsMode(simple ? 'simple' : 'raw');
      setStepsSimple(simple ?? []);
      setStepsRaw(dumpOrBlank(rollout.steps));
      setOriginalStepsRaw(dumpOrBlank(rollout.steps));
      submitCfg.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.data]);

  // The error first: with no data there is never a form, so checking "no form yet" first would show a spinner forever.
  if (cfg.error && !cfg.data) return <ResponseErrorPanel error={new Error(cfg.error)} />;
  if (cfg.loading || !form || !originalForm || !advanced || !originalAdvanced) return <Progress />;
  if (cfg.error) return <ResponseErrorPanel error={new Error(cfg.error)} />;
  if (!cfg.data) return null;

  // No imperative "touched" tracking any more (2026-09-13 bug: toggling a
  // switch on then back off left it stuck "dirty") - every setter just
  // updates its own piece of state; `dirty` below is a pure comparison
  // against the originalForm/originalAdvanced/originalStepsRaw snapshot
  // taken when this env's data loaded (or last discarded), so reverting a
  // value back to what it started as reads as clean again automatically.
  // The trailing `_fields` argument is a holdover from the old imperative
  // markDirty scheme - every call site below still passes it, harmlessly
  // ignored now that `dirty` is computed, rather than touching every one of
  // those call sites just to drop an argument that's now a no-op.
  const setF = <K extends keyof FormState>(key: K, value: FormState[K], ..._fields: ConfigTopLevelField[]) => {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev));
  };
  const setAdv = (key: AdvancedKey, text: string) => {
    setAdvanced(prev => (prev ? { ...prev, [key]: text } : prev));
  };
  const setSteps = (next: StepForm[]) => setStepsSimple(next);
  const setStepsRawText = (text: string) => setStepsRaw(text);
  const toggleExample = (key: AdvancedKey) =>
    setExampleOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const canSwitchStepsToSimple = stepsMode === 'raw' && parseStepsSimple(validateYamlBlock(stepsRaw).parsed) !== undefined;
  const toggleStepsMode = () => {
    if (stepsMode === 'simple') {
      setStepsRaw(dumpOrBlank(buildStepsValue(stepsSimple)));
      setStepsMode('raw');
    } else if (canSwitchStepsToSimple) {
      const simple = parseStepsSimple(validateYamlBlock(stepsRaw).parsed);
      if (simple) {
        setStepsSimple(simple);
        setStepsMode('simple');
      }
    }
  };

  const declaredTemplateNames = (() => {
    const { parsed, valid } = validateYamlBlock(advanced.analysisTemplates);
    if (!valid || !Array.isArray(parsed)) return [];
    return (parsed as Array<{ name?: string }>).map(t => t.name).filter((n): n is string => Boolean(n));
  })();

  const advancedInvalid = (Object.keys(advanced) as AdvancedKey[]).filter(k => !validateYamlBlock(advanced[k]).valid);
  const stepsInvalid = stepsMode === 'raw' && !validateYamlBlock(stepsRaw).valid;
  const structuralErrors = validateBeforeSubmit(form, rolloutEnabled);

  const discard = () => {
    const builtForm = buildFormState(cfg.data!.values);
    const builtAdvanced = buildAdvancedYaml(cfg.data!.values);
    setForm(builtForm);
    setOriginalForm(builtForm);
    setAdvanced(builtAdvanced);
    setOriginalAdvanced(builtAdvanced);
    const rolloutIsSet = (cfg.data!.values.rollout !== undefined && cfg.data!.values.rollout !== null);
    setRolloutEnabled(rolloutIsSet);
    setOriginalRolloutEnabled(rolloutIsSet);
    const rollout = asRecord(cfg.data!.values.rollout);
    const simple = parseStepsSimple(rollout.steps);
    setStepsMode(simple ? 'simple' : 'raw');
    setStepsSimple(simple ?? []);
    setStepsRaw(dumpOrBlank(rollout.steps));
    setOriginalStepsRaw(dumpOrBlank(rollout.steps));
    submitCfg.reset();
  };

  // `dirty` is a pure function of (current, original) - see the setF/setAdv/
  // setSteps comment above for why this replaced imperative touch-tracking.
  const fieldsChanged = (keys: (keyof FormState)[]) => keys.some(k => !deepEqual(form[k], originalForm[k]));
  const stepsCurrentText = stepsMode === 'simple' ? dumpOrBlank(buildStepsValue(stepsSimple)) : stepsRaw;

  const dirty = new Set<ConfigTopLevelField>();
  if (
    rolloutEnabled !== originalRolloutEnabled ||
    (rolloutEnabled &&
      (fieldsChanged(['replicas', 'ports', 'resourcesRequestsCpu', 'resourcesRequestsMemory', 'resourcesLimitsCpu', 'resourcesLimitsMemory', 'liveness', 'readiness']) ||
        advanced.rolloutAdvanced !== originalAdvanced.rolloutAdvanced ||
        stepsCurrentText !== originalStepsRaw))
  ) {
    dirty.add('rollout');
  }
  if (fieldsChanged(['autoscalingEnabled', 'autoscalingMin', 'autoscalingMax', 'autoscalingTargetCPUPercent'])) dirty.add('autoscaling');
  if (fieldsChanged(['ingressEnabled', 'ingressHost', 'ingressPath', 'ingressPathType', 'ingressTls'])) dirty.add('ingress');
  if (fieldsChanged(['httpRouteEnabled', 'httpRouteHostnames', 'httpRouteParentRefs'])) dirty.add('httpRoute');
  if (fieldsChanged(['networkPolicyEnabled', 'networkPolicyAllowIngressFromIngressController'])) dirty.add('networkPolicy');
  if (fieldsChanged(['pdbEnabled', 'pdbMinAvailable', 'pdbMaxUnavailable'])) dirty.add('podDisruptionBudget');
  if (fieldsChanged(['serviceMonitorEnabled', 'serviceMonitorPath', 'serviceMonitorInterval'])) dirty.add('serviceMonitor');
  if (fieldsChanged(['slackEnabled', 'slackChannel'])) dirty.add('notifications');
  if (fieldsChanged(['envVars'])) dirty.add('env');
  if (fieldsChanged(['configMaps'])) dirty.add('configMaps');
  if (fieldsChanged(['secrets'])) dirty.add('secrets');
  if (fieldsChanged(['serviceAccountCreate', 'serviceAccountName', 'serviceAccountAnnotations', 'serviceAccountImagePullSecrets'])) dirty.add('serviceAccount');
  (Object.keys(ADVANCED_META) as AdvancedKey[]).forEach(key => {
    if (key === 'rolloutAdvanced') return; // folded into 'rollout' above
    if (advanced[key] !== originalAdvanced[key]) dirty.add(ADVANCED_META[key].field as ConfigTopLevelField);
  });

  const buildPatchAndSummary = () => {
    const values = cfg.data!.values;
    const patch: Partial<Record<ConfigTopLevelField, unknown>> = {};
    const summary: string[] = [];

    if (dirty.has('rollout') && !rolloutEnabled) {
      // Explicit null, not an omitted key - values-yaml.yaml's own
      // composition (and this chart generally) treats `rollout: null` as
      // "no Rollout/Service/HPA/PDB for this env", the same state a
      // freshly-scaffolded, nothing-deployed-yet env starts in. Turning
      // this off is a deliberate "just a Job/CronJob/other XR here, no
      // long-running container" choice (2026-09-16), not a reset to
      // defaults.
      patch.rollout = null;
      summary.push('rollout: disabled (no container deployed in this environment)');
    } else if (dirty.has('rollout')) {
      const advancedParsed = asRecord(validateYamlBlock(advanced.rolloutAdvanced).parsed);
      const stepsValue =
        stepsMode === 'simple' ? buildStepsValue(stepsSimple) : (validateYamlBlock(stepsRaw).parsed ?? []);
      patch.rollout = {
        ...advancedParsed,
        replicas: form.replicas === '' ? undefined : form.replicas,
        ports: form.ports
          .filter(p => p.name.trim())
          .map(p => ({ name: p.name.trim(), containerPort: p.containerPort === '' ? undefined : p.containerPort })),
        resources: {
          requests: {
            ...(form.resourcesRequestsCpu ? { cpu: form.resourcesRequestsCpu } : {}),
            ...(form.resourcesRequestsMemory ? { memory: form.resourcesRequestsMemory } : {}),
          },
          limits: {
            ...(form.resourcesLimitsCpu ? { cpu: form.resourcesLimitsCpu } : {}),
            ...(form.resourcesLimitsMemory ? { memory: form.resourcesLimitsMemory } : {}),
          },
        },
        steps: stepsValue,
        livenessProbe: buildProbeValue(form.liveness),
        readinessProbe: buildProbeValue(form.readiness),
      };
      summary.push(
        originalRolloutEnabled
          ? `rollout: replicas/resources/probes/steps and/or pod-template settings updated`
          : `rollout: enabled (was previously null - a container will now deploy in this environment)`,
      );
      if (fieldsChanged(['ports'])) {
        summary.push(
          `service: ports set to ${form.ports.filter(p => p.name.trim()).map(p => `${p.name.trim()}:${p.containerPort}`).join(', ') || '(none)'}`,
        );
      }
    }
    if (dirty.has('autoscaling')) {
      patch.autoscaling = {
        ...asRecord(values.autoscaling),
        enabled: form.autoscalingEnabled,
        min: form.autoscalingMin,
        max: form.autoscalingMax,
        targetCPUPercent: form.autoscalingTargetCPUPercent,
      };
      summary.push(`autoscaling: ${form.autoscalingEnabled ? `enabled, ${form.autoscalingMin}-${form.autoscalingMax} replicas @ ${form.autoscalingTargetCPUPercent}% CPU` : 'disabled'}`);
    }
    if (dirty.has('ingress')) {
      patch.ingress = {
        ...asRecord(values.ingress),
        enabled: form.ingressEnabled,
        host: form.ingressHost,
        path: form.ingressPath,
        pathType: form.ingressPathType,
        tls: form.ingressTls,
      };
      summary.push(`ingress: ${form.ingressEnabled ? `enabled for ${form.ingressHost}` : 'disabled'}`);
    }
    if (dirty.has('httpRoute')) {
      patch.httpRoute = {
        ...asRecord(values.httpRoute),
        enabled: form.httpRouteEnabled,
        hostnames: form.httpRouteHostnames.split(',').map(h => h.trim()).filter(Boolean),
        parentRefs: form.httpRouteParentRefs.filter(p => p.name.trim()),
      };
      summary.push(`httpRoute: ${form.httpRouteEnabled ? `enabled for ${form.httpRouteHostnames}` : 'disabled'}`);
    }
    if (dirty.has('networkPolicy')) {
      patch.networkPolicy = {
        ...asRecord(values.networkPolicy),
        enabled: form.networkPolicyEnabled,
        allowIngressFromIngressController: form.networkPolicyAllowIngressFromIngressController,
      };
      summary.push(`networkPolicy: ${form.networkPolicyEnabled ? 'enabled' : 'disabled'}`);
    }
    if (dirty.has('podDisruptionBudget')) {
      patch.podDisruptionBudget = {
        ...asRecord(values.podDisruptionBudget),
        enabled: form.pdbEnabled,
        minAvailable: form.pdbMinAvailable.trim() ? form.pdbMinAvailable.trim() : null,
        maxUnavailable: form.pdbMaxUnavailable.trim() ? form.pdbMaxUnavailable.trim() : null,
      };
      summary.push(`podDisruptionBudget: ${form.pdbEnabled ? 'enabled' : 'disabled'}`);
    }
    if (dirty.has('serviceMonitor')) {
      patch.serviceMonitor = {
        ...asRecord(values.serviceMonitor),
        enabled: form.serviceMonitorEnabled,
        path: form.serviceMonitorPath,
        interval: form.serviceMonitorInterval,
      };
      summary.push(`serviceMonitor: ${form.serviceMonitorEnabled ? `enabled, scraping ${form.serviceMonitorPath} every ${form.serviceMonitorInterval}` : 'disabled'}`);
    }
    if (dirty.has('notifications')) {
      patch.notifications = { ...asRecord(values.notifications), slack: { enabled: form.slackEnabled, channel: form.slackChannel } };
      summary.push(`notifications.slack: ${form.slackEnabled ? `enabled${form.slackChannel ? ` (${form.slackChannel})` : ''}` : 'disabled'}`);
    }
    if (dirty.has('env')) {
      patch.env = form.envVars.filter(v => v.name.trim()).map(v => ({ name: v.name.trim(), value: v.value }));
      summary.push(`env: ${(patch.env as unknown[]).length} variable(s) set`);
    }
    if (dirty.has('configMaps')) {
      const configMapsValue = buildConfigMapsValue(form.configMaps);
      patch.configMaps = configMapsValue;
      summary.push(`configMaps: ${configMapsValue.length} entries set`);
    }
    if (dirty.has('secrets')) {
      const secretsValue = buildSecretsValue(form.secrets);
      patch.secrets = secretsValue;
      summary.push(`secrets: ${secretsValue.length} entries set`);
    }
    if (dirty.has('serviceAccount')) {
      patch.serviceAccount = {
        ...asRecord(values.serviceAccount),
        create: form.serviceAccountCreate,
        name: form.serviceAccountName,
        annotations: Object.fromEntries(form.serviceAccountAnnotations.filter(a => a.key.trim()).map(a => [a.key.trim(), a.value])),
        imagePullSecrets: form.serviceAccountImagePullSecrets.filter(s => s.name.trim()).map(s => ({ name: s.name.trim() })),
      };
      summary.push('serviceAccount: updated');
    }
    (Object.keys(ADVANCED_META) as AdvancedKey[]).forEach(key => {
      if (key === 'rolloutAdvanced') return; // folded into rollout above
      const meta = ADVANCED_META[key];
      if (!dirty.has(meta.field as ConfigTopLevelField)) return;
      const { parsed } = validateYamlBlock(advanced[key]);
      patch[meta.field as ConfigTopLevelField] = parsed ?? (Array.isArray(values[meta.field as ConfigTopLevelField]) ? [] : {});
      summary.push(`${meta.field}: updated`);
    });

    return { patch, summary };
  };

  // Re-run on every render while there's something dirty - these are small
  // in-memory objects, not worth memoizing, and this is what both the
  // review-bar's error list and the submit button's disabled state need to
  // agree on (see item 4's own top-of-file note on why the schema check
  // lives alongside, not instead of, validateBeforeSubmit).
  const { patch: previewPatch, summary: previewSummary } =
    dirty.size > 0 ? buildPatchAndSummary() : { patch: {} as Partial<Record<ConfigTopLevelField, unknown>>, summary: [] as string[] };
  const schemaIssues: SchemaIssue[] = schema.data
    ? (Object.keys(previewPatch) as ConfigTopLevelField[]).flatMap(key =>
        validateAgainstSchema((schema.data as JsonSchema).properties?.[key], schema.data as JsonSchema, previewPatch[key], key),
      )
    : [];

  const canSubmit =
    dirty.size > 0 && advancedInvalid.length === 0 && !stepsInvalid && structuralErrors.length === 0 && schemaIssues.length === 0 && !submitCfg.loading;

  const onSubmit = () => {
    const { patch, summary } = buildPatchAndSummary();
    source.submit(patch, summary);
  };

  const renderAdvancedSection = (key: AdvancedKey) => {
          const meta = ADVANCED_META[key];
          const isDirty = dirty.has(meta.field as ConfigTopLevelField) && (key !== 'rolloutAdvanced' ? true : dirty.has('rollout'));
          return (
            <Section title={meta.title} dirty={isDirty} classes={classes} key={key}>
              <YamlBlockEditor label={meta.title} hint={meta.hint} value={advanced[key]} onChange={text => setAdv(key, text)} />
              {meta.example && (
                <>
                  <button type="button" className={classes.linkBtn} style={{ marginTop: 8 }} onClick={() => toggleExample(key)}>
                    {exampleOpen.has(key) ? 'Hide example' : 'Show example'}
                  </button>
                  {exampleOpen.has(key) && (
                    <>
                      <pre className={classes.example}>{meta.example}</pre>
                      {!advanced[key].trim() && (
                        <button type="button" className={classes.linkBtn} style={{ marginTop: 4 }} onClick={() => setAdv(key, meta.example!)}>
                          Use this as a starting point
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </Section>
          );
  };

  const fieldsDirty = (keys: (keyof FormState)[]) => fieldsChanged(keys);
  const tabDirty: Record<ValuesTab, boolean> = {
    workload:
      rolloutEnabled !== originalRolloutEnabled ||
      fieldsDirty(['replicas', 'ports', 'resourcesRequestsCpu', 'resourcesRequestsMemory', 'resourcesLimitsCpu', 'resourcesLimitsMemory', 'liveness', 'readiness']) ||
      dirty.has('autoscaling') ||
      dirty.has('podDisruptionBudget') ||
      dirty.has('serviceMonitor') ||
      advanced.rolloutAdvanced !== originalAdvanced.rolloutAdvanced,
    release: stepsCurrentText !== originalStepsRaw || dirty.has('notifications') || dirty.has('analysisTemplates') || dirty.has('slos'),
    networking: dirty.has('ingress') || dirty.has('httpRoute') || dirty.has('networkPolicy'),
    config: dirty.has('env') || dirty.has('configMaps') || dirty.has('volumes') || dirty.has('components'),
    access: dirty.has('serviceAccount') || dirty.has('secrets'),
    advanced: dirty.has('cronJobs') || dirty.has('jobs') || dirty.has('extraManifests'),
  };

  const problems = [
    ...advancedInvalid.map(k => `${ADVANCED_META[k].title}: fix the YAML syntax error before submitting.`),
    ...(stepsInvalid ? ['Canary steps: fix the YAML syntax error before submitting.'] : []),
    ...structuralErrors,
    ...schemaIssues.map(i => `${i.path}: ${i.message}`),
  ];
  const notes = schema.error ? [`Couldn't load the chart's values.schema.json for extra validation (${schema.error}). The built-in checks still apply.`] : [];

  return (
    <div className={layout === 'side' ? ui.sideBySide : undefined}>
      <div className={classes.columns}>
        <div className={classes.sectionTitleRow} style={{ marginBottom: 0 }}>
          <Typography className={classes.note}>Live values from GitHub - not polled, use refresh for the latest commit.</Typography>
          <RefreshButton onClick={source.refresh} />
        </div>
        <Subtabs label="Values sections" value={tab} onChange={setTab} tabs={VALUES_TABS.map(x => ({ ...x, marked: tabDirty[x.id] }))} />
        {tab === 'advanced' && (
          <>
            <button type="button" className={classes.advancedToggle} onClick={() => setShowRawFile(v => !v)}>
              {showRawFile ? '▾ Hide full committed YAML' : '▸ View full committed YAML'}
            </button>
            {showRawFile && (
              <pre className={classes.example} style={{ maxHeight: 420, overflow: 'auto' }}>
                {cfg.data.raw || `# Nothing committed yet at ${cfg.data.path} - this environment has no values file\n# on its own branch/history. Submitting a change creates it.`}
              </pre>
            )}
          </>
        )}

      {tab === 'workload' && (
      <Section title="Deployment" dirty={rolloutEnabled !== originalRolloutEnabled} classes={classes}>
        <div className={classes.switchRow}>
          <Switch checked={rolloutEnabled} onChange={e => setRolloutEnabled(e.target.checked)} />
          <Typography className={classes.switchLabel}>Deploy a Rollout (long-running container) in this environment</Typography>
        </div>
        <Typography className={classes.hint} style={{ marginTop: 8 }}>
          {rolloutEnabled
            ? 'Scaling, resources, health checks, and canary steps below configure this Rollout. Turn this off if this environment should only run a Job/CronJob/other resource - see the advanced fields further down.'
            : "This environment has rollout: null - no Rollout, Service, HPA, or PodDisruptionBudget is deployed here. That's a normal, deliberate state, not a placeholder waiting to be filled in - a good fit for an env that only runs a Job/CronJob or another XR. Turn this on to deploy a real container instead."}
        </Typography>
      </Section>
      )}

      {rolloutEnabled && (
        <>
      {tab === 'workload' && (
      <Section title="Scaling" dirty={dirty.has('rollout') || dirty.has('autoscaling')} classes={classes}>
        <div className={classes.grid}>
          <Field label="Replicas" classes={classes}>
            <input
              className={classes.input}
              type="number"
              min={0}
              value={form.replicas}
              onChange={e => setF('replicas', e.target.value === '' ? '' : Number(e.target.value), 'rollout')}
            />
          </Field>
        </div>
        <div className={classes.switchRow} style={{ marginTop: 14 }}>
          <Switch checked={form.autoscalingEnabled} onChange={e => setF('autoscalingEnabled', e.target.checked, 'autoscaling')} />
          <Typography className={classes.switchLabel}>Autoscaling (HPA)</Typography>
        </div>
        {form.autoscalingEnabled && (
          <div className={classes.grid} style={{ marginTop: 10 }}>
            <Field label="Min replicas" classes={classes}>
              <input className={classes.input} type="number" min={1} value={form.autoscalingMin} onChange={e => setF('autoscalingMin', Number(e.target.value), 'autoscaling')} />
            </Field>
            <Field label="Max replicas" classes={classes}>
              <input className={classes.input} type="number" min={1} value={form.autoscalingMax} onChange={e => setF('autoscalingMax', Number(e.target.value), 'autoscaling')} />
            </Field>
            <Field label="Target CPU %" classes={classes}>
              <input className={classes.input} type="number" min={1} max={100} value={form.autoscalingTargetCPUPercent} onChange={e => setF('autoscalingTargetCPUPercent', Number(e.target.value), 'autoscaling')} />
            </Field>
          </div>
        )}
      </Section>
      )}

      {tab === 'workload' && (
      <Section title="Resources" dirty={dirty.has('rollout')} classes={classes}>
        <div className={classes.grid}>
          <Field label="Request CPU" classes={classes}>
            <input className={classes.input} placeholder="e.g. 100m" value={form.resourcesRequestsCpu} onChange={e => setF('resourcesRequestsCpu', e.target.value, 'rollout')} />
          </Field>
          <Field label="Request memory" classes={classes}>
            <input className={classes.input} placeholder="e.g. 128Mi" value={form.resourcesRequestsMemory} onChange={e => setF('resourcesRequestsMemory', e.target.value, 'rollout')} />
          </Field>
          <Field label="Limit CPU" classes={classes}>
            <input className={classes.input} placeholder="e.g. 500m" value={form.resourcesLimitsCpu} onChange={e => setF('resourcesLimitsCpu', e.target.value, 'rollout')} />
          </Field>
          <Field label="Limit memory" classes={classes}>
            <input className={classes.input} placeholder="e.g. 256Mi" value={form.resourcesLimitsMemory} onChange={e => setF('resourcesLimitsMemory', e.target.value, 'rollout')} />
          </Field>
        </div>
      </Section>
      )}

      {tab === 'workload' && (
      <Section title="Service" dirty={dirty.has('rollout') && fieldsChanged(['ports'])} classes={classes}>
        <Typography className={classes.hint}>
          One Service port per entry below (this chart has no separate Service-level port - the
          Service, and the blueGreen preview Service if strategy is blueGreen, target
          containerPort directly). The first entry also doubles as the ingress/HTTPRoute target.
        </Typography>
        <div className={classes.rowList} style={{ marginTop: 10 }}>
          {form.ports.map((p, i) => (
            <div className={classes.row} key={i}>
              <input
                className={classes.input}
                placeholder="name (e.g. http)"
                value={p.name}
                onChange={e => {
                  const next = [...form.ports];
                  next[i] = { ...next[i], name: e.target.value };
                  setF('ports', next, 'rollout');
                }}
              />
              <input
                className={classes.input}
                type="number"
                min={1}
                max={65535}
                placeholder="containerPort"
                value={p.containerPort}
                onChange={e => {
                  const next = [...form.ports];
                  next[i] = { ...next[i], containerPort: e.target.value === '' ? '' : Number(e.target.value) };
                  setF('ports', next, 'rollout');
                }}
              />
              <button type="button" className={classes.removeBtn} onClick={() => setF('ports', form.ports.filter((_, j) => j !== i), 'rollout')}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className={classes.addBtn} onClick={() => setF('ports', [...form.ports, { name: '', containerPort: '' }], 'rollout')}>
            + Add port
          </button>
        </div>
      </Section>
      )}

      {tab === 'workload' && (
      <Section title="Health checks" dirty={dirty.has('rollout')} classes={classes}>
        <ProbeFields label="Liveness probe" probe={form.liveness} onChange={p => setF('liveness', p, 'rollout')} classes={classes} />
        <div style={{ marginTop: 16 }}>
          <ProbeFields label="Readiness probe" probe={form.readiness} onChange={p => setF('readiness', p, 'rollout')} classes={classes} />
        </div>
      </Section>
      )}

      {tab === 'release' && (
      <Section title="Canary steps" dirty={dirty.has('rollout')} classes={classes}>
        {stepsMode === 'simple' ? (
          <StepsBuilder steps={stepsSimple} onChange={setSteps} declaredTemplateNames={declaredTemplateNames} classes={classes} />
        ) : (
          <YamlBlockEditor
            label="rollout.steps"
            hint="This step list doesn't fit the simplified builder's Weight/Pause/Analysis shapes (e.g. setCanaryScale, an experiment, or custom analysis args) - edit the raw list here instead."
            value={stepsRaw}
            onChange={setStepsRawText}
          />
        )}
        <button type="button" className={classes.linkBtn} style={{ marginTop: 10 }} onClick={toggleStepsMode} disabled={stepsMode === 'raw' && !canSwitchStepsToSimple}>
          {stepsMode === 'simple' ? 'Edit as raw YAML instead' : 'Switch back to the simplified builder'}
        </button>
        {stepsMode === 'raw' && !canSwitchStepsToSimple && (
          <Typography className={classes.hint}>Can't switch to the builder: this YAML doesn't parse, or uses a step shape it can't represent.</Typography>
        )}
      </Section>
      )}
        </>
      )}

      {!rolloutEnabled && (tab === 'workload' || tab === 'release') && (
        <div className={ui.formSection}>
          <div className={ui.note}>
            {tab === 'workload'
              ? 'Scaling, resources, the service and health checks configure a Rollout.'
              : 'Canary steps configure a Rollout.'}{' '}
            This environment has none yet (<code>rollout: null</code>), which is how a new environment starts so nothing broken deploys before
            its first image exists. Turn on Deployment to configure it.
          </div>
          <div style={{ marginTop: 10 }}>
            <Button small onClick={() => setRolloutEnabled(true)}>
              Turn on Deployment
            </Button>
          </div>
        </div>
      )}

      {tab === 'networking' && (
      <Section title="Networking" dirty={dirty.has('ingress') || dirty.has('httpRoute') || dirty.has('networkPolicy')} classes={classes}>
        <div className={classes.switchRow}>
          <Switch checked={form.httpRouteEnabled} onChange={e => setF('httpRouteEnabled', e.target.checked, 'httpRoute')} />
          <Typography className={classes.switchLabel}>Gateway API HTTPRoute</Typography>
        </div>
        {form.httpRouteEnabled && (
          <div style={{ marginTop: 10 }}>
            <div className={classes.grid}>
              <Field label="Hostnames (comma-separated)" classes={classes}>
                <input className={classes.input} placeholder="checkout-api.prod.kiac.local" value={form.httpRouteHostnames} onChange={e => setF('httpRouteHostnames', e.target.value, 'httpRoute')} />
              </Field>
            </div>
            <Typography className={classes.fieldLabel} style={{ marginTop: 10 }}>Parent gateways</Typography>
            <div className={classes.rowList} style={{ marginTop: 6 }}>
              {form.httpRouteParentRefs.map((ref, i) => (
                <div className={classes.row} key={i}>
                  <input
                    className={classes.input}
                    placeholder="name (e.g. kiac)"
                    value={ref.name}
                    onChange={e => {
                      const next = [...form.httpRouteParentRefs];
                      next[i] = { ...next[i], name: e.target.value };
                      setF('httpRouteParentRefs', next, 'httpRoute');
                    }}
                  />
                  <input
                    className={classes.input}
                    placeholder="namespace (e.g. kiac-gateway)"
                    value={ref.namespace}
                    onChange={e => {
                      const next = [...form.httpRouteParentRefs];
                      next[i] = { ...next[i], namespace: e.target.value };
                      setF('httpRouteParentRefs', next, 'httpRoute');
                    }}
                  />
                  <button type="button" className={classes.removeBtn} onClick={() => setF('httpRouteParentRefs', form.httpRouteParentRefs.filter((_, j) => j !== i), 'httpRoute')}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className={classes.addBtn} onClick={() => setF('httpRouteParentRefs', [...form.httpRouteParentRefs, { name: '', namespace: '' }], 'httpRoute')}>
                + Add parent gateway
              </button>
            </div>
          </div>
        )}
        <div className={classes.switchRow} style={{ marginTop: 16 }}>
          <Switch checked={form.ingressEnabled} onChange={e => setF('ingressEnabled', e.target.checked, 'ingress')} />
          <Typography className={classes.switchLabel}>Classic Ingress</Typography>
        </div>
        {form.ingressEnabled && (
          <div className={classes.grid} style={{ marginTop: 10 }}>
            <Field label="Host" classes={classes}>
              <input className={classes.input} value={form.ingressHost} onChange={e => setF('ingressHost', e.target.value, 'ingress')} />
            </Field>
            <Field label="Path" classes={classes}>
              <input className={classes.input} value={form.ingressPath} onChange={e => setF('ingressPath', e.target.value, 'ingress')} />
            </Field>
            <Field label="Path type" classes={classes}>
              <select className={classes.select} value={form.ingressPathType} onChange={e => setF('ingressPathType', e.target.value, 'ingress')}>
                <option>Prefix</option>
                <option>Exact</option>
                <option>ImplementationSpecific</option>
              </select>
            </Field>
            <div className={classes.switchRow}>
              <Switch checked={form.ingressTls} onChange={e => setF('ingressTls', e.target.checked, 'ingress')} />
              <Typography className={classes.switchLabel}>TLS (cert-manager)</Typography>
            </div>
          </div>
        )}
        <div className={classes.switchRow} style={{ marginTop: 16 }}>
          <Switch checked={form.networkPolicyEnabled} onChange={e => setF('networkPolicyEnabled', e.target.checked, 'networkPolicy')} />
          <Typography className={classes.switchLabel}>NetworkPolicy</Typography>
        </div>
        {form.networkPolicyEnabled && (
          <div className={classes.switchRow} style={{ marginTop: 8 }}>
            <Switch
              checked={form.networkPolicyAllowIngressFromIngressController}
              onChange={e => setF('networkPolicyAllowIngressFromIngressController', e.target.checked, 'networkPolicy')}
            />
            <Typography className={classes.switchLabel}>Allow ingress from the gateway/ingress controller</Typography>
          </div>
        )}
      </Section>
      )}

      {tab === 'workload' && (
      <Section title="Availability" dirty={dirty.has('podDisruptionBudget') || dirty.has('serviceMonitor')} classes={classes}>
        <div className={classes.switchRow}>
          <Switch checked={form.pdbEnabled} onChange={e => setF('pdbEnabled', e.target.checked, 'podDisruptionBudget')} />
          <Typography className={classes.switchLabel}>PodDisruptionBudget</Typography>
        </div>
        {form.pdbEnabled && (
          <div className={classes.grid} style={{ marginTop: 10 }}>
            <Field label="Min available" classes={classes}>
              <input className={classes.input} value={form.pdbMinAvailable} onChange={e => setF('pdbMinAvailable', e.target.value, 'podDisruptionBudget')} />
            </Field>
            <Field label="Max unavailable" classes={classes}>
              <input className={classes.input} value={form.pdbMaxUnavailable} onChange={e => setF('pdbMaxUnavailable', e.target.value, 'podDisruptionBudget')} />
            </Field>
          </div>
        )}
        <div className={classes.switchRow} style={{ marginTop: 16 }}>
          <Switch checked={form.serviceMonitorEnabled} onChange={e => setF('serviceMonitorEnabled', e.target.checked, 'serviceMonitor')} />
          <Typography className={classes.switchLabel}>Prometheus ServiceMonitor</Typography>
        </div>
        {form.serviceMonitorEnabled && (
          <div className={classes.grid} style={{ marginTop: 10 }}>
            <Field label="Metrics path" classes={classes}>
              <input className={classes.input} value={form.serviceMonitorPath} onChange={e => setF('serviceMonitorPath', e.target.value, 'serviceMonitor')} />
            </Field>
            <Field label="Scrape interval" classes={classes}>
              <input className={classes.input} value={form.serviceMonitorInterval} onChange={e => setF('serviceMonitorInterval', e.target.value, 'serviceMonitor')} />
            </Field>
          </div>
        )}
      </Section>
      )}

      {tab === 'access' && (
      <Section title="Service account" dirty={dirty.has('serviceAccount')} classes={classes}>
        <div className={classes.switchRow}>
          <Switch checked={form.serviceAccountCreate} onChange={e => setF('serviceAccountCreate', e.target.checked, 'serviceAccount')} />
          <Typography className={classes.switchLabel}>Create a dedicated ServiceAccount</Typography>
        </div>
        {form.serviceAccountCreate && (
          <>
            <div className={classes.grid} style={{ marginTop: 10 }}>
              <Field label="Name (blank = app name)" classes={classes}>
                <input className={classes.input} placeholder={appName} value={form.serviceAccountName} onChange={e => setF('serviceAccountName', e.target.value, 'serviceAccount')} />
              </Field>
            </div>
            <Typography className={classes.fieldLabel} style={{ marginTop: 12 }}>Annotations</Typography>
            <div className={classes.rowList} style={{ marginTop: 6 }}>
              {form.serviceAccountAnnotations.map((a, i) => (
                <div className={classes.row} key={i}>
                  <input
                    className={classes.input}
                    placeholder="annotation key"
                    value={a.key}
                    onChange={e => {
                      const next = [...form.serviceAccountAnnotations];
                      next[i] = { ...next[i], key: e.target.value };
                      setF('serviceAccountAnnotations', next, 'serviceAccount');
                    }}
                  />
                  <input
                    className={classes.input}
                    placeholder="value"
                    value={a.value}
                    onChange={e => {
                      const next = [...form.serviceAccountAnnotations];
                      next[i] = { ...next[i], value: e.target.value };
                      setF('serviceAccountAnnotations', next, 'serviceAccount');
                    }}
                  />
                  <button type="button" className={classes.removeBtn} onClick={() => setF('serviceAccountAnnotations', form.serviceAccountAnnotations.filter((_, j) => j !== i), 'serviceAccount')}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className={classes.addBtn} onClick={() => setF('serviceAccountAnnotations', [...form.serviceAccountAnnotations, { key: '', value: '' }], 'serviceAccount')}>
                + Add annotation
              </button>
            </div>
            <Typography className={classes.fieldLabel} style={{ marginTop: 12 }}>Extra image pull secrets</Typography>
            <div className={classes.rowList} style={{ marginTop: 6 }}>
              {form.serviceAccountImagePullSecrets.map((s, i) => (
                <div className={classes.row} key={i}>
                  <input
                    className={classes.input}
                    placeholder="existing Secret name"
                    value={s.name}
                    onChange={e => {
                      const next = [...form.serviceAccountImagePullSecrets];
                      next[i] = { name: e.target.value };
                      setF('serviceAccountImagePullSecrets', next, 'serviceAccount');
                    }}
                  />
                  <button type="button" className={classes.removeBtn} onClick={() => setF('serviceAccountImagePullSecrets', form.serviceAccountImagePullSecrets.filter((_, j) => j !== i), 'serviceAccount')}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className={classes.addBtn} onClick={() => setF('serviceAccountImagePullSecrets', [...form.serviceAccountImagePullSecrets, { name: '' }], 'serviceAccount')}>
                + Add pull secret
              </button>
            </div>
            <Typography className={classes.hint}>
              Registry credentials are already attached to every namespace automatically - this is only for an
              additional, app-specific pull secret.
            </Typography>
          </>
        )}
      </Section>
      )}

      {tab === 'release' && (
      <Section title="Notifications" dirty={dirty.has('notifications')} classes={classes}>
        <div className={classes.switchRow}>
          <Switch checked={form.slackEnabled} onChange={e => setF('slackEnabled', e.target.checked, 'notifications')} />
          <Typography className={classes.switchLabel}>AI-triage Slack notifications</Typography>
        </div>
        {form.slackEnabled && (
          <div className={classes.grid} style={{ marginTop: 10 }}>
            <Field label="Channel (optional)" classes={classes}>
              <input className={classes.input} placeholder="#your-channel" value={form.slackChannel} onChange={e => setF('slackChannel', e.target.value, 'notifications')} />
            </Field>
          </div>
        )}
        <Typography className={classes.hint}>The webhook URL itself is never edited here - it's an Infisical secret, not a values.yaml field.</Typography>
      </Section>
      )}

      {tab === 'config' && (
      <Section title="Environment variables" dirty={dirty.has('env')} classes={classes}>
        <div className={classes.rowList}>
          {form.envVars.map((v, i) => (
            <div className={classes.row} key={i}>
              <input
                className={classes.input}
                placeholder="NAME"
                value={v.name}
                onChange={e => {
                  const next = [...form.envVars];
                  next[i] = { ...next[i], name: e.target.value };
                  setF('envVars', next, 'env');
                }}
              />
              <input
                className={classes.input}
                placeholder="value"
                value={v.value}
                onChange={e => {
                  const next = [...form.envVars];
                  next[i] = { ...next[i], value: e.target.value };
                  setF('envVars', next, 'env');
                }}
              />
              <button type="button" className={classes.removeBtn} onClick={() => setF('envVars', form.envVars.filter((_, j) => j !== i), 'env')}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className={classes.addBtn} onClick={() => setF('envVars', [...form.envVars, { name: '', value: '' }], 'env')}>
            + Add variable
          </button>
        </div>
      </Section>
      )}

      {tab === 'config' && (
      <Section title="Config maps" dirty={dirty.has('configMaps')} classes={classes}>
        <ConfigMapsSection rows={form.configMaps} onChange={rows => setF('configMaps', rows)} classes={classes} />
      </Section>
      )}

      {tab === 'access' && (
      <Section title="Secrets" dirty={dirty.has('secrets')} classes={classes}>
        <SecretsSection rows={form.secrets} onChange={rows => setF('secrets', rows)} classes={classes} />
      </Section>
      )}

      {(Object.keys(ADVANCED_META) as AdvancedKey[])
        .filter(key => ADVANCED_TAB[key] === tab)
        .map(key => renderAdvancedSection(key))}

      </div>
      <PendingPanel
        lines={previewSummary.map(title => ({ title }))}
        problems={problems}
        notes={notes}
        heading={prod ? `Pending changes to ${title}` : 'Pending changes'}
        aria-label={`Pending changes to the values of ${title}`}
        emptyText="Nothing staged. Edit a field and it appears here."
        stick={layout === 'side' ? 'top' : 'bottom'}
        busy={submitCfg.loading}
        canSubmit={canSubmit}
        submitLabel="Open pull request"
        onDiscard={discard}
        onSubmit={onSubmit}
      >
        <div className={ui.note}>
          {title}: {cfg.data.path}. This file has its own pull request.
        </div>
        {submitCfg.result && (
          <div className={ui.note}>
            {submitCfg.result.alreadyOpen ? 'A PR for this exact change is already open: ' : 'PR opened: '}
            <Link className={classes.resultLink} href={submitCfg.result.prUrl} target="_blank" rel="noopener noreferrer">
              {submitCfg.result.prUrl}
            </Link>
          </div>
        )}
        {submitCfg.error && <div className={ui.problem}>Couldn&apos;t open PR: {submitCfg.error}</div>}
      </PendingPanel>
      <PrResultDialog result={submitCfg.result} error={submitCfg.error} onClose={() => submitCfg.reset()} />
    </div>
  );
}

function Section({ title, dirty, children }: { title: string; dirty: boolean; classes: Cls; children: ReactNode }) {
  const t = useHangarTokens();
  const ui = useUi({ t });
  return (
    <div className={ui.formSection}>
      <h3 className={ui.formSectionTitle}>
        {title}
        {dirty && <i className={ui.marker} role="img" aria-label="changed" />}
      </h3>
      {children}
    </div>
  );
}

// A real <label> around the label text and its control, so the text names the input (it did not before).
function Field({ label, classes, children }: { label: string; classes: Cls; children: ReactNode }) {
  return (
    <label className={classes.field}>
      <Typography className={classes.fieldLabel}>{label}</Typography>
      {children}
    </label>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Switch from '@material-ui/core/Switch';
import Link from '@material-ui/core/Link';
import WarningRoundedIcon from '@material-ui/icons/WarningRounded';
import { dump as dumpYaml } from 'js-yaml';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { TowerEmptyState } from '../TowerEmptyState';
import { useReleaseContext } from '../useReleaseContext';
import {
  useAppConfig,
  useConfigMapFiles,
  useEnvXr,
  useSubmitConfigChange,
  useSubmitConfigMapFiles,
  useSubmitEnvXrChange,
  useValuesSchema,
} from '../useConfigData';
import { RefreshButton } from '../RefreshButton';
import { YamlBlockEditor, validateYamlBlock } from '../YamlBlockEditor';
import { validateAgainstSchema, type JsonSchema, type SchemaIssue } from '../schemaValidate';
import { deepEqual } from '../deepEqual';
import type { ConfigTopLevelField } from '../types';

// Tower's Config tab (2026-09-12, revised 2026-09-13). See glidepathConfig.
// ts's own top comment for the backend half of this design; the summary
// that matters here:
//
//  1. Everything renders/edits gitops-<app>/<cluster>/<env>/values.yaml -
//     this platform's real GitOps source of truth - never a live cluster
//     object. Every save is a real PR (never a direct commit, no exception
//     for any tier - unlike Promote, which does direct-commit lower envs).
//  2. Flight (upper) envs only (item 7) - the env picker below is built
//     from useReleaseContext's pipelineOrder.data.upper, not the full env
//     list Topology/Releases show. Which env is active is deliberately the
//     single most visually prominent thing on this tab (see EnvBanner) -
//     2026-09-13 feedback: "editing the wrong config by accident, despite
//     the PR gate, is problematic."
//  3. Common fields get real form controls, including (as of 2026-09-13)
//     liveness/readiness probes, the service account, and canary steps -
//     the fields that are genuinely open-ended k8s-resource shapes
//     (canaryAnalysis, blueGreen, custom AnalysisTemplates, configMaps/
//     secrets/volumes/jobs, extraManifests, ...) get a YamlBlockEditor with
//     live syntax checking and (for the trickier ones) a real example to
//     start from, instead of a hand-built form for every nested shape.
//  4. Nothing is submitted until every YAML block currently on screen
//     parses, a handful of the chart's own documented invariants hold, AND
//     (as of 2026-09-13) the assembled patch validates against the chart's
//     own real values.schema.json - see validateBeforeSubmit and
//     schemaValidate.ts. The hand-written invariant checks stay alongside
//     the schema check rather than being replaced by it: they exist to give
//     the *specific*, easy-to-fix message that the hand-rolled schema
//     validator doesn't always word as clearly (e.g. schema catches
//     "ingress.host must be at least 1 character" - the hand check catches
//     the same thing but phrases it as "Ingress is enabled but has no host
//     set", which is the message worth showing first).
//  5. The "Catalog resource" panel is this feature's answer to item 5's ask
//     to investigate editing a catalog XR's own spec, not just the Helm
//     values it bootstraps - ApplicationEnvironment's spec has exactly one
//     real (non-identity) field, configMapGenerator, so that's what's
//     wired up. NodeJSApplication (the other example item 5 named) is
//     deliberately NOT here: its spec (devCluster/nodeVersion/
//     packageManager/port/visibility) is app-onboarding state scoped to the
//     dev cluster, not to any one flight environment - out of item 7's
//     flight-only scope, not a gap in this pass.
//  6. Canary steps get a structured builder (Weight/Pause/Analysis rows,
//     reordering, the standard canary-hash args boilerplate generated
//     automatically) whenever the existing steps fit one of those three
//     plain shapes - see parseStepsSimple. A step using anything else
//     (setCanaryScale, experiment, custom args, ...) falls back to the raw
//     YAML editor instead of silently mangling something the builder can't
//     represent; either way is still just `rollout.steps` underneath.

function isProdEnv(env: string): boolean {
  return /^(prod|production)$/i.test(env);
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  envBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    padding: '14px 18px',
    borderRadius: 6,
    marginBottom: 16,
    border: '2px solid',
  },
  envBannerProd: { borderColor: ({ t }) => t.bad, backgroundColor: ({ t }) => t.badSoft },
  envBannerOther: { borderColor: ({ t }) => t.amberLine, backgroundColor: ({ t }) => t.amberSoft },
  envBannerLeft: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  envBannerTitle: { fontFamily: fontDisplay, fontWeight: 800, fontSize: 18, letterSpacing: '0.02em' },
  envBannerTitleProd: { color: ({ t }) => t.bad },
  envBannerTitleOther: { color: ({ t }) => t.amberInk },
  envBannerPath: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  select: {
    fontFamily: fontMono,
    fontSize: 12.5,
    padding: '5px 10px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
  },
  columns: { display: 'flex', flexDirection: 'column', gap: 16 },
  section: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: '16px 18px',
  },
  sectionDirty: { borderColor: ({ t }) => t.amberLine },
  sectionTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14.5, color: ({ t }) => t.textHi },
  dirtyDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    marginLeft: 8,
    backgroundColor: ({ t }) => t.amber,
    verticalAlign: 'middle',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 11.5, color: ({ t }) => t.textLo },
  input: {
    fontFamily: fontMono,
    fontSize: 12.5,
    padding: '6px 9px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.bgRaised,
    color: ({ t }) => t.textHi,
    '&:focus': { outline: 'none', borderColor: ({ t }) => t.sky },
  },
  textarea: {
    fontFamily: fontMono,
    fontSize: 12.5,
    padding: '6px 9px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.bgRaised,
    color: ({ t }) => t.textHi,
    resize: 'vertical',
    '&:focus': { outline: 'none', borderColor: ({ t }) => t.sky },
  },
  switchRow: { display: 'flex', alignItems: 'center', gap: 8 },
  switchLabel: { fontSize: 13, color: ({ t }) => t.textHi },
  hint: { fontSize: 11.5, fontStyle: 'italic', color: ({ t }) => t.textFaint, marginTop: 8 },
  advancedToggle: {
    fontFamily: fontMono,
    fontSize: 11.5,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    marginBottom: 12,
  },
  linkBtn: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    '&:disabled': { color: ({ t }) => t.textFaint, cursor: 'not-allowed' },
  },
  rowList: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', gap: 8, alignItems: 'center' },
  stepCard: {
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 4,
    padding: 8,
  },
  rowCard: {
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 4,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  rowCardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  radioRow: { display: 'flex', gap: 14, alignItems: 'center', fontSize: 12.5, color: ({ t }) => t.textHi },
  stepNumber: {
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.textFaint,
    minWidth: 16,
    textAlign: 'right',
    paddingTop: 6,
  },
  stepOrderCol: { display: 'flex', flexDirection: 'column', gap: 2 },
  orderBtn: {
    fontFamily: fontMono,
    fontSize: 10,
    lineHeight: 1,
    padding: '2px 5px',
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 3,
    background: 'none',
    color: ({ t }) => t.textLo,
    cursor: 'pointer',
    '&:disabled': { opacity: 0.35, cursor: 'not-allowed' },
  },
  removeBtn: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.bad,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 6px',
  },
  addBtn: {
    alignSelf: 'flex-start',
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.sky,
    background: 'none',
    border: ({ t }) => `1px dashed ${t.skyLine}`,
    borderRadius: 4,
    cursor: 'pointer',
    padding: '5px 10px',
  },
  reviewBar: {
    position: 'sticky',
    bottom: 0,
    marginTop: 20,
    padding: '14px 18px',
    borderRadius: 6,
    border: '2px solid',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  reviewBarProd: { borderColor: ({ t }) => t.bad, backgroundColor: ({ t }) => t.badSoft },
  reviewBarOther: { borderColor: ({ t }) => t.amberLine, backgroundColor: ({ t }) => t.amberSoft },
  reviewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  reviewTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14 },
  reviewTitleProd: { color: ({ t }) => t.bad },
  reviewTitleOther: { color: ({ t }) => t.amberInk },
  reviewList: { fontSize: 12.5, color: ({ t }) => t.textLo, margin: 0, paddingLeft: 18 },
  errorList: { fontSize: 12.5, color: ({ t }) => t.bad, margin: 0, paddingLeft: 18 },
  btn: {
    fontFamily: fontMono,
    fontSize: 12,
    letterSpacing: '0.03em',
    padding: '7px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: 'transparent',
    color: ({ t }) => t.amberInk,
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  },
  discardBtn: {
    fontFamily: fontMono,
    fontSize: 12,
    padding: '7px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: 'transparent',
    color: ({ t }) => t.textLo,
  },
  resultLink: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.sky },
  note: { fontSize: 12.5, color: ({ t }) => t.textLo },
  example: {
    margin: '6px 0 0',
    padding: '8px 10px',
    fontFamily: fontMono,
    fontSize: 11,
    lineHeight: 1.5,
    borderRadius: 4,
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px dashed ${t.line}`,
    color: ({ t }) => t.textLo,
    whiteSpace: 'pre',
    overflowX: 'auto',
  },
}));

type Cls = ReturnType<typeof useStyles>;

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

export function ConfigTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { owner, appName, pipelineOrder, loading, error } = useReleaseContext();

  // Built directly from cicd.yaml's own declared upper environments
  // (pipelineOrder.upper/upperClusters), NOT by cross-referencing live
  // Kubernetes-discovered `environments` - Config's whole point is editing
  // gitops-<app>/<cluster>/<env>/values.yaml BEFORE anything is necessarily
  // deployed there (2026-09-16 bug: a freshly-declared upper env with
  // `rollout: null` - "I might not want to deploy a container, I might
  // just want to create a job" - has no live workload for Tower to
  // discover yet, so it silently never appeared in this picker at all).
  const flightEnvs = useMemo(() => {
    if (!pipelineOrder.upper) return [];
    return pipelineOrder.upper.map(name => ({
      env: name,
      cluster: pipelineOrder.upperClusters?.[name] ?? '',
    }));
  }, [pipelineOrder.upper, pipelineOrder.upperClusters]);

  const [selectedEnv, setSelectedEnv] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedEnv && flightEnvs.length > 0) setSelectedEnv(flightEnvs[0].env);
  }, [flightEnvs, selectedEnv]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;
  if (!owner || !appName) {
    return (
      <TowerEmptyState
        title="Can't resolve this app's source repo"
        description="App Configuration needs a resolved GitHub owner/repo (from a promoted environment's provenance) to know which gitops-<app> repo to read."
      />
    );
  }
  // 2026-09-16 bug: "there seems to be a refresh/loading issue... it waits
  // a second or two, then reports no configs, then eventually presents all
  // the env's config". Root cause: usePipelineOrder only starts its fetch
  // once owner/appName resolve (both come from useReleaseContext's own
  // provenance-driven repoRef, which itself only settles after
  // `environments` finishes loading) - the render where `loading` above
  // first flips false and owner/appName first become truthy is the SAME
  // render pipelineOrder's effect gets its real (owner, repo) argument for
  // the first time, but React doesn't run that effect until AFTER this
  // paint - so for that one tick, pipelineOrder.loading reads false with no
  // data yet (its state object is still the stale `{loading:false}` from
  // when its argument was undefined). flightEnvs then briefly, wrongly
  // computed as empty before the real fetch had even started. Waiting for
  // pipelineOrder to have EITHER real data OR a real error (checked only
  // once owner/appName are confirmed resolved above, so this can't spin
  // forever if they never do) closes that gap.
  if (pipelineOrder.loading || (!pipelineOrder.data && !pipelineOrder.error)) return <Progress />;
  if (pipelineOrder.error) return <ResponseErrorPanel error={new Error(pipelineOrder.error)} />;
  if (flightEnvs.length === 0) {
    return (
      <TowerEmptyState
        title="No flight environments yet"
        description={`App Configuration only supports flight (upper) environments, and ${appName}'s cicd.yaml doesn't declare any yet. This is expected until CI/CD is set up for this app - it's not an error.`}
      />
    );
  }

  const active = flightEnvs.find(e => e.env === selectedEnv) ?? flightEnvs[0];
  const prod = isProdEnv(active.env);

  return (
    <div>
      {/* 2026-09-13: "it's not clear enough which env's config we're
          editing... editing the wrong config by accident, despite the PR
          gate, is problematic" - this banner (not a small toolbar row) is
          the single most prominent thing on the tab, red for anything named
          prod/production, amber for every other flight env, and the env
          picker itself lives inside it rather than off to the side. */}
      <div className={`${classes.envBanner} ${prod ? classes.envBannerProd : classes.envBannerOther}`}>
        <div className={classes.envBannerLeft}>
          {prod && <WarningRoundedIcon style={{ color: t.bad }} />}
          <Typography className={`${classes.envBannerTitle} ${prod ? classes.envBannerTitleProd : classes.envBannerTitleOther}`}>
            Editing {active.env.toUpperCase()}
          </Typography>
          <select className={classes.select} value={active.env} onChange={e => setSelectedEnv(e.target.value)}>
            {flightEnvs.map(e => (
              <option key={e.env} value={e.env}>
                {e.env} ({e.cluster})
              </option>
            ))}
          </select>
        </div>
        <Typography className={classes.envBannerPath}>
          gitops-{appName}/{active.cluster}/{active.env}/values.yaml
        </Typography>
      </div>
      <EnvXrPanel owner={owner} appName={appName} env={active.env} classes={classes} />
      <ConfigMapFilesPanel owner={owner} appName={appName} cluster={active.cluster} env={active.env} classes={classes} />
      <ConfigEditor owner={owner} appName={appName} cluster={active.cluster} env={active.env} prod={prod} classes={classes} />
    </div>
  );
}

function EnvXrPanel({ owner, appName, env, classes }: { owner: string; appName: string; env: string; classes: Cls }) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const xr = useEnvXr({ owner, appName, env }, refreshNonce);
  const submitXr = useSubmitEnvXrChange();
  const [draft, setDraft] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (xr.data) setDraft(xr.data.configMapGenerator);
  }, [xr.data]);

  if (xr.loading) return <Progress />;
  if (xr.error) {
    return (
      <div className={classes.section} style={{ marginBottom: 16 }}>
        <Typography className={classes.note}>Couldn't load this env's ApplicationEnvironment resource: {xr.error}</Typography>
      </div>
    );
  }
  if (!xr.data || draft === undefined) return null;

  const dirty = draft !== xr.data.configMapGenerator;

  return (
    <div className={`${classes.section} ${dirty ? classes.sectionDirty : ''}`} style={{ marginBottom: 16 }}>
      <div className={classes.sectionTitleRow}>
        <Typography className={classes.sectionTitle}>
          Catalog resource · ApplicationEnvironment
          {dirty && <span className={classes.dirtyDot} />}
        </Typography>
        <RefreshButton label="" onClick={() => setRefreshNonce(n => n + 1)} />
      </div>
      <Typography className={classes.envBannerPath} style={{ marginBottom: 10 }}>
        {xr.data.path}
      </Typography>
      <div className={classes.switchRow}>
        <Switch checked={draft} onChange={e => setDraft(e.target.checked)} disabled={submitXr.loading} />
        <Typography className={classes.switchLabel}>configMapGenerator</Typography>
      </div>
      <Typography className={classes.hint}>
        The only editable field on this XR - appName/cluster/env are this resource's own identity, not a setting.
      </Typography>
      {submitXr.result && (
        <Typography className={classes.note} style={{ marginTop: 10 }}>
          {submitXr.result.alreadyOpen ? 'A PR for this change is already open: ' : 'PR opened: '}
          <Link className={classes.resultLink} href={submitXr.result.prUrl} target="_blank" rel="noopener noreferrer">
            {submitXr.result.prUrl}
          </Link>
        </Typography>
      )}
      {submitXr.error && (
        <Typography className={classes.errorList} style={{ marginTop: 10, listStyle: 'none', paddingLeft: 0 }}>
          Couldn't open PR: {submitXr.error}
        </Typography>
      )}
      {dirty && !submitXr.result && (
        <button
          type="button"
          className={classes.btn}
          style={{ marginTop: 12 }}
          disabled={submitXr.loading}
          onClick={() => submitXr.submit({ owner, appName, env, configMapGenerator: draft })}
        >
          {submitXr.loading ? 'Opening PR…' : 'Open PR for this change'}
        </button>
      )}
    </div>
  );
}

interface ConfigMapFileRow {
  // undefined = a genuinely new file, not yet on GitHub - see submit's
  // rename handling (originalName present + name changed = delete old,
  // create new).
  originalName?: string;
  name: string;
  content: string;
}

function toFileRows(files: { name: string; content: string }[]): ConfigMapFileRow[] {
  return files.map(f => ({ originalName: f.name, name: f.name, content: f.content }));
}

// 2026-09-13 item 2: "I'd like to be able to create the 'Existing
// ConfigMaps' as well... it would be nice to edit those files and create
// new ones." A genuinely different git target from values.yaml - a whole
// directory of arbitrary files rendered through Kustomize's
// configMapGenerator, gated by the configMapGenerator toggle in the
// Catalog resource panel above - so this gets its own fetch/PR flow rather
// than folding into ConfigEditor's values.yaml patch mechanism.
function ConfigMapFilesPanel({ owner, appName, cluster, env, classes }: { owner: string; appName: string; cluster: string; env: string; classes: Cls }) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const filesData = useConfigMapFiles({ owner, appName, cluster, env }, refreshNonce);
  const xr = useEnvXr({ owner, appName, env });
  const submitFiles = useSubmitConfigMapFiles();

  const [rows, setRows] = useState<ConfigMapFileRow[] | undefined>(undefined);
  const [originalRows, setOriginalRows] = useState<ConfigMapFileRow[] | undefined>(undefined);

  useEffect(() => {
    if (filesData.data) {
      const built = toFileRows(filesData.data.files);
      setRows(built);
      setOriginalRows(built);
      submitFiles.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesData.data]);

  if (filesData.loading || !rows || !originalRows) return <Progress />;
  if (filesData.error) {
    return (
      <div className={classes.section} style={{ marginBottom: 16 }}>
        <Typography className={classes.note}>Couldn't load configmap files: {filesData.error}</Typography>
      </div>
    );
  }

  const dirty = !deepEqual(rows, originalRows);
  const names = rows.map(r => r.name.trim());
  const errors: string[] = [];
  if (names.some(n => !n)) errors.push('Every file needs a name.');
  if (names.some(n => n === 'kustomization.yaml')) errors.push('kustomization.yaml is managed automatically and can\'t be used as a file name.');
  if (new Set(names).size !== names.length) errors.push('File names must be unique.');

  const update = (i: number, patch: Partial<ConfigMapFileRow>) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    setRows(next);
  };
  const remove = (i: number) => setRows(rows.filter((_, j) => j !== i));
  const add = () => setRows([...rows, { name: '', content: '' }]);
  const discard = () => {
    setRows(originalRows);
    submitFiles.reset();
  };
  const onSubmit = () => {
    const deletedFiles = originalRows.filter(o => !rows.some(r => r.originalName === o.originalName)).map(o => o.originalName!);
    const renameDeletes = rows.filter(r => r.originalName && r.originalName !== r.name.trim()).map(r => r.originalName!);
    const files = rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), content: r.content }));
    submitFiles.submit({ owner, appName, cluster, env, files, deletedFiles: [...deletedFiles, ...renameDeletes] });
  };

  return (
    <div className={`${classes.section} ${dirty ? classes.sectionDirty : ''}`} style={{ marginBottom: 16 }}>
      <div className={classes.sectionTitleRow}>
        <Typography className={classes.sectionTitle}>
          ConfigMap generator files
          {dirty && <span className={classes.dirtyDot} />}
        </Typography>
        <RefreshButton label="" onClick={() => setRefreshNonce(n => n + 1)} />
      </div>
      <Typography className={classes.envBannerPath} style={{ marginBottom: 6 }}>
        {filesData.data?.path ?? `${cluster}/${env}/configmap`}
      </Typography>
      {filesData.data?.configMapName && (
        <Typography className={classes.hint} style={{ marginTop: 0 }}>
          Generates ConfigMap <code>{filesData.data.configMapName}</code> - reference it from a "Config maps" row above via
          "Existing ConfigMap" → <code>{filesData.data.configMapName}</code>.
        </Typography>
      )}
      {!xr.data?.configMapGenerator && (
        <Typography className={classes.hint} style={{ marginTop: 0 }}>
          configMapGenerator is currently off for this env (see Catalog resource above) - these files can still be prepared here, but won't be rendered into a ConfigMap until it's enabled.
        </Typography>
      )}
      <div className={classes.rowList} style={{ marginTop: 10 }}>
        {rows.length === 0 && <Typography className={classes.hint} style={{ marginTop: 0 }}>No files yet.</Typography>}
        {rows.map((row, i) => (
          <div key={i} className={classes.rowCard}>
            <div className={classes.rowCardHead}>
              <input className={classes.input} style={{ flex: 1 }} placeholder="app-settings.yaml" value={row.name} onChange={e => update(i, { name: e.target.value })} />
              <button type="button" className={classes.removeBtn} onClick={() => remove(i)}>Remove</button>
            </div>
            <textarea className={classes.textarea} rows={6} value={row.content} onChange={e => update(i, { content: e.target.value })} placeholder="file contents" />
          </div>
        ))}
        <button type="button" className={classes.addBtn} onClick={add}>+ Add file</button>
      </div>
      {dirty && (
        <>
          {errors.length > 0 && (
            <ul className={classes.errorList} style={{ marginTop: 10 }}>
              {errors.map(e => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {submitFiles.result ? (
              <button type="button" className={classes.discardBtn} onClick={() => submitFiles.reset()}>Close</button>
            ) : (
              <button type="button" className={classes.discardBtn} onClick={discard} disabled={submitFiles.loading}>Discard</button>
            )}
            <button type="button" className={classes.btn} disabled={errors.length > 0 || submitFiles.loading} onClick={onSubmit}>
              {submitFiles.loading ? 'Opening PR…' : 'Open PR for these files'}
            </button>
          </div>
        </>
      )}
      {submitFiles.result && (
        <Typography className={classes.note} style={{ marginTop: 10 }}>
          {submitFiles.result.alreadyOpen ? 'A PR for this exact change is already open: ' : 'PR opened: '}
          <Link className={classes.resultLink} href={submitFiles.result.prUrl} target="_blank" rel="noopener noreferrer">
            {submitFiles.result.prUrl}
          </Link>
        </Typography>
      )}
      {submitFiles.error && (
        <Typography className={classes.errorList} style={{ marginTop: 10, listStyle: 'none', paddingLeft: 0 }}>
          Couldn't open PR: {submitFiles.error}
        </Typography>
      )}
    </div>
  );
}

function ConfigEditor({
  owner,
  appName,
  cluster,
  env,
  prod,
  classes,
}: {
  owner: string;
  appName: string;
  cluster: string;
  env: string;
  prod: boolean;
  classes: Cls;
}) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const cfg = useAppConfig({ owner, appName, cluster, env }, refreshNonce);
  const submitCfg = useSubmitConfigChange();
  const schema = useValuesSchema(owner);

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
  const [showAdvanced, setShowAdvanced] = useState(false);
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
  const { patch: previewPatch } = dirty.size > 0 ? buildPatchAndSummary() : { patch: {} as Partial<Record<ConfigTopLevelField, unknown>> };
  const schemaIssues: SchemaIssue[] = schema.data
    ? (Object.keys(previewPatch) as ConfigTopLevelField[]).flatMap(key =>
        validateAgainstSchema((schema.data as JsonSchema).properties?.[key], schema.data as JsonSchema, previewPatch[key], key),
      )
    : [];

  const canSubmit =
    dirty.size > 0 && advancedInvalid.length === 0 && !stepsInvalid && structuralErrors.length === 0 && schemaIssues.length === 0 && !submitCfg.loading;

  const onSubmit = () => {
    const { patch, summary } = buildPatchAndSummary();
    submitCfg.submit({ owner, appName, cluster, env, patch, summary });
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

  return (
    <div className={classes.columns}>
      <div className={classes.sectionTitleRow} style={{ marginBottom: 0 }}>
        <Typography className={classes.note}>Live values from GitHub - not polled, use refresh for the latest commit.</Typography>
        <RefreshButton onClick={() => setRefreshNonce(n => n + 1)} />
      </div>

      <button type="button" className={classes.advancedToggle} onClick={() => setShowRawFile(v => !v)}>
        {showRawFile ? '▾ Hide full committed YAML' : '▸ View full committed YAML'}
      </button>
      {showRawFile && (
        <pre className={classes.example} style={{ maxHeight: 420, overflow: 'auto' }}>
          {cfg.data.raw || `# Nothing committed yet at ${cfg.data.path} - this environment has no values.yaml\n# on its own branch/history. Submitting a change below creates it.`}
        </pre>
      )}

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

      {rolloutEnabled && (
        <>
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

      <Section title="Health checks" dirty={dirty.has('rollout')} classes={classes}>
        <ProbeFields label="Liveness probe" probe={form.liveness} onChange={p => setF('liveness', p, 'rollout')} classes={classes} />
        <div style={{ marginTop: 16 }}>
          <ProbeFields label="Readiness probe" probe={form.readiness} onChange={p => setF('readiness', p, 'rollout')} classes={classes} />
        </div>
      </Section>

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
        </>
      )}

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

      <Section title="Config maps" dirty={dirty.has('configMaps')} classes={classes}>
        <ConfigMapsSection rows={form.configMaps} onChange={rows => setF('configMaps', rows)} classes={classes} />
      </Section>

      <Section title="Secrets" dirty={dirty.has('secrets')} classes={classes}>
        <SecretsSection rows={form.secrets} onChange={rows => setF('secrets', rows)} classes={classes} />
      </Section>

      {/* Below Secrets, above the advanced (raw YAML) fields - see ADVANCED_META's `promoted`. */}
      {(Object.keys(ADVANCED_META) as AdvancedKey[])
        .filter(key => ADVANCED_META[key].promoted)
        .map(key => renderAdvancedSection(key))}

      <button type="button" className={classes.advancedToggle} onClick={() => setShowAdvanced(v => !v)}>
        {showAdvanced ? '▾ Hide advanced (raw YAML) fields' : '▸ Show advanced (raw YAML) fields'}
      </button>

      {showAdvanced &&
        (Object.keys(ADVANCED_META) as AdvancedKey[])
          .filter(key => !ADVANCED_META[key].promoted)
          .map(key => renderAdvancedSection(key))}

      {dirty.size > 0 && (
        <div className={`${classes.reviewBar} ${prod ? classes.reviewBarProd : classes.reviewBarOther}`}>
          <div className={classes.reviewHeader}>
            <Typography className={`${classes.reviewTitle} ${prod ? classes.reviewTitleProd : classes.reviewTitleOther}`}>
              {prod && <WarningRoundedIcon style={{ fontSize: 16, verticalAlign: 'text-bottom', marginRight: 4 }} />}
              Review changes to {env.toUpperCase()} ({cluster}) before opening a PR
            </Typography>
            <div style={{ display: 'flex', gap: 10 }}>
              {submitCfg.result ? (
                // A successful (or already-open) PR means these edits are
                // already on their way to review - "Discard" would silently
                // wipe the form back to pre-edit state for no reason at that
                // point (2026-09-13 bug report). Close just dismisses the PR
                // link/banner (submitCfg.reset()), leaving the form exactly
                // as submitted in case there's more to add before merge.
                <button type="button" className={classes.discardBtn} onClick={() => submitCfg.reset()}>
                  Close
                </button>
              ) : (
                <button type="button" className={classes.discardBtn} onClick={discard} disabled={submitCfg.loading}>
                  Discard
                </button>
              )}
              <button type="button" className={classes.btn} disabled={!canSubmit} onClick={onSubmit}>
                {submitCfg.loading ? 'Opening PR…' : 'Open PR'}
              </button>
            </div>
          </div>
          <ul className={classes.reviewList}>
            {[...dirty].map(k => (
              <li key={k}>{k}</li>
            ))}
          </ul>
          {advancedInvalid.length > 0 && (
            <ul className={classes.errorList}>
              {advancedInvalid.map(k => (
                <li key={k}>{ADVANCED_META[k].title}: fix the YAML syntax error above before submitting.</li>
              ))}
            </ul>
          )}
          {stepsInvalid && (
            <ul className={classes.errorList}>
              <li>Canary steps: fix the YAML syntax error above before submitting.</li>
            </ul>
          )}
          {structuralErrors.length > 0 && (
            <ul className={classes.errorList}>
              {structuralErrors.map(e => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {schemaIssues.length > 0 && (
            <ul className={classes.errorList}>
              {schemaIssues.map((issue, i) => (
                <li key={i}>
                  {issue.path}: {issue.message}
                </li>
              ))}
            </ul>
          )}
          {schema.error && (
            <Typography className={classes.hint} style={{ marginTop: 0 }}>
              Couldn't load the chart's values.schema.json for extra validation ({schema.error}) - the built-in checks above still apply.
            </Typography>
          )}
          {submitCfg.result && (
            <Typography className={classes.note}>
              {submitCfg.result.alreadyOpen ? 'A PR for this exact change is already open: ' : 'PR opened: '}
              <Link className={classes.resultLink} href={submitCfg.result.prUrl} target="_blank" rel="noopener noreferrer">
                {submitCfg.result.prUrl}
              </Link>
            </Typography>
          )}
          {submitCfg.error && (
            <Typography className={classes.errorList} style={{ listStyle: 'none', paddingLeft: 0 }}>
              Couldn't open PR: {submitCfg.error}
            </Typography>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, dirty, classes, children }: { title: string; dirty: boolean; classes: Cls; children: ReactNode }) {
  return (
    <div className={`${classes.section} ${dirty ? classes.sectionDirty : ''}`}>
      <div className={classes.sectionTitleRow}>
        <Typography className={classes.sectionTitle}>
          {title}
          {dirty && <span className={classes.dirtyDot} />}
        </Typography>
      </div>
      {children}
    </div>
  );
}

function Field({ label, classes, children }: { label: string; classes: Cls; children: ReactNode }) {
  return (
    <div className={classes.field}>
      <Typography className={classes.fieldLabel}>{label}</Typography>
      {children}
    </div>
  );
}

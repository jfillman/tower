import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import Typography from '@material-ui/core/Typography';
import Switch from '@material-ui/core/Switch';
import Link from '@material-ui/core/Link';
import { dump } from 'js-yaml';
import { ResponseErrorPanel, Progress } from '@backstage/core-components';
import { useValuesSchema } from '../useConfigData.esm.js';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { Subtabs, Button } from '../ui/index.esm.js';
import { PendingPanel } from '../ui/PendingPanel.esm.js';
import { useUi } from '../ui/styles.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { PrResultDialog } from '../PrResultDialog.esm.js';
import { validateYamlBlock, YamlBlockEditor } from '../YamlBlockEditor.esm.js';
import { validateAgainstSchema } from '../schemaValidate.esm.js';
import { deepEqual } from '../deepEqual.esm.js';
import { useStyles } from './styles.esm.js';
import { SloPresets } from './SloPresets.esm.js';
import { ClusterCheckPicker } from './ClusterCheckPicker.esm.js';
import { checkArgs } from './analysisCatalog.esm.js';
import { parseComponents, ComponentsEditor } from './ComponentsEditor.esm.js';
import { componentProblems, catalogOutputs } from './componentCatalog.esm.js';
import { annotateValues, mergeValues } from './annotatedValues.esm.js';
import { analysisProblems, templateRefs } from './analysis.esm.js';
import { declaredComponents, outputsOf, matchComponentOutput } from './components.esm.js';
import { METADATA_FIELDS, metadataProblems } from './metadata.esm.js';
import { workloadOn, workloadStatus } from './workload.esm.js';
import { withGatewayNamespace, parsePeers, isSimpleGatewaySelector, gatewayNamespaceOf, parseParentRefs, validatePeers, buildParentRefs, buildPeers, gatewaySelectorPatch, blankPeer } from './networkPolicy.esm.js';

function asRecord(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function parseEnvRow(e) {
  const name = typeof e.name === "string" ? e.name : "";
  const from = asRecord(e.valueFrom);
  const cm = asRecord(from.configMapKeyRef);
  const sec = asRecord(from.secretKeyRef);
  const fc = asRecord(e.fromComponent);
  const blank = { value: "", refName: "", refKey: "", component: "", output: "" };
  if (Object.keys(fc).length > 0) return { name, kind: "component", ...blank, component: String(fc.name ?? ""), output: String(fc.output ?? "") };
  if (Object.keys(cm).length > 0) return { name, kind: "configMap", ...blank, refName: String(cm.name ?? ""), refKey: String(cm.key ?? "") };
  if (Object.keys(sec).length > 0) return { name, kind: "secret", ...blank, refName: String(sec.name ?? ""), refKey: String(sec.key ?? "") };
  if (Object.keys(from).length > 0) return { name, kind: "other", ...blank, other: e.valueFrom };
  return { name, kind: "value", ...blank, value: String(e.value ?? "") };
}
function buildEnvValue(rows) {
  return rows.filter((r) => r.name.trim()).map((r) => {
    const name = r.name.trim();
    if (r.kind === "configMap") return { name, valueFrom: { configMapKeyRef: { name: r.refName.trim(), key: r.refKey.trim() } } };
    if (r.kind === "secret") return { name, valueFrom: { secretKeyRef: { name: r.refName.trim(), key: r.refKey.trim() } } };
    if (r.kind === "component") return { name, fromComponent: { name: r.component.trim(), output: r.output.trim() } };
    if (r.kind === "other") return { name, valueFrom: r.other };
    return { name, value: r.value };
  });
}
function parseConfigMapRows(v) {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const r = asRecord(raw);
    const hasExisting = typeof r.existingConfigMap === "string" && r.existingConfigMap.length > 0;
    return {
      name: typeof r.name === "string" ? r.name : "",
      as: r.as === "env" || r.as === "both" ? r.as : "volume",
      mountPath: typeof r.mountPath === "string" ? r.mountPath : "",
      source: hasExisting ? "existing" : "data",
      existingConfigMap: typeof r.existingConfigMap === "string" ? r.existingConfigMap : "",
      data: Object.entries(asRecord(r.data)).map(([key, value]) => ({ key, value: String(value ?? "") }))
    };
  });
}
function buildConfigMapsValue(rows) {
  return rows.filter((r) => r.name.trim()).map((r) => {
    const entry = { name: r.name.trim() };
    if (r.as !== "volume") entry.as = r.as;
    if (r.as !== "env" && r.mountPath.trim()) entry.mountPath = r.mountPath.trim();
    if (r.source === "existing") entry.existingConfigMap = r.existingConfigMap.trim();
    else entry.data = Object.fromEntries(r.data.filter((d) => d.key.trim()).map((d) => [d.key.trim(), d.value]));
    return entry;
  });
}
function parseSecretRows(v) {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const r = asRecord(raw);
    return {
      name: typeof r.name === "string" ? r.name : "",
      as: r.as === "volume" || r.as === "both" ? r.as : "env",
      key: typeof r.key === "string" ? r.key : "",
      mountPath: typeof r.mountPath === "string" ? r.mountPath : "",
      shared: Boolean(r.shared ?? false)
    };
  });
}
function buildSecretsValue(rows) {
  return rows.filter((r) => r.name.trim()).map((r) => {
    const entry = { name: r.name.trim() };
    if (r.as !== "env") entry.as = r.as;
    if (r.as !== "volume" && r.key.trim()) entry.key = r.key.trim();
    if (r.as !== "env" && r.mountPath.trim()) entry.mountPath = r.mountPath.trim();
    if (r.shared) entry.shared = true;
    return entry;
  });
}
function parseProbe(raw) {
  const p = asRecord(raw);
  const timing = {
    initialDelaySeconds: typeof p.initialDelaySeconds === "number" ? p.initialDelaySeconds : "",
    periodSeconds: typeof p.periodSeconds === "number" ? p.periodSeconds : "",
    timeoutSeconds: typeof p.timeoutSeconds === "number" ? p.timeoutSeconds : "",
    successThreshold: typeof p.successThreshold === "number" ? p.successThreshold : "",
    failureThreshold: typeof p.failureThreshold === "number" ? p.failureThreshold : ""
  };
  if (p.httpGet) {
    const h = asRecord(p.httpGet);
    return { kind: "httpGet", path: typeof h.path === "string" ? h.path : "", port: h.port !== void 0 ? String(h.port) : "", command: "", ...timing };
  }
  if (p.tcpSocket) {
    const h = asRecord(p.tcpSocket);
    return { kind: "tcpSocket", path: "", port: h.port !== void 0 ? String(h.port) : "", command: "", ...timing };
  }
  if (p.exec) {
    const h = asRecord(p.exec);
    const cmd = Array.isArray(h.command) ? h.command.join("\n") : "";
    return { kind: "exec", path: "", port: "", command: cmd, ...timing };
  }
  return { kind: "none", path: "", port: "", command: "", ...timing };
}
function buildProbeValue(p) {
  if (p.kind === "none") return {};
  const timing = {};
  if (p.initialDelaySeconds !== "") timing.initialDelaySeconds = p.initialDelaySeconds;
  if (p.periodSeconds !== "") timing.periodSeconds = p.periodSeconds;
  if (p.timeoutSeconds !== "") timing.timeoutSeconds = p.timeoutSeconds;
  if (p.successThreshold !== "") timing.successThreshold = p.successThreshold;
  if (p.failureThreshold !== "") timing.failureThreshold = p.failureThreshold;
  const portValue = /^\d+$/.test(p.port.trim()) ? Number(p.port.trim()) : p.port.trim();
  if (p.kind === "httpGet") return { httpGet: { path: p.path.trim(), port: portValue }, ...timing };
  if (p.kind === "tcpSocket") return { tcpSocket: { port: portValue }, ...timing };
  return { exec: { command: p.command.split("\n").map((s) => s.trim()).filter(Boolean) }, ...timing };
}
function ProbeFields({ label, probe, onChange, classes }) {
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, style: { marginBottom: 6 }, children: label }),
    /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
      /* @__PURE__ */ jsx(Field, { label: "Type", classes, children: /* @__PURE__ */ jsxs(
        "select",
        {
          className: classes.select,
          value: probe.kind,
          onChange: (e) => onChange({ ...probe, kind: e.target.value }),
          children: [
            /* @__PURE__ */ jsx("option", { value: "none", children: "None" }),
            /* @__PURE__ */ jsx("option", { value: "httpGet", children: "HTTP GET" }),
            /* @__PURE__ */ jsx("option", { value: "tcpSocket", children: "TCP socket" }),
            /* @__PURE__ */ jsx("option", { value: "exec", children: "Exec command" })
          ]
        }
      ) }),
      probe.kind === "httpGet" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Field, { label: "Path", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. /healthz", value: probe.path, onChange: (e) => onChange({ ...probe, path: e.target.value }) }) }),
        /* @__PURE__ */ jsx(Field, { label: "Port", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. 3000", value: probe.port, onChange: (e) => onChange({ ...probe, port: e.target.value }) }) })
      ] }),
      probe.kind === "tcpSocket" && /* @__PURE__ */ jsx(Field, { label: "Port", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. 3000", value: probe.port, onChange: (e) => onChange({ ...probe, port: e.target.value }) }) })
    ] }),
    probe.kind === "exec" && /* @__PURE__ */ jsx(Field, { label: "Command (one argument per line)", classes, children: /* @__PURE__ */ jsx(
      "textarea",
      {
        className: classes.textarea,
        rows: 3,
        value: probe.command,
        onChange: (e) => onChange({ ...probe, command: e.target.value }),
        placeholder: "e.g. cat /tmp/healthy (one argument per line)"
      }
    ) }),
    probe.kind !== "none" && /* @__PURE__ */ jsxs("div", { className: classes.grid, style: { marginTop: 10 }, children: [
      /* @__PURE__ */ jsx(Field, { label: "Initial delay (s)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, type: "number", min: 0, value: probe.initialDelaySeconds, onChange: (e) => onChange({ ...probe, initialDelaySeconds: e.target.value === "" ? "" : Number(e.target.value) }) }) }),
      /* @__PURE__ */ jsx(Field, { label: "Period (s)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, type: "number", min: 1, value: probe.periodSeconds, onChange: (e) => onChange({ ...probe, periodSeconds: e.target.value === "" ? "" : Number(e.target.value) }) }) }),
      /* @__PURE__ */ jsx(Field, { label: "Timeout (s)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, type: "number", min: 1, value: probe.timeoutSeconds, onChange: (e) => onChange({ ...probe, timeoutSeconds: e.target.value === "" ? "" : Number(e.target.value) }) }) }),
      /* @__PURE__ */ jsx(Field, { label: "Success threshold", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, type: "number", min: 1, value: probe.successThreshold, onChange: (e) => onChange({ ...probe, successThreshold: e.target.value === "" ? "" : Number(e.target.value) }) }) }),
      /* @__PURE__ */ jsx(Field, { label: "Failure threshold", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, type: "number", min: 1, value: probe.failureThreshold, onChange: (e) => onChange({ ...probe, failureThreshold: e.target.value === "" ? "" : Number(e.target.value) }) }) })
    ] })
  ] });
}
const STANDARD_ANALYSIS_ARG = { name: "canary-hash", valueFrom: { podTemplateHashValue: "Latest" } };
function parseStepsSimple(steps) {
  if (steps === void 0) return [];
  if (!Array.isArray(steps)) return void 0;
  const result = [];
  for (const raw of steps) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
    const obj = raw;
    const keys = Object.keys(obj);
    if (keys.length !== 1) return void 0;
    if (keys[0] === "setWeight") {
      if (typeof obj.setWeight !== "number") return void 0;
      result.push({ kind: "weight", weight: obj.setWeight });
    } else if (keys[0] === "pause") {
      const p = asRecord(obj.pause);
      const pKeys = Object.keys(p);
      if (pKeys.length > 1 || pKeys.length === 1 && pKeys[0] !== "duration") return void 0;
      result.push({ kind: "pause", duration: typeof p.duration === "string" ? p.duration : "" });
    } else if (keys[0] === "analysis") {
      const a = asRecord(obj.analysis);
      const aKeys = new Set(Object.keys(a));
      if (!aKeys.has("templates") || !Array.isArray(a.templates)) return void 0;
      const extraKeys = [...aKeys].filter((k) => k !== "templates" && k !== "args");
      if (extraKeys.length > 0) return void 0;
      const templateRows = [];
      for (const t of a.templates) {
        if (!t || typeof t !== "object" || typeof t.templateName !== "string") return void 0;
        if (Object.keys(t).some((k) => k !== "templateName" && k !== "clusterScope")) return void 0;
        if (t.clusterScope !== void 0 && typeof t.clusterScope !== "boolean") return void 0;
        templateRows.push({ name: t.templateName, cluster: t.clusterScope === true });
      }
      const extraArgs = [];
      if (a.args !== void 0) {
        if (!Array.isArray(a.args) || a.args.length === 0) return void 0;
        const [first, ...rest] = a.args;
        if (JSON.stringify(first) !== JSON.stringify(STANDARD_ANALYSIS_ARG)) return void 0;
        for (const r of rest) {
          if (!r || typeof r !== "object" || typeof r.name !== "string" || typeof r.value !== "string" || Object.keys(r).length !== 2) {
            return void 0;
          }
          extraArgs.push({ name: r.name, value: r.value });
        }
      }
      result.push({ kind: "analysis", templates: templateRows, extraArgs });
    } else {
      return void 0;
    }
  }
  return result;
}
function buildStepsValue(steps) {
  return steps.map((s) => {
    if (s.kind === "weight") return { setWeight: s.weight === "" ? 0 : s.weight };
    if (s.kind === "pause") return s.duration.trim() ? { pause: { duration: s.duration.trim() } } : { pause: {} };
    const templates = s.templates.filter((t) => t.name.trim()).map((t) => ({ templateName: t.name.trim(), ...t.cluster ? { clusterScope: true } : {} }));
    const args = [{ name: "canary-hash", valueFrom: { podTemplateHashValue: "Latest" } }, ...s.extraArgs.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), value: a.value }))];
    return { analysis: { templates, args } };
  });
}
function defaultStep(kind) {
  if (kind === "weight") return { kind, weight: 50 };
  if (kind === "pause") return { kind, duration: "30s" };
  return { kind, templates: [], extraArgs: [] };
}
function clusterTemplatesSentence(names) {
  if (names === void 0) return " Cluster templates: Tower could not read the cluster's list, so a cluster template name is not checked.";
  return names.length > 0 ? ` Cluster templates: ${names.join(", ")}.` : " This cluster has no cluster templates.";
}
function StepsBuilder({
  steps,
  onChange,
  declaredTemplateNames,
  clusterTemplateNames,
  checkContext,
  classes
}) {
  const update = (i, next) => {
    const copy = [...steps];
    copy[i] = next;
    onChange(copy);
  };
  const remove = (i) => onChange(steps.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const copy = [...steps];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  const addStep = (kind) => onChange([...steps, defaultStep(kind)]);
  const addClusterCheck = (name) => {
    if (!checkContext) return;
    onChange([...steps, { kind: "analysis", templates: [{ name, cluster: true }], extraArgs: checkArgs(checkContext) }]);
  };
  const clusterChecksInUse = steps.flatMap((s) => s.kind === "analysis" ? s.templates.filter((t) => t.cluster).map((t) => t.name) : []);
  const updateExtraArg = (i, j, patch) => {
    const step = steps[i];
    if (step.kind !== "analysis") return;
    const nextArgs = [...step.extraArgs];
    nextArgs[j] = { ...nextArgs[j], ...patch };
    update(i, { ...step, extraArgs: nextArgs });
  };
  const removeExtraArg = (i, j) => {
    const step = steps[i];
    if (step.kind !== "analysis") return;
    update(i, { ...step, extraArgs: step.extraArgs.filter((_, k) => k !== j) });
  };
  const addExtraArg = (i) => {
    const step = steps[i];
    if (step.kind !== "analysis") return;
    update(i, { ...step, extraArgs: [...step.extraArgs, { name: "", value: "" }] });
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.rowList, children: [
    steps.length === 0 && /* @__PURE__ */ jsx(Typography, { className: classes.hint, style: { marginTop: 0 }, children: "No canary steps set - the platform default sequence will be used." }),
    steps.map((s, i) => /* @__PURE__ */ jsxs("div", { className: classes.stepCard, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.row, style: { alignItems: "flex-start" }, children: [
        /* @__PURE__ */ jsxs(Typography, { className: classes.stepNumber, children: [
          i + 1,
          "."
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.stepOrderCol, children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.orderBtn, disabled: i === 0, onClick: () => move(i, -1), title: "Move up", children: "\u25B2" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.orderBtn, disabled: i === steps.length - 1, onClick: () => move(i, 1), title: "Move down", children: "\u25BC" })
        ] }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            className: classes.select,
            value: s.kind,
            onChange: (e) => update(i, defaultStep(e.target.value)),
            children: [
              /* @__PURE__ */ jsx("option", { value: "weight", children: "Weight" }),
              /* @__PURE__ */ jsx("option", { value: "pause", children: "Pause" }),
              /* @__PURE__ */ jsx("option", { value: "analysis", children: "Analysis" })
            ]
          }
        ),
        s.kind === "weight" && /* @__PURE__ */ jsx(
          "input",
          {
            className: classes.input,
            type: "number",
            min: 0,
            max: 100,
            style: { width: 80 },
            value: s.weight,
            onChange: (e) => update(i, { kind: "weight", weight: e.target.value === "" ? "" : Number(e.target.value) })
          }
        ),
        s.kind === "pause" && /* @__PURE__ */ jsx(
          "input",
          {
            className: classes.input,
            placeholder: "e.g. 30s (empty: waits until promoted by hand)",
            value: s.duration,
            onChange: (e) => update(i, { kind: "pause", duration: e.target.value })
          }
        ),
        s.kind === "analysis" && /* @__PURE__ */ jsxs("div", { className: classes.rowList, style: { flex: 1, minWidth: 280 }, children: [
          s.templates.map((tpl, k) => {
            const setTpl = (patch) => update(i, { ...s, templates: s.templates.map((x, j) => j === k ? { ...x, ...patch } : x) });
            const suggestions = tpl.cluster ? clusterTemplateNames ?? [] : declaredTemplateNames;
            return /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
              /* @__PURE__ */ jsxs(
                "select",
                {
                  className: classes.select,
                  "aria-label": `Step ${i + 1} template ${k + 1} scope`,
                  value: tpl.cluster ? "cluster" : "namespace",
                  onChange: (e) => setTpl({ cluster: e.target.value === "cluster" }),
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "namespace", children: "Declared in this file" }),
                    /* @__PURE__ */ jsx("option", { value: "cluster", children: "Cluster template" })
                  ]
                }
              ),
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: classes.input,
                  list: `analysis-templates-${i}-${k}`,
                  "aria-label": `Step ${i + 1} template ${k + 1}`,
                  placeholder: "not set: a template name",
                  value: tpl.name,
                  onChange: (e) => setTpl({ name: e.target.value })
                }
              ),
              /* @__PURE__ */ jsx("datalist", { id: `analysis-templates-${i}-${k}`, children: suggestions.map((n) => /* @__PURE__ */ jsx("option", { value: n }, n)) }),
              /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => update(i, { ...s, templates: s.templates.filter((_, j) => j !== k) }), children: "Remove" })
            ] }, k);
          }),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => update(i, { ...s, templates: [...s.templates, { name: "", cluster: false }] }), children: "+ Add template" })
        ] }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => remove(i), children: "Remove" })
      ] }),
      s.kind === "analysis" && /* @__PURE__ */ jsxs("div", { style: { marginTop: 8, paddingLeft: 40 }, children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, children: "Args (canary-hash is added automatically)" }),
        /* @__PURE__ */ jsxs("div", { className: classes.rowList, style: { marginTop: 4 }, children: [
          s.extraArgs.map((a, j) => /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
            /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "arg name", value: a.name, onChange: (e) => updateExtraArg(i, j, { name: e.target.value }) }),
            /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "value", value: a.value, onChange: (e) => updateExtraArg(i, j, { value: e.target.value }) }),
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => removeExtraArg(i, j), children: "Remove" })
          ] }, j)),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => addExtraArg(i), children: "+ Add arg" })
        ] })
      ] })
    ] }, i)),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => addStep("weight"), children: "+ Weight step" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => addStep("pause"), children: "+ Pause step" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => addStep("analysis"), children: "+ Analysis step" })
    ] }),
    /* @__PURE__ */ jsxs(Typography, { className: classes.hint, children: [
      "An analysis step's first arg (canary-hash) is always generated automatically - add more above only if a template's own query references another one (e.g. a custom threshold).",
      declaredTemplateNames.length > 0 ? ` Declared in this file: ${declaredTemplateNames.join(", ")}.` : " None are declared in this file yet.",
      clusterTemplatesSentence(clusterTemplateNames),
      " ",
      "A template is looked up in the app's namespace unless it is marked as a cluster template; a wrong choice makes Argo reject the whole Rollout."
    ] }),
    checkContext && /* @__PURE__ */ jsx(
      ClusterCheckPicker,
      {
        templates: clusterTemplateNames,
        ctx: { app: checkContext.app, namespace: checkContext.namespace },
        cluster: checkContext.cluster,
        inUse: clusterChecksInUse,
        onAdd: addClusterCheck
      }
    )
  ] });
}
function ConfigMapsSection({ rows, onChange, classes }) {
  const update = (i, patch) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));
  const add = () => onChange([...rows, { name: "", as: "volume", mountPath: "", source: "data", existingConfigMap: "", data: [] }]);
  const updateDataRow = (i, j, patch) => {
    const row = rows[i];
    const nextData = [...row.data];
    nextData[j] = { ...nextData[j], ...patch };
    update(i, { data: nextData });
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.rowList, children: [
    rows.length === 0 && /* @__PURE__ */ jsx(Typography, { className: classes.hint, style: { marginTop: 0 }, children: "No config maps configured for this app." }),
    rows.map((row, i) => /* @__PURE__ */ jsxs("div", { className: classes.rowCard, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.rowCardHead, children: [
        /* @__PURE__ */ jsx("input", { className: classes.input, style: { flex: 1 }, placeholder: "name", value: row.name, onChange: (e) => update(i, { name: e.target.value }) }),
        /* @__PURE__ */ jsxs("select", { className: classes.select, value: row.as, onChange: (e) => update(i, { as: e.target.value }), children: [
          /* @__PURE__ */ jsx("option", { value: "volume", children: "Mount as volume" }),
          /* @__PURE__ */ jsx("option", { value: "env", children: "Expose as env vars" }),
          /* @__PURE__ */ jsx("option", { value: "both", children: "Both" })
        ] }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => remove(i), children: "Remove" })
      ] }),
      row.as !== "env" && /* @__PURE__ */ jsx(Field, { label: "Mount path (blank = /config/<name>)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: `default: /config/${row.name || "<name>"}`, value: row.mountPath, onChange: (e) => update(i, { mountPath: e.target.value }) }) }),
      /* @__PURE__ */ jsxs("div", { className: classes.radioRow, children: [
        /* @__PURE__ */ jsxs("label", { children: [
          /* @__PURE__ */ jsx("input", { type: "radio", checked: row.source === "data", onChange: () => update(i, { source: "data" }) }),
          " Managed here"
        ] }),
        /* @__PURE__ */ jsxs("label", { children: [
          /* @__PURE__ */ jsx("input", { type: "radio", checked: row.source === "existing", onChange: () => update(i, { source: "existing" }) }),
          " Existing ConfigMap"
        ] })
      ] }),
      row.source === "existing" ? /* @__PURE__ */ jsx(Field, { label: "Existing ConfigMap name", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, value: row.existingConfigMap, onChange: (e) => update(i, { existingConfigMap: e.target.value }) }) }) : /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, children: row.as === "env" ? "Data (env var name \u2192 value)" : "Data (file name \u2192 contents)" }),
        /* @__PURE__ */ jsxs("div", { className: classes.rowList, style: { marginTop: 4 }, children: [
          row.data.map((d, j) => /* @__PURE__ */ jsxs("div", { className: classes.row, style: { alignItems: "flex-start" }, children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                className: classes.input,
                placeholder: row.as === "env" ? "e.g. ENABLE_NEW_FEATURE" : "e.g. app-config.yaml",
                value: d.key,
                onChange: (e) => updateDataRow(i, j, { key: e.target.value })
              }
            ),
            /* @__PURE__ */ jsx(
              "textarea",
              {
                className: classes.textarea,
                style: { flex: 1 },
                rows: 2,
                placeholder: "contents",
                value: d.value,
                onChange: (e) => updateDataRow(i, j, { value: e.target.value })
              }
            ),
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => update(i, { data: row.data.filter((_, k) => k !== j) }), children: "Remove" })
          ] }, j)),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => update(i, { data: [...row.data, { key: "", value: "" }] }), children: "+ Add entry" })
        ] })
      ] })
    ] }, i)),
    /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: add, children: "+ Add config map" })
  ] });
}
function SecretsSection({ rows, onChange, classes }) {
  const update = (i, patch) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));
  const add = () => onChange([...rows, { name: "", as: "env", key: "", mountPath: "", shared: false }]);
  return /* @__PURE__ */ jsxs("div", { className: classes.rowList, children: [
    rows.length === 0 && /* @__PURE__ */ jsx(Typography, { className: classes.hint, style: { marginTop: 0 }, children: "No secrets configured for this app." }),
    rows.map((row, i) => /* @__PURE__ */ jsxs("div", { className: classes.rowCard, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.rowCardHead, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            className: classes.input,
            style: { flex: 1 },
            placeholder: "Infisical property name, e.g. db-password",
            value: row.name,
            onChange: (e) => update(i, { name: e.target.value })
          }
        ),
        /* @__PURE__ */ jsxs("select", { className: classes.select, value: row.as, onChange: (e) => update(i, { as: e.target.value }), children: [
          /* @__PURE__ */ jsx("option", { value: "env", children: "Env var" }),
          /* @__PURE__ */ jsx("option", { value: "volume", children: "Mounted file" }),
          /* @__PURE__ */ jsx("option", { value: "both", children: "Both" })
        ] }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => remove(i), children: "Remove" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
        row.as !== "volume" && /* @__PURE__ */ jsx(Field, { label: "Env var name (blank = NAME uppercased)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: row.name ? `default: ${row.name.toUpperCase()}` : "e.g. DB_PASSWORD", value: row.key, onChange: (e) => update(i, { key: e.target.value }) }) }),
        row.as !== "env" && /* @__PURE__ */ jsx(Field, { label: "Mount path (blank = /secrets/<name>)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: `default: /secrets/${row.name || "<name>"}`, value: row.mountPath, onChange: (e) => update(i, { mountPath: e.target.value }) }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(Switch, { checked: row.shared, onChange: (e) => update(i, { shared: e.target.checked }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Read from this app's shared Infisical store (reused across every env on this cluster)" })
      ] })
    ] }, i)),
    /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: add, children: "+ Add secret" }),
    /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: "References only - the actual secret values live in Infisical and are never edited here." })
  ] });
}
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
const ANALYSIS_TEMPLATES_EXAMPLE = `- name: boarding-api-no-restarts
  args:
    - name: canary-hash   # Argo Rollouts supplies the value; declare the NAME here
  metrics:
    - name: container-restarts
      interval: 1m
      count: 5
      successCondition: "result[0] == 0"
      provider:
        prometheus:
          address: http://kube-prometheus-stack-prometheus.observability.svc.cluster.local:9090
          query: |
            sum(increase(kube_pod_container_status_restarts_total{namespace="app-boarding-api-staging",pod=~".*-{{args.canary-hash}}-.*"}[5m])) or vector(0)`;
const ROLLOUT_STRATEGY_EXAMPLE = `# How a release rolls out. Canary steps (the Release tab's builder) are separate fields and are merged in on submit.
strategy: canary          # or: blueGreen

# canaryAnalysis: a background analysis that runs for the whole canary revision (a SIBLING of the steps builder, not one
# of its steps). Only used with strategy: canary. Every template it names must exist: either declared under Custom
# AnalysisTemplates in this file, or a cluster template (clusterScope: true). Tower checks this before a pull request opens.
# canaryAnalysis:
#   templates:
#     - templateName: boarding-api-no-restarts   # declared in this file
#     - templateName: pod-health-check           # a cluster template:
#       clusterScope: true
#   args:
#     - name: canary-hash
#       valueFrom: { podTemplateHashValue: Latest }
#   startingStep: 1

# blueGreen: only used with strategy: blueGreen. activeService and previewService are chart-owned.
# blueGreen:
#   autoPromotionEnabled: false
#   scaleDownDelaySeconds: 60`;
const ROLLOUT_POD_EXAMPLE = `# The pod itself. These are merged into the Rollout's pod template; the main container's image, ports,
# resources and probes have their own fields (Workload tab) and are not set here.

# Override the container's entrypoint and arguments:
command: ["/app/boarding-api"]
args: ["--log-level", "info"]

podSecurityContext:
  runAsNonRoot: true
  fsGroup: 2000
containerSecurityContext:
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false

# podSpec is deep-merged onto the pod spec: scheduling, DNS, lifecycle. NOT for the main container
# (use the fields above) or more containers (use extraContainers).
podSpec:
  terminationGracePeriodSeconds: 45
  nodeSelector:
    disktype: ssd
  tolerations:
    - key: dedicated
      operator: Equal
      value: apps
      effect: NoSchedule

# A sidecar, appended as-is to the pod's containers:
extraContainers:
  - name: log-shipper
    image: ghcr.io/example/log-shipper:1.4.2
    args: ["--source", "/var/log/app"]`;
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
- name: boarding-api-readiness-availability
  service: boarding-api
  objective: 99          # percent
  indicator:
    type: availability   # or: latency (needs latencyThreshold + a histogram with that le bucket)
    metric: prober_probe_total
    totalFilter: 'namespace="app-boarding-api-staging",container="boarding-api",probe_type="Readiness"'
    errorFilter: 'result!="successful"'`;
const ADVANCED_META = {
  // `promoted` sections render as regular sections, not behind the "Show advanced" toggle.
  components: {
    title: "Attached components (YAML)",
    hint: "Backing services provisioned alongside this app in this environment (Redis today; OAuth server, database and queue are declared kinds without an installed composition yet). Each entry needs a type and a name; spec is the kind's own settings.",
    example: COMPONENTS_EXAMPLE,
    field: "components",
    promoted: true
  },
  slos: {
    title: "SLOs",
    hint: "Service level objectives for this environment. Availability SLOs are the portable choice - latency SLOs need a histogram exposing the exact threshold bucket.",
    example: SLOS_EXAMPLE,
    field: "slos",
    promoted: true
  },
  rolloutStrategy: {
    title: "Rollout strategy",
    hint: "Strategy (canary or blueGreen), canaryAnalysis and blueGreen. The canary steps themselves have their own builder above and are merged in on submit. Only the keys that apply to the chosen strategy are used.",
    example: ROLLOUT_STRATEGY_EXAMPLE,
    field: "rollout"
  },
  rolloutPod: {
    title: "Pod template",
    hint: "command and args, the pod and container security contexts, extra (sidecar) containers, and podSpec for scheduling and lifecycle. Replicas, resources, probes and the Service ports have their own fields and are merged in on submit.",
    example: ROLLOUT_POD_EXAMPLE,
    field: "rollout"
  },
  analysisTemplates: {
    title: "Custom AnalysisTemplates",
    hint: "App-specific analysis templates referenced by name from the canary steps above.",
    example: ANALYSIS_TEMPLATES_EXAMPLE,
    field: "analysisTemplates"
  },
  volumes: { title: "Volumes (PVCs)", hint: "Persistent volume claims mounted into the main container.", example: VOLUMES_EXAMPLE, field: "volumes" },
  cronJobs: { title: "Cron jobs", hint: "Scheduled batch tasks (nightly cleanup, reports, ...).", example: CRONJOBS_EXAMPLE, field: "cronJobs" },
  jobs: { title: "One-off jobs", hint: "e.g. a pre-install DB-migration hook Job.", example: JOBS_EXAMPLE, field: "jobs" },
  extraManifests: {
    title: "Extra manifests",
    hint: "Last-resort escape hatch: a raw list of arbitrary Kubernetes objects.",
    example: EXTRA_MANIFESTS_EXAMPLE,
    field: "extraManifests"
  }
};
const ROLLOUT_STRATEGY_KEYS = ["strategy", "canaryAnalysis", "blueGreen", "rollbackWindow"];
const ROLLOUT_POD_KEYS = ["command", "args", "podSecurityContext", "containerSecurityContext", "extraContainers", "podSpec"];
const ROLLOUT_RAW_KEYS = ["rolloutStrategy", "rolloutPod"];
const DEFAULT_PORTS = [{ name: "http", containerPort: 8080, protocol: "" }];
function dumpOrBlank(v) {
  if (v === void 0 || v === null) return "";
  if (Array.isArray(v) && v.length === 0) return "";
  if (typeof v === "object" && Object.keys(v).length === 0) return "";
  return dump(v, { lineWidth: 100 }).trimEnd();
}
function annotationsPatch(original, rows) {
  const entries = rows.filter((a) => a.key.trim()).map((a) => [a.key.trim(), a.value]);
  if (entries.length > 0) return { annotations: Object.fromEntries(entries) };
  return original.annotations !== void 0 ? { annotations: {} } : {};
}
function annotationsPatchFor(original, field, rows) {
  const entries = rows.filter((a) => a.key.trim()).map((a) => [a.key.trim(), a.value]);
  if (entries.length > 0) return { [field]: Object.fromEntries(entries) };
  return original[field] !== void 0 ? { [field]: {} } : {};
}
function omitIfEmptyAndAbsent(original, key, value) {
  const empty = Array.isArray(value) ? value.length === 0 : value !== null && typeof value === "object" && Object.keys(value).length === 0;
  return empty && original[key] === void 0 ? {} : { [key]: value };
}
function parseAnnotationRows(v) {
  const rec = asRecord(v);
  return Object.entries(rec).map(([key, value]) => ({ key, value: String(value ?? "") }));
}
function buildFormState(values) {
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
  const envList = Array.isArray(values.env) ? values.env : [];
  const serviceAccount = asRecord(values.serviceAccount);
  const imagePullSecrets = Array.isArray(serviceAccount.imagePullSecrets) ? serviceAccount.imagePullSecrets.map((s) => ({ name: s.name ?? "" })) : [];
  const portsList = Array.isArray(rollout.ports) ? rollout.ports.map(
    (p) => ({
      name: p.name ?? "",
      containerPort: typeof p.containerPort === "number" ? p.containerPort : "",
      protocol: typeof p.protocol === "string" ? p.protocol : ""
    })
  ) : void 0;
  return {
    replicas: typeof rollout.replicas === "number" ? rollout.replicas : 2,
    ports: portsList && portsList.length > 0 ? portsList : DEFAULT_PORTS,
    resourcesRequestsCpu: typeof requests.cpu === "string" ? requests.cpu : "",
    resourcesRequestsMemory: typeof requests.memory === "string" ? requests.memory : "",
    resourcesLimitsCpu: typeof limits.cpu === "string" ? limits.cpu : "",
    resourcesLimitsMemory: typeof limits.memory === "string" ? limits.memory : "",
    liveness: parseProbe(rollout.livenessProbe),
    readiness: parseProbe(rollout.readinessProbe),
    autoscalingEnabled: Boolean(autoscaling.enabled ?? false),
    autoscalingMin: typeof autoscaling.min === "number" ? autoscaling.min : 2,
    autoscalingMax: typeof autoscaling.max === "number" ? autoscaling.max : 10,
    autoscalingTargetCPUPercent: typeof autoscaling.targetCPUPercent === "number" ? autoscaling.targetCPUPercent : 70,
    ingressEnabled: Boolean(ingress.enabled ?? false),
    ingressHost: typeof ingress.host === "string" ? ingress.host : "",
    ingressPath: typeof ingress.path === "string" ? ingress.path : "/",
    ingressPathType: typeof ingress.pathType === "string" ? ingress.pathType : "Prefix",
    ingressTls: Boolean(ingress.tls ?? false),
    ingressTlsSecretName: typeof ingress.tlsSecretName === "string" ? ingress.tlsSecretName : "",
    ingressAnnotations: parseAnnotationRows(ingress.annotations),
    httpRouteEnabled: Boolean(httpRoute.enabled ?? false),
    httpRouteHostnames: Array.isArray(httpRoute.hostnames) ? httpRoute.hostnames.join(", ") : "",
    httpRoutePath: typeof httpRoute.path === "string" ? httpRoute.path : "",
    httpRoutePathType: typeof httpRoute.pathType === "string" ? httpRoute.pathType : "",
    httpRouteAnnotations: parseAnnotationRows(httpRoute.annotations),
    httpRouteParentRefs: parseParentRefs(httpRoute.parentRefs),
    networkPolicyEnabled: Boolean(networkPolicy.enabled ?? true),
    networkPolicyAllowIngressFromIngressController: Boolean(networkPolicy.allowIngressFromIngressController ?? true),
    networkPolicyGatewayNs: gatewayNamespaceOf(networkPolicy.ingressControllerNamespaceSelector),
    networkPolicyGatewaySelectorYaml: dumpOrBlank(networkPolicy.ingressControllerNamespaceSelector),
    networkPolicyGatewayAdvanced: !isSimpleGatewaySelector(networkPolicy.ingressControllerNamespaceSelector),
    networkPolicyIngressFrom: parsePeers(networkPolicy.allowIngressFrom),
    networkPolicyEgressTo: parsePeers(networkPolicy.allowEgressTo),
    networkPolicyExtraIngress: dumpOrBlank(networkPolicy.extraIngressRules),
    networkPolicyExtraEgress: dumpOrBlank(networkPolicy.extraEgressRules),
    pdbEnabled: Boolean(pdb.enabled ?? false),
    pdbMinAvailable: pdb.minAvailable !== void 0 && pdb.minAvailable !== null ? String(pdb.minAvailable) : "1",
    pdbMaxUnavailable: pdb.maxUnavailable !== void 0 && pdb.maxUnavailable !== null ? String(pdb.maxUnavailable) : "",
    serviceMonitorEnabled: Boolean(serviceMonitor.enabled ?? true),
    serviceMonitorPath: typeof serviceMonitor.path === "string" ? serviceMonitor.path : "/metrics",
    serviceMonitorInterval: typeof serviceMonitor.interval === "string" ? serviceMonitor.interval : "30s",
    serviceMonitorPort: typeof serviceMonitor.port === "string" ? serviceMonitor.port : "",
    serviceMonitorLabels: parseAnnotationRows(serviceMonitor.additionalLabels),
    meta: Object.fromEntries(METADATA_FIELDS.map((m) => [m.field, parseAnnotationRows(rollout[m.field])])),
    slackEnabled: Boolean(slack.enabled ?? false),
    slackChannel: typeof slack.channel === "string" ? slack.channel : "",
    envVars: envList.map(parseEnvRow),
    configMaps: parseConfigMapRows(values.configMaps),
    secrets: parseSecretRows(values.secrets),
    serviceAccountCreate: Boolean(serviceAccount.create ?? true),
    serviceAccountName: typeof serviceAccount.name === "string" ? serviceAccount.name : "",
    serviceAccountAnnotations: parseAnnotationRows(serviceAccount.annotations),
    serviceAccountImagePullSecrets: imagePullSecrets
  };
}
function buildAdvancedYaml(values) {
  const rollout = asRecord(values.rollout);
  const pick = (keys) => Object.fromEntries(keys.filter((k) => rollout[k] !== void 0).map((k) => [k, rollout[k]]));
  return {
    rolloutStrategy: dumpOrBlank(pick(ROLLOUT_STRATEGY_KEYS)),
    rolloutPod: dumpOrBlank(pick(ROLLOUT_POD_KEYS)),
    analysisTemplates: dumpOrBlank(values.analysisTemplates),
    volumes: dumpOrBlank(values.volumes),
    cronJobs: dumpOrBlank(values.cronJobs),
    jobs: dumpOrBlank(values.jobs),
    components: dumpOrBlank(values.components),
    slos: dumpOrBlank(values.slos),
    extraManifests: dumpOrBlank(values.extraManifests)
  };
}
function validateBeforeSubmit(form, rolloutEnabled) {
  const errors = [];
  if (rolloutEnabled) {
    const namedPorts = form.ports.filter((p) => p.name.trim());
    if (namedPorts.length === 0) {
      errors.push("Service needs at least one named port (this becomes the Service/ingress target).");
    }
    for (const p of namedPorts) {
      if (p.containerPort === "" || p.containerPort < 1 || p.containerPort > 65535) {
        errors.push(`Service port "${p.name.trim()}" needs a valid containerPort (1-65535).`);
      }
    }
    const dupeNames = namedPorts.map((p) => p.name.trim()).filter((n, i, arr) => arr.indexOf(n) !== i);
    if (dupeNames.length > 0) {
      errors.push(`Service port names must be unique - duplicate: ${Array.from(new Set(dupeNames)).join(", ")}.`);
    }
  }
  if (rolloutEnabled) {
    for (const m of METADATA_FIELDS) errors.push(...metadataProblems(m.field, m.title, form.meta[m.field]));
  }
  if (form.ingressEnabled && !form.ingressHost.trim()) {
    errors.push("Ingress is enabled but has no host set.");
  }
  if (form.httpRouteEnabled && !form.httpRouteHostnames.trim()) {
    errors.push("HTTPRoute is enabled but has no hostnames set.");
  }
  if (form.httpRouteEnabled && form.httpRouteParentRefs.length === 0) {
    errors.push("HTTPRoute is enabled but has no parentRefs set.");
  }
  if (form.autoscalingEnabled && form.autoscalingMin !== "" && form.autoscalingMax !== "" && form.autoscalingMin > form.autoscalingMax) {
    errors.push("Autoscaling min replicas is greater than max replicas.");
  }
  if (form.networkPolicyGatewayAdvanced && form.networkPolicyGatewaySelectorYaml.trim()) {
    const parsed = validateYamlBlock(form.networkPolicyGatewaySelectorYaml);
    if (!parsed.valid || !parsed.parsed || typeof parsed.parsed !== "object" || Array.isArray(parsed.parsed)) {
      errors.push("Gateway namespace selector must be a YAML mapping (matchLabels and/or matchExpressions).");
    }
  }
  errors.push(...validatePeers(form.networkPolicyIngressFrom, "Network policy ingress source"));
  errors.push(...validatePeers(form.networkPolicyEgressTo, "Network policy egress destination"));
  for (const [what, text] of [["Network policy extra ingress rules", form.networkPolicyExtraIngress], ["Network policy extra egress rules", form.networkPolicyExtraEgress]]) {
    const { valid, parsed } = validateYamlBlock(text);
    if (valid && parsed !== void 0 && !Array.isArray(parsed)) errors.push(`${what} must be a YAML list of rules.`);
  }
  form.envVars.forEach((v, i) => {
    if (v.kind === "component" && v.name.trim() && (!v.component.trim() || !v.output.trim())) errors.push(`Environment variable ${v.name.trim()} takes its value from a component: choose the component and the output.`);
    if ((v.kind === "configMap" || v.kind === "secret") && v.name.trim() && (!v.refName.trim() || !v.refKey.trim())) errors.push(`Environment variable ${v.name.trim()} needs both a ${v.kind === "configMap" ? "config map" : "secret"} name and a key.`);
    if (!v.name.trim() && (v.value || v.refName || v.component)) errors.push(`Environment variable ${i + 1} has a value but no name.`);
  });
  if (form.pdbEnabled && form.pdbMinAvailable.trim() && form.pdbMaxUnavailable.trim()) {
    errors.push("PodDisruptionBudget: set at most one of minAvailable/maxUnavailable, not both.");
  }
  return errors;
}
const VALUES_TABS = [
  { id: "workload", label: "Workload" },
  { id: "release", label: "Release" },
  { id: "networking", label: "Networking" },
  { id: "config", label: "Config" },
  { id: "components", label: "Components" },
  { id: "access", label: "Access" },
  { id: "advanced", label: "Advanced" }
];
const ADVANCED_TAB = {
  rolloutStrategy: "release",
  rolloutPod: "workload",
  analysisTemplates: "release",
  slos: "release",
  volumes: "config",
  components: "components",
  cronJobs: "advanced",
  jobs: "advanced",
  extraManifests: "advanced"
};
function ConfigEditor({
  owner,
  appName,
  source,
  title,
  prod = false,
  layout = "side",
  copyFrom,
  analysisCluster,
  clusterAnalysisTemplates,
  sloContext,
  componentCatalog,
  chart,
  shared = false,
  workload
}) {
  const tokens = useHangarTokens();
  const classes = useStyles({ t: tokens });
  const ui = useUi({ t: tokens });
  const cfg = source;
  const submitCfg = { loading: source.submitting, result: source.result, error: source.submitError, reset: source.resetSubmit };
  const schema = useValuesSchema(owner);
  const [tab, setTab] = useState("workload");
  const [form, setForm] = useState(void 0);
  const [originalForm, setOriginalForm] = useState(void 0);
  const inheritedShape = workload?.view?.inherited ?? "service";
  const [rolloutEnabled, setRolloutEnabled] = useState(true);
  const [originalRolloutEnabled, setOriginalRolloutEnabled] = useState(true);
  const [advanced, setAdvanced] = useState(void 0);
  const [originalAdvanced, setOriginalAdvanced] = useState(void 0);
  const [stepsMode, setStepsMode] = useState("simple");
  const [stepsSimple, setStepsSimple] = useState([]);
  const [stepsRaw, setStepsRaw] = useState("");
  const [originalStepsRaw, setOriginalStepsRaw] = useState("");
  const [showRawFile, setShowRawFile] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(/* @__PURE__ */ new Set());
  useEffect(() => {
    if (cfg.data) {
      const builtForm = buildFormState(cfg.data.values);
      const builtAdvanced = buildAdvancedYaml(cfg.data.values);
      setForm(builtForm);
      setOriginalForm(builtForm);
      setAdvanced(builtAdvanced);
      setOriginalAdvanced(builtAdvanced);
      const rolloutIsSet = workloadOn(cfg.data.values.rollout, inheritedShape);
      setRolloutEnabled(rolloutIsSet);
      setOriginalRolloutEnabled(rolloutIsSet);
      const rollout = asRecord(cfg.data.values.rollout);
      const simple = parseStepsSimple(rollout.steps);
      setStepsMode(simple ? "simple" : "raw");
      setStepsSimple(simple ?? []);
      setStepsRaw(dumpOrBlank(rollout.steps));
      setOriginalStepsRaw(dumpOrBlank(rollout.steps));
      submitCfg.reset();
    }
  }, [cfg.data, inheritedShape]);
  const [copyNote, setCopyNote] = useState();
  const applyValues = (incoming) => {
    const values = { ...incoming };
    if (values.rollout && typeof values.rollout === "object") {
      const { image: _image, ...rest } = values.rollout;
      values.rollout = rest;
    }
    setForm(buildFormState(values));
    setAdvanced(buildAdvancedYaml(values));
    setRolloutEnabled(workloadOn(values.rollout, inheritedShape));
    const rollout = asRecord(values.rollout);
    const simple = parseStepsSimple(rollout.steps);
    setStepsMode(simple ? "simple" : "raw");
    setStepsSimple(simple ?? []);
    setStepsRaw(dumpOrBlank(rollout.steps));
  };
  const copyValues = async (id) => {
    if (!copyFrom || !id) return;
    const label = copyFrom.options.find((o) => o.id === id)?.label ?? id;
    setCopyNote({ text: `Loading the values of ${label}\u2026` });
    try {
      applyValues(await copyFrom.load(id));
      setCopyNote({ text: `Copied the values of ${label}. Review them in the pending changes; Discard all undoes it.` });
    } catch (e) {
      setCopyNote({ text: `Could not load the values of ${label}: ${String(e)}`, bad: true });
    }
  };
  if (cfg.error && !cfg.data) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(cfg.error) });
  if (cfg.loading || !form || !originalForm || !advanced || !originalAdvanced) return /* @__PURE__ */ jsx(Progress, {});
  if (cfg.error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(cfg.error) });
  if (!cfg.data) return null;
  const setF = (key, value, ..._fields) => {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  };
  const setAdv = (key, text) => {
    setAdvanced((prev) => prev ? { ...prev, [key]: text } : prev);
  };
  const setSteps = (next) => setStepsSimple(next);
  const setStepsRawText = (text) => setStepsRaw(text);
  const toggleExample = (key) => setExampleOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const canSwitchStepsToSimple = stepsMode === "raw" && parseStepsSimple(validateYamlBlock(stepsRaw).parsed) !== void 0;
  const toggleStepsMode = () => {
    if (stepsMode === "simple") {
      setStepsRaw(dumpOrBlank(buildStepsValue(stepsSimple)));
      setStepsMode("raw");
    } else if (canSwitchStepsToSimple) {
      const simple = parseStepsSimple(validateYamlBlock(stepsRaw).parsed);
      if (simple) {
        setStepsSimple(simple);
        setStepsMode("simple");
      }
    }
  };
  const declared = declaredComponents(validateYamlBlock(advanced.components).parsed);
  const componentOutputs = (name) => {
    const type = declared.find((c) => c.name === name)?.type ?? "";
    return catalogOutputs(componentCatalog, type) ?? outputsOf(type);
  };
  const matchOf = (row) => row.kind === "configMap" || row.kind === "secret" ? matchComponentOutput(declared, row.kind === "configMap" ? "configMapKeyRef" : "secretKeyRef", row.refName, row.refKey) : void 0;
  const declaredTemplateNames = (() => {
    const { parsed, valid } = validateYamlBlock(advanced.analysisTemplates);
    if (!valid || !Array.isArray(parsed)) return [];
    return parsed.map((t) => t.name).filter((n) => Boolean(n));
  })();
  const advancedInvalid = Object.keys(advanced).filter((k) => !validateYamlBlock(advanced[k]).valid);
  const stepsInvalid = stepsMode === "raw" && !validateYamlBlock(stepsRaw).valid;
  const analysisIssues = rolloutEnabled ? analysisProblems(
    templateRefs(
      stepsMode === "simple" ? buildStepsValue(stepsSimple) : validateYamlBlock(stepsRaw).parsed,
      asRecord(validateYamlBlock(advanced.rolloutStrategy).parsed)
    ),
    declaredTemplateNames,
    clusterAnalysisTemplates,
    analysisCluster
  ) : [];
  const componentIssues = componentCatalog ? componentProblems(componentCatalog, parseComponents(advanced.components) ?? []) : [];
  const structuralErrors = [...validateBeforeSubmit(form, rolloutEnabled), ...analysisIssues, ...componentIssues];
  const discard = () => {
    const builtForm = buildFormState(cfg.data.values);
    const builtAdvanced = buildAdvancedYaml(cfg.data.values);
    setForm(builtForm);
    setOriginalForm(builtForm);
    setAdvanced(builtAdvanced);
    setOriginalAdvanced(builtAdvanced);
    const rolloutIsSet = workloadOn(cfg.data.values.rollout, inheritedShape);
    setRolloutEnabled(rolloutIsSet);
    setOriginalRolloutEnabled(rolloutIsSet);
    const rollout = asRecord(cfg.data.values.rollout);
    const simple = parseStepsSimple(rollout.steps);
    setStepsMode(simple ? "simple" : "raw");
    setStepsSimple(simple ?? []);
    setStepsRaw(dumpOrBlank(rollout.steps));
    setOriginalStepsRaw(dumpOrBlank(rollout.steps));
    submitCfg.reset();
  };
  const fieldsChanged = (keys) => keys.some((k) => !deepEqual(form[k], originalForm[k]));
  const stepsCurrentText = stepsMode === "simple" ? dumpOrBlank(buildStepsValue(stepsSimple)) : stepsRaw;
  const dirty = /* @__PURE__ */ new Set();
  if (rolloutEnabled !== originalRolloutEnabled || rolloutEnabled && (fieldsChanged(["replicas", "ports", "resourcesRequestsCpu", "resourcesRequestsMemory", "resourcesLimitsCpu", "resourcesLimitsMemory", "liveness", "readiness", "meta"]) || advanced.rolloutStrategy !== originalAdvanced.rolloutStrategy || advanced.rolloutPod !== originalAdvanced.rolloutPod || stepsCurrentText !== originalStepsRaw)) {
    dirty.add("rollout");
  }
  if (fieldsChanged(["autoscalingEnabled", "autoscalingMin", "autoscalingMax", "autoscalingTargetCPUPercent"])) dirty.add("autoscaling");
  if (fieldsChanged(["ingressEnabled", "ingressHost", "ingressPath", "ingressPathType", "ingressTls", "ingressTlsSecretName", "ingressAnnotations"])) dirty.add("ingress");
  if (fieldsChanged(["httpRouteEnabled", "httpRouteHostnames", "httpRouteParentRefs", "httpRoutePath", "httpRoutePathType", "httpRouteAnnotations"])) dirty.add("httpRoute");
  if (fieldsChanged(["networkPolicyEnabled", "networkPolicyAllowIngressFromIngressController", "networkPolicyGatewayNs", "networkPolicyGatewaySelectorYaml", "networkPolicyGatewayAdvanced", "networkPolicyIngressFrom", "networkPolicyEgressTo", "networkPolicyExtraIngress", "networkPolicyExtraEgress"])) dirty.add("networkPolicy");
  if (fieldsChanged(["pdbEnabled", "pdbMinAvailable", "pdbMaxUnavailable"])) dirty.add("podDisruptionBudget");
  if (fieldsChanged(["serviceMonitorEnabled", "serviceMonitorPath", "serviceMonitorInterval", "serviceMonitorPort", "serviceMonitorLabels"])) dirty.add("serviceMonitor");
  if (fieldsChanged(["slackEnabled", "slackChannel"])) dirty.add("notifications");
  if (fieldsChanged(["envVars"])) dirty.add("env");
  if (fieldsChanged(["configMaps"])) dirty.add("configMaps");
  if (fieldsChanged(["secrets"])) dirty.add("secrets");
  if (fieldsChanged(["serviceAccountCreate", "serviceAccountName", "serviceAccountAnnotations", "serviceAccountImagePullSecrets"])) dirty.add("serviceAccount");
  Object.keys(ADVANCED_META).forEach((key) => {
    if (ROLLOUT_RAW_KEYS.includes(key)) return;
    if (advanced[key] !== originalAdvanced[key]) dirty.add(ADVANCED_META[key].field);
  });
  const buildPatchAndSummary = () => {
    const values = cfg.data.values;
    const patch = {};
    const summary = [];
    if (dirty.has("rollout") && !rolloutEnabled) {
      const kept = cfg.data.values.rollout;
      patch.rollout = { ...kept && typeof kept === "object" ? kept : {}, enabled: false };
      summary.push(
        shared ? "rollout: disabled in the shared values (no container in an environment that does not set its own)" : "rollout: disabled (no container deployed in this environment)"
      );
    } else if (dirty.has("rollout")) {
      const advancedParsed = {
        ...asRecord(validateYamlBlock(advanced.rolloutStrategy).parsed),
        ...asRecord(validateYamlBlock(advanced.rolloutPod).parsed)
      };
      const hasResources = Boolean(form.resourcesRequestsCpu || form.resourcesRequestsMemory || form.resourcesLimitsCpu || form.resourcesLimitsMemory);
      const origRollout = asRecord(cfg.data.values.rollout);
      const originalHadResources = origRollout.resources !== void 0;
      const stepsValue = stepsMode === "simple" ? buildStepsValue(stepsSimple) : validateYamlBlock(stepsRaw).parsed ?? [];
      patch.rollout = {
        ...advancedParsed,
        replicas: form.replicas === "" ? void 0 : form.replicas,
        ports: form.ports.filter((p) => p.name.trim()).map((p) => ({
          name: p.name.trim(),
          containerPort: p.containerPort === "" ? void 0 : p.containerPort,
          ...p.protocol ? { protocol: p.protocol } : {}
        })),
        // Left out when nothing is set and the file had none, so an edit elsewhere does not add `resources: {…{}}`.
        ...hasResources || originalHadResources ? {
          resources: {
            requests: {
              ...form.resourcesRequestsCpu ? { cpu: form.resourcesRequestsCpu } : {},
              ...form.resourcesRequestsMemory ? { memory: form.resourcesRequestsMemory } : {}
            },
            limits: {
              ...form.resourcesLimitsCpu ? { cpu: form.resourcesLimitsCpu } : {},
              ...form.resourcesLimitsMemory ? { memory: form.resourcesLimitsMemory } : {}
            }
          }
        } : {},
        ...Object.assign({}, ...METADATA_FIELDS.map((m) => annotationsPatchFor(asRecord(cfg.data.values.rollout), m.field, form.meta[m.field]))),
        ...omitIfEmptyAndAbsent(origRollout, "steps", stepsValue),
        ...omitIfEmptyAndAbsent(origRollout, "livenessProbe", buildProbeValue(form.liveness)),
        ...omitIfEmptyAndAbsent(origRollout, "readinessProbe", buildProbeValue(form.readiness)),
        // Said explicitly only when the shared values turn it off and this file must turn it back on; otherwise left
        // out (the chart default), which also drops an enabled: false this file had.
        ...inheritedShape === "none" ? { enabled: true } : {}
      };
      if (originalRolloutEnabled) {
        summary.push(
          `rollout: replicas/resources/probes/steps and/or pod-template settings ${originalRolloutEnabled ? "updated" : "set"}${shared ? " in the shared values" : ""}`
        );
      } else if (shared) {
        summary.push("rollout: enabled in the shared values (was off)");
      } else {
        summary.push("rollout: enabled (was off: a container will deploy in this environment with its next release)");
      }
      if (fieldsChanged(["ports"])) {
        summary.push(
          `service: ports set to ${form.ports.filter((p) => p.name.trim()).map((p) => `${p.name.trim()}:${p.containerPort}`).join(", ") || "(none)"}`
        );
      }
    }
    if (dirty.has("autoscaling")) {
      patch.autoscaling = {
        ...asRecord(values.autoscaling),
        enabled: form.autoscalingEnabled,
        min: form.autoscalingMin,
        max: form.autoscalingMax,
        targetCPUPercent: form.autoscalingTargetCPUPercent
      };
      summary.push(`autoscaling: ${form.autoscalingEnabled ? `enabled, ${form.autoscalingMin}-${form.autoscalingMax} replicas @ ${form.autoscalingTargetCPUPercent}% CPU` : "disabled"}`);
    }
    if (dirty.has("ingress")) {
      patch.ingress = {
        ...asRecord(values.ingress),
        enabled: form.ingressEnabled,
        host: form.ingressHost,
        path: form.ingressPath,
        pathType: form.ingressPathType,
        tls: form.ingressTls,
        tlsSecretName: form.ingressTlsSecretName.trim() || void 0,
        ...annotationsPatch(asRecord(values.ingress), form.ingressAnnotations)
      };
      summary.push(`ingress: ${form.ingressEnabled ? `enabled for ${form.ingressHost}` : "disabled"}`);
    }
    if (dirty.has("httpRoute")) {
      patch.httpRoute = {
        ...asRecord(values.httpRoute),
        enabled: form.httpRouteEnabled,
        hostnames: form.httpRouteHostnames.split(",").map((h) => h.trim()).filter(Boolean),
        path: form.httpRoutePath.trim() || void 0,
        pathType: form.httpRoutePathType || void 0,
        ...annotationsPatch(asRecord(values.httpRoute), form.httpRouteAnnotations),
        parentRefs: buildParentRefs(form.httpRouteParentRefs)
      };
      summary.push(`httpRoute: ${form.httpRouteEnabled ? `enabled for ${form.httpRouteHostnames}` : "disabled"}`);
    }
    if (dirty.has("networkPolicy")) {
      const orig = asRecord(values.networkPolicy);
      const list = (key, rows) => rows.length > 0 || orig[key] !== void 0 ? { [key]: rows } : {};
      const rawList = (key, text) => {
        const parsed = validateYamlBlock(text).parsed;
        return Array.isArray(parsed) ? list(key, parsed) : list(key, []);
      };
      patch.networkPolicy = {
        ...orig,
        enabled: form.networkPolicyEnabled,
        allowIngressFromIngressController: form.networkPolicyAllowIngressFromIngressController,
        ...gatewaySelectorPatch(orig.ingressControllerNamespaceSelector, form),
        ...list("allowIngressFrom", buildPeers(form.networkPolicyIngressFrom)),
        ...list("allowEgressTo", buildPeers(form.networkPolicyEgressTo)),
        ...rawList("extraIngressRules", form.networkPolicyExtraIngress),
        ...rawList("extraEgressRules", form.networkPolicyExtraEgress)
      };
      summary.push(`networkPolicy: ${form.networkPolicyEnabled ? "enabled" : "disabled"}`);
    }
    if (dirty.has("podDisruptionBudget")) {
      patch.podDisruptionBudget = {
        ...asRecord(values.podDisruptionBudget),
        enabled: form.pdbEnabled,
        minAvailable: form.pdbMinAvailable.trim() ? form.pdbMinAvailable.trim() : null,
        maxUnavailable: form.pdbMaxUnavailable.trim() ? form.pdbMaxUnavailable.trim() : null
      };
      summary.push(`podDisruptionBudget: ${form.pdbEnabled ? "enabled" : "disabled"}`);
    }
    if (dirty.has("serviceMonitor")) {
      patch.serviceMonitor = {
        ...asRecord(values.serviceMonitor),
        enabled: form.serviceMonitorEnabled,
        path: form.serviceMonitorPath,
        interval: form.serviceMonitorInterval,
        port: form.serviceMonitorPort.trim() || void 0,
        ...(() => {
          const a = annotationsPatch(asRecord(values.serviceMonitor).additionalLabels === void 0 ? {} : { annotations: 1 }, form.serviceMonitorLabels);
          return a.annotations === void 0 ? {} : { additionalLabels: a.annotations };
        })()
      };
      summary.push(`serviceMonitor: ${form.serviceMonitorEnabled ? `enabled, scraping ${form.serviceMonitorPath} every ${form.serviceMonitorInterval}` : "disabled"}`);
    }
    if (dirty.has("notifications")) {
      patch.notifications = { ...asRecord(values.notifications), slack: { enabled: form.slackEnabled, channel: form.slackChannel } };
      summary.push(`notifications.slack: ${form.slackEnabled ? `enabled${form.slackChannel ? ` (${form.slackChannel})` : ""}` : "disabled"}`);
    }
    if (dirty.has("env")) {
      patch.env = buildEnvValue(form.envVars);
      summary.push(`env: ${patch.env.length} variable(s) set`);
    }
    if (dirty.has("configMaps")) {
      const configMapsValue = buildConfigMapsValue(form.configMaps);
      patch.configMaps = configMapsValue;
      summary.push(`configMaps: ${configMapsValue.length} entries set`);
    }
    if (dirty.has("secrets")) {
      const secretsValue = buildSecretsValue(form.secrets);
      patch.secrets = secretsValue;
      summary.push(`secrets: ${secretsValue.length} entries set`);
    }
    if (dirty.has("serviceAccount")) {
      patch.serviceAccount = {
        ...asRecord(values.serviceAccount),
        create: form.serviceAccountCreate,
        name: form.serviceAccountName,
        annotations: Object.fromEntries(form.serviceAccountAnnotations.filter((a) => a.key.trim()).map((a) => [a.key.trim(), a.value])),
        imagePullSecrets: form.serviceAccountImagePullSecrets.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim() }))
      };
      summary.push("serviceAccount: updated");
    }
    Object.keys(ADVANCED_META).forEach((key) => {
      if (ROLLOUT_RAW_KEYS.includes(key)) return;
      const meta = ADVANCED_META[key];
      if (!dirty.has(meta.field)) return;
      const { parsed } = validateYamlBlock(advanced[key]);
      patch[meta.field] = parsed ?? (Array.isArray(values[meta.field]) ? [] : {});
      summary.push(`${meta.field}: updated`);
    });
    return { patch, summary };
  };
  const { patch: previewPatch, summary: previewSummary } = dirty.size > 0 ? buildPatchAndSummary() : { patch: {}, summary: [] };
  const schemaIssues = schema.data ? Object.keys(previewPatch).flatMap(
    (key) => validateAgainstSchema(schema.data.properties?.[key], schema.data, previewPatch[key], key)
  ) : [];
  const canSubmit = dirty.size > 0 && advancedInvalid.length === 0 && !stepsInvalid && validateYamlBlock(form.networkPolicyExtraIngress).valid && validateYamlBlock(form.networkPolicyExtraEgress).valid && structuralErrors.length === 0 && schemaIssues.length === 0 && !submitCfg.loading;
  const onSubmit = () => {
    const { patch, summary } = buildPatchAndSummary();
    source.submit(patch, summary);
  };
  const renderAdvancedSection = (key) => {
    const meta = ADVANCED_META[key];
    const isDirty = dirty.has(meta.field) && (ROLLOUT_RAW_KEYS.includes(key) ? dirty.has("rollout") : true);
    return /* @__PURE__ */ jsxs(Section, { title: meta.title, dirty: isDirty, classes, children: [
      key === "slos" && sloContext && /* @__PURE__ */ jsx(
        SloPresets,
        {
          ctx: { app: sloContext.app, namespace: sloContext.namespace },
          cluster: sloContext.cluster,
          text: advanced.slos,
          onChange: (text) => setAdv("slos", text)
        }
      ),
      /* @__PURE__ */ jsx(YamlBlockEditor, { label: meta.title, hint: meta.hint, value: advanced[key], onChange: (text) => setAdv(key, text) }),
      meta.example && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.linkBtn, style: { marginTop: 8 }, onClick: () => toggleExample(key), children: exampleOpen.has(key) ? "Hide example" : "Show example" }),
        exampleOpen.has(key) && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("pre", { className: classes.example, children: meta.example }),
          !advanced[key].trim() && /* @__PURE__ */ jsx("button", { type: "button", className: classes.linkBtn, style: { marginTop: 4 }, onClick: () => setAdv(key, meta.example), children: "Use this as a starting point" })
        ] })
      ] })
    ] }, key);
  };
  const fieldsDirty = (keys) => fieldsChanged(keys);
  const tabDirty = {
    workload: rolloutEnabled !== originalRolloutEnabled || fieldsDirty(["replicas", "ports", "resourcesRequestsCpu", "resourcesRequestsMemory", "resourcesLimitsCpu", "resourcesLimitsMemory", "liveness", "readiness", "meta"]) || dirty.has("autoscaling") || dirty.has("podDisruptionBudget") || dirty.has("serviceMonitor") || advanced.rolloutPod !== originalAdvanced.rolloutPod,
    release: stepsCurrentText !== originalStepsRaw || advanced.rolloutStrategy !== originalAdvanced.rolloutStrategy || dirty.has("notifications") || dirty.has("analysisTemplates") || dirty.has("slos"),
    networking: dirty.has("ingress") || dirty.has("httpRoute") || dirty.has("networkPolicy"),
    config: dirty.has("env") || dirty.has("configMaps") || dirty.has("volumes"),
    components: dirty.has("components"),
    access: dirty.has("serviceAccount") || dirty.has("secrets"),
    advanced: dirty.has("cronJobs") || dirty.has("jobs") || dirty.has("extraManifests")
  };
  const problems = [
    ...advancedInvalid.map((k) => `${ADVANCED_META[k].title}: fix the YAML syntax error before submitting.`),
    ...stepsInvalid ? ["Canary steps: fix the YAML syntax error before submitting."] : [],
    ...form.networkPolicyEnabled && (!validateYamlBlock(form.networkPolicyExtraIngress).valid || !validateYamlBlock(form.networkPolicyExtraEgress).valid) ? ["Network policy extra rules: fix the YAML syntax error before submitting."] : [],
    ...structuralErrors,
    ...schemaIssues.map((i) => `${i.path}: ${i.message}`)
  ];
  const notes = schema.error ? [`Couldn't load the chart's values.schema.json for extra validation (${schema.error}). The built-in checks still apply.`] : [];
  return /* @__PURE__ */ jsxs("div", { className: layout === "side" ? ui.sideBySide : void 0, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.columns, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionTitleRow, style: { marginBottom: 0 }, children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "Live values from GitHub - not polled, use refresh for the latest commit." }),
        /* @__PURE__ */ jsx(RefreshButton, { onClick: source.refresh })
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.advancedToggle, onClick: () => setShowFull((v) => !v), children: showFull ? "\u25BE Hide full values (annotated)" : "\u25B8 View full values (annotated)" }),
      showFull && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Typography, { className: classes.hint, children: [
          chart ? 'The chart defaults with this file laid over them, every field with its description; "# set here" marks what the file sets. Changes you have staged in the form are included.' : "Tower could not read the chart's schema, so this shows only the committed file.",
          dirty.size > 0 ? " (Showing your staged changes.)" : ""
        ] }),
        /* @__PURE__ */ jsx("pre", { className: classes.example, style: { maxHeight: 480, overflow: "auto" }, "aria-label": "Full values", children: annotateValues(chart, mergeValues(cfg.data.values, previewPatch)) })
      ] }),
      copyFrom && copyFrom.options.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsxs("select", { className: classes.input, "aria-label": "Copy values from", value: "", onChange: (e) => void copyValues(e.target.value), style: { maxWidth: 260 }, children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "Copy values from\u2026" }),
          copyFrom.options.map((o) => /* @__PURE__ */ jsx("option", { value: o.id, children: o.label }, o.id))
        ] }),
        copyNote && /* @__PURE__ */ jsx("span", { className: copyNote.bad ? ui.problem : ui.note, children: copyNote.text })
      ] }),
      /* @__PURE__ */ jsx(Subtabs, { label: "Values sections", value: tab, onChange: setTab, tabs: VALUES_TABS.map((x) => ({ ...x, marked: tabDirty[x.id] })) }),
      tab === "advanced" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.advancedToggle, onClick: () => setShowRawFile((v) => !v), children: showRawFile ? "\u25BE Hide full committed YAML" : "\u25B8 View full committed YAML" }),
        showRawFile && /* @__PURE__ */ jsx("pre", { className: classes.example, style: { maxHeight: 420, overflow: "auto" }, children: cfg.data.raw || `# Nothing committed yet at ${cfg.data.path} - this environment has no values file
# on its own branch/history. Submitting a change creates it.` })
      ] }),
      tab === "workload" && /* @__PURE__ */ jsxs(Section, { title: "Deployment", dirty: rolloutEnabled !== originalRolloutEnabled, classes, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
          /* @__PURE__ */ jsx(Switch, { checked: rolloutEnabled, onChange: (e) => setRolloutEnabled(e.target.checked) }),
          /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: shared ? "Run a service (Rollout) in each environment that does not set its own" : "Run a service (Rollout) in this environment" })
        ] }),
        /* @__PURE__ */ jsx(Typography, { className: classes.hint, style: { marginTop: 8 }, children: rolloutEnabled ? "Scaling, resources, health checks and canary steps below configure the Rollout. It runs once a release puts an image here. Turn this off if this environment should only run a Job, CronJob or other resource." : "No Rollout, Service, HPA or PodDisruptionBudget here (rollout.enabled: false): a deliberate choice for an environment that only runs a Job, CronJob or another XR. Releases to it are refused. Turn this on to run a service; the settings below come back as they were." }),
        !shared && workload?.view && /* @__PURE__ */ jsx(WorkloadStatus, { view: workload.view, live: workload.live, classes })
      ] }),
      rolloutEnabled && /* @__PURE__ */ jsxs(Fragment, { children: [
        tab === "workload" && /* @__PURE__ */ jsxs(Section, { title: "Scaling", dirty: dirty.has("rollout") || dirty.has("autoscaling"), classes, children: [
          /* @__PURE__ */ jsx("div", { className: classes.grid, children: /* @__PURE__ */ jsx(Field, { label: "Replicas", classes, children: /* @__PURE__ */ jsx(
            "input",
            {
              className: classes.input,
              type: "number",
              min: 0,
              value: form.replicas,
              onChange: (e) => setF("replicas", e.target.value === "" ? "" : Number(e.target.value), "rollout")
            }
          ) }) }),
          /* @__PURE__ */ jsxs("div", { className: classes.switchRow, style: { marginTop: 14 }, children: [
            /* @__PURE__ */ jsx(Switch, { checked: form.autoscalingEnabled, onChange: (e) => setF("autoscalingEnabled", e.target.checked, "autoscaling") }),
            /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Autoscaling (HPA)" })
          ] }),
          form.autoscalingEnabled && /* @__PURE__ */ jsxs("div", { className: classes.grid, style: { marginTop: 10 }, children: [
            /* @__PURE__ */ jsx(Field, { label: "Min replicas", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, type: "number", min: 1, value: form.autoscalingMin, onChange: (e) => setF("autoscalingMin", Number(e.target.value), "autoscaling") }) }),
            /* @__PURE__ */ jsx(Field, { label: "Max replicas", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, type: "number", min: 1, value: form.autoscalingMax, onChange: (e) => setF("autoscalingMax", Number(e.target.value), "autoscaling") }) }),
            /* @__PURE__ */ jsx(Field, { label: "Target CPU %", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, type: "number", min: 1, max: 100, value: form.autoscalingTargetCPUPercent, onChange: (e) => setF("autoscalingTargetCPUPercent", Number(e.target.value), "autoscaling") }) })
          ] })
        ] }),
        tab === "workload" && /* @__PURE__ */ jsx(Section, { title: "Resources", dirty: dirty.has("rollout"), classes, children: /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
          /* @__PURE__ */ jsx(Field, { label: "Request CPU", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. 100m", value: form.resourcesRequestsCpu, onChange: (e) => setF("resourcesRequestsCpu", e.target.value, "rollout") }) }),
          /* @__PURE__ */ jsx(Field, { label: "Request memory", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. 128Mi", value: form.resourcesRequestsMemory, onChange: (e) => setF("resourcesRequestsMemory", e.target.value, "rollout") }) }),
          /* @__PURE__ */ jsx(Field, { label: "Limit CPU", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. 500m", value: form.resourcesLimitsCpu, onChange: (e) => setF("resourcesLimitsCpu", e.target.value, "rollout") }) }),
          /* @__PURE__ */ jsx(Field, { label: "Limit memory", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. 256Mi", value: form.resourcesLimitsMemory, onChange: (e) => setF("resourcesLimitsMemory", e.target.value, "rollout") }) })
        ] }) }),
        tab === "workload" && /* @__PURE__ */ jsxs(Section, { title: "Service", dirty: dirty.has("rollout") && fieldsChanged(["ports"]), classes, children: [
          /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: "One Service port per entry below (this chart has no separate Service-level port - the Service, and the blueGreen preview Service if strategy is blueGreen, target containerPort directly). The first entry also doubles as the ingress/HTTPRoute target." }),
          /* @__PURE__ */ jsxs("div", { className: classes.rowList, style: { marginTop: 10 }, children: [
            form.ports.map((p, i) => /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: classes.input,
                  placeholder: "name (e.g. http)",
                  value: p.name,
                  onChange: (e) => {
                    const next = [...form.ports];
                    next[i] = { ...next[i], name: e.target.value };
                    setF("ports", next, "rollout");
                  }
                }
              ),
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: classes.input,
                  type: "number",
                  min: 1,
                  max: 65535,
                  placeholder: "containerPort",
                  value: p.containerPort,
                  onChange: (e) => {
                    const next = [...form.ports];
                    next[i] = { ...next[i], containerPort: e.target.value === "" ? "" : Number(e.target.value) };
                    setF("ports", next, "rollout");
                  }
                }
              ),
              /* @__PURE__ */ jsxs(
                "select",
                {
                  className: classes.input,
                  "aria-label": `Port ${i + 1} protocol`,
                  value: p.protocol,
                  onChange: (e) => {
                    const next = [...form.ports];
                    next[i] = { ...next[i], protocol: e.target.value };
                    setF("ports", next, "rollout");
                  },
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "", children: "TCP (default)" }),
                    /* @__PURE__ */ jsx("option", { value: "TCP", children: "TCP" }),
                    /* @__PURE__ */ jsx("option", { value: "UDP", children: "UDP" }),
                    /* @__PURE__ */ jsx("option", { value: "SCTP", children: "SCTP" })
                  ]
                }
              ),
              /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => setF("ports", form.ports.filter((_, j) => j !== i), "rollout"), children: "Remove" })
            ] }, i)),
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => setF("ports", [...form.ports, { name: "", containerPort: "", protocol: "" }], "rollout"), children: "+ Add port" })
          ] })
        ] }),
        tab === "workload" && /* @__PURE__ */ jsxs(Section, { title: "Labels and annotations", dirty: fieldsChanged(["meta"]), classes, children: [
          /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: "Extra labels and annotations on the pods, the Rollout and the Service. Labels and annotations the chart sets itself cannot be overridden." }),
          METADATA_FIELDS.map((m) => /* @__PURE__ */ jsx(
            AnnotationRows,
            {
              title: m.title,
              noun: m.noun,
              hint: m.hint,
              rows: form.meta[m.field],
              onChange: (rows) => setF("meta", { ...form.meta, [m.field]: rows }, "rollout"),
              classes
            },
            m.field
          ))
        ] }),
        tab === "workload" && /* @__PURE__ */ jsxs(Section, { title: "Health checks", dirty: dirty.has("rollout"), classes, children: [
          /* @__PURE__ */ jsx(ProbeFields, { label: "Liveness probe", probe: form.liveness, onChange: (p) => setF("liveness", p, "rollout"), classes }),
          /* @__PURE__ */ jsx("div", { style: { marginTop: 16 }, children: /* @__PURE__ */ jsx(ProbeFields, { label: "Readiness probe", probe: form.readiness, onChange: (p) => setF("readiness", p, "rollout"), classes }) })
        ] }),
        tab === "release" && analysisIssues.length > 0 && /* @__PURE__ */ jsxs("div", { role: "alert", className: ui.problem, style: { border: `1px solid ${tokens.bad}`, borderRadius: 6, padding: "10px 12px", marginTop: 10 }, children: [
          /* @__PURE__ */ jsx("b", { children: "Argo would reject this Rollout:" }),
          " it refers to an analysis template that does not exist where it is looked up.",
          /* @__PURE__ */ jsx("ul", { style: { margin: "6px 0 0", paddingLeft: 18 }, children: analysisIssues.map((m) => /* @__PURE__ */ jsx("li", { children: m }, m)) })
        ] }),
        tab === "release" && /* @__PURE__ */ jsxs(Section, { title: "Canary steps", dirty: dirty.has("rollout"), classes, children: [
          stepsMode === "simple" ? /* @__PURE__ */ jsx(StepsBuilder, { steps: stepsSimple, onChange: setSteps, declaredTemplateNames, clusterTemplateNames: clusterAnalysisTemplates, checkContext: sloContext, classes }) : /* @__PURE__ */ jsx(
            YamlBlockEditor,
            {
              label: "rollout.steps",
              hint: "This step list doesn't fit the simplified builder's Weight/Pause/Analysis shapes (e.g. setCanaryScale, an experiment, or custom analysis args) - edit the raw list here instead.",
              value: stepsRaw,
              onChange: setStepsRawText
            }
          ),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.linkBtn, style: { marginTop: 10 }, onClick: toggleStepsMode, disabled: stepsMode === "raw" && !canSwitchStepsToSimple, children: stepsMode === "simple" ? "Edit as raw YAML instead" : "Switch back to the simplified builder" }),
          stepsMode === "raw" && !canSwitchStepsToSimple && /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: "Can't switch to the builder: this YAML doesn't parse, or uses a step shape it can't represent." })
        ] })
      ] }),
      !rolloutEnabled && (tab === "workload" || tab === "release") && /* @__PURE__ */ jsxs("div", { className: ui.formSection, children: [
        /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
          tab === "workload" ? "Scaling, resources, the service and health checks configure a Rollout." : "Canary steps configure a Rollout.",
          " ",
          "This environment runs no service (",
          /* @__PURE__ */ jsx("code", { children: "rollout.enabled: false" }),
          "). Turn on Deployment to configure one."
        ] }),
        /* @__PURE__ */ jsx("div", { style: { marginTop: 10 }, children: /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setRolloutEnabled(true), children: "Turn on Deployment" }) })
      ] }),
      tab === "networking" && /* @__PURE__ */ jsxs(Section, { title: "Networking", dirty: dirty.has("ingress") || dirty.has("httpRoute") || dirty.has("networkPolicy"), classes, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
          /* @__PURE__ */ jsx(Switch, { checked: form.httpRouteEnabled, onChange: (e) => setF("httpRouteEnabled", e.target.checked, "httpRoute") }),
          /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Gateway API HTTPRoute" })
        ] }),
        form.httpRouteEnabled && /* @__PURE__ */ jsxs("div", { style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
            /* @__PURE__ */ jsx(Field, { label: "Hostnames (comma-separated)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. boarding-api.prod.kiac.local", value: form.httpRouteHostnames, onChange: (e) => setF("httpRouteHostnames", e.target.value, "httpRoute") }) }),
            /* @__PURE__ */ jsx(Field, { label: "Path (optional)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. /api", value: form.httpRoutePath, onChange: (e) => setF("httpRoutePath", e.target.value, "httpRoute") }) }),
            /* @__PURE__ */ jsx(Field, { label: "Path type", classes, children: /* @__PURE__ */ jsxs("select", { className: classes.input, value: form.httpRoutePathType, onChange: (e) => setF("httpRoutePathType", e.target.value, "httpRoute"), children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Chart default" }),
              /* @__PURE__ */ jsx("option", { value: "PathPrefix", children: "PathPrefix" }),
              /* @__PURE__ */ jsx("option", { value: "Exact", children: "Exact" }),
              /* @__PURE__ */ jsx("option", { value: "RegularExpression", children: "RegularExpression" })
            ] }) })
          ] }),
          /* @__PURE__ */ jsx(
            AnnotationRows,
            {
              title: "HTTPRoute annotations",
              rows: form.httpRouteAnnotations,
              onChange: (rows) => setF("httpRouteAnnotations", rows, "httpRoute"),
              classes
            }
          ),
          /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, style: { marginTop: 10 }, children: "Parent gateways" }),
          /* @__PURE__ */ jsxs("div", { className: classes.rowList, style: { marginTop: 6 }, children: [
            form.httpRouteParentRefs.map((ref, i) => /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: classes.input,
                  placeholder: "name (e.g. kiac)",
                  value: ref.name,
                  onChange: (e) => {
                    const next = [...form.httpRouteParentRefs];
                    next[i] = { ...next[i], name: e.target.value };
                    setF("httpRouteParentRefs", next, "httpRoute");
                  }
                }
              ),
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: classes.input,
                  placeholder: "namespace (e.g. kiac-gateway)",
                  value: ref.namespace,
                  onChange: (e) => {
                    const next = [...form.httpRouteParentRefs];
                    next[i] = { ...next[i], namespace: e.target.value };
                    setF("httpRouteParentRefs", next, "httpRoute");
                  }
                }
              ),
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: classes.input,
                  placeholder: "listener (optional sectionName)",
                  "aria-label": `Parent gateway ${i + 1} listener`,
                  value: ref.sectionName,
                  onChange: (e) => {
                    const next = [...form.httpRouteParentRefs];
                    next[i] = { ...next[i], sectionName: e.target.value };
                    setF("httpRouteParentRefs", next, "httpRoute");
                  }
                }
              ),
              /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => setF("httpRouteParentRefs", form.httpRouteParentRefs.filter((_, j) => j !== i), "httpRoute"), children: "Remove" })
            ] }, i)),
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => setF("httpRouteParentRefs", [...form.httpRouteParentRefs, { name: "", namespace: "", sectionName: "" }], "httpRoute"), children: "+ Add parent gateway" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.switchRow, style: { marginTop: 16 }, children: [
          /* @__PURE__ */ jsx(Switch, { checked: form.ingressEnabled, onChange: (e) => setF("ingressEnabled", e.target.checked, "ingress") }),
          /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Classic Ingress" })
        ] }),
        form.ingressEnabled && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: classes.grid, style: { marginTop: 10 }, children: [
            /* @__PURE__ */ jsx(Field, { label: "Host", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, value: form.ingressHost, onChange: (e) => setF("ingressHost", e.target.value, "ingress") }) }),
            /* @__PURE__ */ jsx(Field, { label: "Path", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, value: form.ingressPath, onChange: (e) => setF("ingressPath", e.target.value, "ingress") }) }),
            /* @__PURE__ */ jsx(Field, { label: "Path type", classes, children: /* @__PURE__ */ jsxs("select", { className: classes.select, value: form.ingressPathType, onChange: (e) => setF("ingressPathType", e.target.value, "ingress"), children: [
              /* @__PURE__ */ jsx("option", { children: "Prefix" }),
              /* @__PURE__ */ jsx("option", { children: "Exact" }),
              /* @__PURE__ */ jsx("option", { children: "ImplementationSpecific" })
            ] }) }),
            /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
              /* @__PURE__ */ jsx(Switch, { checked: form.ingressTls, onChange: (e) => setF("ingressTls", e.target.checked, "ingress") }),
              /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "TLS (cert-manager)" })
            ] }),
            form.ingressTls && /* @__PURE__ */ jsx(Field, { label: "TLS secret name (optional)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, value: form.ingressTlsSecretName, onChange: (e) => setF("ingressTlsSecretName", e.target.value, "ingress") }) })
          ] }),
          /* @__PURE__ */ jsx(
            AnnotationRows,
            {
              title: "Ingress annotations",
              rows: form.ingressAnnotations,
              onChange: (rows) => setF("ingressAnnotations", rows, "ingress"),
              classes
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.switchRow, style: { marginTop: 16 }, children: [
          /* @__PURE__ */ jsx(Switch, { checked: form.networkPolicyEnabled, onChange: (e) => setF("networkPolicyEnabled", e.target.checked, "networkPolicy") }),
          /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "NetworkPolicy" })
        ] }),
        form.networkPolicyEnabled && /* @__PURE__ */ jsxs("div", { style: { marginTop: 8 }, children: [
          /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
            /* @__PURE__ */ jsx(
              Switch,
              {
                checked: form.networkPolicyAllowIngressFromIngressController,
                onChange: (e) => setF("networkPolicyAllowIngressFromIngressController", e.target.checked, "networkPolicy")
              }
            ),
            /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Allow ingress from the gateway/ingress controller" })
          ] }),
          form.networkPolicyAllowIngressFromIngressController && /* @__PURE__ */ jsx("div", { className: classes.grid, style: { marginTop: 8 }, children: form.networkPolicyGatewayAdvanced ? /* @__PURE__ */ jsx("div", { style: { gridColumn: "1 / -1" }, children: /* @__PURE__ */ jsx(
            YamlBlockEditor,
            {
              label: "Gateway namespace selector",
              hint: "A Kubernetes namespace selector (matchLabels and/or matchExpressions). Empty: the chart default applies.",
              value: form.networkPolicyGatewaySelectorYaml,
              onChange: (t) => setF("networkPolicyGatewaySelectorYaml", t, "networkPolicy"),
              rows: 4
            }
          ) }) : /* @__PURE__ */ jsx(Field, { label: "Gateway namespace", classes, children: /* @__PURE__ */ jsx(
            "input",
            {
              className: classes.input,
              placeholder: "not set: the chart default applies",
              value: form.networkPolicyGatewayNs,
              onChange: (e) => setF("networkPolicyGatewayNs", e.target.value, "networkPolicy")
            }
          ) }) }),
          form.networkPolicyAllowIngressFromIngressController && !form.networkPolicyGatewayAdvanced && /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: classes.addBtn,
              onMouseDown: (e) => e.preventDefault(),
              onClick: () => {
                setF(
                  "networkPolicyGatewaySelectorYaml",
                  form.networkPolicyGatewayNs.trim() ? dumpOrBlank(withGatewayNamespace(void 0, form.networkPolicyGatewayNs.trim())) : form.networkPolicyGatewaySelectorYaml,
                  "networkPolicy"
                );
                setF("networkPolicyGatewayAdvanced", true, "networkPolicy");
              },
              children: "Edit the gateway selector as YAML"
            }
          ),
          /* @__PURE__ */ jsx(
            PeerList,
            {
              title: "Also allow ingress from",
              noun: "source",
              rows: form.networkPolicyIngressFrom,
              onChange: (rows) => setF("networkPolicyIngressFrom", rows, "networkPolicy"),
              classes
            }
          ),
          /* @__PURE__ */ jsx(
            PeerList,
            {
              title: "Allow egress to",
              noun: "destination",
              rows: form.networkPolicyEgressTo,
              onChange: (rows) => setF("networkPolicyEgressTo", rows, "networkPolicy"),
              classes
            }
          ),
          /* @__PURE__ */ jsx("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ jsx(
            YamlBlockEditor,
            {
              label: "Extra ingress rules (raw)",
              hint: "Real Kubernetes NetworkPolicy ingress rules, for shapes the lists above cannot say (UDP or SCTP, several peers ORed in one rule).",
              value: form.networkPolicyExtraIngress,
              onChange: (t) => setF("networkPolicyExtraIngress", t, "networkPolicy"),
              rows: 4
            }
          ) }),
          /* @__PURE__ */ jsx("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ jsx(
            YamlBlockEditor,
            {
              label: "Extra egress rules (raw)",
              hint: "Same shape, for egress.",
              value: form.networkPolicyExtraEgress,
              onChange: (t) => setF("networkPolicyExtraEgress", t, "networkPolicy"),
              rows: 4
            }
          ) })
        ] })
      ] }),
      tab === "workload" && /* @__PURE__ */ jsxs(Section, { title: "Availability", dirty: dirty.has("podDisruptionBudget") || dirty.has("serviceMonitor"), classes, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
          /* @__PURE__ */ jsx(Switch, { checked: form.pdbEnabled, onChange: (e) => setF("pdbEnabled", e.target.checked, "podDisruptionBudget") }),
          /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "PodDisruptionBudget" })
        ] }),
        form.pdbEnabled && /* @__PURE__ */ jsxs("div", { className: classes.grid, style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx(Field, { label: "Min available", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, value: form.pdbMinAvailable, onChange: (e) => setF("pdbMinAvailable", e.target.value, "podDisruptionBudget") }) }),
          /* @__PURE__ */ jsx(Field, { label: "Max unavailable", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, value: form.pdbMaxUnavailable, onChange: (e) => setF("pdbMaxUnavailable", e.target.value, "podDisruptionBudget") }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.switchRow, style: { marginTop: 16 }, children: [
          /* @__PURE__ */ jsx(Switch, { checked: form.serviceMonitorEnabled, onChange: (e) => setF("serviceMonitorEnabled", e.target.checked, "serviceMonitor") }),
          /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Prometheus ServiceMonitor" })
        ] }),
        form.serviceMonitorEnabled && /* @__PURE__ */ jsxs("div", { className: classes.grid, style: { marginTop: 10 }, children: [
          /* @__PURE__ */ jsx(Field, { label: "Metrics path", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, value: form.serviceMonitorPath, onChange: (e) => setF("serviceMonitorPath", e.target.value, "serviceMonitor") }) }),
          /* @__PURE__ */ jsx(Field, { label: "Scrape interval", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, value: form.serviceMonitorInterval, onChange: (e) => setF("serviceMonitorInterval", e.target.value, "serviceMonitor") }) }),
          /* @__PURE__ */ jsx(Field, { label: "Port name (optional)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "default: the service port", value: form.serviceMonitorPort, onChange: (e) => setF("serviceMonitorPort", e.target.value, "serviceMonitor") }) })
        ] }),
        form.serviceMonitorEnabled && /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(
          AnnotationRows,
          {
            title: "ServiceMonitor labels",
            noun: "label",
            hint: "Extra labels on the ServiceMonitor, for example the release label a Prometheus selects monitors by.",
            rows: form.serviceMonitorLabels,
            onChange: (rows) => setF("serviceMonitorLabels", rows, "serviceMonitor"),
            classes
          }
        ) })
      ] }),
      tab === "access" && /* @__PURE__ */ jsxs(Section, { title: "Service account", dirty: dirty.has("serviceAccount"), classes, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
          /* @__PURE__ */ jsx(Switch, { checked: form.serviceAccountCreate, onChange: (e) => setF("serviceAccountCreate", e.target.checked, "serviceAccount") }),
          /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Create a dedicated ServiceAccount" })
        ] }),
        form.serviceAccountCreate && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: classes.grid, style: { marginTop: 10 }, children: /* @__PURE__ */ jsx(Field, { label: "Name (blank = app name)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: `default: ${appName}`, value: form.serviceAccountName, onChange: (e) => setF("serviceAccountName", e.target.value, "serviceAccount") }) }) }),
          /* @__PURE__ */ jsx(
            AnnotationRows,
            {
              title: "Service account annotations",
              hint: "Annotations on the ServiceAccount (for example a cloud IAM role). The chart has no field for annotations on the pods or the Deployment.",
              rows: form.serviceAccountAnnotations,
              onChange: (rows) => setF("serviceAccountAnnotations", rows, "serviceAccount"),
              classes
            }
          ),
          /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, style: { marginTop: 12 }, children: "Extra image pull secrets" }),
          /* @__PURE__ */ jsxs("div", { className: classes.rowList, style: { marginTop: 6 }, children: [
            form.serviceAccountImagePullSecrets.map((s, i) => /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: classes.input,
                  placeholder: "existing Secret name",
                  value: s.name,
                  onChange: (e) => {
                    const next = [...form.serviceAccountImagePullSecrets];
                    next[i] = { name: e.target.value };
                    setF("serviceAccountImagePullSecrets", next, "serviceAccount");
                  }
                }
              ),
              /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => setF("serviceAccountImagePullSecrets", form.serviceAccountImagePullSecrets.filter((_, j) => j !== i), "serviceAccount"), children: "Remove" })
            ] }, i)),
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => setF("serviceAccountImagePullSecrets", [...form.serviceAccountImagePullSecrets, { name: "" }], "serviceAccount"), children: "+ Add pull secret" })
          ] }),
          /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: "Registry credentials are already attached to every namespace automatically - this is only for an additional, app-specific pull secret." })
        ] })
      ] }),
      tab === "release" && /* @__PURE__ */ jsxs(Section, { title: "Notifications", dirty: dirty.has("notifications"), classes, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
          /* @__PURE__ */ jsx(Switch, { checked: form.slackEnabled, onChange: (e) => setF("slackEnabled", e.target.checked, "notifications") }),
          /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "AI-triage Slack notifications" })
        ] }),
        form.slackEnabled && /* @__PURE__ */ jsx("div", { className: classes.grid, style: { marginTop: 10 }, children: /* @__PURE__ */ jsx(Field, { label: "Channel (optional)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. #your-channel", value: form.slackChannel, onChange: (e) => setF("slackChannel", e.target.value, "notifications") }) }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: "The webhook URL itself is never edited here - it's an Infisical secret, not a values.yaml field." })
      ] }),
      tab === "config" && /* @__PURE__ */ jsx(Section, { title: "Environment variables", dirty: dirty.has("env"), classes, children: /* @__PURE__ */ jsxs("div", { className: classes.rowList, children: [
        form.envVars.map((v, i) => {
          const setRow = (patch) => {
            const next = [...form.envVars];
            next[i] = { ...next[i], ...patch };
            setF("envVars", next, "env");
          };
          return /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
            /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "NAME", "aria-label": `Variable ${i + 1} name`, value: v.name, onChange: (e) => setRow({ name: e.target.value }) }),
            v.kind === "other" ? /* @__PURE__ */ jsxs("span", { className: classes.hint, style: { flex: 2 }, children: [
              "Taken from ",
              Object.keys(asRecord(v.other))[0] ?? "another source",
              " (kept as it is; edit it under Advanced if needed)"
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsxs("select", { className: classes.input, "aria-label": `Variable ${i + 1} source`, value: v.kind, onChange: (e) => setRow({ kind: e.target.value }), children: [
                /* @__PURE__ */ jsx("option", { value: "value", children: "Value" }),
                /* @__PURE__ */ jsx("option", { value: "configMap", children: "From config map" }),
                /* @__PURE__ */ jsx("option", { value: "secret", children: "From secret" }),
                /* @__PURE__ */ jsx("option", { value: "component", children: "From component" })
              ] }),
              v.kind === "value" && /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "value", "aria-label": `Variable ${i + 1} value`, value: v.value, onChange: (e) => setRow({ value: e.target.value }) }),
              v.kind === "component" && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    className: classes.input,
                    "aria-label": `Variable ${i + 1} component`,
                    value: v.component,
                    onChange: (e) => setRow({ component: e.target.value, output: "" }),
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "", children: "Choose a component\u2026" }),
                      declared.map((c) => /* @__PURE__ */ jsxs("option", { value: c.name, children: [
                        c.name,
                        " (",
                        c.type,
                        ")"
                      ] }, c.name)),
                      v.component && !declared.some((c) => c.name === v.component) && /* @__PURE__ */ jsxs("option", { value: v.component, children: [
                        v.component,
                        " (not declared)"
                      ] })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs("select", { className: classes.input, "aria-label": `Variable ${i + 1} output`, value: v.output, onChange: (e) => setRow({ output: e.target.value }), children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "Choose an output\u2026" }),
                  componentOutputs(v.component).map((o) => /* @__PURE__ */ jsx("option", { value: o, children: o }, o)),
                  v.output && !componentOutputs(v.component).includes(v.output) && /* @__PURE__ */ jsx("option", { value: v.output, children: v.output })
                ] })
              ] }),
              (v.kind === "configMap" || v.kind === "secret") && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    className: classes.input,
                    placeholder: v.kind === "configMap" ? "config map name" : "secret name",
                    "aria-label": `Variable ${i + 1} ${v.kind === "configMap" ? "config map" : "secret"} name`,
                    value: v.refName,
                    onChange: (e) => setRow({ refName: e.target.value })
                  }
                ),
                /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "key", "aria-label": `Variable ${i + 1} key`, value: v.refKey, onChange: (e) => setRow({ refKey: e.target.value }) }),
                matchOf(v) && /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    className: classes.linkBtn,
                    title: "airframe-validate warns about this (AF-COMP-003): a component's own output should be referenced as a component, so a rename cannot break it silently",
                    onClick: () => {
                      const m = matchOf(v);
                      if (m) setRow({ kind: "component", component: m.name, output: m.output, refName: "", refKey: "" });
                    },
                    children: [
                      "Use component ",
                      matchOf(v)?.name,
                      ".",
                      matchOf(v)?.output,
                      " instead"
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => setF("envVars", form.envVars.filter((_, j) => j !== i), "env"), children: "Remove" })
          ] }, i);
        }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => setF("envVars", [...form.envVars, { name: "", kind: "value", value: "", refName: "", refKey: "", component: "", output: "" }], "env"), children: "+ Add variable" })
      ] }) }),
      tab === "config" && /* @__PURE__ */ jsx(Section, { title: "Config maps", dirty: dirty.has("configMaps"), classes, children: /* @__PURE__ */ jsx(ConfigMapsSection, { rows: form.configMaps, onChange: (rows) => setF("configMaps", rows), classes }) }),
      tab === "access" && /* @__PURE__ */ jsx(Section, { title: "Secrets", dirty: dirty.has("secrets"), classes, children: /* @__PURE__ */ jsx(SecretsSection, { rows: form.secrets, onChange: (rows) => setF("secrets", rows), classes }) }),
      tab === "components" && /* @__PURE__ */ jsxs(Section, { title: "Components", dirty: dirty.has("components"), classes, children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.hint, style: { marginTop: 0, marginBottom: 10 }, children: "Backing services attached to this environment: a cache, a database, a message broker. Each is created next to your app and hands it a connection through a Secret or ConfigMap." }),
        /* @__PURE__ */ jsx(ComponentsEditor, { text: advanced.components, onChange: (text) => setAdv("components", text), defs: componentCatalog })
      ] }),
      Object.keys(ADVANCED_META).filter((key) => ADVANCED_TAB[key] === tab).map((key) => renderAdvancedSection(key))
    ] }),
    /* @__PURE__ */ jsxs(
      PendingPanel,
      {
        lines: previewSummary.map((title2) => ({ title: title2 })),
        problems,
        notes,
        heading: prod ? `Pending changes to ${title}` : "Pending changes",
        "aria-label": `Pending changes to the values of ${title}`,
        emptyText: "Nothing staged. Edit a field and it appears here.",
        stick: layout === "side" ? "top" : "bottom",
        busy: submitCfg.loading,
        canSubmit,
        submitLabel: "Open pull request",
        onDiscard: discard,
        onSubmit,
        children: [
          /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
            title,
            ": ",
            cfg.data.path,
            ". This file has its own pull request."
          ] }),
          submitCfg.result && /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
            submitCfg.result.alreadyOpen ? "A PR for this exact change is already open: " : "PR opened: ",
            /* @__PURE__ */ jsx(Link, { className: classes.resultLink, href: submitCfg.result.prUrl, target: "_blank", rel: "noopener noreferrer", children: submitCfg.result.prUrl })
          ] }),
          submitCfg.error && /* @__PURE__ */ jsxs("div", { className: ui.problem, children: [
            "Couldn't open PR: ",
            submitCfg.error
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx(PrResultDialog, { result: submitCfg.result, error: submitCfg.error, onClose: () => submitCfg.reset() })
  ] });
}
function Section({ title, dirty, children }) {
  const t = useHangarTokens();
  const ui = useUi({ t });
  return /* @__PURE__ */ jsxs("div", { className: ui.formSection, children: [
    /* @__PURE__ */ jsxs("h3", { className: ui.formSectionTitle, children: [
      title,
      dirty && /* @__PURE__ */ jsx("i", { className: ui.marker, role: "img", "aria-label": "changed" })
    ] }),
    children
  ] });
}
function AnnotationRows({
  title,
  hint,
  rows,
  onChange,
  classes,
  noun = "annotation"
}) {
  const set = (i, patch) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  return /* @__PURE__ */ jsxs("div", { style: { marginTop: 12 }, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, children: title }),
    hint && /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: hint }),
    /* @__PURE__ */ jsxs("div", { className: classes.rowList, style: { marginTop: 6 }, children: [
      rows.map((a, i) => /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: `${noun} key`, "aria-label": `${title} ${i + 1} key`, value: a.key, onChange: (e) => set(i, { key: e.target.value }) }),
        /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "value", "aria-label": `${title} ${i + 1} value`, value: a.value, onChange: (e) => set(i, { value: e.target.value }) }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => onChange(rows.filter((_, j) => j !== i)), children: "Remove" })
      ] }, i)),
      /* @__PURE__ */ jsxs("button", { type: "button", className: classes.addBtn, onClick: () => onChange([...rows, { key: "", value: "" }]), children: [
        "+ Add ",
        noun
      ] })
    ] })
  ] });
}
function PeerList({
  title,
  noun,
  rows,
  onChange,
  classes
}) {
  const set = (i, patch) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  return /* @__PURE__ */ jsxs("div", { style: { marginTop: 12 }, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, children: title }),
    /* @__PURE__ */ jsxs("div", { className: classes.rowList, style: { marginTop: 6 }, children: [
      rows.map((r, i) => /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsxs("select", { className: classes.input, "aria-label": `${title} ${i + 1} kind`, value: r.kind, onChange: (e) => set(i, { kind: e.target.value }), children: [
          /* @__PURE__ */ jsx("option", { value: "namespace", children: "Namespace" }),
          /* @__PURE__ */ jsx("option", { value: "cidr", children: "CIDR" })
        ] }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: classes.input,
            "aria-label": `${title} ${i + 1} ${r.kind === "cidr" ? "CIDR" : "namespace"}`,
            placeholder: r.kind === "cidr" ? "not set: a CIDR such as 10.0.0.0/8" : "not set: a namespace name",
            value: r.target,
            onChange: (e) => set(i, { target: e.target.value })
          }
        ),
        r.kind === "namespace" && /* @__PURE__ */ jsx(
          "input",
          {
            className: classes.input,
            "aria-label": `${title} ${i + 1} pod labels`,
            placeholder: "pod labels: key=value, key=value (optional)",
            value: r.podLabels,
            onChange: (e) => set(i, { podLabels: e.target.value })
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: classes.input,
            style: { maxWidth: 150 },
            "aria-label": `${title} ${i + 1} ports`,
            placeholder: "ports (all if empty)",
            value: r.ports,
            onChange: (e) => set(i, { ports: e.target.value })
          }
        ),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => onChange(rows.filter((_, j) => j !== i)), children: "Remove" })
      ] }, i)),
      /* @__PURE__ */ jsxs("button", { type: "button", className: classes.addBtn, onClick: () => onChange([...rows, blankPeer()]), children: [
        "+ Add ",
        noun
      ] })
    ] })
  ] });
}
function Field({ label, classes, children }) {
  return /* @__PURE__ */ jsxs("label", { className: classes.field, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, children: label }),
    children
  ] });
}
function WorkloadStatus({ view, live, classes }) {
  const status = workloadStatus(view);
  const liveTag = live?.image ? live.image.slice(live.image.lastIndexOf(":") + 1) : void 0;
  return /* @__PURE__ */ jsxs("div", { "data-testid": "workload-status", style: { marginTop: 10 }, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: /* @__PURE__ */ jsx("b", { children: status.text }) }),
    live && (status.kind === "deployed" || live.deployed) && /* @__PURE__ */ jsxs(Typography, { className: classes.hint, children: [
      live.deployed ? `Running: ${liveTag ?? "an image"}${live.health ? ` (${live.health})` : ""}` : "Running: nothing yet",
      status.kind === "deployed" && live.deployed && liveTag && liveTag !== view.release?.tag ? " - not the released image yet: a rollout may be in progress, or Argo CD has not synced." : ""
    ] })
  ] });
}

export { ConfigEditor };
//# sourceMappingURL=ValuesForm.esm.js.map

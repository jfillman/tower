import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Switch from '@material-ui/core/Switch';
import Link from '@material-ui/core/Link';
import WarningRoundedIcon from '@material-ui/icons/WarningRounded';
import { dump } from 'js-yaml';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { TowerEmptyState } from '../TowerEmptyState.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';
import { useEnvXr, useSubmitEnvXrChange, useConfigMapFiles, useSubmitConfigMapFiles, useAppConfig, useSubmitConfigChange, useValuesSchema } from '../useConfigData.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { PrResultDialog } from '../PrResultDialog.esm.js';
import { preventFocusScroll } from '../preventFocusScroll.esm.js';
import { validateYamlBlock, YamlBlockEditor } from '../YamlBlockEditor.esm.js';
import { validateAgainstSchema } from '../schemaValidate.esm.js';
import { deepEqual } from '../deepEqual.esm.js';

function isProdEnv(env) {
  return /^(prod|production)$/i.test(env);
}
const useStyles = makeStyles(() => ({
  envBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    padding: "14px 18px",
    borderRadius: 6,
    marginBottom: 16,
    border: "2px solid"
  },
  envBannerProd: { borderColor: ({ t }) => t.bad, backgroundColor: ({ t }) => t.badSoft },
  envBannerOther: { borderColor: ({ t }) => t.amberLine, backgroundColor: ({ t }) => t.amberSoft },
  envBannerLeft: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  envBannerTitle: { fontFamily: fontDisplay, fontWeight: 800, fontSize: 18, letterSpacing: "0.02em" },
  envBannerTitleProd: { color: ({ t }) => t.bad },
  envBannerTitleOther: { color: ({ t }) => t.amberInk },
  envBannerPath: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  select: {
    fontFamily: fontMono,
    fontSize: 12.5,
    padding: "5px 10px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi
  },
  columns: { display: "flex", flexDirection: "column", gap: 16 },
  section: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: "16px 18px"
  },
  sectionDirty: { borderColor: ({ t }) => t.amberLine },
  sectionTitleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14.5, color: ({ t }) => t.textHi },
  dirtyDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    marginLeft: 8,
    backgroundColor: ({ t }) => t.amber,
    verticalAlign: "middle"
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  fieldLabel: { fontSize: 11.5, color: ({ t }) => t.textLo },
  input: {
    fontFamily: fontMono,
    fontSize: 12.5,
    padding: "6px 9px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.bgRaised,
    color: ({ t }) => t.textHi,
    "&:focus": { outline: "none", borderColor: ({ t }) => t.sky }
  },
  textarea: {
    fontFamily: fontMono,
    fontSize: 12.5,
    padding: "6px 9px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.bgRaised,
    color: ({ t }) => t.textHi,
    resize: "vertical",
    "&:focus": { outline: "none", borderColor: ({ t }) => t.sky }
  },
  switchRow: { display: "flex", alignItems: "center", gap: 8 },
  switchLabel: { fontSize: 13, color: ({ t }) => t.textHi },
  hint: { fontSize: 11.5, fontStyle: "italic", color: ({ t }) => t.textFaint, marginTop: 8 },
  advancedToggle: {
    fontFamily: fontMono,
    fontSize: 11.5,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: ({ t }) => t.sky,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    marginBottom: 12
  },
  linkBtn: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    "&:disabled": { color: ({ t }) => t.textFaint, cursor: "not-allowed" }
  },
  rowList: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  stepCard: {
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 4,
    padding: 8
  },
  rowCard: {
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 4,
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  rowCardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  radioRow: { display: "flex", gap: 14, alignItems: "center", fontSize: 12.5, color: ({ t }) => t.textHi },
  stepNumber: {
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.textFaint,
    minWidth: 16,
    textAlign: "right",
    paddingTop: 6
  },
  stepOrderCol: { display: "flex", flexDirection: "column", gap: 2 },
  orderBtn: {
    fontFamily: fontMono,
    fontSize: 10,
    lineHeight: 1,
    padding: "2px 5px",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 3,
    background: "none",
    color: ({ t }) => t.textLo,
    cursor: "pointer",
    "&:disabled": { opacity: 0.35, cursor: "not-allowed" }
  },
  removeBtn: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.bad,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px 6px"
  },
  addBtn: {
    alignSelf: "flex-start",
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.sky,
    background: "none",
    border: ({ t }) => `1px dashed ${t.skyLine}`,
    borderRadius: 4,
    cursor: "pointer",
    padding: "5px 10px"
  },
  reviewBar: {
    position: "sticky",
    bottom: 0,
    marginTop: 20,
    padding: "14px 18px",
    borderRadius: 6,
    border: "2px solid",
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  reviewBarProd: { borderColor: ({ t }) => t.bad, backgroundColor: ({ t }) => t.badSoft },
  reviewBarOther: { borderColor: ({ t }) => t.amberLine, backgroundColor: ({ t }) => t.amberSoft },
  reviewHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 },
  reviewTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14 },
  reviewTitleProd: { color: ({ t }) => t.bad },
  reviewTitleOther: { color: ({ t }) => t.amberInk },
  reviewList: { fontSize: 12.5, color: ({ t }) => t.textLo, margin: 0, paddingLeft: 18 },
  errorList: { fontSize: 12.5, color: ({ t }) => t.bad, margin: 0, paddingLeft: 18 },
  btn: {
    fontFamily: fontMono,
    fontSize: 12,
    letterSpacing: "0.03em",
    padding: "7px 16px",
    borderRadius: 4,
    cursor: "pointer",
    border: ({ t }) => `1px solid ${t.amberLine}`,
    backgroundColor: "transparent",
    color: ({ t }) => t.amberInk,
    "&:disabled": { opacity: 0.5, cursor: "not-allowed" }
  },
  discardBtn: {
    fontFamily: fontMono,
    fontSize: 12,
    padding: "7px 16px",
    borderRadius: 4,
    cursor: "pointer",
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: "transparent",
    color: ({ t }) => t.textLo
  },
  resultLink: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.sky },
  note: { fontSize: 12.5, color: ({ t }) => t.textLo },
  example: {
    margin: "6px 0 0",
    padding: "8px 10px",
    fontFamily: fontMono,
    fontSize: 11,
    lineHeight: 1.5,
    borderRadius: 4,
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px dashed ${t.line}`,
    color: ({ t }) => t.textLo,
    whiteSpace: "pre",
    overflowX: "auto"
  }
}));
function asRecord(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
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
        /* @__PURE__ */ jsx(Field, { label: "Path", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "/healthz", value: probe.path, onChange: (e) => onChange({ ...probe, path: e.target.value }) }) }),
        /* @__PURE__ */ jsx(Field, { label: "Port", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "3000", value: probe.port, onChange: (e) => onChange({ ...probe, port: e.target.value }) }) })
      ] }),
      probe.kind === "tcpSocket" && /* @__PURE__ */ jsx(Field, { label: "Port", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "3000", value: probe.port, onChange: (e) => onChange({ ...probe, port: e.target.value }) }) })
    ] }),
    probe.kind === "exec" && /* @__PURE__ */ jsx(Field, { label: "Command (one argument per line)", classes, children: /* @__PURE__ */ jsx(
      "textarea",
      {
        className: classes.textarea,
        rows: 3,
        value: probe.command,
        onChange: (e) => onChange({ ...probe, command: e.target.value }),
        placeholder: "cat\n/tmp/healthy"
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
      const templateNames = a.templates.map(
        (t) => typeof t.templateName === "string" ? t.templateName : void 0
      );
      if (templateNames.some((name) => name === void 0)) return void 0;
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
      result.push({ kind: "analysis", templates: templateNames.join(", "), extraArgs });
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
    const templates = s.templates.split(",").map((x) => x.trim()).filter(Boolean).map((templateName) => ({ templateName }));
    const args = [{ name: "canary-hash", valueFrom: { podTemplateHashValue: "Latest" } }, ...s.extraArgs.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), value: a.value }))];
    return { analysis: { templates, args } };
  });
}
function defaultStep(kind) {
  if (kind === "weight") return { kind, weight: 50 };
  if (kind === "pause") return { kind, duration: "30s" };
  return { kind, templates: "", extraArgs: [] };
}
function StepsBuilder({
  steps,
  onChange,
  declaredTemplateNames,
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
            placeholder: "30s (blank = manual/indefinite)",
            value: s.duration,
            onChange: (e) => update(i, { kind: "pause", duration: e.target.value })
          }
        ),
        s.kind === "analysis" && /* @__PURE__ */ jsx(
          "input",
          {
            className: classes.input,
            style: { minWidth: 240 },
            placeholder: "template names, comma-separated",
            value: s.templates,
            onChange: (e) => update(i, { ...s, templates: e.target.value })
          }
        ),
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
      declaredTemplateNames.length > 0 ? ` Declared in this file: ${declaredTemplateNames.join(", ")} - a step can also name a platform-wide ClusterAnalysisTemplate not declared here.` : " A step can name any app-declared or platform-wide ClusterAnalysisTemplate."
    ] })
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
      row.as !== "env" && /* @__PURE__ */ jsx(Field, { label: "Mount path (blank = /config/<name>)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: `/config/${row.name || "<name>"}`, value: row.mountPath, onChange: (e) => update(i, { mountPath: e.target.value }) }) }),
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
                placeholder: row.as === "env" ? "ENABLE_NEW_CHECKOUT" : "app-config.yaml",
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
        row.as !== "volume" && /* @__PURE__ */ jsx(Field, { label: "Env var name (blank = NAME uppercased)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: row.name ? row.name.toUpperCase() : "DB_PASSWORD", value: row.key, onChange: (e) => update(i, { key: e.target.value }) }) }),
        row.as !== "env" && /* @__PURE__ */ jsx(Field, { label: "Mount path (blank = /secrets/<name>)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: `/secrets/${row.name || "<name>"}`, value: row.mountPath, onChange: (e) => update(i, { mountPath: e.target.value }) }) })
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
const ADVANCED_META = {
  // `promoted` sections render as regular sections, not behind the "Show advanced" toggle.
  components: {
    title: "Attached components",
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
  rolloutAdvanced: {
    title: "Rollout strategy & pod template",
    hint: "strategy, canaryAnalysis, blueGreen, command/args, security contexts, extraContainers, podSpec. Canary steps, probes, replicas, resources, and the Service's ports have their own fields above and are merged back in on submit.",
    example: ROLLOUT_ADVANCED_EXAMPLE,
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
const ROLLOUT_ADVANCED_KEYS = [
  "strategy",
  "canaryAnalysis",
  "blueGreen",
  "command",
  "args",
  "podSecurityContext",
  "containerSecurityContext",
  "extraContainers",
  "podSpec"
];
const DEFAULT_PORTS = [{ name: "http", containerPort: 8080 }];
function dumpOrBlank(v) {
  if (v === void 0 || v === null) return "";
  if (Array.isArray(v) && v.length === 0) return "";
  if (typeof v === "object" && Object.keys(v).length === 0) return "";
  return dump(v, { lineWidth: 100 }).trimEnd();
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
      containerPort: typeof p.containerPort === "number" ? p.containerPort : ""
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
    httpRouteEnabled: Boolean(httpRoute.enabled ?? false),
    httpRouteHostnames: Array.isArray(httpRoute.hostnames) ? httpRoute.hostnames.join(", ") : "",
    httpRouteParentRefs: Array.isArray(httpRoute.parentRefs) ? httpRoute.parentRefs.map((p) => ({
      name: p.name ?? "",
      namespace: p.namespace ?? ""
    })) : [],
    networkPolicyEnabled: Boolean(networkPolicy.enabled ?? true),
    networkPolicyAllowIngressFromIngressController: Boolean(networkPolicy.allowIngressFromIngressController ?? true),
    pdbEnabled: Boolean(pdb.enabled ?? false),
    pdbMinAvailable: pdb.minAvailable !== void 0 && pdb.minAvailable !== null ? String(pdb.minAvailable) : "1",
    pdbMaxUnavailable: pdb.maxUnavailable !== void 0 && pdb.maxUnavailable !== null ? String(pdb.maxUnavailable) : "",
    serviceMonitorEnabled: Boolean(serviceMonitor.enabled ?? true),
    serviceMonitorPath: typeof serviceMonitor.path === "string" ? serviceMonitor.path : "/metrics",
    serviceMonitorInterval: typeof serviceMonitor.interval === "string" ? serviceMonitor.interval : "30s",
    slackEnabled: Boolean(slack.enabled ?? false),
    slackChannel: typeof slack.channel === "string" ? slack.channel : "",
    envVars: envList.map((e) => ({ name: e.name ?? "", value: String(e.value ?? "") })),
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
  const rolloutAdvanced = {};
  for (const key of ROLLOUT_ADVANCED_KEYS) {
    if (rollout[key] !== void 0) rolloutAdvanced[key] = rollout[key];
  }
  return {
    rolloutAdvanced: dumpOrBlank(rolloutAdvanced),
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
  if (form.pdbEnabled && form.pdbMinAvailable.trim() && form.pdbMaxUnavailable.trim()) {
    errors.push("PodDisruptionBudget: set at most one of minAvailable/maxUnavailable, not both.");
  }
  return errors;
}
function ConfigTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { owner, appName, pipelineOrder, loading, error } = useReleaseContext();
  const flightEnvs = useMemo(() => {
    if (!pipelineOrder.upper) return [];
    return pipelineOrder.upper.map((name) => ({
      env: name,
      cluster: pipelineOrder.upperClusters?.[name] ?? ""
    }));
  }, [pipelineOrder.upper, pipelineOrder.upperClusters]);
  const [searchParams] = useSearchParams();
  const [selectedEnv, setSelectedEnv] = useState(searchParams.get("env") ?? void 0);
  useEffect(() => {
    if (!selectedEnv && flightEnvs.length > 0) setSelectedEnv(flightEnvs[0].env);
  }, [flightEnvs, selectedEnv]);
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  if (!owner || !appName) {
    return /* @__PURE__ */ jsx(
      TowerEmptyState,
      {
        title: "Can't resolve this app's source repo",
        description: "App Configuration needs a resolved GitHub owner/repo (from a promoted environment's provenance) to know which gitops-<app> repo to read."
      }
    );
  }
  if (pipelineOrder.loading || !pipelineOrder.data && !pipelineOrder.error) return /* @__PURE__ */ jsx(Progress, {});
  if (pipelineOrder.error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(pipelineOrder.error) });
  if (flightEnvs.length === 0) {
    return /* @__PURE__ */ jsx(
      TowerEmptyState,
      {
        title: "No flight environments yet",
        description: `App Configuration only supports flight (upper) environments, and ${appName}'s cicd.yaml doesn't declare any yet. This is expected until CI/CD is set up for this app - it's not an error.`
      }
    );
  }
  const active = flightEnvs.find((e) => e.env === selectedEnv) ?? flightEnvs[0];
  const prod = isProdEnv(active.env);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: `${classes.envBanner} ${prod ? classes.envBannerProd : classes.envBannerOther}`, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.envBannerLeft, children: [
        prod && /* @__PURE__ */ jsx(WarningRoundedIcon, { style: { color: t.bad } }),
        /* @__PURE__ */ jsxs(Typography, { className: `${classes.envBannerTitle} ${prod ? classes.envBannerTitleProd : classes.envBannerTitleOther}`, children: [
          "Editing ",
          active.env.toUpperCase()
        ] }),
        /* @__PURE__ */ jsx("select", { className: classes.select, value: active.env, onChange: (e) => setSelectedEnv(e.target.value), children: flightEnvs.map((e) => /* @__PURE__ */ jsxs("option", { value: e.env, children: [
          e.env,
          " (",
          e.cluster,
          ")"
        ] }, e.env)) })
      ] }),
      /* @__PURE__ */ jsxs(Typography, { className: classes.envBannerPath, children: [
        "gitops-",
        appName,
        "/",
        active.cluster,
        "/",
        active.env,
        "/values.yaml"
      ] })
    ] }),
    /* @__PURE__ */ jsx(EnvXrPanel, { owner, appName, env: active.env, classes }),
    /* @__PURE__ */ jsx(ConfigMapFilesPanel, { owner, appName, cluster: active.cluster, env: active.env, classes }),
    /* @__PURE__ */ jsx(ConfigEditor, { owner, appName, cluster: active.cluster, env: active.env, prod, classes })
  ] });
}
function EnvXrPanel({ owner, appName, env, classes }) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const xr = useEnvXr({ owner, appName, env }, refreshNonce);
  const submitXr = useSubmitEnvXrChange();
  const [draft, setDraft] = useState(void 0);
  useEffect(() => {
    if (xr.data) setDraft(xr.data.configMapGenerator);
  }, [xr.data]);
  if (xr.loading) return /* @__PURE__ */ jsx(Progress, {});
  if (xr.error) {
    return /* @__PURE__ */ jsx("div", { className: classes.section, style: { marginBottom: 16 }, children: /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
      "Couldn't load this env's ApplicationEnvironment resource: ",
      xr.error
    ] }) });
  }
  if (!xr.data || draft === void 0) return null;
  const dirty = draft !== xr.data.configMapGenerator;
  return /* @__PURE__ */ jsxs("div", { className: `${classes.section} ${dirty ? classes.sectionDirty : ""}`, style: { marginBottom: 16 }, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.sectionTitleRow, children: [
      /* @__PURE__ */ jsxs(Typography, { className: classes.sectionTitle, children: [
        "Catalog resource \xB7 ApplicationEnvironment",
        dirty && /* @__PURE__ */ jsx("span", { className: classes.dirtyDot })
      ] }),
      /* @__PURE__ */ jsx(RefreshButton, { label: "", onClick: () => setRefreshNonce((n) => n + 1) })
    ] }),
    /* @__PURE__ */ jsx(Typography, { className: classes.envBannerPath, style: { marginBottom: 10 }, children: xr.data.path }),
    /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
      /* @__PURE__ */ jsx(Switch, { checked: draft, onChange: (e) => setDraft(e.target.checked), disabled: submitXr.loading }),
      /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "configMapGenerator" })
    ] }),
    /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: "The only editable field on this XR - appName/cluster/env are this resource's own identity, not a setting." }),
    /* @__PURE__ */ jsx(PrResultDialog, { result: submitXr.result, error: submitXr.error, onClose: () => submitXr.reset() }),
    submitXr.result && /* @__PURE__ */ jsxs(Typography, { className: classes.note, style: { marginTop: 10 }, children: [
      submitXr.result.alreadyOpen ? "A PR for this change is already open: " : "PR opened: ",
      /* @__PURE__ */ jsx(Link, { className: classes.resultLink, href: submitXr.result.prUrl, target: "_blank", rel: "noopener noreferrer", children: submitXr.result.prUrl })
    ] }),
    submitXr.error && /* @__PURE__ */ jsxs(Typography, { className: classes.errorList, style: { marginTop: 10, listStyle: "none", paddingLeft: 0 }, children: [
      "Couldn't open PR: ",
      submitXr.error
    ] }),
    dirty && !submitXr.result && /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        className: classes.btn,
        style: { marginTop: 12 },
        disabled: submitXr.loading,
        onMouseDown: preventFocusScroll,
        onClick: () => submitXr.submit({ owner, appName, env, configMapGenerator: draft }),
        children: submitXr.loading ? "Opening PR\u2026" : "Open PR for this change"
      }
    )
  ] });
}
function toFileRows(files) {
  return files.map((f) => ({ originalName: f.name, name: f.name, content: f.content }));
}
function ConfigMapFilesPanel({ owner, appName, cluster, env, classes }) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const filesData = useConfigMapFiles({ owner, appName, cluster, env }, refreshNonce);
  const xr = useEnvXr({ owner, appName, env });
  const submitFiles = useSubmitConfigMapFiles();
  const [rows, setRows] = useState(void 0);
  const [originalRows, setOriginalRows] = useState(void 0);
  useEffect(() => {
    if (filesData.data) {
      const built = toFileRows(filesData.data.files);
      setRows(built);
      setOriginalRows(built);
      submitFiles.reset();
    }
  }, [filesData.data]);
  if (filesData.loading || !rows || !originalRows) return /* @__PURE__ */ jsx(Progress, {});
  if (filesData.error) {
    return /* @__PURE__ */ jsx("div", { className: classes.section, style: { marginBottom: 16 }, children: /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
      "Couldn't load configmap files: ",
      filesData.error
    ] }) });
  }
  const dirty = !deepEqual(rows, originalRows);
  const names = rows.map((r) => r.name.trim());
  const errors = [];
  if (names.some((n) => !n)) errors.push("Every file needs a name.");
  if (names.some((n) => n === "kustomization.yaml")) errors.push("kustomization.yaml is managed automatically and can't be used as a file name.");
  if (new Set(names).size !== names.length) errors.push("File names must be unique.");
  const update = (i, patch) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    setRows(next);
  };
  const remove = (i) => setRows(rows.filter((_, j) => j !== i));
  const add = () => setRows([...rows, { name: "", content: "" }]);
  const discard = () => {
    setRows(originalRows);
    submitFiles.reset();
  };
  const onSubmit = () => {
    const deletedFiles = originalRows.filter((o) => !rows.some((r) => r.originalName === o.originalName)).map((o) => o.originalName);
    const renameDeletes = rows.filter((r) => r.originalName && r.originalName !== r.name.trim()).map((r) => r.originalName);
    const files = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), content: r.content }));
    submitFiles.submit({ owner, appName, cluster, env, files, deletedFiles: [...deletedFiles, ...renameDeletes] });
  };
  return /* @__PURE__ */ jsxs("div", { className: `${classes.section} ${dirty ? classes.sectionDirty : ""}`, style: { marginBottom: 16 }, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.sectionTitleRow, children: [
      /* @__PURE__ */ jsxs(Typography, { className: classes.sectionTitle, children: [
        "ConfigMap generator files",
        dirty && /* @__PURE__ */ jsx("span", { className: classes.dirtyDot })
      ] }),
      /* @__PURE__ */ jsx(RefreshButton, { label: "", onClick: () => setRefreshNonce((n) => n + 1) })
    ] }),
    /* @__PURE__ */ jsx(Typography, { className: classes.envBannerPath, style: { marginBottom: 6 }, children: filesData.data?.path ?? `${cluster}/${env}/configmap` }),
    filesData.data?.configMapName && /* @__PURE__ */ jsxs(Typography, { className: classes.hint, style: { marginTop: 0 }, children: [
      "Generates ConfigMap ",
      /* @__PURE__ */ jsx("code", { children: filesData.data.configMapName }),
      ' - reference it from a "Config maps" row above via "Existing ConfigMap" \u2192 ',
      /* @__PURE__ */ jsx("code", { children: filesData.data.configMapName }),
      "."
    ] }),
    !xr.data?.configMapGenerator && /* @__PURE__ */ jsx(Typography, { className: classes.hint, style: { marginTop: 0 }, children: "configMapGenerator is currently off for this env (see Catalog resource above) - these files can still be prepared here, but won't be rendered into a ConfigMap until it's enabled." }),
    /* @__PURE__ */ jsxs("div", { className: classes.rowList, style: { marginTop: 10 }, children: [
      rows.length === 0 && /* @__PURE__ */ jsx(Typography, { className: classes.hint, style: { marginTop: 0 }, children: "No files yet." }),
      rows.map((row, i) => /* @__PURE__ */ jsxs("div", { className: classes.rowCard, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.rowCardHead, children: [
          /* @__PURE__ */ jsx("input", { className: classes.input, style: { flex: 1 }, placeholder: "app-settings.yaml", value: row.name, onChange: (e) => update(i, { name: e.target.value }) }),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => remove(i), children: "Remove" })
        ] }),
        /* @__PURE__ */ jsx("textarea", { className: classes.textarea, rows: 6, value: row.content, onChange: (e) => update(i, { content: e.target.value }), placeholder: "file contents" })
      ] }, i)),
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: add, children: "+ Add file" })
    ] }),
    dirty && /* @__PURE__ */ jsxs(Fragment, { children: [
      errors.length > 0 && /* @__PURE__ */ jsx("ul", { className: classes.errorList, style: { marginTop: 10 }, children: errors.map((e) => /* @__PURE__ */ jsx("li", { children: e }, e)) }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10, marginTop: 12 }, children: [
        submitFiles.result ? /* @__PURE__ */ jsx("button", { type: "button", className: classes.discardBtn, onClick: () => submitFiles.reset(), children: "Close" }) : /* @__PURE__ */ jsx("button", { type: "button", className: classes.discardBtn, onClick: discard, disabled: submitFiles.loading, children: "Discard" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.btn, disabled: errors.length > 0 || submitFiles.loading, onMouseDown: preventFocusScroll, onClick: onSubmit, children: submitFiles.loading ? "Opening PR\u2026" : "Open PR for these files" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(PrResultDialog, { result: submitFiles.result, error: submitFiles.error, onClose: () => submitFiles.reset() }),
    submitFiles.result && /* @__PURE__ */ jsxs(Typography, { className: classes.note, style: { marginTop: 10 }, children: [
      submitFiles.result.alreadyOpen ? "A PR for this exact change is already open: " : "PR opened: ",
      /* @__PURE__ */ jsx(Link, { className: classes.resultLink, href: submitFiles.result.prUrl, target: "_blank", rel: "noopener noreferrer", children: submitFiles.result.prUrl })
    ] }),
    submitFiles.error && /* @__PURE__ */ jsxs(Typography, { className: classes.errorList, style: { marginTop: 10, listStyle: "none", paddingLeft: 0 }, children: [
      "Couldn't open PR: ",
      submitFiles.error
    ] })
  ] });
}
function ConfigEditor({
  owner,
  appName,
  cluster,
  env,
  prod,
  classes
}) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const cfg = useAppConfig({ owner, appName, cluster, env }, refreshNonce);
  const submitCfg = useSubmitConfigChange();
  const schema = useValuesSchema(owner);
  const [form, setForm] = useState(void 0);
  const [originalForm, setOriginalForm] = useState(void 0);
  const [rolloutEnabled, setRolloutEnabled] = useState(true);
  const [originalRolloutEnabled, setOriginalRolloutEnabled] = useState(true);
  const [advanced, setAdvanced] = useState(void 0);
  const [originalAdvanced, setOriginalAdvanced] = useState(void 0);
  const [stepsMode, setStepsMode] = useState("simple");
  const [stepsSimple, setStepsSimple] = useState([]);
  const [stepsRaw, setStepsRaw] = useState("");
  const [originalStepsRaw, setOriginalStepsRaw] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRawFile, setShowRawFile] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(/* @__PURE__ */ new Set());
  useEffect(() => {
    if (cfg.data) {
      const builtForm = buildFormState(cfg.data.values);
      const builtAdvanced = buildAdvancedYaml(cfg.data.values);
      setForm(builtForm);
      setOriginalForm(builtForm);
      setAdvanced(builtAdvanced);
      setOriginalAdvanced(builtAdvanced);
      const rolloutIsSet = cfg.data.values.rollout !== void 0 && cfg.data.values.rollout !== null;
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
  }, [cfg.data]);
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
  const declaredTemplateNames = (() => {
    const { parsed, valid } = validateYamlBlock(advanced.analysisTemplates);
    if (!valid || !Array.isArray(parsed)) return [];
    return parsed.map((t) => t.name).filter((n) => Boolean(n));
  })();
  const advancedInvalid = Object.keys(advanced).filter((k) => !validateYamlBlock(advanced[k]).valid);
  const stepsInvalid = stepsMode === "raw" && !validateYamlBlock(stepsRaw).valid;
  const structuralErrors = validateBeforeSubmit(form, rolloutEnabled);
  const discard = () => {
    const builtForm = buildFormState(cfg.data.values);
    const builtAdvanced = buildAdvancedYaml(cfg.data.values);
    setForm(builtForm);
    setOriginalForm(builtForm);
    setAdvanced(builtAdvanced);
    setOriginalAdvanced(builtAdvanced);
    const rolloutIsSet = cfg.data.values.rollout !== void 0 && cfg.data.values.rollout !== null;
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
  if (rolloutEnabled !== originalRolloutEnabled || rolloutEnabled && (fieldsChanged(["replicas", "ports", "resourcesRequestsCpu", "resourcesRequestsMemory", "resourcesLimitsCpu", "resourcesLimitsMemory", "liveness", "readiness"]) || advanced.rolloutAdvanced !== originalAdvanced.rolloutAdvanced || stepsCurrentText !== originalStepsRaw)) {
    dirty.add("rollout");
  }
  if (fieldsChanged(["autoscalingEnabled", "autoscalingMin", "autoscalingMax", "autoscalingTargetCPUPercent"])) dirty.add("autoscaling");
  if (fieldsChanged(["ingressEnabled", "ingressHost", "ingressPath", "ingressPathType", "ingressTls"])) dirty.add("ingress");
  if (fieldsChanged(["httpRouteEnabled", "httpRouteHostnames", "httpRouteParentRefs"])) dirty.add("httpRoute");
  if (fieldsChanged(["networkPolicyEnabled", "networkPolicyAllowIngressFromIngressController"])) dirty.add("networkPolicy");
  if (fieldsChanged(["pdbEnabled", "pdbMinAvailable", "pdbMaxUnavailable"])) dirty.add("podDisruptionBudget");
  if (fieldsChanged(["serviceMonitorEnabled", "serviceMonitorPath", "serviceMonitorInterval"])) dirty.add("serviceMonitor");
  if (fieldsChanged(["slackEnabled", "slackChannel"])) dirty.add("notifications");
  if (fieldsChanged(["envVars"])) dirty.add("env");
  if (fieldsChanged(["configMaps"])) dirty.add("configMaps");
  if (fieldsChanged(["secrets"])) dirty.add("secrets");
  if (fieldsChanged(["serviceAccountCreate", "serviceAccountName", "serviceAccountAnnotations", "serviceAccountImagePullSecrets"])) dirty.add("serviceAccount");
  Object.keys(ADVANCED_META).forEach((key) => {
    if (key === "rolloutAdvanced") return;
    if (advanced[key] !== originalAdvanced[key]) dirty.add(ADVANCED_META[key].field);
  });
  const buildPatchAndSummary = () => {
    const values = cfg.data.values;
    const patch = {};
    const summary = [];
    if (dirty.has("rollout") && !rolloutEnabled) {
      patch.rollout = null;
      summary.push("rollout: disabled (no container deployed in this environment)");
    } else if (dirty.has("rollout")) {
      const advancedParsed = asRecord(validateYamlBlock(advanced.rolloutAdvanced).parsed);
      const stepsValue = stepsMode === "simple" ? buildStepsValue(stepsSimple) : validateYamlBlock(stepsRaw).parsed ?? [];
      patch.rollout = {
        ...advancedParsed,
        replicas: form.replicas === "" ? void 0 : form.replicas,
        ports: form.ports.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), containerPort: p.containerPort === "" ? void 0 : p.containerPort })),
        resources: {
          requests: {
            ...form.resourcesRequestsCpu ? { cpu: form.resourcesRequestsCpu } : {},
            ...form.resourcesRequestsMemory ? { memory: form.resourcesRequestsMemory } : {}
          },
          limits: {
            ...form.resourcesLimitsCpu ? { cpu: form.resourcesLimitsCpu } : {},
            ...form.resourcesLimitsMemory ? { memory: form.resourcesLimitsMemory } : {}
          }
        },
        steps: stepsValue,
        livenessProbe: buildProbeValue(form.liveness),
        readinessProbe: buildProbeValue(form.readiness)
      };
      summary.push(
        originalRolloutEnabled ? `rollout: replicas/resources/probes/steps and/or pod-template settings updated` : `rollout: enabled (was previously null - a container will now deploy in this environment)`
      );
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
        tls: form.ingressTls
      };
      summary.push(`ingress: ${form.ingressEnabled ? `enabled for ${form.ingressHost}` : "disabled"}`);
    }
    if (dirty.has("httpRoute")) {
      patch.httpRoute = {
        ...asRecord(values.httpRoute),
        enabled: form.httpRouteEnabled,
        hostnames: form.httpRouteHostnames.split(",").map((h) => h.trim()).filter(Boolean),
        parentRefs: form.httpRouteParentRefs.filter((p) => p.name.trim())
      };
      summary.push(`httpRoute: ${form.httpRouteEnabled ? `enabled for ${form.httpRouteHostnames}` : "disabled"}`);
    }
    if (dirty.has("networkPolicy")) {
      patch.networkPolicy = {
        ...asRecord(values.networkPolicy),
        enabled: form.networkPolicyEnabled,
        allowIngressFromIngressController: form.networkPolicyAllowIngressFromIngressController
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
        interval: form.serviceMonitorInterval
      };
      summary.push(`serviceMonitor: ${form.serviceMonitorEnabled ? `enabled, scraping ${form.serviceMonitorPath} every ${form.serviceMonitorInterval}` : "disabled"}`);
    }
    if (dirty.has("notifications")) {
      patch.notifications = { ...asRecord(values.notifications), slack: { enabled: form.slackEnabled, channel: form.slackChannel } };
      summary.push(`notifications.slack: ${form.slackEnabled ? `enabled${form.slackChannel ? ` (${form.slackChannel})` : ""}` : "disabled"}`);
    }
    if (dirty.has("env")) {
      patch.env = form.envVars.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), value: v.value }));
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
      if (key === "rolloutAdvanced") return;
      const meta = ADVANCED_META[key];
      if (!dirty.has(meta.field)) return;
      const { parsed } = validateYamlBlock(advanced[key]);
      patch[meta.field] = parsed ?? (Array.isArray(values[meta.field]) ? [] : {});
      summary.push(`${meta.field}: updated`);
    });
    return { patch, summary };
  };
  const { patch: previewPatch } = dirty.size > 0 ? buildPatchAndSummary() : { patch: {} };
  const schemaIssues = schema.data ? Object.keys(previewPatch).flatMap(
    (key) => validateAgainstSchema(schema.data.properties?.[key], schema.data, previewPatch[key], key)
  ) : [];
  const canSubmit = dirty.size > 0 && advancedInvalid.length === 0 && !stepsInvalid && structuralErrors.length === 0 && schemaIssues.length === 0 && !submitCfg.loading;
  const onSubmit = () => {
    const { patch, summary } = buildPatchAndSummary();
    submitCfg.submit({ owner, appName, cluster, env, patch, summary });
  };
  const renderAdvancedSection = (key) => {
    const meta = ADVANCED_META[key];
    const isDirty = dirty.has(meta.field) && (key !== "rolloutAdvanced" ? true : dirty.has("rollout"));
    return /* @__PURE__ */ jsxs(Section, { title: meta.title, dirty: isDirty, classes, children: [
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
  return /* @__PURE__ */ jsxs("div", { className: classes.columns, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.sectionTitleRow, style: { marginBottom: 0 }, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "Live values from GitHub - not polled, use refresh for the latest commit." }),
      /* @__PURE__ */ jsx(RefreshButton, { onClick: () => setRefreshNonce((n) => n + 1) })
    ] }),
    /* @__PURE__ */ jsx("button", { type: "button", className: classes.advancedToggle, onClick: () => setShowRawFile((v) => !v), children: showRawFile ? "\u25BE Hide full committed YAML" : "\u25B8 View full committed YAML" }),
    showRawFile && /* @__PURE__ */ jsx("pre", { className: classes.example, style: { maxHeight: 420, overflow: "auto" }, children: cfg.data.raw || `# Nothing committed yet at ${cfg.data.path} - this environment has no values.yaml
# on its own branch/history. Submitting a change below creates it.` }),
    /* @__PURE__ */ jsxs(Section, { title: "Deployment", dirty: rolloutEnabled !== originalRolloutEnabled, classes, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(Switch, { checked: rolloutEnabled, onChange: (e) => setRolloutEnabled(e.target.checked) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Deploy a Rollout (long-running container) in this environment" })
      ] }),
      /* @__PURE__ */ jsx(Typography, { className: classes.hint, style: { marginTop: 8 }, children: rolloutEnabled ? "Scaling, resources, health checks, and canary steps below configure this Rollout. Turn this off if this environment should only run a Job/CronJob/other resource - see the advanced fields further down." : "This environment has rollout: null - no Rollout, Service, HPA, or PodDisruptionBudget is deployed here. That's a normal, deliberate state, not a placeholder waiting to be filled in - a good fit for an env that only runs a Job/CronJob or another XR. Turn this on to deploy a real container instead." })
    ] }),
    rolloutEnabled && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(Section, { title: "Scaling", dirty: dirty.has("rollout") || dirty.has("autoscaling"), classes, children: [
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
      /* @__PURE__ */ jsx(Section, { title: "Resources", dirty: dirty.has("rollout"), classes, children: /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
        /* @__PURE__ */ jsx(Field, { label: "Request CPU", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. 100m", value: form.resourcesRequestsCpu, onChange: (e) => setF("resourcesRequestsCpu", e.target.value, "rollout") }) }),
        /* @__PURE__ */ jsx(Field, { label: "Request memory", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. 128Mi", value: form.resourcesRequestsMemory, onChange: (e) => setF("resourcesRequestsMemory", e.target.value, "rollout") }) }),
        /* @__PURE__ */ jsx(Field, { label: "Limit CPU", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. 500m", value: form.resourcesLimitsCpu, onChange: (e) => setF("resourcesLimitsCpu", e.target.value, "rollout") }) }),
        /* @__PURE__ */ jsx(Field, { label: "Limit memory", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "e.g. 256Mi", value: form.resourcesLimitsMemory, onChange: (e) => setF("resourcesLimitsMemory", e.target.value, "rollout") }) })
      ] }) }),
      /* @__PURE__ */ jsxs(Section, { title: "Service", dirty: dirty.has("rollout") && fieldsChanged(["ports"]), classes, children: [
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
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => setF("ports", form.ports.filter((_, j) => j !== i), "rollout"), children: "Remove" })
          ] }, i)),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => setF("ports", [...form.ports, { name: "", containerPort: "" }], "rollout"), children: "+ Add port" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Section, { title: "Health checks", dirty: dirty.has("rollout"), classes, children: [
        /* @__PURE__ */ jsx(ProbeFields, { label: "Liveness probe", probe: form.liveness, onChange: (p) => setF("liveness", p, "rollout"), classes }),
        /* @__PURE__ */ jsx("div", { style: { marginTop: 16 }, children: /* @__PURE__ */ jsx(ProbeFields, { label: "Readiness probe", probe: form.readiness, onChange: (p) => setF("readiness", p, "rollout"), classes }) })
      ] }),
      /* @__PURE__ */ jsxs(Section, { title: "Canary steps", dirty: dirty.has("rollout"), classes, children: [
        stepsMode === "simple" ? /* @__PURE__ */ jsx(StepsBuilder, { steps: stepsSimple, onChange: setSteps, declaredTemplateNames, classes }) : /* @__PURE__ */ jsx(
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
    /* @__PURE__ */ jsxs(Section, { title: "Networking", dirty: dirty.has("ingress") || dirty.has("httpRoute") || dirty.has("networkPolicy"), classes, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(Switch, { checked: form.httpRouteEnabled, onChange: (e) => setF("httpRouteEnabled", e.target.checked, "httpRoute") }),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Gateway API HTTPRoute" })
      ] }),
      form.httpRouteEnabled && /* @__PURE__ */ jsxs("div", { style: { marginTop: 10 }, children: [
        /* @__PURE__ */ jsx("div", { className: classes.grid, children: /* @__PURE__ */ jsx(Field, { label: "Hostnames (comma-separated)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "checkout-api.prod.kiac.local", value: form.httpRouteHostnames, onChange: (e) => setF("httpRouteHostnames", e.target.value, "httpRoute") }) }) }),
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
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => setF("httpRouteParentRefs", form.httpRouteParentRefs.filter((_, j) => j !== i), "httpRoute"), children: "Remove" })
          ] }, i)),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => setF("httpRouteParentRefs", [...form.httpRouteParentRefs, { name: "", namespace: "" }], "httpRoute"), children: "+ Add parent gateway" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, style: { marginTop: 16 }, children: [
        /* @__PURE__ */ jsx(Switch, { checked: form.ingressEnabled, onChange: (e) => setF("ingressEnabled", e.target.checked, "ingress") }),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Classic Ingress" })
      ] }),
      form.ingressEnabled && /* @__PURE__ */ jsxs("div", { className: classes.grid, style: { marginTop: 10 }, children: [
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
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, style: { marginTop: 16 }, children: [
        /* @__PURE__ */ jsx(Switch, { checked: form.networkPolicyEnabled, onChange: (e) => setF("networkPolicyEnabled", e.target.checked, "networkPolicy") }),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "NetworkPolicy" })
      ] }),
      form.networkPolicyEnabled && /* @__PURE__ */ jsxs("div", { className: classes.switchRow, style: { marginTop: 8 }, children: [
        /* @__PURE__ */ jsx(
          Switch,
          {
            checked: form.networkPolicyAllowIngressFromIngressController,
            onChange: (e) => setF("networkPolicyAllowIngressFromIngressController", e.target.checked, "networkPolicy")
          }
        ),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Allow ingress from the gateway/ingress controller" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Section, { title: "Availability", dirty: dirty.has("podDisruptionBudget") || dirty.has("serviceMonitor"), classes, children: [
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
        /* @__PURE__ */ jsx(Field, { label: "Scrape interval", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, value: form.serviceMonitorInterval, onChange: (e) => setF("serviceMonitorInterval", e.target.value, "serviceMonitor") }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Section, { title: "Service account", dirty: dirty.has("serviceAccount"), classes, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(Switch, { checked: form.serviceAccountCreate, onChange: (e) => setF("serviceAccountCreate", e.target.checked, "serviceAccount") }),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "Create a dedicated ServiceAccount" })
      ] }),
      form.serviceAccountCreate && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: classes.grid, style: { marginTop: 10 }, children: /* @__PURE__ */ jsx(Field, { label: "Name (blank = app name)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: appName, value: form.serviceAccountName, onChange: (e) => setF("serviceAccountName", e.target.value, "serviceAccount") }) }) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, style: { marginTop: 12 }, children: "Annotations" }),
        /* @__PURE__ */ jsxs("div", { className: classes.rowList, style: { marginTop: 6 }, children: [
          form.serviceAccountAnnotations.map((a, i) => /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                className: classes.input,
                placeholder: "annotation key",
                value: a.key,
                onChange: (e) => {
                  const next = [...form.serviceAccountAnnotations];
                  next[i] = { ...next[i], key: e.target.value };
                  setF("serviceAccountAnnotations", next, "serviceAccount");
                }
              }
            ),
            /* @__PURE__ */ jsx(
              "input",
              {
                className: classes.input,
                placeholder: "value",
                value: a.value,
                onChange: (e) => {
                  const next = [...form.serviceAccountAnnotations];
                  next[i] = { ...next[i], value: e.target.value };
                  setF("serviceAccountAnnotations", next, "serviceAccount");
                }
              }
            ),
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => setF("serviceAccountAnnotations", form.serviceAccountAnnotations.filter((_, j) => j !== i), "serviceAccount"), children: "Remove" })
          ] }, i)),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => setF("serviceAccountAnnotations", [...form.serviceAccountAnnotations, { key: "", value: "" }], "serviceAccount"), children: "+ Add annotation" })
        ] }),
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
    /* @__PURE__ */ jsxs(Section, { title: "Notifications", dirty: dirty.has("notifications"), classes, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(Switch, { checked: form.slackEnabled, onChange: (e) => setF("slackEnabled", e.target.checked, "notifications") }),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: "AI-triage Slack notifications" })
      ] }),
      form.slackEnabled && /* @__PURE__ */ jsx("div", { className: classes.grid, style: { marginTop: 10 }, children: /* @__PURE__ */ jsx(Field, { label: "Channel (optional)", classes, children: /* @__PURE__ */ jsx("input", { className: classes.input, placeholder: "#your-channel", value: form.slackChannel, onChange: (e) => setF("slackChannel", e.target.value, "notifications") }) }) }),
      /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: "The webhook URL itself is never edited here - it's an Infisical secret, not a values.yaml field." })
    ] }),
    /* @__PURE__ */ jsx(Section, { title: "Environment variables", dirty: dirty.has("env"), classes, children: /* @__PURE__ */ jsxs("div", { className: classes.rowList, children: [
      form.envVars.map((v, i) => /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            className: classes.input,
            placeholder: "NAME",
            value: v.name,
            onChange: (e) => {
              const next = [...form.envVars];
              next[i] = { ...next[i], name: e.target.value };
              setF("envVars", next, "env");
            }
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: classes.input,
            placeholder: "value",
            value: v.value,
            onChange: (e) => {
              const next = [...form.envVars];
              next[i] = { ...next[i], value: e.target.value };
              setF("envVars", next, "env");
            }
          }
        ),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.removeBtn, onClick: () => setF("envVars", form.envVars.filter((_, j) => j !== i), "env"), children: "Remove" })
      ] }, i)),
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.addBtn, onClick: () => setF("envVars", [...form.envVars, { name: "", value: "" }], "env"), children: "+ Add variable" })
    ] }) }),
    /* @__PURE__ */ jsx(Section, { title: "Config maps", dirty: dirty.has("configMaps"), classes, children: /* @__PURE__ */ jsx(ConfigMapsSection, { rows: form.configMaps, onChange: (rows) => setF("configMaps", rows), classes }) }),
    /* @__PURE__ */ jsx(Section, { title: "Secrets", dirty: dirty.has("secrets"), classes, children: /* @__PURE__ */ jsx(SecretsSection, { rows: form.secrets, onChange: (rows) => setF("secrets", rows), classes }) }),
    Object.keys(ADVANCED_META).filter((key) => ADVANCED_META[key].promoted).map((key) => renderAdvancedSection(key)),
    /* @__PURE__ */ jsx("button", { type: "button", className: classes.advancedToggle, onClick: () => setShowAdvanced((v) => !v), children: showAdvanced ? "\u25BE Hide advanced (raw YAML) fields" : "\u25B8 Show advanced (raw YAML) fields" }),
    showAdvanced && Object.keys(ADVANCED_META).filter((key) => !ADVANCED_META[key].promoted).map((key) => renderAdvancedSection(key)),
    dirty.size > 0 && /* @__PURE__ */ jsxs("div", { className: `${classes.reviewBar} ${prod ? classes.reviewBarProd : classes.reviewBarOther}`, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.reviewHeader, children: [
        /* @__PURE__ */ jsxs(Typography, { className: `${classes.reviewTitle} ${prod ? classes.reviewTitleProd : classes.reviewTitleOther}`, children: [
          prod && /* @__PURE__ */ jsx(WarningRoundedIcon, { style: { fontSize: 16, verticalAlign: "text-bottom", marginRight: 4 } }),
          "Review changes to ",
          env.toUpperCase(),
          " (",
          cluster,
          ") before opening a PR"
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10 }, children: [
          submitCfg.result ? (
            // A successful (or already-open) PR means these edits are
            // already on their way to review - "Discard" would silently
            // wipe the form back to pre-edit state for no reason at that
            // point (2026-09-13 bug report). Close just dismisses the PR
            // link/banner (submitCfg.reset()), leaving the form exactly
            // as submitted in case there's more to add before merge.
            /* @__PURE__ */ jsx("button", { type: "button", className: classes.discardBtn, onClick: () => submitCfg.reset(), children: "Close" })
          ) : /* @__PURE__ */ jsx("button", { type: "button", className: classes.discardBtn, onClick: discard, disabled: submitCfg.loading, children: "Discard" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: classes.btn, disabled: !canSubmit, onMouseDown: preventFocusScroll, onClick: onSubmit, children: submitCfg.loading ? "Opening PR\u2026" : "Open PR" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("ul", { className: classes.reviewList, children: [...dirty].map((k) => /* @__PURE__ */ jsx("li", { children: k }, k)) }),
      advancedInvalid.length > 0 && /* @__PURE__ */ jsx("ul", { className: classes.errorList, children: advancedInvalid.map((k) => /* @__PURE__ */ jsxs("li", { children: [
        ADVANCED_META[k].title,
        ": fix the YAML syntax error above before submitting."
      ] }, k)) }),
      stepsInvalid && /* @__PURE__ */ jsx("ul", { className: classes.errorList, children: /* @__PURE__ */ jsx("li", { children: "Canary steps: fix the YAML syntax error above before submitting." }) }),
      structuralErrors.length > 0 && /* @__PURE__ */ jsx("ul", { className: classes.errorList, children: structuralErrors.map((e) => /* @__PURE__ */ jsx("li", { children: e }, e)) }),
      schemaIssues.length > 0 && /* @__PURE__ */ jsx("ul", { className: classes.errorList, children: schemaIssues.map((issue, i) => /* @__PURE__ */ jsxs("li", { children: [
        issue.path,
        ": ",
        issue.message
      ] }, i)) }),
      schema.error && /* @__PURE__ */ jsxs(Typography, { className: classes.hint, style: { marginTop: 0 }, children: [
        "Couldn't load the chart's values.schema.json for extra validation (",
        schema.error,
        ") - the built-in checks above still apply."
      ] }),
      /* @__PURE__ */ jsx(PrResultDialog, { result: submitCfg.result, error: submitCfg.error, onClose: () => submitCfg.reset() }),
      submitCfg.result && /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
        submitCfg.result.alreadyOpen ? "A PR for this exact change is already open: " : "PR opened: ",
        /* @__PURE__ */ jsx(Link, { className: classes.resultLink, href: submitCfg.result.prUrl, target: "_blank", rel: "noopener noreferrer", children: submitCfg.result.prUrl })
      ] }),
      submitCfg.error && /* @__PURE__ */ jsxs(Typography, { className: classes.errorList, style: { listStyle: "none", paddingLeft: 0 }, children: [
        "Couldn't open PR: ",
        submitCfg.error
      ] })
    ] })
  ] });
}
function Section({ title, dirty, classes, children }) {
  return /* @__PURE__ */ jsxs("div", { className: `${classes.section} ${dirty ? classes.sectionDirty : ""}`, children: [
    /* @__PURE__ */ jsx("div", { className: classes.sectionTitleRow, children: /* @__PURE__ */ jsxs(Typography, { className: classes.sectionTitle, children: [
      title,
      dirty && /* @__PURE__ */ jsx("span", { className: classes.dirtyDot })
    ] }) }),
    children
  ] });
}
function Field({ label, classes, children }) {
  return /* @__PURE__ */ jsxs("div", { className: classes.field, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, children: label }),
    children
  ] });
}

export { ConfigTab };
//# sourceMappingURL=ConfigTab.esm.js.map

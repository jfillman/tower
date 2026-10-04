import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import Typography from '@material-ui/core/Typography';
import Switch from '@material-ui/core/Switch';
import Link from '@material-ui/core/Link';
import { Progress } from '@backstage/core-components';
import { deepEqual } from '../deepEqual.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { PrResultDialog } from '../PrResultDialog.esm.js';
import { preventFocusScroll } from '../preventFocusScroll.esm.js';
import { useEnvXr, useSubmitEnvXrChange, useConfigMapFiles, useSubmitConfigMapFiles } from '../useConfigData.esm.js';

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

export { ConfigMapFilesPanel, EnvXrPanel };
//# sourceMappingURL=FlightPanels.esm.js.map

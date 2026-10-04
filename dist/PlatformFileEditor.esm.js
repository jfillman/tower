import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useEffect, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Link from '@material-ui/core/Link';
import { dump, load } from 'js-yaml';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { usePlatformFile, useSubmitPlatformFileChange } from './useConfigData.esm.js';
import { validateYamlBlock, YamlBlockEditor } from './YamlBlockEditor.esm.js';
import { deepEqual } from './deepEqual.esm.js';
import { CONFIG_TOP_LEVEL_FIELDS } from './types.esm.js';

function safeYamlDump(value) {
  try {
    return dump(value ?? {}, { lineWidth: -1 });
  } catch {
    return "";
  }
}
function safeYamlLoad(text) {
  try {
    const parsed = load(text.trim().length === 0 ? "{}" : text);
    return parsed ?? {};
  } catch {
    return void 0;
  }
}
const useStyles = makeStyles({
  submitBar: { display: "flex", alignItems: "center", gap: 12, marginTop: 8 },
  submitBtn: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: 4,
    border: "none",
    cursor: "pointer",
    backgroundColor: ({ t }) => t.amber,
    color: ({ t }) => t.amberInk,
    "&:disabled": { opacity: 0.45, cursor: "default" }
  },
  resultLink: { fontFamily: fontMono, fontSize: 12 }
});
function PlatformFileEditor({
  owner,
  appName,
  selector,
  refreshNonce = 0,
  onSubmitted
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [localNonce, setLocalNonce] = useState(0);
  const file = usePlatformFile({ owner, appName, selector }, refreshNonce + localNonce);
  const submit = useSubmitPlatformFileChange();
  const [raw, setRaw] = useState("");
  useEffect(() => {
    if (!file.data) return;
    if (Object.keys(file.data.values).length === 0 && selector.kind === "env") {
      setRaw(`envName: ${selector.env}
rollout: null
`);
    } else {
      setRaw(safeYamlDump(file.data.values));
    }
  }, [file.data, selector]);
  const valid = validateYamlBlock(raw).valid;
  const patch = useMemo(() => {
    if (!file.data || !valid) return {};
    const parsed = safeYamlLoad(raw) ?? {};
    const result = {};
    for (const key of CONFIG_TOP_LEVEL_FIELDS) {
      if (!deepEqual(parsed[key], file.data.values[key])) result[key] = parsed[key];
    }
    return result;
  }, [raw, valid, file.data]);
  const dirty = Object.keys(patch).length > 0;
  async function handleSubmit() {
    if (!dirty || !valid) return;
    await submit.submit({
      owner,
      appName,
      selector,
      patch,
      summary: Object.keys(patch).map((k) => `updated \`${k}\``)
    });
    setLocalNonce((n) => n + 1);
    onSubmitted?.();
  }
  if (file.loading) return /* @__PURE__ */ jsx(Progress, {});
  if (file.error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(file.error) });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(YamlBlockEditor, { label: file.data?.path ?? "platform file", value: raw, onChange: setRaw, rows: 12 }),
    /* @__PURE__ */ jsx("div", { className: classes.submitBar, children: /* @__PURE__ */ jsx("button", { type: "button", className: classes.submitBtn, disabled: !dirty || !valid || submit.loading, onClick: handleSubmit, children: submit.loading ? "Opening PR\u2026" : "Open PR for this file" }) }),
    submit.result && /* @__PURE__ */ jsxs(Typography, { children: [
      submit.result.alreadyOpen ? "A PR for this exact change is already open: " : "PR opened: ",
      /* @__PURE__ */ jsx(Link, { className: classes.resultLink, href: submit.result.prUrl, target: "_blank", rel: "noopener noreferrer", children: submit.result.prUrl })
    ] }),
    submit.error && /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(submit.error) })
  ] });
}

export { PlatformFileEditor };
//# sourceMappingURL=PlatformFileEditor.esm.js.map

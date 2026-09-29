import { jsxs, jsx } from 'react/jsx-runtime';
import { useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { load } from 'js-yaml';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';

const useStyles = makeStyles(() => ({
  wrap: { display: "flex", flexDirection: "column", gap: 6 },
  labelRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  label: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint
  },
  hint: { fontSize: 11.5, color: ({ t }) => t.textFaint, fontStyle: "italic" },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: fontMono,
    fontSize: 12.5,
    lineHeight: 1.5,
    padding: "10px 12px",
    borderRadius: 4,
    resize: "vertical",
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.bgRaised,
    border: ({ t }) => `1px solid ${t.line}`,
    "&:focus": { outline: "none", borderColor: ({ t }) => t.sky }
  },
  textareaInvalid: {
    borderColor: ({ t }) => t.bad
  },
  status: {
    fontFamily: fontMono,
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    gap: 6
  },
  statusOk: { color: ({ t }) => t.good },
  statusBad: { color: ({ t }) => t.bad }
}));
function validateYamlBlock(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { valid: true, parsed: void 0 };
  try {
    const parsed = load(text);
    return { valid: true, parsed };
  } catch (e) {
    const err = e;
    const where = err.mark?.line !== void 0 ? ` (line ${err.mark.line + 1}, column ${(err.mark.column ?? 0) + 1})` : "";
    return { valid: false, error: `${err.message ?? String(e)}${where}` };
  }
}
function YamlBlockEditor({
  label,
  hint,
  value,
  onChange,
  rows = 8
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const validation = useMemo(() => validateYamlBlock(value), [value]);
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.labelRow, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.label, children: label }),
      /* @__PURE__ */ jsx("span", { className: `${classes.status} ${validation.valid ? classes.statusOk : classes.statusBad}`, children: validation.valid ? "\u2713 Valid YAML" : `\u2717 ${validation.error}` })
    ] }),
    hint && /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: hint }),
    /* @__PURE__ */ jsx(
      "textarea",
      {
        className: `${classes.textarea} ${validation.valid ? "" : classes.textareaInvalid}`,
        spellCheck: false,
        rows,
        value,
        onChange: (e) => onChange(e.target.value)
      }
    )
  ] });
}

export { YamlBlockEditor, validateYamlBlock };
//# sourceMappingURL=YamlBlockEditor.esm.js.map

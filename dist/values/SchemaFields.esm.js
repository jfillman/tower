import { jsx, jsxs } from 'react/jsx-runtime';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import { useStyles } from './styles.esm.js';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { requiredFields, visibleFields, currentMode, pruneForMode } from './componentCatalog.esm.js';

const cleanDescription = (d) => (d ?? "").replace(/^\([a-z]+\)\s*/, "").replace(/\s+/g, " ").trim();
const isEmpty = (v) => v === void 0 || v === null || v === "" || Array.isArray(v) && v.length === 0;
function setField(spec, key, value) {
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
  classes
}) {
  const def = node.default;
  const ghost = def !== void 0 ? `default: ${String(def)}` : "not set";
  if (node.enum) {
    const numeric = node.type === "integer" || node.type === "number";
    return /* @__PURE__ */ jsxs(
      "select",
      {
        className: classes.input,
        "aria-label": label,
        value: value === void 0 ? "" : String(value),
        onChange: (e) => {
          const v = e.target.value;
          if (v === "") onChange(void 0);
          else onChange(numeric ? Number(v) : v);
        },
        children: [
          /* @__PURE__ */ jsx("option", { value: "", children: ghost }),
          node.enum.map((o) => /* @__PURE__ */ jsx("option", { value: String(o), children: String(o) }, String(o)))
        ]
      }
    );
  }
  if (node.type === "integer" || node.type === "number") {
    return /* @__PURE__ */ jsx(
      "input",
      {
        className: classes.input,
        type: "number",
        "aria-label": label,
        placeholder: ghost,
        value: typeof value === "number" ? value : "",
        onChange: (e) => onChange(e.target.value === "" ? void 0 : Number(e.target.value))
      }
    );
  }
  return /* @__PURE__ */ jsx("input", { className: classes.input, "aria-label": label, placeholder: ghost, value: typeof value === "string" ? value : "", onChange: (e) => onChange(e.target.value) });
}
function SchemaFields({
  def,
  spec,
  onChange,
  idPrefix
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const required = new Set(requiredFields(def, spec));
  const fields = visibleFields(def, spec);
  const mode = currentMode(def, spec);
  const change = (key, value) => {
    const next = setField(spec, key, value);
    onChange(key === "mode" ? pruneForMode(def, next) : next);
  };
  return /* @__PURE__ */ jsx("div", { className: classes.grid, children: fields.map((f) => {
    const node = def.spec.properties?.[f];
    const label = `${idPrefix} ${f}`;
    const star = required.has(f) ? " *" : "";
    const hint = cleanDescription(node.description);
    let control;
    if (node.type === "boolean") {
      control = /* @__PURE__ */ jsxs("div", { className: classes.switchRow, children: [
        /* @__PURE__ */ jsx(Switch, { checked: typeof spec[f] === "boolean" ? spec[f] : node.default === true, inputProps: { "aria-label": label }, onChange: (e) => change(f, e.target.checked) }),
        /* @__PURE__ */ jsx(Typography, { className: classes.switchLabel, children: node.default !== void 0 ? `default: ${String(node.default)}` : "" })
      ] });
    } else if (node.type === "array" && (node.items?.type ?? "string") === "string") {
      const list = Array.isArray(spec[f]) ? spec[f].map(String) : [];
      control = /* @__PURE__ */ jsx(
        "textarea",
        {
          className: classes.textarea,
          rows: 3,
          "aria-label": label,
          placeholder: "not set: one per line",
          value: list.join("\n"),
          onChange: (e) => change(f, e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))
        }
      );
    } else if (node.type === "object" && node.properties && Object.values(node.properties).every((p) => p.type === "string")) {
      const sub = spec[f] && typeof spec[f] === "object" ? spec[f] : {};
      const subRequired = new Set(node.required ?? []);
      control = /* @__PURE__ */ jsx("div", { className: classes.rowList, children: Object.entries(node.properties).map(([k, n]) => /* @__PURE__ */ jsx(
        "input",
        {
          className: classes.input,
          "aria-label": `${label} ${k}`,
          placeholder: `${k}${subRequired.has(k) ? " (required)" : ""}`,
          value: typeof sub[k] === "string" ? sub[k] : "",
          onChange: (e) => change(f, setField(sub, k, e.target.value)),
          title: cleanDescription(n.description)
        },
        k
      )) });
    } else if (node.type === "string" || node.type === "integer" || node.type === "number") {
      control = /* @__PURE__ */ jsx(Scalar, { node, value: spec[f], label, classes, onChange: (v) => change(f, v) });
    } else {
      control = /* @__PURE__ */ jsxs(Typography, { className: classes.hint, children: [
        "This field is not drawn here: edit it in the YAML below. Current value: ",
        /* @__PURE__ */ jsx("code", { children: JSON.stringify(spec[f] ?? null) })
      ] });
    }
    return /* @__PURE__ */ jsxs("div", { className: classes.field, "data-mode": mode, children: [
      /* @__PURE__ */ jsxs(Typography, { className: classes.fieldLabel, children: [
        f,
        star
      ] }),
      control,
      hint && /* @__PURE__ */ jsx(Typography, { className: classes.hint, children: hint })
    ] }, f);
  }) });
}

export { SchemaFields };
//# sourceMappingURL=SchemaFields.esm.js.map

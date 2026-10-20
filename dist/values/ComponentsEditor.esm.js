import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useRef } from 'react';
import Typography from '@material-ui/core/Typography';
import { load, dump } from 'js-yaml';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { Chip } from '../ui/index.esm.js';
import { useUi } from '../ui/styles.esm.js';
import { newSpec } from './componentCatalog.esm.js';
import { SchemaFields } from './SchemaFields.esm.js';
import { useStyles } from './styles.esm.js';

function parseComponents(text) {
  if (!text.trim()) return [];
  try {
    const v = load(text);
    if (!Array.isArray(v)) return void 0;
    return v.map((c) => {
      const r = c && typeof c === "object" ? c : {};
      const spec = r.spec && typeof r.spec === "object" && !Array.isArray(r.spec) ? r.spec : {};
      return { name: String(r.name ?? ""), type: String(r.type ?? ""), spec };
    });
  } catch {
    return void 0;
  }
}
function dumpComponents(rows) {
  if (rows.length === 0) return "";
  return dump(
    rows.map((r) => ({ type: r.type, name: r.name, ...Object.keys(r.spec).length > 0 ? { spec: r.spec } : {} })),
    { lineWidth: 100 }
  ).trimEnd();
}
const resolve = (template, name) => (template ?? "").replace("{name}", name);
function ComponentsEditor({
  text,
  onChange,
  defs,
  onRemove,
  wired,
  onWire,
  onRename
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ui = useUi({ t });
  const [addType, setAddType] = useState("");
  const renamingFrom = useRef(void 0);
  const rows = parseComponents(text);
  if (!defs) {
    return /* @__PURE__ */ jsx("div", { className: ui.note, children: "The component catalog could not be loaded, so the form is not available. Edit the components in the YAML below." });
  }
  if (!rows) {
    return /* @__PURE__ */ jsx("div", { className: ui.note, children: "The components below are not a YAML list the form can edit. Fix the YAML first, or keep editing it there." });
  }
  const set = (next) => onChange(dumpComponents(next));
  const update = (i, patch) => set(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  const uniqueName = (type) => {
    let n = type;
    for (let k = 2; rows.some((r) => r.name === n); k++) n = `${type}-${k}`;
    return n;
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.rowList, children: [
    rows.length === 0 && /* @__PURE__ */ jsx("div", { className: ui.note, children: "No components yet. Add one to give this environment a Redis, a database or a message broker." }),
    rows.map((r, i) => {
      const def = defs.find((d) => d.type === r.type);
      return /* @__PURE__ */ jsxs("div", { className: classes.stepCard, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.row, style: { alignItems: "center" }, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              className: classes.input,
              "aria-label": `Component ${i + 1} name`,
              placeholder: "not set: a name, for example cache",
              value: r.name,
              onChange: (e) => update(i, { name: e.target.value }),
              onFocus: () => {
                renamingFrom.current = r.name;
              },
              onBlur: (e) => {
                const from = renamingFrom.current;
                renamingFrom.current = void 0;
                const to = e.target.value.trim();
                if (from && to && from !== to) onRename?.(from, to);
              },
              style: { maxWidth: 260 }
            }
          ),
          /* @__PURE__ */ jsx(Chip, { tone: "ground", children: def?.kind ?? r.type }),
          /* @__PURE__ */ jsx("span", { style: { flex: 1 } }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: classes.removeBtn,
              onClick: () => {
                set(rows.filter((_, j) => j !== i));
                onRemove?.(r);
              },
              children: "Remove"
            }
          )
        ] }),
        def ? /* @__PURE__ */ jsxs(Fragment, { children: [
          def.summary && /* @__PURE__ */ jsx("div", { className: ui.note, style: { margin: "8px 0" }, children: def.summary }),
          /* @__PURE__ */ jsx(SchemaFields, { def, spec: r.spec, idPrefix: `Component ${i + 1}`, onChange: (spec) => update(i, { spec }) }),
          Object.keys(def.outputs).length > 0 && r.name && (() => {
            const reading = wired?.(r.name) ?? {};
            const unwired = Object.keys(def.outputs).filter((k) => !(reading[k]?.length > 0));
            return /* @__PURE__ */ jsxs("div", { style: { marginTop: 10 }, children: [
              /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, children: "What it gives the app" }),
              /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
                "Each output reaches the app as an environment variable with ",
                /* @__PURE__ */ jsx("b", { children: "From component" }),
                " (Config tab), so a rename cannot break it. Adding a component adds them under the names the app's framework or driver reads on its own where Tower knows them (Spring Boot's SPRING_DATASOURCE_URL, libpq's PGHOST), otherwise <COMPONENT>_<OUTPUT>; rename any of them on the Config tab. The right column shows which variable reads each output."
              ] }),
              /* @__PURE__ */ jsx("table", { style: { marginTop: 4, fontSize: 12, borderCollapse: "collapse" }, children: /* @__PURE__ */ jsx("tbody", { children: Object.entries(def.outputs).map(([k, o]) => /* @__PURE__ */ jsxs("tr", { children: [
                /* @__PURE__ */ jsx("td", { style: { padding: "2px 14px 2px 0", fontWeight: 600 }, children: k }),
                /* @__PURE__ */ jsx("td", { style: { padding: "2px 14px 2px 0", opacity: 0.8 }, children: o.kind === "literal" ? "a plain value" : `${o.kind === "secretKeyRef" ? "Secret" : "ConfigMap"} ${resolve(o.secret ?? o.configMap, r.name)}, key ${o.key}` }),
                wired && /* @__PURE__ */ jsx("td", { style: { padding: "2px 0", fontFamily: "monospace" }, "aria-label": `Env vars reading ${k}`, children: reading[k]?.length ? `\u2192 ${reading[k].join(", ")}` : /* @__PURE__ */ jsx("span", { style: { opacity: 0.6 }, children: "not used" }) })
              ] }, k)) }) }),
              onWire && unwired.length > 0 && /* @__PURE__ */ jsxs("button", { type: "button", className: classes.addBtn, style: { marginTop: 6 }, onClick: () => onWire(r.name, unwired, { type: r.type, all: true }), children: [
                "+ Add environment variables for ",
                unwired.join(", ")
              ] })
            ] });
          })()
        ] }) : /* @__PURE__ */ jsxs("div", { className: ui.problem, style: { marginTop: 8 }, children: [
          '"',
          r.type,
          '" is not a component type airframe knows, so its fields cannot be drawn. Edit it in the YAML below.'
        ] })
      ] }, i);
    }),
    /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
      /* @__PURE__ */ jsxs("select", { className: classes.input, "aria-label": "Component type to add", value: addType, onChange: (e) => setAddType(e.target.value), style: { maxWidth: 260 }, children: [
        /* @__PURE__ */ jsx("option", { value: "", children: "Choose a type\u2026" }),
        defs.map((d) => /* @__PURE__ */ jsx("option", { value: d.type, children: d.kind }, d.type))
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: classes.addBtn,
          disabled: !addType,
          onClick: () => {
            const def = defs.find((d) => d.type === addType);
            if (!def) return;
            const name = uniqueName(def.type);
            set([...rows, { type: def.type, name, spec: newSpec(def) }]);
            setAddType("");
            onWire?.(name, Object.keys(def.outputs), { type: def.type, all: false });
          },
          children: "+ Add component"
        }
      )
    ] })
  ] });
}

export { ComponentsEditor, dumpComponents, parseComponents };
//# sourceMappingURL=ComponentsEditor.esm.js.map

import { jsxs, jsx } from 'react/jsx-runtime';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import { usePrometheusInstantQuery } from '../usePrometheusQuery.esm.js';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { Chip } from '../ui/index.esm.js';
import { useUi } from '../ui/styles.esm.js';
import { SLO_PRESETS_NOTE, SLO_PRESETS, presetOn, togglePreset } from './sloCatalog.esm.js';
import { useStyles } from './styles.esm.js';

const TONE = { found: "ok", checking: "neutral", none: "bad", unreachable: "bad" };
function PresetRow({
  preset,
  ctx,
  cluster,
  text,
  onChange
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ui = useUi({ t });
  const { loading, error, samples } = usePrometheusInstantQuery(cluster, preset.dataQuery(ctx));
  let data = "checking";
  if (!loading) {
    if (error) data = "unreachable";
    else data = samples.some((s) => s.value > 0) ? "found" : "none";
  }
  const on = presetOn(text, preset, ctx);
  const editable = togglePreset(text, preset, ctx, !on) !== void 0;
  const canToggle = editable && (on || data === "found");
  const why = {
    checking: "Checking whether the metric has data\u2026",
    found: "The metric has data for this workload.",
    none: `No data yet for this workload on ${cluster}: the pods have not reported these probes, so the SLO would show nothing.`,
    unreachable: `Tower could not reach Prometheus on ${cluster}, so it cannot tell whether there is data.`
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.row, style: { alignItems: "flex-start" }, children: [
    /* @__PURE__ */ jsx(
      Switch,
      {
        checked: on,
        disabled: !canToggle,
        inputProps: { "aria-label": `SLO ${preset.title}` },
        onChange: (e) => {
          const next = togglePreset(text, preset, ctx, e.target.checked);
          if (next !== void 0) onChange(next);
        }
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
      /* @__PURE__ */ jsxs(Typography, { className: classes.switchLabel, children: [
        preset.title,
        " ",
        /* @__PURE__ */ jsx("span", { title: why[data], children: /* @__PURE__ */ jsx(Chip, { tone: TONE[data], children: { checking: "checking", found: "data found", none: "no data yet", unreachable: "cannot check" }[data] }) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: ui.note, children: preset.description }),
      data !== "found" && data !== "checking" && !on && /* @__PURE__ */ jsx("div", { className: ui.note, children: why[data] }),
      !editable && /* @__PURE__ */ jsx("div", { className: ui.problem, children: "The YAML below is not a list, so this cannot edit it. Fix it first." })
    ] })
  ] });
}
function SloPresets({
  ctx,
  cluster,
  text,
  onChange
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ui = useUi({ t });
  return /* @__PURE__ */ jsxs("div", { style: { marginBottom: 14 }, children: [
    /* @__PURE__ */ jsx(Typography, { className: classes.fieldLabel, children: "Common SLOs" }),
    /* @__PURE__ */ jsxs("div", { className: ui.note, style: { marginBottom: 6 }, children: [
      "Turn one on and its entry is added to the YAML below; turn it off and only that entry is removed. ",
      SLO_PRESETS_NOTE
    ] }),
    /* @__PURE__ */ jsx("div", { className: classes.rowList, children: SLO_PRESETS.map((p) => /* @__PURE__ */ jsx(PresetRow, { preset: p, ctx, cluster, text, onChange }, p.id)) })
  ] });
}

export { SloPresets };
//# sourceMappingURL=SloPresets.esm.js.map

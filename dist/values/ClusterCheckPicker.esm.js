import { jsxs, jsx } from 'react/jsx-runtime';
import Typography from '@material-ui/core/Typography';
import { usePrometheusInstantQuery } from '../usePrometheusQuery.esm.js';
import { useHangarTokens } from '../brand/tokens.esm.js';
import { Button, Chip } from '../ui/index.esm.js';
import { useUi } from '../ui/styles.esm.js';
import { catalogCheck } from './analysisCatalog.esm.js';
import { useStyles } from './styles.esm.js';

const TONE = {
  found: "ok",
  checking: "neutral",
  unknown: "neutral",
  none: "bad",
  unreachable: "bad"
};
const LABEL = {
  found: "data found",
  checking: "checking",
  unknown: "not checked",
  none: "no data yet",
  unreachable: "cannot check"
};
function CheckRow({
  name,
  ctx,
  cluster,
  inUse,
  onAdd
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ui = useUi({ t });
  const known = catalogCheck(name);
  const { loading, error, samples } = usePrometheusInstantQuery(known ? cluster : void 0, known?.dataQuery(ctx));
  let data = known ? "checking" : "unknown";
  if (known && !loading) {
    if (error) data = "unreachable";
    else data = samples.some((s) => s.value > 0) ? "found" : "none";
  }
  const canAdd = !inUse && (data === "found" || data === "unknown");
  const why = {
    checking: "Checking whether the metric has data\u2026",
    found: "The metric this check reads has data for this workload.",
    none: `No data for this workload on ${cluster}: it needs ${known?.needs}. Until that is scraped the check passes without looking at anything.`,
    unreachable: `Tower could not reach Prometheus on ${cluster}, so it cannot tell whether this check would see data.`,
    unknown: "Not part of the airframe catalog, so Tower does not know which metric it reads. Check its args yourself."
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.row, style: { alignItems: "flex-start" }, children: [
    /* @__PURE__ */ jsx(Button, { small: true, disabled: !canAdd, "aria-label": `Add cluster check ${name}`, onClick: () => onAdd(name), children: inUse ? "Added" : "+ Add" }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
      /* @__PURE__ */ jsxs(Typography, { className: classes.switchLabel, children: [
        known ? `${known.title} ` : "",
        /* @__PURE__ */ jsx("code", { children: name }),
        " ",
        /* @__PURE__ */ jsx("span", { title: why[data], children: /* @__PURE__ */ jsx(Chip, { tone: TONE[data], children: LABEL[data] }) })
      ] }),
      data !== "found" && data !== "checking" && /* @__PURE__ */ jsx("div", { className: ui.note, children: why[data] })
    ] })
  ] });
}
function ClusterCheckPicker({
  templates,
  ctx,
  cluster,
  inUse,
  onAdd
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const ui = useUi({ t });
  return /* @__PURE__ */ jsxs("div", { style: { marginTop: 12 }, children: [
    /* @__PURE__ */ jsxs(Typography, { className: classes.fieldLabel, children: [
      "Cluster checks on ",
      cluster
    ] }),
    /* @__PURE__ */ jsxs("div", { className: ui.note, style: { marginBottom: 6 }, children: [
      "Adds an analysis step that runs the check against this environment (",
      ctx.namespace,
      ", pods ",
      ctx.app,
      "-*). Put it after a weight step: a failing check aborts the rollout."
    ] }),
    templates === void 0 && /* @__PURE__ */ jsx("div", { className: ui.note, children: "Tower could not read this cluster's templates." }),
    templates?.length === 0 && /* @__PURE__ */ jsx("div", { className: ui.note, children: "This cluster has no cluster templates." }),
    /* @__PURE__ */ jsx("div", { className: classes.rowList, children: (templates ?? []).map((name) => /* @__PURE__ */ jsx(CheckRow, { name, ctx, cluster, inUse: inUse.includes(name), onAdd }, name)) })
  ] });
}

export { ClusterCheckPicker };
//# sourceMappingURL=ClusterCheckPicker.esm.js.map

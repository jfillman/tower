import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';

function stepLabel(step) {
  const base = step.stage ?? step.name ?? "step";
  return step.env ? `${base} \u2192 ${step.env}` : base;
}
const useStyles = makeStyles(() => ({
  wrap: { display: "flex", flexDirection: "column", gap: 6 },
  name: { fontFamily: fontDisplay, fontSize: 12.5, fontWeight: 700, color: ({ t }) => t.textHi },
  row: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" },
  trigger: {
    fontFamily: fontMono,
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 10,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    color: ({ t }) => t.textLo
  },
  connector: { width: 12, height: 1, backgroundColor: ({ t }) => t.line },
  chip: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "3px 9px",
    borderRadius: 10,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    border: ({ t }) => `1px solid ${t.lineSoft}`
  }
}));
function PipelineFlowPreview({
  name,
  pipeline
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const steps = Array.isArray(pipeline) ? pipeline : pipeline.steps ?? [];
  const trigger = Array.isArray(pipeline) ? void 0 : pipeline.trigger;
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsx("span", { className: classes.name, children: name }),
    /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
      trigger !== void 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("span", { className: classes.trigger, children: typeof trigger === "string" ? trigger : JSON.stringify(trigger) }),
        steps.length > 0 && /* @__PURE__ */ jsx("span", { className: classes.connector })
      ] }),
      steps.map((step, i) => /* @__PURE__ */ jsxs("span", { style: { display: "contents" }, children: [
        /* @__PURE__ */ jsx("span", { className: classes.chip, children: stepLabel(step) }),
        i < steps.length - 1 && /* @__PURE__ */ jsx("span", { className: classes.connector })
      ] }, i)),
      steps.length === 0 && trigger === void 0 && /* @__PURE__ */ jsx("span", { className: classes.trigger, children: "(no steps configured)" })
    ] })
  ] });
}

export { PipelineFlowPreview };
//# sourceMappingURL=PipelineFlowPreview.esm.js.map

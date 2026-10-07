import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Link from '@material-ui/core/Link';
import { ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { validateYamlBlock, YamlBlockEditor } from '../YamlBlockEditor.esm.js';
import { Button } from '../ui/index.esm.js';
import { describeChart } from '../environments/ownChart.esm.js';

const useStyles = makeStyles({
  note: { fontSize: 12.5, color: ({ t }) => t.textFaint, marginBottom: 10, lineHeight: 1.5 },
  mono: { fontFamily: fontMono, fontSize: 12 },
  bar: { display: "flex", alignItems: "center", gap: 12, marginTop: 8 }
});
function RawValuesEditor({ source, chart }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const original = source.data?.raw ?? "";
  const [text, setText] = useState(original);
  useEffect(() => setText(original), [original]);
  const check = validateYamlBlock(text);
  const dirty = text !== original;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: c.note, children: [
      "This environment renders its own chart, ",
      /* @__PURE__ */ jsx("span", { className: c.mono, children: describeChart(chart) }),
      ", not Airframe's, so its values are edited as YAML here. The keys are that chart's. ",
      /* @__PURE__ */ jsx("span", { className: c.mono, children: "release" }),
      " and",
      " ",
      /* @__PURE__ */ jsx("span", { className: c.mono, children: "releaseTracking" }),
      " belong to the deploy and release flows and are kept as they are."
    ] }),
    /* @__PURE__ */ jsx(YamlBlockEditor, { label: source.data?.path ?? "values", value: text, onChange: setText, rows: 16 }),
    /* @__PURE__ */ jsxs("div", { className: c.bar, children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "primary",
          disabled: !dirty || !check.valid || source.submitting,
          onMouseDown: (e) => e.preventDefault(),
          onClick: () => void source.submitRaw(text, [`Edit ${source.data?.path ?? "values"} as YAML (own chart)`]).catch(() => void 0),
          children: source.submitting ? "Opening pull request\u2026" : "Open pull request"
        }
      ),
      source.result && /* @__PURE__ */ jsx(Link, { className: c.mono, href: source.result.prUrl, target: "_blank", rel: "noopener noreferrer", children: source.result.prUrl })
    ] }),
    source.submitError && /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(source.submitError) })
  ] });
}

export { RawValuesEditor };
//# sourceMappingURL=RawValuesEditor.esm.js.map

import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { chainIdToSlug } from './tekton/chainSlug.esm.js';
import { TextLink } from './ui/index.esm.js';
import { Tooltip } from './ui/Tooltip.esm.js';

const useStyles = makeStyles(() => ({
  line: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, display: "inline-flex", flexWrap: "wrap", gap: 4, alignItems: "baseline" },
  trace: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, userSelect: "all" }
}));
function flowHref(slug) {
  return `?tab=pipelines&flow=${encodeURIComponent(slug)}&history=30d`;
}
function LineageLine({
  slug,
  origin,
  traceId
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  if (!origin?.chainId) return null;
  const originSlug = origin.chainSlug ?? chainIdToSlug(origin.chainId);
  const buildTrace = origin.traceId;
  const joined = Boolean(traceId && buildTrace && traceId === buildTrace);
  return /* @__PURE__ */ jsxs("span", { className: c.line, "data-testid": "lineage", children: [
    /* @__PURE__ */ jsxs("span", { children: [
      slug ? `${slug} \xB7 ` : "",
      "from"
    ] }),
    originSlug ? /* @__PURE__ */ jsx(TextLink, { to: flowHref(originSlug), title: `Open the Pipelines tab on ${originSlug}, the flow that built this image`, children: originSlug }) : /* @__PURE__ */ jsx("span", { children: "the build flow" }),
    joined && /* @__PURE__ */ jsx(Tooltip, { title: "This promotion's spans are in the build's trace", children: /* @__PURE__ */ jsxs("span", { className: c.trace, children: [
      "\xB7 trace ",
      buildTrace
    ] }) }),
    !joined && (traceId || buildTrace) && /* @__PURE__ */ jsxs("span", { className: c.trace, children: [
      traceId ? `\xB7 trace ${traceId}` : "",
      buildTrace ? ` \xB7 build trace ${buildTrace}` : ""
    ] })
  ] });
}

export { LineageLine, flowHref };
//# sourceMappingURL=LineageLine.esm.js.map

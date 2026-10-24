import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState, useEffect, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontScale, fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { Section, FilterBar, FilterChips, Count, Hint, Card, useTableKit, EmptyNote, Callout, FactGrid, Fact, StatusChip, FilterSelect } from '../ui/index.esm.js';
import { explain } from '../supplyChain.esm.js';
import { specOperations, operationForSpan, diffSpecs } from './apiSpec.esm.js';
import { serviceNameOf, formatRate } from './model.esm.js';
import { useObservedOperations } from './useAirspace.esm.js';

const VERDICT_TONE = { verified: "ok", unverified: "warn", contradicted: "bad", missing: "neutral" };
const useStyles = makeStyles(() => ({
  method: { fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.sky },
  path: { fontFamily: fontMono, fontSize: fontScale.md, color: ({ t }) => t.textHi },
  deprecatedPath: { textDecoration: "line-through", color: ({ t }) => t.textFaint },
  mono: { fontFamily: fontMono, fontSize: fontScale.sm },
  changeList: { margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 },
  scrollBox: { overflowX: "auto" },
  filterPad: { padding: "10px 14px 0" },
  factsPad: { padding: "0 14px" }
}));
const short = (s, n = 12) => s ? s.replace(/^sha256:/, "").slice(0, n) : "\u2014";
const tagOf = (image) => image ? image.split("/").pop() ?? image : "\u2014";
const envId = (e) => `${e.cluster}/${e.env}`;
function DeployedSpecsPanel({
  app,
  envs,
  win,
  compareTo
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const withSpec = envs.filter((e) => e.spec);
  const [envKey, setEnvKey] = useState(() => envId(withSpec[0] ?? envs[0]));
  useEffect(() => {
    if (!envs.some((e) => envId(e) === envKey) && envs[0]) setEnvKey(envId(withSpec[0] ?? envs[0]));
  }, [envs, envKey, withSpec]);
  const current = envs.find((e) => envId(e) === envKey) ?? envs[0];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Section, { title: "Deployed specs", meta: /* @__PURE__ */ jsx(Count, { children: "signed onto each environment's image" }), framed: true, children: [
      /* @__PURE__ */ jsx("div", { className: c.filterPad, children: /* @__PURE__ */ jsx(FilterBar, { children: /* @__PURE__ */ jsx(
        FilterChips,
        {
          label: "Environment",
          options: envs.map((e) => ({ id: envId(e), label: e.env, title: `${e.env} on ${e.cluster}` })),
          value: envKey,
          onChange: setEnvKey
        }
      ) }) }),
      current && /* @__PURE__ */ jsx(EnvSpecDetail, { app, env: current, win })
    ] }),
    withSpec.length >= 2 ? /* @__PURE__ */ jsx(SpecDiffSection, { envs: withSpec, compareTo }) : /* @__PURE__ */ jsxs(Hint, { children: [
      "Only ",
      withSpec[0]?.env ?? "no environment",
      " carries a signed spec, so there is nothing to compare yet. Each build signs the spec onto its image; once a second environment runs one, the diff between them shows here."
    ] })
  ] });
}
function EnvSpecDetail({ app, env, win }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const observed = useObservedOperations(env.cluster, serviceNameOf(app, env.env), win);
  const ops = useMemo(() => env.spec ? specOperations(env.spec.predicate.spec) : [], [env.spec]);
  const usage = useMemo(() => {
    const out = /* @__PURE__ */ new Map();
    for (const o of observed.operations) {
      const op = operationForSpan(o.name, ops);
      if (op) out.set(op.key, (out.get(op.key) ?? 0) + o.rate);
    }
    return out;
  }, [observed.operations, ops]);
  if (env.loading) return /* @__PURE__ */ jsxs(EmptyNote, { inset: true, children: [
    "Reading ",
    env.env,
    "'s image\u2026"
  ] });
  if (env.error) {
    return /* @__PURE__ */ jsx(Callout, { tone: "neutral", title: `Couldn't read ${env.env}'s image attestations`, children: env.error });
  }
  if (!env.spec) {
    return /* @__PURE__ */ jsxs(EmptyNote, { inset: true, children: [
      env.env,
      " runs ",
      tagOf(env.image),
      ", which carries no signed spec: it was built before the app had an openapi.yaml (cicd.yaml api.spec), or before Glidepath attested specs."
    ] });
  }
  const p = env.spec.predicate;
  const why = explain(env.spec.attestation, "API spec");
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: c.factsPad, children: /* @__PURE__ */ jsxs(FactGrid, { children: [
      /* @__PURE__ */ jsxs(Fact, { label: "API", children: [
        p.title || app,
        " ",
        p.version && /* @__PURE__ */ jsx("span", { className: c.mono, children: p.version })
      ] }),
      /* @__PURE__ */ jsxs(Fact, { label: "Format", children: [
        p.apiType,
        " ",
        p.specVersion
      ] }),
      /* @__PURE__ */ jsx(Fact, { label: "Signature", title: `${why.headline}. ${why.body}`, children: /* @__PURE__ */ jsx(StatusChip, { tone: VERDICT_TONE[env.spec.verdict], title: why.headline, children: why.label }) }),
      /* @__PURE__ */ jsx(Fact, { label: "Image", children: /* @__PURE__ */ jsx("span", { className: c.mono, children: tagOf(env.image) }) }),
      /* @__PURE__ */ jsx(Fact, { label: "Digest", children: /* @__PURE__ */ jsx("span", { className: c.mono, children: short(env.digest) }) }),
      /* @__PURE__ */ jsx(Fact, { label: "Spec file", children: /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
        p.path,
        " \xB7 ",
        short(p.sha256)
      ] }) })
    ] }) }),
    env.spec.verdict !== "verified" && /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
      why.headline,
      ". ",
      why.consequence ?? why.body
    ] }),
    /* @__PURE__ */ jsx("div", { className: c.scrollBox, children: /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Method" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Path" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Summary" }),
        /* @__PURE__ */ jsxs("th", { className: tk.th, children: [
          "Seen in ",
          env.env
        ] })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: ops.map((o) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: c.method, children: o.method }) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: `${c.path} ${o.deprecated ? c.deprecatedPath : ""}`, children: o.path }) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: o.summary || "\u2014" }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: usage.has(o.key) ? formatRate(usage.get(o.key)) : "\u2014" })
      ] }, o.key)) })
    ] }) }),
    /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
      '"Seen" is per operation, from server spans in the last ',
      win,
      " that name a route. Traces don't say which fields a caller reads, and frameworks that report only the method match no operation."
    ] })
  ] });
}
function SpecDiffSection({ envs, compareTo }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const ids = envs.map(envId);
  const initialTo = envs.find((e) => e.env === compareTo) ?? envs[envs.length - 1];
  const initialFrom = envs.find((e) => e !== initialTo && envId(e) !== envId(initialTo)) ?? envs[0];
  const [from, setFrom] = useState(envId(initialFrom));
  const [to, setTo] = useState(envId(initialTo));
  const a = envs.find((e) => envId(e) === from);
  const b = envs.find((e) => envId(e) === to);
  const diff = useMemo(() => a?.spec && b?.spec ? diffSpecs(a.spec.predicate.spec, b.spec.predicate.spec) : void 0, [a, b]);
  const same = a?.spec && b?.spec && a.spec.predicate.sha256 === b.spec.predicate.sha256;
  const options = envs.map((e) => ({ value: envId(e), label: `${e.env} \xB7 ${e.spec?.predicate.version || short(e.spec?.predicate.sha256, 7)}` }));
  const unverified = [a, b].filter((e) => e?.spec && e.spec.verdict !== "verified").map((e) => e.env);
  let emptyNote;
  if (from === to) emptyNote = "Pick two different environments.";
  else if (same) emptyNote = `Both run the same spec file (${short(a?.spec?.predicate.sha256)}).`;
  else if (!diff || diff.operations.length === 0) {
    emptyNote = "The files differ, but no operation, parameter, request body or success response changed.";
  }
  return /* @__PURE__ */ jsxs(
    Section,
    {
      title: `Diff ${a?.env ?? "?"} \u2192 ${b?.env ?? "?"}`,
      meta: diff ? /* @__PURE__ */ jsxs(Count, { children: [
        diff.breakingCount,
        " breaking \xB7 ",
        diff.nonBreakingCount,
        " other \xB7 ",
        diff.unchangedCount,
        " unchanged"
      ] }) : void 0,
      framed: true,
      children: [
        /* @__PURE__ */ jsx("div", { className: c.filterPad, children: /* @__PURE__ */ jsxs(FilterBar, { children: [
          /* @__PURE__ */ jsx(FilterSelect, { label: "From", value: from, options, onChange: setFrom }),
          /* @__PURE__ */ jsx(FilterSelect, { label: "To", value: to, options: options.filter((o) => ids.includes(o.value)), onChange: setTo })
        ] }) }),
        /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
          "What changed from the spec ",
          a?.env,
          " runs to the one ",
          b?.env,
          " runs, read by Tower: removed operations, parameters and request fields that became required, and response fields removed or retyped count as breaking. A release PR's api-compat check (oasdiff) is the authoritative report; it shows on the Release Record."
        ] }),
        unverified.length > 0 && /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
          "The spec on ",
          unverified.join(" and "),
          " is not verified: the diff reads it as it is, without trusting it."
        ] }),
        emptyNote || !diff ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: emptyNote }) : /* @__PURE__ */ jsx("div", { className: c.scrollBox, children: /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Change" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Method" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Path" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "What" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: diff.operations.map((d) => /* @__PURE__ */ jsx(DiffRow, { d, c, tk }, d.key)) })
        ] }) })
      ]
    }
  );
}
function DiffRow({ d, c, tk }) {
  const label = { added: "Added", removed: "Removed", changed: "Changed" }[d.kind];
  return /* @__PURE__ */ jsxs("tr", { children: [
    /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(StatusChip, { tone: d.breaking ? "warn" : "neutral", children: d.breaking ? `${label} \xB7 breaking` : label }) }),
    /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: c.method, children: d.method }) }),
    /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: c.path, children: d.path }) }),
    /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("ul", { className: c.changeList, children: d.changes.map((x) => /* @__PURE__ */ jsx("li", { children: x.breaking ? /* @__PURE__ */ jsx("strong", { children: x.text }) : x.text }, x.text)) }) })
  ] });
}
function NoDeployedSpec({ app }) {
  return /* @__PURE__ */ jsx(Card, { title: "Deployed specs", children: /* @__PURE__ */ jsxs(Hint, { children: [
    "No environment of ",
    app,
    " runs an image with a signed spec yet. Glidepath signs the file named by cicd.yaml api.spec (default openapi.yaml at the repo root) onto every build; once a build with one is deployed, each environment's spec and the diff between them show here."
  ] }) });
}

export { DeployedSpecsPanel, NoDeployedSpec };
//# sourceMappingURL=DeployedSpecsPanel.esm.js.map

import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useMemo, useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontScale, fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { useTableKit, Callout, Hint, Section, FilterBar, FilterChips, SearchField, TextLink, EmptyNote, Chip, StatusChip, Count, Card, FactGrid, Fact } from '../ui/index.esm.js';
import { useFleetEnvironments } from '../useFleetEnvironments.esm.js';
import { withDeployedSpecs, refName } from './contracts.esm.js';
import { serviceNameOf, formatRate, appOfService } from './model.esm.js';
import { useApiContracts } from './useHangarApps.esm.js';
import { useObservedOperations } from './useAirspace.esm.js';
import { useDeployedSpecs } from './useDeployedSpecs.esm.js';
import { DeployedSpecsPanel, NoDeployedSpec } from './DeployedSpecsPanel.esm.js';
import { PanelSkeleton } from '../ui/LoadState.esm.js';
import { YamlBlock } from '../ui/YamlBlock.esm.js';

const useStyles = makeStyles(() => ({
  layout: { display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" },
  listCol: { flex: "1 1 320px", minWidth: 0, maxWidth: 420 },
  detailCol: { flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 },
  method: { fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.sky },
  path: { fontFamily: fontMono, fontSize: fontScale.md, color: ({ t }) => t.textHi },
  deprecatedPath: { textDecoration: "line-through", color: ({ t }) => t.textFaint },
  peers: { display: "flex", flexWrap: "wrap", gap: 6 },
  scrollBox: { overflowX: "auto" },
  filterPad: { padding: "10px 14px 0" },
  apiName: { display: "block", fontFamily: fontMono, fontSize: fontScale.md, color: ({ t }) => t.textHi },
  apiSub: { display: "block", fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.textLo, marginTop: 2 }
}));
const EXAMPLE = `# catalog-info.yaml in the app's repo, beside its Component
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: flight-api
  description: Flights, seats and status
spec:
  type: openapi          # openapi | asyncapi | graphql | grpc
  lifecycle: production
  owner: team-flight-data
  definition:
    $text: ./openapi.yaml
---
# and on the Component:
spec:
  providesApis: [flight-api]
  consumesApis: [baggage-api]   # on a caller's Component
`;
function ContractsView({
  graph,
  cluster,
  env,
  win,
  appFilter,
  compareTo,
  roster,
  nonce,
  onOpenApp
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const catalog = useApiContracts(nonce);
  const scoped = useMemo(
    () => appFilter ? roster.filter((e) => (e.metadata.annotations?.["github.com/project-slug"]?.split("/")[1] ?? e.metadata.name) === appFilter) : roster,
    [roster, appFilter]
  );
  const fleet = useFleetEnvironments(scoped);
  const deployed = useDeployedSpecs(fleet.apps, nonce);
  const contracts = useMemo(() => withDeployedSpecs(catalog.contracts, deployed.byApp), [catalog.contracts, deployed.byApp]);
  const { loading, error } = catalog;
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedRef, setSelectedRef] = useState(void 0);
  const [picked, setPicked] = useState(false);
  const pick = (ref) => {
    setPicked(true);
    setSelectedRef(ref);
  };
  const types = useMemo(() => [...new Set(contracts.map((x) => x.type))].sort(), [contracts]);
  const shown = useMemo(
    () => contracts.filter(
      (x) => (type === "all" || x.type === type) && (!appFilter || x.providers.some((p) => refName(p) === appFilter) || x.consumers.some((p) => refName(p) === appFilter)) && (!query || `${x.title} ${x.name} ${x.description ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    ),
    [contracts, type, appFilter, query]
  );
  useEffect(() => {
    if (!picked || !shown.some((x) => x.ref === selectedRef)) setSelectedRef(shown[0]?.ref);
  }, [shown, selectedRef, picked]);
  const selected = shown.find((x) => x.ref === selectedRef);
  if (loading) return /* @__PURE__ */ jsxs(Fragment, { children: [
    fleet.probes,
    /* @__PURE__ */ jsx(PanelSkeleton, { label: "Loading APIs" })
  ] });
  if (error) return /* @__PURE__ */ jsxs(Fragment, { children: [
    fleet.probes,
    /* @__PURE__ */ jsx(Callout, { tone: "bad", title: "Couldn't read the catalog's APIs", children: error })
  ] });
  if (contracts.length === 0) {
    return /* @__PURE__ */ jsxs("div", { className: c.detailCol, children: [
      fleet.probes,
      deployed.loading && /* @__PURE__ */ jsx(Hint, { children: "Reading each environment's image for a signed spec\u2026" }),
      /* @__PURE__ */ jsx(Callout, { tone: "neutral", title: "No APIs registered in the catalog yet", children: "Contracts lists the catalog's API entities. None exist yet: an app registers its API next to its Component, with the definition kept in the app's repo. Once one does, its operations, providers and consumers show here." }),
      /* @__PURE__ */ jsx(YamlBlock, { title: "Registering an API", text: EXAMPLE, lineNumbers: false }),
      appFilter && /* @__PURE__ */ jsx(ObservedOperations, { cluster, service: serviceNameOf(appFilter, env), win })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: c.layout, children: [
    fleet.probes,
    /* @__PURE__ */ jsx("div", { className: c.listCol, children: /* @__PURE__ */ jsxs(Section, { title: "APIs", count: shown.length, framed: true, children: [
      /* @__PURE__ */ jsx("div", { className: c.filterPad, children: /* @__PURE__ */ jsxs(FilterBar, { children: [
        /* @__PURE__ */ jsx(FilterChips, { label: "Type", options: [{ id: "all", label: "All" }, ...types.map((x) => ({ id: x, label: x }))], value: type, onChange: setType }),
        /* @__PURE__ */ jsx(SearchField, { label: "Search APIs", placeholder: "name or description", value: query, onChange: setQuery })
      ] }) }),
      appFilter && /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
        "APIs ",
        appFilter,
        " provides or consumes. ",
        /* @__PURE__ */ jsxs(TextLink, { onClick: () => onOpenApp(appFilter), children: [
          appFilter,
          "'s Airspace \u2192"
        ] })
      ] }),
      shown.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "No API matches." }) : /* @__PURE__ */ jsx("table", { className: tk.table, children: /* @__PURE__ */ jsx("tbody", { children: shown.map((x) => /* @__PURE__ */ jsxs(
        "tr",
        {
          tabIndex: 0,
          "aria-selected": x.ref === selected?.ref,
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") pick(x.ref);
          },
          className: `${tk.rowLink} ${x.ref === selected?.ref ? tk.rowSelected : ""}`,
          onClick: () => pick(x.ref),
          children: [
            /* @__PURE__ */ jsxs("td", { className: tk.td, children: [
              /* @__PURE__ */ jsx("span", { className: c.apiName, children: x.title }),
              x.subtitle && /* @__PURE__ */ jsx("span", { className: c.apiSub, children: x.subtitle })
            ] }),
            /* @__PURE__ */ jsxs("td", { className: tk.td, children: [
              /* @__PURE__ */ jsx(Chip, { children: x.type }),
              x.deployed && /* @__PURE__ */ jsxs(Fragment, { children: [
                " ",
                /* @__PURE__ */ jsx(StatusChip, { tone: "info", title: "Each environment's image carries a signed spec", children: "signed" })
              ] })
            ] }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(Count, { children: x.operations.length || "\u2014" }) })
          ]
        },
        x.ref
      )) }) })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: c.detailCol, children: [
      !selected && appFilter && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Callout, { tone: "neutral", title: `No registered API for ${appFilter}`, children: [
          "Nothing in the catalog says ",
          appFilter,
          " provides or consumes an API. What it served in traffic is below."
        ] }),
        /* @__PURE__ */ jsx(ObservedOperations, { cluster, service: serviceNameOf(appFilter, env), win })
      ] }),
      selected && appFilter && !selected.providers.some((p) => refName(p) === appFilter) && /* @__PURE__ */ jsx(ObservedOperations, { cluster, service: serviceNameOf(appFilter, env), win }),
      selected && /* @__PURE__ */ jsx(ContractDetail, { contract: selected, graph, cluster, env, win, compareTo, onOpenApp })
    ] })
  ] });
}
function ContractDetail({
  contract,
  graph,
  cluster,
  env,
  win,
  compareTo,
  onOpenApp
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const [showDef, setShowDef] = useState(false);
  const providers = contract.providers.map(refName);
  const callers = useMemo(() => {
    const out = /* @__PURE__ */ new Map();
    for (const p of providers) {
      const svc = serviceNameOf(p, env);
      for (const s of graph.samples) {
        if (s.server !== svc || s.client === "user") continue;
        const who = appOfService(s.client, env) ?? s.client;
        out.set(who, (out.get(who) ?? 0) + s.rate);
      }
    }
    return [...out.entries()].sort((a, b) => b[1] - a[1]);
  }, [providers, graph, env]);
  const declaredConsumers = contract.consumers.map(refName);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Card, { title: contract.title, meta: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Chip, { children: contract.type }),
      contract.subtitle && /* @__PURE__ */ jsx(Count, { children: contract.subtitle })
    ] }), actions: contract.lifecycle ? /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", children: contract.lifecycle }) : void 0, children: [
      contract.description && /* @__PURE__ */ jsx(Hint, { children: contract.description }),
      /* @__PURE__ */ jsxs(FactGrid, { children: [
        /* @__PURE__ */ jsx(Fact, { label: "Owner", children: contract.owner ?? "\u2014" }),
        /* @__PURE__ */ jsx(Fact, { label: "Provided by", children: /* @__PURE__ */ jsx("span", { className: c.peers, children: providers.length ? providers.map((p) => /* @__PURE__ */ jsx(TextLink, { onClick: () => onOpenApp(p), children: p }, p)) : "\u2014" }) }),
        /* @__PURE__ */ jsx(Fact, { label: "Declared consumers", children: /* @__PURE__ */ jsx("span", { className: c.peers, children: declaredConsumers.length ? declaredConsumers.join(", ") : "none" }) }),
        /* @__PURE__ */ jsx(Fact, { label: `Callers seen in ${env}`, children: /* @__PURE__ */ jsx("span", { className: c.peers, children: callers.length ? callers.map(([who, rate]) => /* @__PURE__ */ jsxs(StatusChip, { tone: declaredConsumers.includes(who) ? "ok" : "warn", title: declaredConsumers.includes(who) ? "declared consumer" : "calls the provider, not a declared consumer", children: [
          who,
          " \xB7 ",
          formatRate(rate)
        ] }, who)) : "none in this window" }) })
      ] })
    ] }),
    contract.source === "deployed" && /* @__PURE__ */ jsx(Hint, { children: "Read from the spec signed onto the app's images; there is no API entity for it in the catalog." }),
    contract.deployed ? /* @__PURE__ */ jsx(DeployedSpecsPanel, { app: contract.deployed.app, envs: contract.deployed.envs, win, compareTo }) : providers[0] && (contract.type === "openapi" || contract.type === "asyncapi") && /* @__PURE__ */ jsx(NoDeployedSpec, { app: providers[0] }),
    contract.source === "catalog" && /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs(Section, { title: "Operations", count: contract.operations.length, framed: true, children: [
      contract.parseError && /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
        "Couldn't read the definition as OpenAPI: ",
        contract.parseError
      ] }),
      !contract.parseError && contract.type !== "openapi" && /* @__PURE__ */ jsx(Hint, { inset: true, children: contract.type === "crd" ? "An Airframe XRD: its contract is the schema in the definition below, not HTTP operations." : `Operations are listed for OpenAPI definitions; this is ${contract.type}. The definition is below.` }),
      contract.operations.length > 0 && /* @__PURE__ */ jsx("div", { className: c.scrollBox, children: /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Method" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Path" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Summary" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: contract.operations.map((o) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: c.method, children: o.method }) }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: `${c.path} ${o.deprecated ? c.deprecatedPath : ""}`, children: o.path }) }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: o.summary || "\u2014" })
        ] }, `${o.method} ${o.path}`)) })
      ] }) })
    ] }) }),
    providers[0] && /* @__PURE__ */ jsx(ObservedOperations, { cluster, service: serviceNameOf(providers[0], env), win }),
    /* @__PURE__ */ jsx(TextLink, { expanded: showDef, onClick: () => setShowDef((v) => !v), children: "Definition" }),
    showDef && /* @__PURE__ */ jsx(YamlBlock, { title: `${contract.name} definition`, text: contract.definition || "# empty", filter: true })
  ] });
}
function ObservedOperations({ cluster, service, win }) {
  const tk = useTableKit();
  const ops = useObservedOperations(cluster, service, win);
  return /* @__PURE__ */ jsxs(Section, { title: `Operations seen in traffic \xB7 ${service}`, count: ops.operations.length, framed: true, children: [
    /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
      "Span names from traces in the last ",
      win,
      ": what was served, not a contract. Frameworks that do not report a route show only the method."
    ] }),
    ops.operations.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: ops.loading ? "Loading\u2026" : "None in this window." }) : /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Operation" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Rate" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: ops.operations.map((o) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { className: tk.td, children: o.name }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: formatRate(o.rate) })
      ] }, o.name)) })
    ] })
  ] });
}

export { ContractsView };
//# sourceMappingURL=ContractsView.esm.js.map

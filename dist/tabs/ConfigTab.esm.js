import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { TowerEmptyState } from '../TowerEmptyState.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';
import { ENVS_ROOT } from '../types.esm.js';
import { ConfigEditor } from '../values/ValuesForm.esm.js';
import { useChartValues } from '../values/annotatedValues.esm.js';
import { useComponentCatalog } from '../values/componentCatalog.esm.js';
import { useFlightBaseValuesSource, usePlatformValuesSource } from '../values/sources.esm.js';
import { RawValuesEditor } from '../values/RawValuesEditor.esm.js';
import { useCicdConfig } from '../useConfigData.esm.js';
import { readEnvironments } from '../environments/stagedChanges.esm.js';
import { ownChartOf } from '../environments/ownChart.esm.js';
import { PageHeader, Panel, Subtabs } from '../ui/index.esm.js';
import { useUi } from '../ui/styles.esm.js';
import { useHangarTokens } from '../brand/tokens.esm.js';

function configSections(appName, clusters) {
  const several = clusters.length > 1;
  return [
    {
      id: "base",
      kind: "base",
      label: "Ground shared values",
      title: "Ground shared values",
      path: `${ENVS_ROOT}/base.yaml`,
      hint: "The values every Ground environment starts from; an environment overrides any of them in its own file. Flight environments do not read this file: they have their own shared values, changed through a reviewed PR on the gitops repo."
    },
    ...clusters.map((cluster) => ({
      id: `flight-${cluster}`,
      kind: "flight",
      cluster,
      label: several ? `Flight shared values (${cluster})` : "Flight shared values",
      title: `Flight shared values on ${cluster}`,
      path: `gitops-${appName}/${cluster}/base.yaml`,
      hint: `The values every Flight environment on ${cluster} starts from; an environment overrides any of them in its own values.yaml. A change opens a PR on gitops-${appName} and reaches those environments when it merges, like a release.`
    })),
    {
      id: "preview",
      kind: "pr-env",
      label: "Preview environments",
      title: "Preview environment template",
      path: `${ENVS_ROOT}/pr-env.yaml`,
      hint: "The template every pull request preview environment is built from (on the cluster's default chart). Its name and image are set by the platform."
    }
  ];
}
function Editor({ owner, appName, section, source, own }) {
  const componentCatalog = useComponentCatalog(owner);
  const chart = useChartValues(owner);
  if (own && section.kind !== "pr-env") return /* @__PURE__ */ jsx(RawValuesEditor, { source, chart: own });
  return /* @__PURE__ */ jsx(ConfigEditor, { owner, appName, source, title: `${section.title} (${section.path})`, layout: "side", componentCatalog, chart });
}
function PlatformValues(props) {
  const source = usePlatformValuesSource({ owner: props.owner, appName: props.appName, selector: props.selector });
  return /* @__PURE__ */ jsx(Editor, { ...props, source });
}
function FlightValues(props) {
  const source = useFlightBaseValuesSource({ owner: props.owner, appName: props.appName, cluster: props.cluster });
  return /* @__PURE__ */ jsx(Editor, { ...props, source });
}
function ConfigTab() {
  const t = useHangarTokens();
  const ui = useUi({ t });
  const { owner, appName, loading, error } = useReleaseContext();
  const [sectionId, setSection] = useState("base");
  const cicd = useCicdConfig(owner && appName ? { owner, appName } : void 0);
  const deploy = cicd.data?.values.deploy;
  const clusters = useMemo(
    () => [...new Set(readEnvironments(deploy).envs.filter((e) => e.tier === "flight" && e.cluster).map((e) => e.cluster))],
    [deploy]
  );
  const own = ownChartOf(deploy, "");
  const [searchParams, setSearchParams] = useSearchParams();
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  if (!owner || !appName) {
    return /* @__PURE__ */ jsx(
      TowerEmptyState,
      {
        title: "Can't resolve this app's source repo",
        description: "App Configuration needs a resolved GitHub owner/repo (from a promoted environment's provenance) to know which repo's environments folder to read."
      }
    );
  }
  const sections = configSections(appName, clusters);
  const active = sections.find((s) => s.id === sectionId) ?? sections[0];
  const legacyEnv = searchParams.get("env");
  const toEnvironments = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("env");
    next.set("tab", "environments");
    setSearchParams(next);
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(PageHeader, { title: "App Configuration", subtitle: `What ${appName} shares across its environments. Every change opens a pull request (on the ${appName} repo, or gitops-${appName} for Flight); nothing is committed directly.` }),
    /* @__PURE__ */ jsx(Panel, { style: { padding: 12, marginBottom: 16 }, children: /* @__PURE__ */ jsxs("span", { className: ui.note, children: [
      legacyEnv ? `${legacyEnv}'s own values moved: ` : "An environment's own values are edited in its row on the ",
      /* @__PURE__ */ jsx("a", { href: "#environments", onClick: (e) => {
        e.preventDefault();
        toEnvironments();
      }, children: "Environments tab" }),
      "."
    ] }) }),
    /* @__PURE__ */ jsx(Subtabs, { label: "App configuration sections", value: active.id, onChange: setSection, tabs: sections.map((s) => ({ id: s.id, label: s.label })) }),
    /* @__PURE__ */ jsxs("div", { className: ui.note, style: { margin: "12px 0" }, children: [
      active.hint,
      " ",
      /* @__PURE__ */ jsx("code", { children: active.path })
    ] }),
    active.kind === "flight" ? /* @__PURE__ */ jsx(FlightValues, { owner, appName, section: active, cluster: active.cluster, own }, active.id) : /* @__PURE__ */ jsx(PlatformValues, { owner, appName, section: active, selector: { kind: active.kind }, own }, active.id)
  ] });
}

export { ConfigTab, configSections };
//# sourceMappingURL=ConfigTab.esm.js.map

import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { TowerEmptyState } from '../TowerEmptyState.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';
import { useEnvsRoot } from '../useConfigData.esm.js';
import { ConfigEditor } from '../values/ValuesForm.esm.js';
import { useChartValues } from '../values/annotatedValues.esm.js';
import { useComponentCatalog } from '../values/componentCatalog.esm.js';
import { usePlatformValuesSource } from '../values/sources.esm.js';
import { PageHeader, Panel, Subtabs } from '../ui/index.esm.js';
import { useUi } from '../ui/styles.esm.js';
import { useHangarTokens } from '../brand/tokens.esm.js';

const SECTIONS = [
  {
    id: "base",
    label: "Shared values",
    selector: { kind: "base" },
    file: "base.yaml",
    title: "Shared values",
    hint: "The values every Ground environment starts from. An environment overrides any of them in its own file, so a change here reaches each environment that has not."
  },
  {
    id: "preview",
    label: "Preview environments",
    selector: { kind: "pr-env" },
    file: "pr-env.yaml",
    title: "Preview environment template",
    hint: "The template every pull request preview environment is built from. Its name and image are set by the platform."
  }
];
function PlatformValues({ owner, appName, section, path }) {
  const source = usePlatformValuesSource({ owner, appName, selector: section.selector });
  const componentCatalog = useComponentCatalog(owner);
  const chart = useChartValues(owner);
  return /* @__PURE__ */ jsx(ConfigEditor, { owner, appName, source, title: `${section.title} (${path})`, layout: "side", componentCatalog, chart });
}
function ConfigTab() {
  const t = useHangarTokens();
  const ui = useUi({ t });
  const { owner, appName, loading, error } = useReleaseContext();
  const envsRoot = useEnvsRoot(owner && appName ? { owner, appName } : void 0);
  const [section, setSection] = useState("base");
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
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const activePath = `${envsRoot}/${active.file}`;
  const legacyEnv = searchParams.get("env");
  const toEnvironments = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("env");
    next.set("tab", "environments");
    setSearchParams(next);
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(PageHeader, { title: "App Configuration", subtitle: `What ${appName} shares across its environments. Every change opens a pull request on the ${appName} repo; nothing is committed directly.` }),
    /* @__PURE__ */ jsx(Panel, { style: { padding: 12, marginBottom: 16 }, children: /* @__PURE__ */ jsxs("span", { className: ui.note, children: [
      legacyEnv ? `${legacyEnv}'s own values moved: ` : "An environment's own values are edited in its row on the ",
      /* @__PURE__ */ jsx("a", { href: "#environments", onClick: (e) => {
        e.preventDefault();
        toEnvironments();
      }, children: "Environments tab" }),
      "."
    ] }) }),
    /* @__PURE__ */ jsx(Subtabs, { label: "App configuration sections", value: section, onChange: setSection, tabs: SECTIONS.map((s) => ({ id: s.id, label: s.label })) }),
    /* @__PURE__ */ jsxs("div", { className: ui.note, style: { margin: "12px 0" }, children: [
      active.hint,
      " ",
      /* @__PURE__ */ jsx("code", { children: activePath })
    ] }),
    /* @__PURE__ */ jsx(PlatformValues, { owner, appName, section: active, path: activePath }, active.id)
  ] });
}

export { ConfigTab };
//# sourceMappingURL=ConfigTab.esm.js.map

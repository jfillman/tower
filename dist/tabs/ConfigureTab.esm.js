import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEntity } from '@backstage/plugin-catalog-react';
import { hasCapabilities, CAP } from '../serviceClass.esm.js';
import { Subtabs, Hint } from '../ui/index.esm.js';
import { SettingFinder } from '../configure/SettingFinder.esm.js';
import { StagedScope } from '../configure/stagedScope.esm.js';
import { ConfigTab } from './ConfigTab.esm.js';
import { EnvironmentsTab } from './EnvironmentsTab.esm.js';
import { GlidepathTab } from './GlidepathTab.esm.js';

const CONFIGURE_SUBTABS = ["environments", "config", "glidepath"];
function isConfigureSubtab(id) {
  return CONFIGURE_SUBTABS.includes(id ?? "");
}
const SUBTABS = [
  { id: "environments", label: "Environments", Component: EnvironmentsTab },
  { id: "config", label: "Shared values (base.yaml)", Component: ConfigTab },
  { id: "glidepath", label: "Pipeline (cicd.yaml)", Component: GlidepathTab }
];
function ConfigureTab() {
  const { entity } = useEntity();
  const [searchParams, setSearchParams] = useSearchParams();
  const subtabs = SUBTABS.filter((s) => s.id !== "config" || hasCapabilities(entity, [CAP.valuesConfig]));
  const param = searchParams.get("tab");
  const active = isConfigureSubtab(param) && subtabs.some((s) => s.id === param) ? param : subtabs[0].id;
  const [visited, setVisited] = useState(() => /* @__PURE__ */ new Set([active]));
  if (!visited.has(active)) setVisited(/* @__PURE__ */ new Set([...visited, active]));
  const [staged, setStaged] = useState({});
  const onTotal = useMemo(
    () => Object.fromEntries(
      CONFIGURE_SUBTABS.map((id) => [id, (n) => setStaged((prev) => prev[id] === n ? prev : { ...prev, [id]: n })])
    ),
    []
  );
  const go = useCallback(
    (id, row) => setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", id);
      if (row) next.set("row", row);
      else next.delete("row");
      return next;
    }),
    [setSearchParams]
  );
  const openHit = (hit) => go(hit.file.subtab, hit.file.env);
  const elsewhere = subtabs.filter((s) => s.id !== active && (staged[s.id] ?? 0) > 0);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx(
        Subtabs,
        {
          label: "Configure",
          tabs: subtabs.map((s) => ({ id: s.id, label: s.label, marked: (staged[s.id] ?? 0) > 0 })),
          value: active,
          onChange: (id) => go(id)
        }
      ),
      /* @__PURE__ */ jsx(SettingFinder, { onOpen: openHit })
    ] }),
    elsewhere.length > 0 && /* @__PURE__ */ jsxs(Hint, { children: [
      "Staged and not yet opened in",
      " ",
      elsewhere.map((s) => `${s.label} (${staged[s.id]})`).join(", "),
      ". They stay staged while you work here; each sub-tab opens its own PR."
    ] }),
    /* @__PURE__ */ jsx("div", { style: { marginTop: 16 }, children: subtabs.filter((s) => visited.has(s.id)).map(({ id, Component }) => /* @__PURE__ */ jsx("div", { hidden: id !== active, children: /* @__PURE__ */ jsx(StagedScope, { onTotal: onTotal[id], children: /* @__PURE__ */ jsx(Component, {}) }) }, id)) })
  ] });
}

export { CONFIGURE_SUBTABS, ConfigureTab, isConfigureSubtab };
//# sourceMappingURL=ConfigureTab.esm.js.map

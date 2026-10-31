import { jsx } from 'react/jsx-runtime';
import { createRouteRef, createFrontendPlugin, PageBlueprint, createExtensionInput } from '@backstage/frontend-plugin-api';
import { HangarMark } from './brand/HangarMark.esm.js';
import { towerTabMountDataRef } from './mounts.esm.js';

const towerRouteRef = createRouteRef();
const towerPlugin = createFrontendPlugin({
  pluginId: "tower",
  extensions: [
    PageBlueprint.makeWithOverrides({
      inputs: {
        agentTab: createExtensionInput([towerTabMountDataRef], { singleton: true, optional: true }),
        clearanceTab: createExtensionInput([towerTabMountDataRef], { singleton: true, optional: true })
      },
      factory(originalFactory, { inputs }) {
        const mounts = {
          agent: inputs.agentTab?.get(towerTabMountDataRef),
          clearance: inputs.clearanceTab?.get(towerTabMountDataRef)
        };
        return originalFactory({
          path: "/tower",
          routeRef: towerRouteRef,
          title: "Tower",
          icon: /* @__PURE__ */ jsx(HangarMark, { glyph: "tower", size: 24 }),
          noHeader: true,
          loader: () => import('./TowerPage.esm.js').then((m) => /* @__PURE__ */ jsx(m.TowerPage, { mounts }))
        });
      }
    })
  ]
});

export { towerPlugin, towerRouteRef };
//# sourceMappingURL=plugin.esm.js.map

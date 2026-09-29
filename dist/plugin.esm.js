import { jsx } from 'react/jsx-runtime';
import { createRouteRef, createFrontendPlugin, PageBlueprint } from '@backstage/frontend-plugin-api';
import { HangarMark } from './brand/HangarMark.esm.js';

const towerRouteRef = createRouteRef();
const towerPlugin = createFrontendPlugin({
  pluginId: "tower",
  extensions: [
    PageBlueprint.make({
      params: {
        path: "/tower",
        routeRef: towerRouteRef,
        title: "Tower",
        icon: /* @__PURE__ */ jsx(HangarMark, { glyph: "tower", size: 24 }),
        noHeader: true,
        loader: () => import('./TowerPage.esm.js').then((m) => /* @__PURE__ */ jsx(m.TowerPage, {}))
      }
    })
  ]
});

export { towerPlugin, towerRouteRef };
//# sourceMappingURL=plugin.esm.js.map

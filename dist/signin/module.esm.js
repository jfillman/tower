import { jsx } from 'react/jsx-runtime';
import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { HangarSignInPage } from './HangarSignInPage.esm.js';

function createHangarSignInModule(options) {
  return createFrontendModule({
    pluginId: "app",
    extensions: [
      SignInPageBlueprint.make({
        params: {
          loader: async () => (props) => /* @__PURE__ */ jsx(HangarSignInPage, { ...props, ...options })
        }
      })
    ]
  });
}

export { createHangarSignInModule };
//# sourceMappingURL=module.esm.js.map

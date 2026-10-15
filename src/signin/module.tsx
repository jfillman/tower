import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { HangarSignInPage, type HangarSignInOptions } from './HangarSignInPage';

/**
 * The Hangar sign-in page as an app module: add the result to `createApp({ features })`. It overrides the app's
 * single `sign-in-page` extension, so remove any other SignInPageBlueprint the app registers. Providers are the
 * app's choice (which auth backends it runs), so they're passed in rather than fixed here.
 */
export function createHangarSignInModule(options: HangarSignInOptions) {
  return createFrontendModule({
    pluginId: 'app',
    extensions: [
      SignInPageBlueprint.make({
        params: {
          loader: async () => props => <HangarSignInPage {...props} {...options} />,
        },
      }),
    ],
  });
}

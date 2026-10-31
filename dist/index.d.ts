import * as _backstage_frontend_plugin_api from '@backstage/frontend-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { DiscoveryApi, FetchApi, ApiRef, ProfileInfoApi, BackstageIdentityApi, SessionApi, SignInPageProps } from '@backstage/core-plugin-api';
import * as react from 'react';
import { ReactNode } from 'react';

interface TowerTabMount {
    /** The tab's body. Rendered inside Tower's EntityProvider, so `useEntity()` gives it the service. */
    element: JSX.Element;
    /**
     * Whether the tab has anything to say about this service; absent means always. Tower asks once per service and
     * hides the tab until the answer is yes, so most services do not get an empty tab. A failure counts as no.
     */
    relevant?: (ctx: TowerMountContext) => Promise<boolean>;
}
interface TowerMountContext {
    entity: Entity;
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
}
declare const TOWER_TAB_MOUNT_ID = "tower.tab-mount";
declare const towerTabMountDataRef: _backstage_frontend_plugin_api.ConfigurableExtensionDataRef<TowerTabMount, "tower.tab-mount", {}>;
type TowerMountName = 'agent' | 'clearance';
/** The page extension's input names, one per mounted tab: `attachTo: { id: 'page:tower', input: <this> }`. */
declare const TOWER_MOUNT_INPUTS: Record<TowerMountName, string>;

declare const towerRouteRef: _backstage_frontend_plugin_api.RouteRef<undefined>;
declare const towerPlugin: _backstage_frontend_plugin_api.OverridableFrontendPlugin<{}, {}, {
    "page:tower": _backstage_frontend_plugin_api.OverridableExtensionDefinition<{
        config: {
            path: string | undefined;
            title: string | undefined;
        };
        configInput: {
            path?: string | undefined | undefined;
            title?: string | undefined | undefined;
        };
        output: _backstage_frontend_plugin_api.ExtensionDataRef<string, "core.routing.path", {}> | _backstage_frontend_plugin_api.ExtensionDataRef<_backstage_frontend_plugin_api.RouteRef<_backstage_frontend_plugin_api.AnyRouteRefParams>, "core.routing.ref", {
            optional: true;
        }> | _backstage_frontend_plugin_api.ExtensionDataRef<react.JSX.Element, "core.reactElement", {}> | _backstage_frontend_plugin_api.ExtensionDataRef<string, "core.title", {
            optional: true;
        }> | _backstage_frontend_plugin_api.ExtensionDataRef<_backstage_frontend_plugin_api.IconElement, "core.icon", {
            optional: true;
        }>;
        inputs: {
            pages: _backstage_frontend_plugin_api.ExtensionInput<_backstage_frontend_plugin_api.ConfigurableExtensionDataRef<react.JSX.Element, "core.reactElement", {}> | _backstage_frontend_plugin_api.ConfigurableExtensionDataRef<string, "core.routing.path", {}> | _backstage_frontend_plugin_api.ConfigurableExtensionDataRef<_backstage_frontend_plugin_api.RouteRef<_backstage_frontend_plugin_api.AnyRouteRefParams>, "core.routing.ref", {
                optional: true;
            }> | _backstage_frontend_plugin_api.ConfigurableExtensionDataRef<string, "core.title", {
                optional: true;
            }> | _backstage_frontend_plugin_api.ConfigurableExtensionDataRef<_backstage_frontend_plugin_api.IconElement, "core.icon", {
                optional: true;
            }>, {
                singleton: false;
                optional: false;
                internal: false;
            }>;
            agentTab: _backstage_frontend_plugin_api.ExtensionInput<_backstage_frontend_plugin_api.ConfigurableExtensionDataRef<TowerTabMount, "tower.tab-mount", {}>, {
                singleton: true;
                optional: true;
                internal: false;
            }>;
            clearanceTab: _backstage_frontend_plugin_api.ExtensionInput<_backstage_frontend_plugin_api.ConfigurableExtensionDataRef<TowerTabMount, "tower.tab-mount", {}>, {
                singleton: true;
                optional: true;
                internal: false;
            }>;
        };
        kind: "page";
        name: undefined;
        params: {
            path: string;
            title?: string;
            icon?: _backstage_frontend_plugin_api.IconElement;
            loader?: () => Promise<react.JSX.Element>;
            routeRef?: _backstage_frontend_plugin_api.RouteRef;
            noHeader?: boolean;
        };
    }>;
}>;

/** An OAuth provider the page offers. `id` is what's remembered between visits; keep it stable. */
interface HangarSignInProvider {
    id: string;
    title: string;
    /** One line under the button, e.g. which accounts are allowed. */
    message?: string;
    apiRef: ApiRef<ProfileInfoApi & BackstageIdentityApi & SessionApi>;
    icon?: ReactNode;
}
interface HangarSignInOptions {
    providers: HangarSignInProvider[];
    /** Offer "Continue as guest". Needs the backend guest provider; meant for local development only. */
    guest?: boolean;
    /** Replaces the default line under the wordmark. */
    tagline?: ReactNode;
}
declare const githubSignInProvider: HangarSignInProvider;
declare function HangarSignInPage({ onSignInSuccess, providers, guest, tagline }: SignInPageProps & HangarSignInOptions): react.JSX.Element;

/**
 * The Hangar sign-in page as an app module: add the result to `createApp({ features })`. It overrides the app's
 * single `sign-in-page` extension, so remove any other SignInPageBlueprint the app registers. Providers are the
 * app's choice (which auth backends it runs), so they're passed in rather than fixed here.
 */
declare function createHangarSignInModule(options: HangarSignInOptions): _backstage_frontend_plugin_api.FrontendModule;

export { HangarSignInPage, TOWER_MOUNT_INPUTS, TOWER_TAB_MOUNT_ID, createHangarSignInModule, githubSignInProvider, towerPlugin, towerRouteRef, towerTabMountDataRef };
export type { HangarSignInOptions, HangarSignInProvider, TowerMountContext, TowerMountName, TowerTabMount };

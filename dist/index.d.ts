import * as react from 'react';
import * as _backstage_frontend_plugin_api from '@backstage/frontend-plugin-api';

declare const towerRouteRef: _backstage_frontend_plugin_api.RouteRef<undefined>;
declare const towerPlugin: _backstage_frontend_plugin_api.OverridableFrontendPlugin<{}, {}, {
    "page:tower": _backstage_frontend_plugin_api.OverridableExtensionDefinition<{
        kind: "page";
        name: undefined;
        config: {
            path: string | undefined;
            title: string | undefined;
        };
        configInput: {
            path?: string | undefined;
            title?: string | undefined;
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
        };
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

export { towerPlugin, towerRouteRef };

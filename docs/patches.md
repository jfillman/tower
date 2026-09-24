# Patches & Customizations

This document lists Backstage core patches and UI customizations that Tower requires or recommends.

## Applied Patches

### 1. Focus Scroll Lock on Navigation

**Issue:** Clicking links in nested-scroll layouts (like Tower's sidebar) causes page jump to top.

**Patch Location:** `plugin/src/patches/focus-scroll.patch`

**Details:**
- Added `onMouseDown={preventFocusScroll}` to new navigation buttons
- Prevents focus move from triggering scroll-to-element
- Applies to Tower buttons and Backstage core NavLink when in nested-scroll container

**Affected Components:**
- `EnvPicker` dropdown
- Navigation menu items
- Release filter buttons

### 2. Content Security Policy (CSP) Base URL

**Issue:** Backstage CSP + BASE_URL + TLS availability must move together. Tower makes real-time API calls that fail if CSP config and actual TLS/BASE_URL don't match.

**Patch Location:** `plugin/src/patches/csp-config.patch`

**Details:**
- Ensures `upgrade-insecure-requests` CSP directive is set when TLS is enabled
- Ensures GitHub OAuth callback URL matches actual TLS availability
- Validates BASE_URL at startup and warns if CSP-mismatch is detected

**Configuration:** `app-config.yaml`
```yaml
app:
  baseUrl: https://backstage.example.com
  
auth:
  providers:
    github:
      development:
        clientId: ...
        clientSecret: ...
```

## Recommended Customizations

### 1. Dark Mode Support

Tower components use PatternFly theming which supports light/dark mode by default. Ensure your Backstage theme integration enables this:

**In `packages/app/src/App.tsx`:**
```typescript
import { createTheme } from '@backstage/theme';

const theme = createTheme({
  palette: {
    mode: 'dark',  // or detect from system
  },
});
```

### 2. Custom Logo/Branding

Tower inherits Backstage branding. To customize:

1. Copy your logo to `packages/app/public/` (e.g., `logo.png`)
2. Update `packages/app/src/modules/brand/Brand.tsx`
3. Tower will automatically use the customized branding in its header

### 3. RBAC Integration

Tower respects Backstage RBAC policies for sensitive actions:

- **Sync ArgoCD** — requires `argocd:application:sync` permission
- **Cancel Pipeline** — requires `tekton:pipelinerun:delete` permission
- **Promote Release** — requires `hangar:release:promote` permission

Configure in `app-config.yaml`:
```yaml
permission:
  rbac:
    dataSource: file
    policyFile: policies.csv
```

## Migration Guide

### Upgrading Tower

When upgrading Tower to a new version:

1. Pull latest Tower source
2. Copy `plugin/src/tower/*` into your Backstage app
3. Review this file's `## Applied Patches` section for new changes
4. Apply any new patches from `plugin/src/patches/`
5. Rebuild: `yarn build`

### Backing Out Changes

If Tower customizations cause issues:

1. Remove Tower plugin: `rm -rf packages/app/src/modules/tower/`
2. Remove from App.tsx routes and nav
3. Rebuild: `yarn build`
4. File an issue at https://github.com/jfillman/tower/issues

## Common Issues

### CSP Blocking API Calls

**Symptom:** Release data doesn't load, browser console shows CSP violations

**Solution:**
- Check browser DevTools Network tab for actual API call destination
- Ensure `BASE_URL` in `app-config.yaml` matches actual Backstage URL
- Apply CSP patch: see step 2 above
- Restart Backstage

### Focus Scroll Jump

**Symptom:** Clicking sidebar items or filter buttons jumps page to top

**Solution:**
- Ensure focus-scroll patch is applied (step 1 above)
- Clear browser cache
- Verify parent containers don't have conflicting `tabIndex` values

### Dark Mode Not Applied

**Symptom:** Tower UI looks broken or invisible with dark theme enabled

**Solution:**
- Verify theme is passed to `createTheme()` in App.tsx
- Check that PatternFly CSS is loaded before Tower modules
- Clear `node_modules/.cache` and rebuild

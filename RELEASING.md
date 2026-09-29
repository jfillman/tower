# Releasing

`@jfillman/tower` is distributed as a **git-tag dependency** — there's no npm registry, no
publish token. `backstage` (and any other consumer) pins a tag directly:

```json
"@jfillman/tower": "jfillman/tower#v0.1.0"
```

Because of that, the tagged commit must already contain the **built** `dist/` output — nothing
runs a build step at install time. That makes the release step manual and deliberate rather than
automated: CI (`.github/workflows/ci.yml`) only validates every push/PR (install, `tsc`, lint,
test, build) so a broken commit is caught long before it's ever tagged.

## Steps

1. Make sure `main` is clean and CI is green.
2. Bump `version` in `package.json`.
3. `yarn build` — regenerates `dist/`.
4. `git add package.json dist && git commit -m "release: vX.Y.Z"`
5. `git tag vX.Y.Z && git push origin main --tags`
6. In the consuming repo (e.g. `backstage`), bump the pin and reinstall:
   ```bash
   # packages/app/package.json: "@jfillman/tower": "jfillman/tower#vX.Y.Z"
   yarn install
   ```

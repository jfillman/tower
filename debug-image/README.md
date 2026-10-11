# Tower break-glass debug image

`ghcr.io/jfillman/tower-debug`: the container a Tower break-glass session runs in (spec:
`SPEC-tower-break-glass-debug.md`). Alpine plus:

| Need | Tools |
|---|---|
| HTTP, TLS | `curl`, `openssl` |
| DNS | `dig`, `host`, `nslookup` (bind-tools) |
| Sockets, routes, processes | `ss`, `ip` (iproute2), `lsof`, `ps`, `top` (procps), `nc` (netcat-openbsd) |
| Data | `jq`, `less` |
| Databases | `psql` (PostgreSQL 17 client), `redis-cli` |
| Everything else | busybox (`sh`, `ls`, `cat`, `grep`, `sed`, `awk`, `find`, `vi`, `wget`, `tar`, …) |

Not included, on purpose: `ping`, `traceroute`, `tcpdump`, `strace`, `gdb`. They need Linux capabilities (NET_RAW,
NET_ADMIN, SYS_PTRACE) that the break-glass admission policies drop from every debug container.

The image runs as 65532 with a read-only root, and has no writable directory.

## Releasing

Push a change under `debug-image/` to `main` (or run the workflow by hand). The workflow builds the image for amd64 and
arm64, pushes it, and signs it with cosign (keyless, GitHub OIDC). Its summary prints the digest.

Then pin that digest in the three places that name it:

- backstage `packages/backend/src/breakglassSpec.ts` (`DEBUG_IMAGE`);
- gitops-cluster-dev `30-policy/kyverno-policies/tower-breakglass.yaml`;
- gitops-cluster-kind-prod `30-policy/breakglass/policies.yaml`.

Accept the new digest in the policies **before** the backend uses it.

Verify a signature by hand:

```bash
cosign verify ghcr.io/jfillman/tower-debug@sha256:... \
  --certificate-identity-regexp '^https://github.com/jfillman/tower/.github/workflows/debug-image.yml@refs/heads/main$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

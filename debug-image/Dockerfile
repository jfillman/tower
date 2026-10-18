# Tower break-glass debug image (2026-10-11). What runs in a break-glass debug container, ephemeral or in a copy-mode
# pod: the tools to look inside a pod's network and processes, and nothing that needs privileges. The policies run it
# non-root (65532), every capability dropped, a read-only root, so:
#   - no writable directory: HOME=/tmp is read-only too; history files go to /dev/null;
#   - tools that need capabilities are left out on purpose: ping/traceroute (NET_RAW), tcpdump (NET_RAW, NET_ADMIN),
#     strace/gdb (SYS_PTRACE). Allowing them would be its own decision, in the policies, not here.
# Built for amd64 and arm64 (the fleet runs both), signed keylessly with cosign from this repo's workflow
# (.github/workflows/debug-image.yml), and pinned by digest in the backend and the admission policies.
FROM docker.io/library/alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8

RUN apk add --no-cache \
      bind-tools \
      ca-certificates \
      curl \
      iproute2 \
      jq \
      less \
      lsof \
      netcat-openbsd \
      openssl \
      postgresql17-client \
      procps \
      redis \
 && rm -rf /var/cache/apk/*

ENV HOME=/tmp \
    PSQL_HISTORY=/dev/null \
    REDISCLI_HISTFILE=/dev/null \
    LESSHISTFILE=- \
    PS1='debug \w $ '

USER 65532:65532
WORKDIR /tmp
CMD ["sh"]

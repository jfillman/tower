import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useRef, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { relativeTime, formatDateTime } from '../../shared/format.esm.js';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { ImageTagPill } from './ImageTagPill.esm.js';
import { useArgoCapabilities } from '../../useReleaseData.esm.js';
import { useTableKit, Card, EmptyNote, SectionTitle, StatusChip, Button, TextLink, Callout, Tile, Fact } from '../../ui/index.esm.js';
import { argoTone } from '../../argoTone.esm.js';
import { Tooltip, ActionReason } from '../../ui/Tooltip.esm.js';
import { MenuButton } from '../../ui/MenuButton.esm.js';

function syncWaveFor(node, k8sResources) {
  return k8sResources.find((r) => r.kind === node.kind && r.name === node.name)?.annotations?.["argocd.argoproj.io/sync-wave"];
}
const useStyles = makeStyles(() => ({
  headRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  statusChips: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
  revision: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  actions: { display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap", alignItems: "center" },
  // Real Application-level facts ArgoCD's own UI shows as standing banners
  // (2026-09-16: "the argocd info panel is missing vital info - there was
  // a sync result message" - operationState.message and status.conditions
  // weren't surfaced anywhere outside the collapsed disclosure before).
  // Always visible, not gated behind "show details" - these are exactly
  // the kind of thing that banner exists to hide by default (routine
  // sync/revision facts), not this.
  opBannerMeta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, marginTop: 2 },
  // The per-action explainer table (2026-09-16: "easy to understand
  // explainers on which sync option to enable depending on the argocd
  // state and what its possible errors are") - a short, always-the-same
  // reference, not a dynamic recommendation engine (TroubleshootBanner
  // already reads live state and tells you what's actually wrong/what to
  // do about THIS environment right now; this panel's guide is the
  // general "what does each button do" reference alongside it).
  guide: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 12px",
    backgroundColor: ({ t }) => t.panelAlt,
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`
  },
  guideRow: { display: "flex", gap: 10, fontSize: 11 },
  guideName: { fontFamily: fontMono, fontWeight: 700, color: ({ t }) => t.textHi, flex: "0 0 132px" },
  guideBody: { color: ({ t }) => t.textLo, lineHeight: 1.5 },
  guideRoadmapTag: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, fontStyle: "italic" },
  detail: { display: "flex", flexDirection: "column", gap: 12, paddingTop: 4, borderTop: ({ t }) => `1px solid ${t.lineSoft}` },
  kvGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" },
  kvFull: { gridColumn: "1 / -1" },
  flags: { display: "flex", gap: 5, flexWrap: "wrap", marginTop: 3 },
  subTitleGap: { marginBottom: 2 },
  // The full ArgoCD "Sync Status" panel column set (2026-09-16: "I would
  // like the argocd resource tree section to contain the same info as
  // argocd's UI does in the sync status page... sync wave, status, health,
  // hook, message") - a real table, not the prior flat pill list, since
  // that's the shape this much real per-resource data actually needs.
  treeScroll: { overflowX: "auto" },
  bodyRow: { borderTop: ({ t }) => `1px solid ${t.lineSoft}` },
  bodyRowHook: { backgroundColor: ({ t }) => t.panelAlt },
  cell: { padding: "6px 8px", color: ({ t }) => t.textHi, verticalAlign: "top" },
  cellMuted: { padding: "6px 8px", color: ({ t }) => t.textFaint, verticalAlign: "top" },
  cellKind: { padding: "6px 8px", color: ({ t }) => t.sky, fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap" },
  cellName: { padding: "6px 8px", color: ({ t }) => t.textHi, verticalAlign: "top", wordBreak: "break-word" },
  cellMessage: { padding: "6px 8px", color: ({ t }) => t.textFaint, verticalAlign: "top", wordBreak: "break-word", maxWidth: 260 },
  hookBadge: {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 7px",
    borderRadius: 10,
    whiteSpace: "nowrap",
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky
  },
  diffNote: { fontSize: 11, color: ({ t }) => t.textFaint, paddingTop: 6 }
}));
const SYNC_GUIDE = [
  {
    name: "Refresh",
    body: "Re-compares live cluster state against git and recomputes the diff. Applies nothing. Safe to click anytime - use it when you just want to confirm the status above is current."
  },
  {
    name: "Hard refresh",
    body: "Same as Refresh, but also bypasses ArgoCD's cached manifest render (Helm/Kustomize output). Use this instead of a plain Refresh when you changed something that affects manifest generation itself - a Helm values file, a referenced ConfigMap - and the diff still looks stale."
  },
  {
    name: "Sync",
    body: "Applies git's declared state to the cluster, following the Application's own sync policy: environment Applications prune, so anything git no longer declares is deleted too, as the next automatic sync would (there is no separate Sync with prune). Use when Sync status above reads OutOfSync and you don't want to wait for automated sync. Possible error: a sync can fail if a resource change conflicts with one made directly in the cluster."
  },
  {
    name: "Force sync",
    body: "Deletes and recreates a resource instead of patching it (Argo CD's --force). Use to recover from a resource stuck by an immutable-field conflict that a normal Sync can't apply, such as a changed Service selector or Job template. Risk: whatever gets replaced is briefly down. Ground: the app's owners. Flight: admins only."
  },
  {
    name: "Terminate",
    body: "Stops the sync operation that is running now, as Argo CD's own Terminate does. Use when a sync is stuck (a hook that never finishes, a resource that never gets healthy) and blocking the next one. What was already applied stays applied; run Sync again once the cause is fixed."
  },
  // ArgoCD's own Sync dialog "Advanced" section (2026-09-16: "consider adding additional argocd sync options").
  // Guide-only, no buttons: real sync-request modifiers this platform does not offer. Apply only went 2026-10-10:
  // it skips resource hooks, and Glidepath's environments have none since ADR-0021 phase 3.
  {
    name: "Replace",
    roadmap: true,
    body: "Uses kubectl replace instead of a normal apply - fully overwrites a resource with what's in git, dropping any field a normal apply left alone (e.g. one a different controller set directly). Use when a resource has drifted in a way a normal patch-based apply can't reconcile. Risk: can drop real fields a normal apply would have preserved."
  },
  {
    name: "Server-side apply",
    roadmap: true,
    body: "Uses the Kubernetes API server's own server-side apply instead of ArgoCD's client-side apply, for correct field-ownership tracking when another controller also legitimately writes to the same resource (e.g. an HPA managing replicas). Use when client-side apply keeps fighting that other controller. Possible error: a real field-manager conflict if two managers both claim the same field without one yielding."
  }
];
function forceSyncTargets(resources) {
  return resources.filter((r) => r.syncStatus && r.syncStatus !== "Synced").map((r) => `${r.kind}/${r.name}`);
}
function ArgoCommandPanel({
  env,
  argoActions,
  currentImage,
  incomingImage
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const tc = useTableKit();
  const [detailOpen, setDetailOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const caps = useArgoCapabilities(env.argoAppName ? env.cluster : void 0, env.argoAppName);
  const errorSignatureRef = useRef(void 0);
  useEffect(() => {
    const signature = `${env.argoAppName ?? ""}|${env.argoOperationStartedAt ?? ""}|${env.argoOperationFinishedAt ?? ""}|${env.argoSyncStatus ?? ""}`;
    if (argoActions.error && errorSignatureRef.current !== void 0 && errorSignatureRef.current !== signature) {
      argoActions.clearError();
    }
    errorSignatureRef.current = signature;
  }, [env.argoAppName, env.argoOperationStartedAt, env.argoOperationFinishedAt, env.argoSyncStatus]);
  if (!env.argoAppName) {
    return /* @__PURE__ */ jsx(Card, { title: "ArgoCD application", children: /* @__PURE__ */ jsx(EmptyNote, { children: "This environment has no ArgoCD Application resolved yet." }) });
  }
  const canAct = Boolean(env.cluster);
  const reached = env.argoHealthStatus !== void 0 || env.argoSyncStatus !== void 0;
  const resources = env.argoResources ?? [];
  const outOfSync = resources.filter((r) => r.syncStatus && r.syncStatus !== "Synced").length;
  const act = (fn) => {
    if (canAct) fn(env.cluster, env.argoAppName);
  };
  const may = (a) => caps.data ? caps.data[a] : a === "refresh" || a === "sync";
  const notAllowed = (a) => caps.data?.tier === "flight" && (a === "sync" || a === "force") ? "On a Flight environment only an admin may do this." : "Only the app's owning team (or an admin) may do this.";
  const running = env.argoOperationPhase === "Running";
  const replaced = forceSyncTargets(resources);
  const appOutOfSync = env.argoSyncStatus === "OutOfSync";
  const syncReasonId = `argo-sync-reason-${env.argoAppName}`;
  const syncLabel = appOutOfSync && outOfSync > 0 ? `Sync ${outOfSync} resource${outOfSync === 1 ? "" : "s"}` : "Sync";
  return /* @__PURE__ */ jsxs(Card, { children: [
    /* @__PURE__ */ jsxs("div", { className: classes.headRow, children: [
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(SectionTitle, { level: 2, children: env.argoAppName }) }),
      currentImage?.tag && /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
        incomingImage?.tag && /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: t.textFaint, fontFamily: fontMono }, children: "LIVE" }),
        /* @__PURE__ */ jsx(ImageTagPill, { tag: currentImage.tag, nickname: currentImage.nickname, size: "small" })
      ] }),
      incomingImage?.tag && /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: t.amberInk, fontFamily: fontMono, fontWeight: 700 }, children: "\u21E2 DEPLOYING" }),
        /* @__PURE__ */ jsx(ImageTagPill, { tag: incomingImage.tag, nickname: incomingImage.nickname, size: "small" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.statusChips, children: [
        /* @__PURE__ */ jsx(StatusChip, { tone: argoTone(env.argoSyncStatus), children: env.argoSyncStatus ?? "Sync unknown" }),
        /* @__PURE__ */ jsx(StatusChip, { tone: argoTone(env.argoHealthStatus), children: env.argoHealthStatus ?? "Health unknown" }),
        env.argoRevision && /* @__PURE__ */ jsxs("span", { className: classes.revision, children: [
          "@ ",
          env.argoRevision.slice(0, 9)
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
        /* @__PURE__ */ jsx(Tooltip, { title: SYNC_GUIDE[0].body, children: /* @__PURE__ */ jsx(Button, { small: true, disabled: !canAct || Boolean(argoActions.pending), onClick: () => act(argoActions.refresh), children: argoActions.pending === "refresh" ? "Refreshing\u2026" : "Refresh" }) }),
        /* @__PURE__ */ jsx(Tooltip, { title: may("sync") ? SYNC_GUIDE[2].body : void 0, children: /* @__PURE__ */ jsx(
          Button,
          {
            small: true,
            variant: appOutOfSync ? "primary" : "default",
            "aria-describedby": may("sync") ? void 0 : syncReasonId,
            disabled: !canAct || Boolean(argoActions.pending) || !may("sync"),
            onClick: () => act(argoActions.sync),
            children: argoActions.pending === "sync" ? "Syncing\u2026" : syncLabel
          }
        ) }),
        /* @__PURE__ */ jsx(
          MenuButton,
          {
            actions: [
              {
                key: "hardRefresh",
                label: argoActions.pending === "hardRefresh" ? "Refreshing\u2026" : "Hard refresh",
                hint: "re-reads the repo, skips cache",
                title: SYNC_GUIDE[1].body,
                disabled: !canAct || Boolean(argoActions.pending),
                onSelect: () => act(argoActions.hardRefresh)
              },
              ...running ? [
                {
                  key: "terminate",
                  label: argoActions.pending === "terminate" ? "Terminating\u2026" : "Terminate sync",
                  hint: "stops the running sync",
                  title: may("terminate") ? SYNC_GUIDE[4].body : notAllowed("terminate"),
                  disabled: !canAct || Boolean(argoActions.pending) || !may("terminate"),
                  onSelect: () => act(argoActions.terminate)
                }
              ] : [],
              {
                key: "force",
                label: argoActions.pending === "force" ? "Forcing\u2026" : "Force sync\u2026",
                hint: "replaces resources \xB7 asks first",
                danger: true,
                group: true,
                title: may("force") ? SYNC_GUIDE[3].body : notAllowed("force"),
                disabled: !canAct || Boolean(argoActions.pending) || !may("force"),
                onSelect: () => setConfirmForce(true)
              }
            ]
          }
        ),
        /* @__PURE__ */ jsx(TextLink, { expanded: guideOpen, onClick: () => setGuideOpen((v) => !v), children: "Which one?" })
      ] })
    ] }),
    !may("sync") && /* @__PURE__ */ jsxs(ActionReason, { id: syncReasonId, children: [
      notAllowed("sync"),
      " ",
      caps.data?.tier === "flight" ? "You can still Refresh, and Terminate a running sync." : ""
    ] }),
    (env.argoOperationMessage || env.argoOperationPhase) && /* @__PURE__ */ jsxs(Callout, { tone: "info", title: `Last operation: ${env.argoOperationPhase ?? "unknown"}`, children: [
      env.argoOperationMessage,
      env.argoReconciledAt && /* @__PURE__ */ jsx(Tooltip, { title: formatDateTime(env.argoReconciledAt), children: /* @__PURE__ */ jsxs("div", { className: classes.opBannerMeta, children: [
        "Last reconcile: ",
        relativeTime(env.argoReconciledAt)
      ] }) })
    ] }),
    (env.argoConditions ?? []).map((c, i) => /* @__PURE__ */ jsx(Callout, { tone: "bad", title: c.type, children: c.message }, `${c.type}-${i}`)),
    confirmForce && /* @__PURE__ */ jsx("div", { "data-testid": "force-sync-confirm", children: /* @__PURE__ */ jsxs(Callout, { tone: "bad", title: "Force sync", children: [
      /* @__PURE__ */ jsx("div", { children: replaced.length > 0 ? `Delete and recreate what is out of sync in ${env.argoAppName}: ${replaced.join(", ")}. Each is down until it is recreated.` : `Nothing in ${env.argoAppName} is out of sync right now, so a force sync has nothing to replace.` }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, marginTop: 6 }, children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            small: true,
            variant: "danger",
            disabled: replaced.length === 0,
            onClick: () => {
              setConfirmForce(false);
              act(argoActions.forceSync);
            },
            children: "Force sync"
          }
        ),
        /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setConfirmForce(false), children: "Cancel" })
      ] })
    ] }) }),
    argoActions.error && /* @__PURE__ */ jsx(Callout, { tone: "bad", title: "The ArgoCD action failed", children: argoActions.error }),
    !reached && /* @__PURE__ */ jsx(Callout, { tone: "warn", icon: "!", title: `Couldn't reach ArgoCD for ${env.argoAppName}`, children: "Sync and health on this page may be stale, not wrong. Try Refresh; if it persists, check RBAC or connectivity before treating it as a release problem." }),
    guideOpen && /* @__PURE__ */ jsx("div", { className: classes.guide, children: SYNC_GUIDE.map((g) => /* @__PURE__ */ jsxs("div", { className: classes.guideRow, children: [
      /* @__PURE__ */ jsxs("span", { className: classes.guideName, children: [
        g.name,
        g.roadmap && /* @__PURE__ */ jsx("div", { className: classes.guideRoadmapTag, children: "not yet available" })
      ] }),
      /* @__PURE__ */ jsx("span", { className: classes.guideBody, children: g.body })
    ] }, g.name)) }),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(TextLink, { expanded: detailOpen, onClick: () => setDetailOpen((v) => !v), children: "Sync policy, revision and resource tree" }) }),
    detailOpen && /* @__PURE__ */ jsxs("div", { className: classes.detail, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.kvGrid, children: [
        /* @__PURE__ */ jsx(Tile, { children: /* @__PURE__ */ jsx(Fact, { label: "Application", children: env.argoAppName }) }),
        /* @__PURE__ */ jsx(Tile, { children: /* @__PURE__ */ jsx(Fact, { label: "Target revision", children: env.argoSource?.targetRevision ?? "\u2014" }) }),
        /* @__PURE__ */ jsx(Tile, { children: /* @__PURE__ */ jsx(Fact, { label: "Last sync", title: env.argoOperationStartedAt ? formatDateTime(env.argoOperationStartedAt) : void 0, children: env.argoOperationStartedAt ? relativeTime(env.argoOperationStartedAt) : "\u2014" }) }),
        /* @__PURE__ */ jsx(Tile, { children: /* @__PURE__ */ jsx(Fact, { label: "Last operation", children: env.argoOperationPhase ?? "\u2014" }) }),
        /* @__PURE__ */ jsx(Tile, { children: /* @__PURE__ */ jsx(Fact, { label: "Out of sync", children: resources.length > 0 ? `${outOfSync} resource${outOfSync === 1 ? "" : "s"}` : "\u2014" }) }),
        env.argoOperationMessage && /* @__PURE__ */ jsx(Tile, { className: classes.kvFull, children: /* @__PURE__ */ jsx(Fact, { label: "Last operation message", children: env.argoOperationMessage }) }),
        /* @__PURE__ */ jsx(Tile, { className: classes.kvFull, children: /* @__PURE__ */ jsx(Fact, { label: "Sync policy", children: /* @__PURE__ */ jsxs("span", { className: classes.flags, children: [
          /* @__PURE__ */ jsx(StatusChip, { tone: env.argoSyncPolicy?.automated ? "ok" : "neutral", children: "automated" }),
          /* @__PURE__ */ jsx(StatusChip, { tone: env.argoSyncPolicy?.selfHeal ? "ok" : "neutral", children: "self-heal" }),
          /* @__PURE__ */ jsx(StatusChip, { tone: env.argoSyncPolicy?.prune ? "ok" : "neutral", children: "prune" })
        ] }) }) }),
        env.argoSource?.repoUrl && /* @__PURE__ */ jsx(Tile, { className: classes.kvFull, children: /* @__PURE__ */ jsxs(Fact, { label: "Source", children: [
          env.argoSource.repoUrl.replace(/^https?:\/\//, ""),
          env.argoSource.path ? ` \xB7 ${env.argoSource.path}` : ""
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: classes.subTitleGap, children: /* @__PURE__ */ jsx(SectionTitle, { level: 2, children: "Resource tree" }) }),
        resources.length === 0 ? /* @__PURE__ */ jsxs(EmptyNote, { children: [
          "No resource tree reported yet",
          reached ? "" : " (ArgoCD unreachable)",
          "."
        ] }) : /* @__PURE__ */ jsx("div", { className: classes.treeScroll, children: /* @__PURE__ */ jsxs("table", { className: `${tc.table} ${tc.dense}`, children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { className: tc.th, children: "Sync wave" }),
            /* @__PURE__ */ jsx("th", { className: tc.th, children: "Kind" }),
            /* @__PURE__ */ jsx("th", { className: tc.th, children: "Name" }),
            /* @__PURE__ */ jsx("th", { className: tc.th, children: "Status" }),
            /* @__PURE__ */ jsx("th", { className: tc.th, children: "Health" }),
            /* @__PURE__ */ jsx("th", { className: tc.th, children: "Hook" }),
            /* @__PURE__ */ jsx("th", { className: tc.th, children: "Message" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: resources.map((r, i) => /* @__PURE__ */ jsxs("tr", { className: `${classes.bodyRow} ${r.hookType ? classes.bodyRowHook : ""}`, children: [
            /* @__PURE__ */ jsx("td", { className: classes.cellMuted, children: syncWaveFor(r, env.resources) ?? "\u2014" }),
            /* @__PURE__ */ jsx("td", { className: classes.cellKind, children: r.kind }),
            /* @__PURE__ */ jsx("td", { className: classes.cellName, children: r.name }),
            /* @__PURE__ */ jsx("td", { className: classes.cell, children: r.syncStatus ? /* @__PURE__ */ jsx(StatusChip, { tone: argoTone(r.syncStatus), children: r.syncStatus }) : "\u2014" }),
            /* @__PURE__ */ jsx("td", { className: classes.cell, children: r.health ? /* @__PURE__ */ jsx(StatusChip, { tone: argoTone(r.health), children: r.health }) : "\u2014" }),
            /* @__PURE__ */ jsx("td", { className: classes.cell, children: r.hookType && /* @__PURE__ */ jsx("span", { className: classes.hookBadge, children: r.hookType }) }),
            /* @__PURE__ */ jsx("td", { className: classes.cellMessage, children: r.message ?? "\u2014" })
          ] }, `${r.kind}-${r.name}-${i}`)) })
        ] }) }),
        resources.length > 0 && /* @__PURE__ */ jsx(Typography, { className: classes.diffNote, children: outOfSync === 0 ? "All resources in sync." : `${outOfSync} resource${outOfSync === 1 ? "" : "s"} out of sync.` })
      ] })
    ] })
  ] });
}

export { ArgoCommandPanel, forceSyncTargets };
//# sourceMappingURL=ArgoCommandPanel.esm.js.map

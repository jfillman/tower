import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useRef, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { relativeTime, formatDateTime } from '../../shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { ImageTagPill } from './ImageTagPill.esm.js';

function syncWaveFor(node, k8sResources) {
  return k8sResources.find((r) => r.kind === node.kind && r.name === node.name)?.annotations?.["argocd.argoproj.io/sync-wave"];
}
const useStyles = makeStyles(() => ({
  panel: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 10,
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  headRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi, flexShrink: 0 },
  statusChips: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
  chip: { fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 12 },
  chipOk: { backgroundColor: ({ t }) => t.goodSoft, color: ({ t }) => t.good },
  chipProg: { backgroundColor: ({ t }) => t.amberSoft, color: ({ t }) => t.amberInk },
  chipBad: { backgroundColor: ({ t }) => t.badSoft, color: ({ t }) => t.bad },
  chipUnknown: { backgroundColor: ({ t }) => t.lineSoft, color: ({ t }) => t.textFaint },
  revision: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  actions: { display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap", alignItems: "center" },
  btn: {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 600,
    padding: "5px 11px",
    borderRadius: 7,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    cursor: "pointer",
    whiteSpace: "nowrap",
    "&:disabled": { opacity: 0.5, cursor: "default" }
  },
  btnPrimary: { backgroundColor: ({ t }) => t.skySoft, color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine },
  btnRoadmap: { opacity: 0.45, borderStyle: "dashed", cursor: "default" },
  helpToggle: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.sky,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "5px 4px",
    whiteSpace: "nowrap"
  },
  argoErr: { fontSize: 11.5, fontStyle: "italic", color: ({ t }) => t.bad },
  // Real Application-level facts ArgoCD's own UI shows as standing banners
  // (2026-09-16: "the argocd info panel is missing vital info - there was
  // a sync result message" - operationState.message and status.conditions
  // weren't surfaced anywhere outside the collapsed disclosure before).
  // Always visible, not gated behind "show details" - these are exactly
  // the kind of thing that banner exists to hide by default (routine
  // sync/revision facts), not this.
  opBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    backgroundColor: ({ t }) => t.skySoft,
    border: ({ t }) => `1px solid ${t.skyLine}`
  },
  opBannerBadge: { fontFamily: fontMono, fontSize: 9.5, fontWeight: 700, color: ({ t }) => t.sky, flexShrink: 0, marginTop: 1 },
  opBannerText: { fontSize: 12, color: ({ t }) => t.textHi, lineHeight: 1.5 },
  opBannerMeta: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint, marginTop: 2 },
  condition: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    backgroundColor: ({ t }) => t.badSoft,
    border: ({ t }) => `1px solid ${t.bad}`
  },
  conditionType: { fontFamily: fontMono, fontSize: 9.5, fontWeight: 700, color: ({ t }) => t.bad, flexShrink: 0, marginTop: 1 },
  conditionText: { fontSize: 12, color: ({ t }) => t.textHi, lineHeight: 1.5, wordBreak: "break-word" },
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
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.lineSoft}`
  },
  guideRow: { display: "flex", gap: 10, fontSize: 11.5 },
  guideName: { fontFamily: fontMono, fontWeight: 700, color: ({ t }) => t.textHi, flex: "0 0 132px" },
  guideBody: { color: ({ t }) => t.textLo, lineHeight: 1.5 },
  guideRoadmapTag: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.textFaint, fontStyle: "italic" },
  disclosureToggle: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    alignSelf: "flex-start",
    "&:hover": { color: ({ t }) => t.sky }
  },
  detail: { display: "flex", flexDirection: "column", gap: 12, paddingTop: 4, borderTop: ({ t }) => `1px solid ${t.lineSoft}` },
  kvGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" },
  kv: { display: "flex", flexDirection: "column", gap: 2, padding: "7px 9px", backgroundColor: ({ t }) => t.panelAlt, borderRadius: 6 },
  kvFull: { gridColumn: "1 / -1" },
  k: { fontFamily: fontMono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", color: ({ t }) => t.textFaint, fontWeight: 700 },
  v: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi, wordBreak: "break-word" },
  flags: { display: "flex", gap: 5, flexWrap: "wrap", marginTop: 3 },
  flag: { fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5, backgroundColor: ({ t }) => t.goodSoft, color: ({ t }) => t.good },
  flagOff: { backgroundColor: ({ t }) => t.lineSoft, color: ({ t }) => t.textFaint },
  subTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 12.5, color: ({ t }) => t.textHi, marginBottom: 2 },
  // The full ArgoCD "Sync Status" panel column set (2026-09-16: "I would
  // like the argocd resource tree section to contain the same info as
  // argocd's UI does in the sync status page... sync wave, status, health,
  // hook, message") - a real table, not the prior flat pill list, since
  // that's the shape this much real per-resource data actually needs.
  treeScroll: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontFamily: fontMono, fontSize: 11 },
  headCell: {
    textAlign: "left",
    padding: "5px 8px",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: 700,
    color: ({ t }) => t.textFaint,
    whiteSpace: "nowrap"
  },
  bodyRow: { borderTop: ({ t }) => `1px solid ${t.lineSoft}` },
  bodyRowHook: { backgroundColor: ({ t }) => t.panelAlt },
  cell: { padding: "6px 8px", color: ({ t }) => t.textHi, verticalAlign: "top" },
  cellMuted: { padding: "6px 8px", color: ({ t }) => t.textFaint, verticalAlign: "top" },
  cellKind: { padding: "6px 8px", color: ({ t }) => t.sky, fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap" },
  cellName: { padding: "6px 8px", color: ({ t }) => t.textHi, verticalAlign: "top", wordBreak: "break-word" },
  cellMessage: { padding: "6px 8px", color: ({ t }) => t.textFaint, verticalAlign: "top", wordBreak: "break-word", maxWidth: 260 },
  statusBadge: { display: "inline-block", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 10, whiteSpace: "nowrap" },
  hookBadge: {
    display: "inline-block",
    fontSize: 9.5,
    fontWeight: 700,
    padding: "2px 7px",
    borderRadius: 10,
    whiteSpace: "nowrap",
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky
  },
  diffNote: { fontSize: 11, color: ({ t }) => t.textFaint, paddingTop: 6 },
  note: { fontSize: 12, fontStyle: "italic", color: ({ t }) => t.textLo, padding: "2px 0" }
}));
function statusChipClass(classes, status) {
  if (status === "Healthy" || status === "Synced") return classes.chipOk;
  if (status === "Progressing" || status === "Suspended" || status === "OutOfSync") return classes.chipProg;
  if (status === "Degraded" || status === "Missing") return classes.chipBad;
  return classes.chipUnknown;
}
const SYNC_GUIDE = [
  {
    name: "Refresh",
    body: "Re-compares live cluster state against git and recomputes the diff. Applies nothing. Safe to click anytime - use it when you just want to confirm the status above is current."
  },
  {
    name: "Hard Refresh",
    body: "Same as Refresh, but also bypasses ArgoCD's cached manifest render (Helm/Kustomize output). Use this instead of a plain Refresh when you changed something that affects manifest generation itself - a Helm values file, a referenced ConfigMap - and the diff still looks stale."
  },
  {
    name: "Sync",
    body: "Applies git's declared state to the cluster. Use when Sync status above reads OutOfSync and automated sync is off (or is enabled but hasn't caught up yet). Possible error: a sync can fail outright if a resource change conflicts with one made directly in the cluster (someone/something edited live state git doesn't know about)."
  },
  {
    name: "Sync w/ Prune",
    roadmap: true,
    body: "Also deletes any resource that exists live but is no longer declared in git. Use to clean up after removing something from git. Risk: can delete real resources unexpectedly if git state is wrong - not yet available (needs the authorization model from HANDOFF-tower-write-actions.md)."
  },
  {
    name: "Force Sync",
    roadmap: true,
    body: "Deletes and recreates a resource instead of patching it. Use to recover from a resource stuck by an immutable-field conflict that a normal Sync can't apply. Risk: causes brief downtime for whatever gets replaced - not yet available, same reason as Sync w/ Prune."
  },
  // ArgoCD's own Sync dialog "Advanced" section (2026-09-16: "consider
  // adding additional argocd sync options, see screenshot" - Apply only/
  // Force/Replace/Server-side apply; Force itself is already covered as
  // "Force Sync" above). Guide-only, no button of their own - these are
  // real sync-request modifiers, not standalone actions, the same way
  // ArgoCD's own UI keeps them collapsed under "Advanced" rather than as
  // primary buttons; adding 3 more always-visible disabled buttons here
  // would clutter the action row for options this platform doesn't yet
  // have an authorization model to actually offer.
  {
    name: "Apply only",
    roadmap: true,
    body: "Skips this app's PreSync/PostSync/SyncFail resource hooks (platform-outcome-presync/postsync included) and applies the plain manifests only. Use to get git's declared state onto the cluster without re-triggering release-outcome hooks - e.g. when the hook itself is what's broken, not the actual application resources. Effect: no release-outcome event gets reported for a sync run this way."
  },
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
function ArgoCommandPanel({
  env,
  argoActions,
  currentImage,
  incomingImage
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [detailOpen, setDetailOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const errorSignatureRef = useRef(void 0);
  useEffect(() => {
    const signature = `${env.argoAppName ?? ""}|${env.argoOperationStartedAt ?? ""}|${env.argoOperationFinishedAt ?? ""}|${env.argoSyncStatus ?? ""}`;
    if (argoActions.error && errorSignatureRef.current !== void 0 && errorSignatureRef.current !== signature) {
      argoActions.clearError();
    }
    errorSignatureRef.current = signature;
  }, [env.argoAppName, env.argoOperationStartedAt, env.argoOperationFinishedAt, env.argoSyncStatus]);
  if (!env.argoAppName) {
    return /* @__PURE__ */ jsxs("div", { className: classes.panel, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "ArgoCD application" }),
      /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "This environment has no ArgoCD Application resolved yet." })
    ] });
  }
  const canAct = Boolean(env.cluster);
  const reached = env.argoHealthStatus !== void 0 || env.argoSyncStatus !== void 0;
  const resources = env.argoResources ?? [];
  const outOfSync = resources.filter((r) => r.syncStatus && r.syncStatus !== "Synced").length;
  const act = (fn) => {
    if (canAct) fn(env.cluster, env.argoAppName);
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.panel, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.headRow, children: [
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(Typography, { className: classes.title, children: env.argoAppName }) }),
      currentImage?.tag && /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
        incomingImage?.tag && /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: t.textFaint, fontFamily: fontMono }, children: "LIVE" }),
        /* @__PURE__ */ jsx(ImageTagPill, { tag: currentImage.tag, nickname: currentImage.nickname, size: "small" })
      ] }),
      incomingImage?.tag && /* @__PURE__ */ jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: t.amberInk, fontFamily: fontMono, fontWeight: 700 }, children: "\u21E2 DEPLOYING" }),
        /* @__PURE__ */ jsx(ImageTagPill, { tag: incomingImage.tag, nickname: incomingImage.nickname, size: "small" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.statusChips, children: [
        /* @__PURE__ */ jsx("span", { className: `${classes.chip} ${statusChipClass(classes, env.argoSyncStatus)}`, children: env.argoSyncStatus ?? "unknown" }),
        /* @__PURE__ */ jsx("span", { className: `${classes.chip} ${statusChipClass(classes, env.argoHealthStatus)}`, children: env.argoHealthStatus ?? "unknown" }),
        env.argoRevision && /* @__PURE__ */ jsxs("span", { className: classes.revision, children: [
          "@ ",
          env.argoRevision.slice(0, 9)
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: classes.btn,
            title: SYNC_GUIDE[0].body,
            disabled: !canAct || Boolean(argoActions.pending),
            onClick: () => act(argoActions.refresh),
            children: argoActions.pending === "refresh" ? "refreshing\u2026" : "\u27F3 Refresh"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: classes.btn,
            title: SYNC_GUIDE[1].body,
            disabled: !canAct || Boolean(argoActions.pending),
            onClick: () => act(argoActions.hardRefresh),
            children: argoActions.pending === "hardRefresh" ? "refreshing\u2026" : "\u27F3 Hard refresh"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: `${classes.btn} ${classes.btnPrimary}`,
            title: SYNC_GUIDE[2].body,
            disabled: !canAct || Boolean(argoActions.pending),
            onClick: () => act(argoActions.sync),
            children: argoActions.pending === "sync" ? "syncing\u2026" : "\u21C4 Sync"
          }
        ),
        /* @__PURE__ */ jsx("button", { type: "button", className: `${classes.btn} ${classes.btnRoadmap}`, title: SYNC_GUIDE[3].body, disabled: true, children: "Sync w/ prune" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: `${classes.btn} ${classes.btnRoadmap}`, title: SYNC_GUIDE[4].body, disabled: true, children: "Force sync" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.helpToggle, onClick: () => setGuideOpen((v) => !v), children: guideOpen ? "hide guide" : "which one? \u25BE" })
      ] })
    ] }),
    (env.argoOperationMessage || env.argoOperationPhase) && /* @__PURE__ */ jsxs("div", { className: classes.opBanner, children: [
      /* @__PURE__ */ jsx("span", { className: classes.opBannerBadge, children: env.argoOperationPhase ?? "OPERATION" }),
      /* @__PURE__ */ jsxs("div", { children: [
        env.argoOperationMessage && /* @__PURE__ */ jsx(Typography, { className: classes.opBannerText, children: env.argoOperationMessage }),
        env.argoReconciledAt && /* @__PURE__ */ jsxs(Typography, { className: classes.opBannerMeta, title: formatDateTime(env.argoReconciledAt), children: [
          "Last reconcile: ",
          relativeTime(env.argoReconciledAt)
        ] })
      ] })
    ] }),
    (env.argoConditions ?? []).map((c, i) => /* @__PURE__ */ jsxs("div", { className: classes.condition, children: [
      /* @__PURE__ */ jsx("span", { className: classes.conditionType, children: c.type }),
      /* @__PURE__ */ jsx(Typography, { className: classes.conditionText, children: c.message })
    ] }, `${c.type}-${i}`)),
    argoActions.error && /* @__PURE__ */ jsx(Typography, { className: classes.argoErr, children: argoActions.error }),
    !reached && /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
      "Couldn't reach ArgoCD for ",
      env.argoAppName,
      " - the facts here may be stale, not actually wrong."
    ] }),
    guideOpen && /* @__PURE__ */ jsx("div", { className: classes.guide, children: SYNC_GUIDE.map((g) => /* @__PURE__ */ jsxs("div", { className: classes.guideRow, children: [
      /* @__PURE__ */ jsxs("span", { className: classes.guideName, children: [
        g.name,
        g.roadmap && /* @__PURE__ */ jsx("div", { className: classes.guideRoadmapTag, children: "not yet available" })
      ] }),
      /* @__PURE__ */ jsx("span", { className: classes.guideBody, children: g.body })
    ] }, g.name)) }),
    /* @__PURE__ */ jsx("button", { type: "button", className: classes.disclosureToggle, onClick: () => setDetailOpen((v) => !v), children: detailOpen ? "\u25BE hide details" : "\u25B8 show sync policy, revision + resource tree" }),
    detailOpen && /* @__PURE__ */ jsxs("div", { className: classes.detail, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.kvGrid, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.k, children: "Application" }),
          /* @__PURE__ */ jsx("span", { className: classes.v, children: env.argoAppName })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.k, children: "Target revision" }),
          /* @__PURE__ */ jsx("span", { className: classes.v, children: env.argoSource?.targetRevision ?? "\u2014" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.k, children: "Last sync" }),
          /* @__PURE__ */ jsx(
            "span",
            {
              className: classes.v,
              title: env.argoOperationStartedAt ? formatDateTime(env.argoOperationStartedAt) : void 0,
              children: env.argoOperationStartedAt ? relativeTime(env.argoOperationStartedAt) : "\u2014"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.k, children: "Last operation" }),
          /* @__PURE__ */ jsx("span", { className: classes.v, children: env.argoOperationPhase ?? "\u2014" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.k, children: "Out of sync" }),
          /* @__PURE__ */ jsx("span", { className: classes.v, children: resources.length > 0 ? `${outOfSync} resource${outOfSync === 1 ? "" : "s"}` : "\u2014" })
        ] }),
        env.argoOperationMessage && /* @__PURE__ */ jsxs("div", { className: `${classes.kv} ${classes.kvFull}`, children: [
          /* @__PURE__ */ jsx("span", { className: classes.k, children: "Last operation message" }),
          /* @__PURE__ */ jsx("span", { className: classes.v, children: env.argoOperationMessage })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: `${classes.kv} ${classes.kvFull}`, children: [
          /* @__PURE__ */ jsx("span", { className: classes.k, children: "Sync policy" }),
          /* @__PURE__ */ jsxs("div", { className: classes.flags, children: [
            /* @__PURE__ */ jsx("span", { className: `${classes.flag} ${env.argoSyncPolicy?.automated ? "" : classes.flagOff}`, children: "automated" }),
            /* @__PURE__ */ jsx("span", { className: `${classes.flag} ${env.argoSyncPolicy?.selfHeal ? "" : classes.flagOff}`, children: "self-heal" }),
            /* @__PURE__ */ jsx("span", { className: `${classes.flag} ${env.argoSyncPolicy?.prune ? "" : classes.flagOff}`, children: "prune" })
          ] })
        ] }),
        env.argoSource?.repoUrl && /* @__PURE__ */ jsxs("div", { className: `${classes.kv} ${classes.kvFull}`, children: [
          /* @__PURE__ */ jsx("span", { className: classes.k, children: "Source" }),
          /* @__PURE__ */ jsxs("span", { className: classes.v, children: [
            env.argoSource.repoUrl.replace(/^https?:\/\//, ""),
            env.argoSource.path ? ` \xB7 ${env.argoSource.path}` : ""
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.subTitle, children: "Resource tree" }),
        resources.length === 0 ? /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
          "No resource tree reported yet",
          reached ? "" : " (ArgoCD unreachable)",
          "."
        ] }) : /* @__PURE__ */ jsx("div", { className: classes.treeScroll, children: /* @__PURE__ */ jsxs("table", { className: classes.table, children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { className: classes.headCell, children: "Sync wave" }),
            /* @__PURE__ */ jsx("th", { className: classes.headCell, children: "Kind" }),
            /* @__PURE__ */ jsx("th", { className: classes.headCell, children: "Name" }),
            /* @__PURE__ */ jsx("th", { className: classes.headCell, children: "Status" }),
            /* @__PURE__ */ jsx("th", { className: classes.headCell, children: "Health" }),
            /* @__PURE__ */ jsx("th", { className: classes.headCell, children: "Hook" }),
            /* @__PURE__ */ jsx("th", { className: classes.headCell, children: "Message" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: resources.map((r, i) => /* @__PURE__ */ jsxs("tr", { className: `${classes.bodyRow} ${r.hookType ? classes.bodyRowHook : ""}`, children: [
            /* @__PURE__ */ jsx("td", { className: classes.cellMuted, children: syncWaveFor(r, env.resources) ?? "\u2014" }),
            /* @__PURE__ */ jsx("td", { className: classes.cellKind, children: r.kind }),
            /* @__PURE__ */ jsx("td", { className: classes.cellName, children: r.name }),
            /* @__PURE__ */ jsx("td", { className: classes.cell, children: /* @__PURE__ */ jsx("span", { className: `${classes.statusBadge} ${statusChipClass(classes, r.syncStatus)}`, children: r.syncStatus ?? "\u2014" }) }),
            /* @__PURE__ */ jsx("td", { className: classes.cell, children: r.health ? /* @__PURE__ */ jsx("span", { className: `${classes.statusBadge} ${statusChipClass(classes, r.health)}`, children: r.health }) : "\u2014" }),
            /* @__PURE__ */ jsx("td", { className: classes.cell, children: r.hookType && /* @__PURE__ */ jsx("span", { className: classes.hookBadge, children: r.hookType }) }),
            /* @__PURE__ */ jsx("td", { className: classes.cellMessage, children: r.message ?? "\u2014" })
          ] }, `${r.kind}-${r.name}-${i}`)) })
        ] }) }),
        resources.length > 0 && /* @__PURE__ */ jsx(Typography, { className: classes.diffNote, children: outOfSync === 0 ? "All resources in sync." : `${outOfSync} resource${outOfSync === 1 ? "" : "s"} out of sync.` })
      ] })
    ] })
  ] });
}

export { ArgoCommandPanel };
//# sourceMappingURL=ArgoCommandPanel.esm.js.map

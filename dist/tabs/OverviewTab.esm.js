import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { useSearchParams } from 'react-router-dom';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { useReleaseContext, nicknameForImageTag, gitopsPrForEnv, lastDeployedAt } from '../useReleaseContext.esm.js';
import { buildSupplyChainStages, MiniFlow } from '../PipelineFlow.esm.js';
import { PrButton } from '../PrButton.esm.js';
import { slugHue } from '../PipelineRunList.esm.js';
import { RecentActivityPanel } from '../RecentActivityPanel.esm.js';
import { TowerEmptyState } from '../TowerEmptyState.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { PageHeader, healthColor, StatusChip, healthTone } from '../ui/index.esm.js';
import { useAppNotifications } from '../useAppNotifications.esm.js';
import { isPreviewEnvName, imageTag, health, previewPrNumber } from '../types.esm.js';

const GRAFANA_HOST_BY_CLUSTER = {
  "kind-dev": "grafana.dev.kiac.local",
  "kind-prod": "grafana.prod.kiac.local"
};
function computeReleaseTracks(list) {
  const runs = [];
  for (const env of list) {
    const groupable = Boolean(env.image);
    const last = runs[runs.length - 1];
    if (groupable && last && last.image === env.image) {
      last.envs.push(env);
    } else {
      runs.push({ image: groupable ? env.image : void 0, envs: [env] });
    }
  }
  return runs;
}
const HEALTH_LABEL = {
  healthy: "Healthy",
  progressing: "Scaling",
  paused: "Paused",
  degraded: "Degraded",
  unknown: "Unknown"
};
const TRACK_CARD_W = 260;
const TRACK_GAP = 16;
const TRACK_RAIL_H = 44;
const useStyles = makeStyles(() => ({
  monitoringCard: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: "16px 20px",
    display: "flex",
    flexWrap: "wrap",
    gap: 20,
    alignItems: "center"
  },
  monitoringNote: { fontSize: 12.5, color: ({ t }) => t.textLo, flex: "1 1 260px" },
  monitoringLinks: { display: "flex", gap: 14, flexWrap: "wrap" },
  monitoringLink: {
    fontFamily: fontMono,
    fontSize: 12.5,
    color: ({ t }) => t.sky,
    textDecoration: "none",
    whiteSpace: "nowrap"
  },
  metaCard: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: "16px 20px",
    marginBottom: 20,
    display: "flex",
    flexWrap: "wrap",
    gap: "10px 32px"
  },
  metaItem: { display: "flex", flexDirection: "column", gap: 3, minWidth: 140 },
  metaLabel: { fontFamily: fontMono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: ({ t }) => t.textFaint },
  metaLink: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.sky, textDecoration: "none" },
  metaValue: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.textHi },
  // A flex row (not a CSS grid) so a release track - see below - can size
  // itself by its own card count instead of an equal share of the row.
  // alignItems: 'stretch' (the flex default, but named here so it doesn't
  // regress back to 'flex-start') so every card/track in one wrapped row
  // matches the row's tallest sibling's height, regardless of which one
  // happens to have an extra row of content (e.g. only some envs have a
  // Route) or belongs to a different release track - confirmed live
  // 2026-09-11: checkout-api's solo-tag Staging card rendered visibly
  // taller than its Dev/Test row-mates because 'flex-start' let each
  // track/card size purely to its own content.
  grid: { display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 16 },
  card: {
    flex: "1 1 260px",
    // Without a cap, one card left alone on the final row stretches to
    // fill it - confirmed live in the Release Flow Concepts mockup this
    // design is built from, same fix applied here.
    maxWidth: 320,
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: "16px 18px",
    // A flex column so the "View Rollout" link (rolloutLink, below) can pin
    // itself to the card's bottom edge via marginTop: auto - every card in a
    // row already matches its row's tallest sibling's height (see `grid`'s
    // own comment), so this is what makes the link land at the same
    // horizontal height across a row regardless of how much content sits
    // above it (2026-09-11 feedback).
    display: "flex",
    flexDirection: "column"
  },
  // A release track: a connecting band across every card sharing a build,
  // with one tag pill for the whole group instead of each card repeating
  // its own "Image" row. grow:0 so a track's width comes from its own card
  // count, not an equal share of the row (two tracks can appear side by
  // side when more than one release is in flight); shrink:1 + minWidth:0 so
  // a *wide* single track can still shrink to fit the row instead of
  // sizing every card to its max-width with nothing to wrap into - same
  // overflow bug hit and fixed in the design mockup this mirrors.
  // paddingTop reserves room for the label + band + nodes ABOVE the cards,
  // entirely inside the track's own box - all three are absolutely
  // positioned at non-negative `top` values within that reserved zone.
  // The label used to sit at a negative top (floating above the box
  // entirely, relying on whatever margin the previous row happened to
  // leave) - fine in isolation, but with several tracks/cards wrapping
  // across multiple rows in the real Overview grid, that external margin
  // is never guaranteed, and the label overlapped the row above it -
  // confirmed live 2026-09-10.
  // WRAPPING (2026-09-24: "when all the rail card envs share the same rail image
  // tag and the browser window is small, the rail cards extend off the page") -
  // this used to be a non-wrapping flex row, so a track holding every env (each
  // card min 175px) simply overflowed the page at narrow widths. It now wraps
  // like the outer grid does. The connecting band and per-env dots moved onto
  // the cards themselves (trackCard's ::before/::after) so that every wrapped
  // row gets its own correctly-positioned band, instead of one track-wide band
  // whose percentage-positioned dots no longer lined up with the cards once
  // they broke across lines.
  // A track is a column of ROWS (2026-09-24: "if you have to break a rail up into
  // two or more rows, the image info needs to be present on the rail for each
  // row"). The row split is computed in JS from the grid's measured width (see
  // trackRows below) rather than left to CSS flex-wrap, precisely so each row
  // can carry its own image label + band, and so widening the window pulls the
  // cards back onto one row instead of stranding a stretched card or two.
  track: {
    display: "flex",
    flexDirection: "column",
    flex: "0 1 auto",
    minWidth: 0,
    maxWidth: "100%",
    rowGap: 8
  },
  trackRow: {
    position: "relative",
    // Shrink-wrap to THIS row's own cards (the track is a stretching flex column, so
    // without this a shorter last row takes the widest row's width and its label -
    // centered on the row - lands off-center over its cards, 2026-09-24).
    alignSelf: "flex-start",
    display: "flex",
    columnGap: 16,
    paddingTop: TRACK_RAIL_H
  },
  // maxWidth caps the pill to its own trackRow's width (position: relative,
  // set below) so a single narrow card's tag - which can render wider than
  // the card itself, e.g. a long semver plus a nickname chip - truncates
  // with an ellipsis instead of overflowing past the card and overlapping a
  // neighboring track's pill when two single-env tracks sit side by side
  // (confirmed live 2026-09-29: boarding-api's two solo-env release tracks
  // overlapped their image-tag chips). The button's own `title` (below)
  // still carries the untruncated tag on hover.
  trackLabel: {
    position: "absolute",
    top: 0,
    left: "50%",
    transform: "translateX(-50%)",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    backgroundColor: ({ t }) => t.skySoft,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    borderRadius: 100,
    padding: "3px 12px",
    cursor: "pointer",
    boxSizing: "border-box",
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  trackNickname: {
    display: "inline-block",
    marginLeft: 6,
    fontFamily: fontMono,
    fontSize: 10,
    padding: "1px 7px",
    borderRadius: 8,
    border: "1px solid"
  },
  // Fixed-ish width, never grown (2026-09-24: "the cards should have a max width so
  // that if you stretch the browser window... it should try and fit all the cards
  // back on the same row") - a card wants TRACK_CARD_W, may shrink to its
  // minWidth on a very narrow screen, and never stretches past it.
  // A declared-but-undeployed environment has almost nothing to show, so it keeps its own height instead of
  // stretching to its row's tallest sibling (which made it a tall, nearly empty box).
  cardUndeployed: { alignSelf: "flex-start" },
  // Next to a release track, an undeployed card starts where the track's cards do (below the rail), not at the rail's top.
  cardBelowRail: { marginTop: TRACK_RAIL_H },
  trackCard: {
    flex: `0 1 ${TRACK_CARD_W}px`,
    minWidth: 175,
    maxWidth: TRACK_CARD_W,
    position: "relative",
    // Band segment + node above THIS card; the -8px overhang on each side meets
    // the neighbouring card's segment across the 16px column gap.
    "&::before": {
      content: '""',
      position: "absolute",
      top: -16,
      left: -8,
      right: -8,
      height: 4,
      borderRadius: 4,
      backgroundColor: ({ t }) => t.sky,
      opacity: 0.9
    },
    "&::after": {
      content: '""',
      position: "absolute",
      top: -20,
      left: "50%",
      width: 12,
      height: 12,
      borderRadius: "50%",
      backgroundColor: ({ t }) => t.sky,
      border: ({ t }) => `2px solid ${t.bg}`,
      transform: "translateX(-50%)"
    }
  },
  cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  // 2026-09-15 feedback: env names are always lowercase at the Kubernetes
  // level (DNS-1123) - capitalizing them for display invented a form the
  // real resource doesn't have. Lowercase here, sentence case kept for
  // actual prose elsewhere - see RecentActivityPanel/activityRowRenderers'
  // own pass for the fuller rationale.
  envName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, textTransform: "lowercase", color: ({ t }) => t.textHi },
  dot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
  healthChip: { alignSelf: "flex-start", marginBottom: 10 },
  flowRow: { marginBottom: 12 },
  pendingPr: { marginBottom: 12 },
  pendingPrLabel: {
    display: "block",
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: ({ t }) => t.amberInk,
    marginBottom: 4
  },
  // A preview env's own source PR is informational, not "needs attention"
  // the way a pending promotion is - textFaint rather than pendingPrLabel's
  // amber, same distinction the rest of this app draws between amber
  // (attention) and gray (at rest).
  previewPrLabel: {
    display: "block",
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: ({ t }) => t.textFaint,
    marginBottom: 4
  },
  kv: { display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", borderBottom: ({ t }) => `1px dashed ${t.lineSoft}`, fontSize: 12.5 },
  kvLabel: { color: ({ t }) => t.textFaint },
  kvValue: { fontFamily: fontMono, color: ({ t }) => t.textHi, textAlign: "right" },
  kvLink: {
    fontFamily: fontMono,
    fontSize: 12.5,
    color: ({ t }) => t.sky,
    textAlign: "right",
    textDecoration: "none",
    overflowWrap: "anywhere",
    "&:hover": { textDecoration: "underline" }
  },
  rolloutLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: "auto",
    paddingTop: 10,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`,
    background: "none",
    border: "none",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: ({ t }) => t.lineSoft,
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    cursor: "pointer",
    textAlign: "left"
  },
  rolloutLinkPct: { color: ({ t }) => t.amberInk },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi, margin: "24px 0 12px" },
  // Restored 2026-09-10 - a real preview/PR-env indicator existed on this
  // card once before and got dropped somewhere along the way; the small
  // "own build" badge inline next to the env name is the fix, distinct from
  // the collapsed rail chip below (which is the new "own row" ask).
  previewBadge: {
    fontFamily: fontMono,
    fontSize: 9.5,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: ({ t }) => t.textFaint,
    border: ({ t }) => `1px dashed ${t.line}`,
    borderRadius: 3,
    padding: "1px 6px",
    whiteSpace: "nowrap"
  },
  // Preview/PR environments move to their own row below the real pipeline
  // (2026-09-10 feedback) - they aren't part of the promotion order, so
  // they shouldn't visually compete with it for space or attention. Each
  // one starts as a small chip and expands into the same full card the
  // pipeline envs use, in place, rather than a separate always-open card
  // taking up room for an environment that may not even exist tomorrow.
  previewRow: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 },
  previewItem: { display: "flex", flexDirection: "column", gap: 10 },
  previewChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontFamily: fontMono,
    fontSize: 12,
    padding: "7px 12px",
    borderRadius: 100,
    border: ({ t }) => `1px dashed ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    cursor: "pointer",
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  notifCard: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: "12px 18px",
    marginBottom: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    cursor: "pointer",
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  notifLeft: { display: "flex", alignItems: "center", gap: 10 },
  // Amber ("new/informational"), not the old bad/red - this is a count of
  // recent activity, not an alert or an error state.
  notifDot: { width: 8, height: 8, borderRadius: "50%", backgroundColor: ({ t }) => t.amber, flexShrink: 0 },
  notifText: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.textHi },
  notifLink: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.sky }
}));
function trackRows(envs, gridWidth) {
  if (gridWidth <= 0) return [envs];
  const perRow = Math.max(1, Math.floor((gridWidth + TRACK_GAP) / (TRACK_CARD_W + TRACK_GAP)));
  const rows = [];
  for (let i = 0; i < envs.length; i += perRow) rows.push(envs.slice(i, i + perRow));
  return rows;
}
function OverviewTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [gridEl, setGridEl] = useState(null);
  const [gridWidth, setGridWidth] = useState(0);
  useEffect(() => {
    if (!gridEl) return void 0;
    setGridWidth(gridEl.clientWidth);
    const ro = new ResizeObserver((entries) => setGridWidth(entries[0].contentRect.width));
    ro.observe(gridEl);
    return () => ro.disconnect();
  }, [gridEl]);
  const {
    entity,
    environments,
    loading,
    error,
    repoRef,
    owner,
    appName,
    deployHistory,
    provenanceByImage,
    gitopsPrs,
    sourcePrs,
    pipelineOrder,
    pipelineRuns,
    refresh
  } = useReleaseContext();
  const [, setSearchParams] = useSearchParams();
  const { notifications, recentCount, loading: notifLoading } = useAppNotifications(appName);
  const [expandedPreview, setExpandedPreview] = useState(/* @__PURE__ */ new Set());
  const togglePreview = (key) => setExpandedPreview((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const goToNotifications = () => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "notifications");
    return next;
  });
  const goToImage = (tag) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "images");
    next.set("imageTag", tag);
    return next;
  });
  const goToRun = (runName) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "pipelines");
    next.set("run", runName);
    return next;
  });
  const goToEnv = (envName) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "deployments");
    next.set("env", envName);
    return next;
  });
  const goToTopology = (envName) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "topology");
    next.set("env", envName);
    return next;
  });
  const goToRollout = (envName) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "deployments");
    next.set("env", envName);
    return next;
  });
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  const sourceRepo = repoRef ?? (owner && appName ? { owner, repo: appName } : void 0);
  const sourceUrl = sourceRepo ? `https://github.com/${sourceRepo.owner}/${sourceRepo.repo}` : void 0;
  const gitopsUrl = owner && appName ? `https://github.com/${owner}/gitops-${appName}` : void 0;
  const previewEnvs = environments.filter((env) => isPreviewEnvName(env.env));
  const pipelineEnvs = environments.filter((env) => !isPreviewEnvName(env.env));
  const hasRail = pipelineEnvs.some((env) => env.deployed !== false);
  const renderEnvCard = (env, opts) => {
    if (env.deployed === false) {
      return /* @__PURE__ */ jsxs(
        "div",
        {
          className: `${classes.card} ${classes.cardUndeployed} ${opts?.skipImage ? classes.trackCard : ""} ${!opts?.skipImage && hasRail ? classes.cardBelowRail : ""}`,
          children: [
            /* @__PURE__ */ jsx("div", { className: classes.cardHead, children: /* @__PURE__ */ jsx("span", { className: classes.envName, children: env.env }) }),
            /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", dot: true, className: classes.healthChip, children: "Not yet deployed" }),
            /* @__PURE__ */ jsxs("div", { className: classes.kv, style: { borderBottom: "none" }, children: [
              /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Cluster" }),
              /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: env.cluster || "\u2014" })
            ] })
          ]
        },
        env.key
      );
    }
    const h = health(env);
    const provenance = env.image ? provenanceByImage[env.image] : void 0;
    const scStages = buildSupplyChainStages(provenance?.data, Boolean(provenance?.loading));
    const matchedPr = gitopsPrForEnv(gitopsPrs, env.env);
    const pendingPr = matchedPr?.state === "open" ? matchedPr : void 0;
    const previewPr = sourcePrs.find((pr) => pr.number === previewPrNumber(env.env));
    return /* @__PURE__ */ jsxs("div", { className: `${classes.card} ${opts?.skipImage ? classes.trackCard : ""}`, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.cardHead, children: [
        /* @__PURE__ */ jsx("span", { className: classes.envName, children: env.env }),
        isPreviewEnvName(env.env) && /* @__PURE__ */ jsx("span", { className: classes.previewBadge, children: "preview \xB7 own build" })
      ] }),
      /* @__PURE__ */ jsx(StatusChip, { tone: healthTone(h), dot: true, className: classes.healthChip, children: HEALTH_LABEL[h] }),
      /* @__PURE__ */ jsx("div", { className: classes.flowRow, children: /* @__PURE__ */ jsx(MiniFlow, { stages: scStages }) }),
      pendingPr && /* @__PURE__ */ jsxs("div", { className: classes.pendingPr, children: [
        /* @__PURE__ */ jsx("span", { className: classes.pendingPrLabel, children: "Promotion pending" }),
        /* @__PURE__ */ jsx(PrButton, { pr: pendingPr })
      ] }),
      previewPr && /* @__PURE__ */ jsxs("div", { className: classes.pendingPr, children: [
        /* @__PURE__ */ jsx("span", { className: classes.previewPrLabel, children: "Pull request" }),
        /* @__PURE__ */ jsx(PrButton, { pr: previewPr })
      ] }),
      env.cloud ? /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: env.cloud.resource?.kind ?? env.cloud.targetLabel }),
        /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: env.cloud.resource ? `${env.cloud.resource.name} \xB7 ${env.cloud.resource.region ?? env.cloud.targetLabel}` : env.cloud.targetLabel })
      ] }) : /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Cluster / namespace" }),
        /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
          env.cluster,
          " / ",
          env.namespace
        ] })
      ] }),
      !opts?.skipImage && /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Image" }),
        /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: imageTag(env.image) })
      ] }),
      env.cloud ? env.cloud.consoleUrl && /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Console" }),
        /* @__PURE__ */ jsx("a", { className: classes.kvLink, href: env.cloud.consoleUrl, target: "_blank", rel: "noopener noreferrer", children: env.cloud.targetLabel })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Replicas" }),
          /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
            env.availableReplicas ?? "\u2014",
            " / ",
            env.desiredReplicas ?? "\u2014"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Strategy" }),
          /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: env.strategy ?? "\u2014" })
        ] })
      ] }),
      env.ingressUrl && /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Route" }),
        /* @__PURE__ */ jsx(
          "a",
          {
            className: classes.kvLink,
            href: env.ingressUrl,
            target: "_blank",
            rel: "noopener noreferrer",
            children: env.ingressUrl
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.kv, style: { borderBottom: "none" }, children: [
        /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Deployed" }),
        /* @__PURE__ */ jsx("span", { className: classes.kvValue, title: formatDateTime(lastDeployedAt(env, deployHistory.data)), children: relativeTime(lastDeployedAt(env, deployHistory.data)) })
      ] }),
      !isPreviewEnvName(env.env) && env.workload?.kind === "Rollout" && env.workload.canaryProgress && /* @__PURE__ */ jsxs("button", { type: "button", className: classes.rolloutLink, onClick: () => goToRollout(env.env), children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "View rollout",
          env.workload.canaryProgress.currentStepIndex !== void 0 && ` \xB7 step ${Math.min(env.workload.canaryProgress.currentStepIndex + 1, env.workload.canaryProgress.steps.length)}/${env.workload.canaryProgress.steps.length}`
        ] }),
        env.workload.canaryProgress.currentWeight !== void 0 && /* @__PURE__ */ jsxs("span", { className: classes.rolloutLinkPct, children: [
          env.workload.canaryProgress.currentWeight,
          "% traffic \u2192"
        ] })
      ] })
    ] }, env.key);
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(
      PageHeader,
      {
        title: "Overview",
        subtitle: "Where this service runs, what is live in each environment, and what happened recently.",
        actions: /* @__PURE__ */ jsx(RefreshButton, { onClick: refresh })
      }
    ),
    recentCount > 0 && /* @__PURE__ */ jsxs(
      "div",
      {
        className: classes.notifCard,
        role: "button",
        tabIndex: 0,
        onClick: goToNotifications,
        onKeyDown: (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            goToNotifications();
          }
        },
        children: [
          /* @__PURE__ */ jsxs("div", { className: classes.notifLeft, children: [
            /* @__PURE__ */ jsx("span", { className: classes.notifDot }),
            /* @__PURE__ */ jsxs("span", { className: classes.notifText, children: [
              recentCount,
              " new notification",
              recentCount === 1 ? "" : "s",
              " from Glidepath"
            ] })
          ] }),
          /* @__PURE__ */ jsx("span", { className: classes.notifLink, children: "View \u2192" })
        ]
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: classes.metaCard, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.metaItem, children: [
        /* @__PURE__ */ jsx("span", { className: classes.metaLabel, children: "Source repo" }),
        sourceUrl ? /* @__PURE__ */ jsxs("a", { className: classes.metaLink, href: sourceUrl, target: "_blank", rel: "noopener noreferrer", children: [
          sourceRepo.owner,
          "/",
          sourceRepo.repo
        ] }) : /* @__PURE__ */ jsx("span", { className: classes.metaValue, children: "\u2014" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.metaItem, children: [
        /* @__PURE__ */ jsx("span", { className: classes.metaLabel, children: "GitOps repo" }),
        gitopsUrl ? /* @__PURE__ */ jsxs("a", { className: classes.metaLink, href: gitopsUrl, target: "_blank", rel: "noopener noreferrer", children: [
          "gitops-",
          appName
        ] }) : /* @__PURE__ */ jsx("span", { className: classes.metaValue, children: "\u2014" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.metaItem, children: [
        /* @__PURE__ */ jsx("span", { className: classes.metaLabel, children: "Owner" }),
        /* @__PURE__ */ jsx("span", { className: classes.metaValue, children: entity.spec?.owner ?? "\u2014" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.metaItem, children: [
        /* @__PURE__ */ jsx("span", { className: classes.metaLabel, children: "System" }),
        /* @__PURE__ */ jsx("span", { className: classes.metaValue, children: entity.spec?.system ?? "\u2014" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.metaItem, children: [
        /* @__PURE__ */ jsx("span", { className: classes.metaLabel, children: "Lifecycle" }),
        /* @__PURE__ */ jsx("span", { className: classes.metaValue, children: entity.spec?.lifecycle ?? "\u2014" })
      ] })
    ] }),
    pipelineEnvs.length === 0 ? /* @__PURE__ */ jsx(
      TowerEmptyState,
      {
        title: "Nothing deployed yet",
        description: "This app hasn't shipped its first build to any environment yet - Tower reads Rollouts, Deployments and Pods live from each configured cluster, so there's nothing to show here until it has. This is expected for a freshly onboarded app, not an error."
      }
    ) : /* @__PURE__ */ jsx("div", { className: classes.grid, ref: setGridEl, children: computeReleaseTracks(pipelineEnvs).map((run) => {
      if (!run.image) {
        return renderEnvCard(run.envs[0]);
      }
      const n = run.envs.length;
      const nickname = nicknameForImageTag(imageTag(run.image), pipelineRuns);
      return /* @__PURE__ */ jsx("div", { className: classes.track, children: trackRows(run.envs, gridWidth).map((rowEnvs) => /* @__PURE__ */ jsxs("div", { className: classes.trackRow, children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            className: classes.trackLabel,
            title: `View ${imageTag(run.image)} in the Images tab`,
            onClick: () => goToImage(imageTag(run.image)),
            children: [
              imageTag(run.image),
              nickname && /* @__PURE__ */ jsx(
                "span",
                {
                  className: classes.trackNickname,
                  style: {
                    color: `hsl(${slugHue(nickname)}, 65%, 60%)`,
                    borderColor: `hsl(${slugHue(nickname)}, 65%, 60%)`,
                    backgroundColor: `hsla(${slugHue(nickname)}, 65%, 60%, 0.12)`
                  },
                  children: nickname
                }
              ),
              " ",
              "\xB7 live in ",
              n,
              " env",
              n === 1 ? "" : "s"
            ]
          }
        ),
        rowEnvs.map((env) => renderEnvCard(env, { skipImage: true }))
      ] }, rowEnvs[0].key)) }, run.envs[0].key);
    }) }),
    previewEnvs.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Preview environments" }),
      /* @__PURE__ */ jsx("div", { className: classes.previewRow, children: previewEnvs.map((env) => {
        const h = health(env);
        const isOpen = expandedPreview.has(env.key);
        return /* @__PURE__ */ jsxs("div", { className: classes.previewItem, children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              className: classes.previewChip,
              onClick: () => togglePreview(env.key),
              "aria-expanded": isOpen,
              children: [
                /* @__PURE__ */ jsx("span", { className: classes.dot, style: { backgroundColor: healthColor(h, t) } }),
                env.env,
                /* @__PURE__ */ jsx("span", { className: classes.previewBadge, children: "preview" }),
                isOpen ? /* @__PURE__ */ jsx(ExpandLessIcon, { style: { fontSize: 16 } }) : /* @__PURE__ */ jsx(ExpandMoreIcon, { style: { fontSize: 16 } })
              ]
            }
          ),
          isOpen && renderEnvCard(env)
        ] }, env.key);
      }) })
    ] }),
    /* @__PURE__ */ jsx(
      RecentActivityPanel,
      {
        notifications,
        loading: notifLoading,
        goToImage,
        goToRun,
        goToEnv,
        goToTopology,
        pipelineOrder,
        pipelineRuns,
        deployHistory: deployHistory.data,
        onViewAll: goToNotifications
      }
    ),
    /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, children: "Monitoring" }),
    /* @__PURE__ */ jsxs("div", { className: classes.monitoringCard, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.monitoringNote, children: "No per-app dashboards exist yet - this app's live metrics aren't embedded here, but each environment's cluster runs a real Grafana instance you can explore directly." }),
      /* @__PURE__ */ jsx("div", { className: classes.monitoringLinks, children: [...new Set(pipelineEnvs.map((env) => env.cluster))].map((cluster) => ({ cluster, host: GRAFANA_HOST_BY_CLUSTER[cluster] })).filter((c) => Boolean(c.host)).map(({ cluster, host }) => /* @__PURE__ */ jsxs(
        "a",
        {
          className: classes.monitoringLink,
          href: `http://${host}`,
          target: "_blank",
          rel: "noopener noreferrer",
          children: [
            "Open Grafana (",
            cluster,
            ") \u2197"
          ]
        },
        cluster
      )) })
    ] })
  ] });
}

export { OverviewTab };
//# sourceMappingURL=OverviewTab.esm.js.map

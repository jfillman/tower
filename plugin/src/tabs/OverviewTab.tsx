import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { useSearchParams } from 'react-router-dom';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { relativeTime, formatDateTime } from '../../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { gitopsPrForEnv, lastDeployedAt, nicknameForImageTag, useReleaseContext } from '../useReleaseContext';
import { buildSupplyChainStages, MiniFlow } from '../PipelineFlow';
import { PrButton } from '../PrButton';
import { slugHue } from '../PipelineRunList';
import { RecentActivityPanel } from '../RecentActivityPanel';
import { TowerEmptyState } from '../TowerEmptyState';
import { RefreshButton } from '../RefreshButton';
import { useAppNotifications } from '../useAppNotifications';
import { health, imageTag, isPreviewEnvName, previewPrNumber, type EnvironmentSummary, type Health } from '../types';

// grafana.{dev,prod}.kiac.local (real Gateway HTTPRoutes - gitops-cluster-dev
// and gitops-cluster-kind-prod's 60-gateway-routes/50-gateway-routes,
// fronting each cluster's kube-prometheus-stack Grafana) is as far as
// per-app monitoring goes today - no per-app dashboard/panel-embed exists
// anywhere on this platform (the only Grafana dashboards that exist are
// platform-cicd's own fleet-wide CI/CD & DORA ones, not per-service
// request-volume/error-rate/lead-time panels), so there's no URL to embed.
// Replaces the "Grafana panels not wired up yet" placeholder that sat here
// promising exactly that - an honest link to the real instance beats a
// stub promising data that has no source (see ComingSoonTab's own
// comment on this module's "honest, not faked" posture).
const GRAFANA_HOST_BY_CLUSTER: Record<string, string> = {
  'kind-dev': 'grafana.dev.kiac.local',
  'kind-prod': 'grafana.prod.kiac.local',
};

// Groups consecutive environments running the exact same live image into
// one "release track" (see the Release Flow Concepts artifact / "Option A",
// 2026-09-10 - user picked this over a unified frame and a rail-level
// stepper specifically because it keeps every environment its own
// first-class card and adds the release as a visibly separate layer, rather
// than merging environments into one object). Callers only ever pass the
// non-preview environments in - preview environments get their own row
// below the pipeline grid entirely (2026-09-10 feedback: "PR envs... are
// not part of the promotion order"), so this function has no preview
// concept of its own to get wrong.
interface ReleaseTrackRun {
  image?: string;
  envs: EnvironmentSummary[];
}

function computeReleaseTracks(list: EnvironmentSummary[]): ReleaseTrackRun[] {
  const runs: ReleaseTrackRun[] = [];
  for (const env of list) {
    const groupable = Boolean(env.image);
    const last = runs[runs.length - 1];
    if (groupable && last && last.image === env.image) {
      last.envs.push(env);
    } else {
      runs.push({ image: groupable ? env.image : undefined, envs: [env] });
    }
  }
  return runs;
}

const HEALTH_LABEL: Record<Health, string> = {
  healthy: 'Healthy',
  progressing: 'Scaling',
  paused: 'Paused',
  degraded: 'Degraded',
  unknown: 'Unknown',
};

// Card basis inside a release track, and the gap between cards - shared by the CSS above and
// the rows-per-track calculation in OverviewTab so the two can't drift apart.
const TRACK_CARD_W = 260;
const TRACK_GAP = 16;

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  monitoringCard: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: '16px 20px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    alignItems: 'center',
  },
  monitoringNote: { fontSize: 12.5, color: ({ t }) => t.textLo, flex: '1 1 260px' },
  monitoringLinks: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  monitoringLink: {
    fontFamily: fontMono,
    fontSize: 12.5,
    color: ({ t }) => t.sky,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  metaCard: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: '16px 20px',
    marginBottom: 20,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px 32px',
  },
  metaItem: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 140 },
  metaLabel: { fontFamily: fontMono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: ({ t }) => t.textFaint },
  metaLink: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.sky, textDecoration: 'none' },
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
  grid: { display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 16 },
  card: {
    flex: '1 1 260px',
    // Without a cap, one card left alone on the final row stretches to
    // fill it - confirmed live in the Release Flow Concepts mockup this
    // design is built from, same fix applied here.
    maxWidth: 320,
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: '16px 18px',
    // A flex column so the "View Rollout" link (rolloutLink, below) can pin
    // itself to the card's bottom edge via marginTop: auto - every card in a
    // row already matches its row's tallest sibling's height (see `grid`'s
    // own comment), so this is what makes the link land at the same
    // horizontal height across a row regardless of how much content sits
    // above it (2026-09-11 feedback).
    display: 'flex',
    flexDirection: 'column',
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
    display: 'flex',
    flexDirection: 'column',
    flex: '0 1 auto',
    minWidth: 0,
    maxWidth: '100%',
    rowGap: 8,
  },
  trackRow: {
    position: 'relative',
    display: 'flex',
    columnGap: 16,
    paddingTop: 44,
  },
  trackLabel: {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    backgroundColor: ({ t }) => t.skySoft,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    borderRadius: 100,
    padding: '3px 12px',
    cursor: 'pointer',
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  trackNickname: {
    display: 'inline-block',
    marginLeft: 6,
    fontFamily: fontMono,
    fontSize: 10,
    padding: '1px 7px',
    borderRadius: 8,
    border: '1px solid',
  },
  // Fixed-ish width, never grown (2026-09-24: "the cards should have a max width so
  // that if you stretch the browser window... it should try and fit all the cards
  // back on the same row") - a card wants TRACK_CARD_W, may shrink to its
  // minWidth on a very narrow screen, and never stretches past it.
  trackCard: {
    flex: `0 1 ${TRACK_CARD_W}px`,
    minWidth: 175,
    maxWidth: TRACK_CARD_W,
    position: 'relative',
    // Band segment + node above THIS card; the -8px overhang on each side meets
    // the neighbouring card's segment across the 16px column gap.
    '&::before': {
      content: '""',
      position: 'absolute',
      top: -16,
      left: -8,
      right: -8,
      height: 4,
      borderRadius: 4,
      backgroundColor: ({ t }: { t: HangarTokens }) => t.sky,
      opacity: 0.9,
    },
    '&::after': {
      content: '""',
      position: 'absolute',
      top: -20,
      left: '50%',
      width: 12,
      height: 12,
      borderRadius: '50%',
      backgroundColor: ({ t }: { t: HangarTokens }) => t.sky,
      border: ({ t }: { t: HangarTokens }) => `2px solid ${t.bg}`,
      transform: 'translateX(-50%)',
    },
  },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  // 2026-09-15 feedback: env names are always lowercase at the Kubernetes
  // level (DNS-1123) - capitalizing them for display invented a form the
  // real resource doesn't have. Lowercase here, sentence case kept for
  // actual prose elsewhere - see RecentActivityPanel/activityRowRenderers'
  // own pass for the fuller rationale.
  envName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, textTransform: 'lowercase', color: ({ t }) => t.textHi },
  dot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block' },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 100,
    marginBottom: 10,
  },
  flowRow: { marginBottom: 12 },
  pendingPr: { marginBottom: 12 },
  pendingPrLabel: {
    display: 'block',
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: ({ t }) => t.amberInk,
    marginBottom: 4,
  },
  // A preview env's own source PR is informational, not "needs attention"
  // the way a pending promotion is - textFaint rather than pendingPrLabel's
  // amber, same distinction the rest of this app draws between amber
  // (attention) and gray (at rest).
  previewPrLabel: {
    display: 'block',
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: ({ t }) => t.textFaint,
    marginBottom: 4,
  },
  kv: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: ({ t }) => `1px dashed ${t.lineSoft}`, fontSize: 12.5 },
  kvLabel: { color: ({ t }) => t.textFaint },
  kvValue: { fontFamily: fontMono, color: ({ t }) => t.textHi, textAlign: 'right' },
  kvLink: {
    fontFamily: fontMono,
    fontSize: 12.5,
    color: ({ t }) => t.sky,
    textAlign: 'right',
    textDecoration: 'none',
    overflowWrap: 'anywhere',
    '&:hover': { textDecoration: 'underline' },
  },
  rolloutLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 'auto',
    paddingTop: 10,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`,
    background: 'none',
    border: 'none',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: ({ t }) => t.lineSoft,
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    cursor: 'pointer',
    textAlign: 'left',
  },
  rolloutLinkPct: { color: ({ t }) => t.amberInk },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi, margin: '24px 0 12px' },
  // Restored 2026-09-10 - a real preview/PR-env indicator existed on this
  // card once before and got dropped somewhere along the way; the small
  // "own build" badge inline next to the env name is the fix, distinct from
  // the collapsed rail chip below (which is the new "own row" ask).
  previewBadge: {
    fontFamily: fontMono,
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: ({ t }) => t.textFaint,
    border: ({ t }) => `1px dashed ${t.line}`,
    borderRadius: 3,
    padding: '1px 6px',
    whiteSpace: 'nowrap',
  },
  // Preview/PR environments move to their own row below the real pipeline
  // (2026-09-10 feedback) - they aren't part of the promotion order, so
  // they shouldn't visually compete with it for space or attention. Each
  // one starts as a small chip and expands into the same full card the
  // pipeline envs use, in place, rather than a separate always-open card
  // taking up room for an environment that may not even exist tomorrow.
  previewRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  previewItem: { display: 'flex', flexDirection: 'column', gap: 10 },
  previewChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    fontFamily: fontMono,
    fontSize: 12,
    padding: '7px 12px',
    borderRadius: 100,
    border: ({ t }) => `1px dashed ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    cursor: 'pointer',
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  notifCard: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: '12px 18px',
    marginBottom: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    cursor: 'pointer',
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  notifLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  // Amber ("new/informational"), not the old bad/red - this is a count of
  // recent activity, not an alert or an error state.
  notifDot: { width: 8, height: 8, borderRadius: '50%', backgroundColor: ({ t }) => t.amber, flexShrink: 0 },
  notifText: { fontFamily: fontMono, fontSize: 12.5, color: ({ t }) => t.textHi },
  notifLink: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.sky },
}));

const STATUS_COLOR: Record<Health, keyof HangarTokens> = {
  healthy: 'good',
  progressing: 'amber',
  paused: 'sky',
  degraded: 'bad',
  unknown: 'textFaint',
};

const STATUS_SOFT: Record<Health, keyof HangarTokens> = {
  healthy: 'goodSoft',
  progressing: 'amberSoft',
  paused: 'skySoft',
  degraded: 'badSoft',
  unknown: 'panelAlt',
};

// Splits a release track's envs into rows that fit `gridWidth` - each row then gets its own
// image label and band. Before the grid has been measured (width 0) everything stays on one
// row, which is also what a wide-enough window gets.
function trackRows<T>(envs: T[], gridWidth: number): T[][] {
  if (gridWidth <= 0) return [envs];
  const perRow = Math.max(1, Math.floor((gridWidth + TRACK_GAP) / (TRACK_CARD_W + TRACK_GAP)));
  const rows: T[][] = [];
  for (let i = 0; i < envs.length; i += perRow) rows.push(envs.slice(i, i + perRow));
  return rows;
}

export function OverviewTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  // Width of the environment grid, for splitting a release track into rows (see
  // trackRows). A callback-ref state, not useRef, because the grid only mounts after
  // the loading/empty early returns below.
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  useEffect(() => {
    if (!gridEl) return undefined;
    setGridWidth(gridEl.clientWidth);
    const ro = new ResizeObserver(entries => setGridWidth(entries[0].contentRect.width));
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
    refresh,
  } = useReleaseContext();
  const [, setSearchParams] = useSearchParams();
  const { notifications, recentCount, loading: notifLoading } = useAppNotifications(appName);
  // Preview/PR environments render in their own row below the real
  // pipeline, each starting collapsed - see the `previewRow` styles' own
  // comment. Independent per-env toggle (a Set, not one shared "which one
  // is open" value) since more than one preview env can reasonably be
  // inspected at once. Declared here (before the loading/error/empty early
  // returns below) - React hooks can't follow a conditional return.
  const [expandedPreview, setExpandedPreview] = useState<Set<string>>(new Set());
  const togglePreview = (key: string) =>
    setExpandedPreview(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const goToNotifications = () => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set('tab', 'notifications');
    return next;
  });
  // Same jump-to-Images-tab mechanism as ReleaseMatrix's own goToImage -
  // used by a release track's own image-tag pill (2026-09-12: the standalone
  // "Recent images" panel below the rail was dropped as redundant with the
  // per-card image info already on each rail card, so the pill is now the
  // only way to reach the Images tab from an env card's own image tag).
  const goToImage = (tag: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set('tab', 'images');
    next.set('imageTag', tag);
    return next;
  });

  // Jumps to the CI/CD tab's CD panel with this environment pre-selected and
  // its rollout ramp already expanded (2026-09-11: "add the 'View Rollout'
  // link with the traffic % weight to the overview env card that links back
  // to the cicd CD panel") - CiCdTab.tsx reads these same two params once at
  // mount.
  // Recent Activity's build-event CI pill (2026-09-14 feedback: it used to
  // be a plain <a target="_blank"> to the notification's own fully-
  // qualified link, which opened a whole second tab - this switches tabs
  // in place instead). CiCdTab.tsx reads `run` the same way it already
  // reads `env`/`expandRollout` below.
  const goToRun = (runName: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set('tab', 'pipelines');
    next.set('run', runName);
    return next;
  });

  // Recent Activity's env-event pill - a lighter version of goToRollout
  // below (no expandRollout: this is "show me this environment", not
  // specifically "show me its in-progress canary").
  const goToEnv = (envName: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set('tab', 'deployments');
    next.set('env', envName);
    return next;
  });

  // Recent Activity's release-triggered pill (2026-09-15 feedback: this
  // used to render as a static, non-navigating "link" - nothing has synced
  // for this env yet at trigger time, so goToEnv's CI/CD-tab deep link
  // isn't meaningful here the way it is for Deploying/Resolved; Topology is
  // real state that already exists regardless of release progress).
  // TopologyTab.tsx reads `env` the same way CiCdTab.tsx does, and scrolls
  // that environment's block into view.
  const goToTopology = (envName: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set('tab', 'topology');
    next.set('env', envName);
    return next;
  });

  const goToRollout = (envName: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set('tab', 'deployments');
    next.set('env', envName);
    return next;
  });

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;

  // Falls back to the catalog's github.com/project-slug (owner/appName) when no
  // deployed image's provenance has resolved a repoRef yet (2026-09-24: "for a
  // brand new app, the src repo link doesn't appear in the info panel") - same
  // fallback gitopsUrl below already used.
  const sourceRepo = repoRef ?? (owner && appName ? { owner, repo: appName } : undefined);
  const sourceUrl = sourceRepo ? `https://github.com/${sourceRepo.owner}/${sourceRepo.repo}` : undefined;
  const gitopsUrl = owner && appName ? `https://github.com/${owner}/gitops-${appName}` : undefined;
  const previewEnvs = environments.filter(env => isPreviewEnvName(env.env));
  const pipelineEnvs = environments.filter(env => !isPreviewEnvName(env.env));

  // skipImage: true for a card inside a release track - the track's own
  // label already shows the shared image once, so repeating it per card
  // would be exactly the redundancy this whole feature exists to remove.
  const renderEnvCard = (env: EnvironmentSummary, opts?: { skipImage?: boolean }) => {
    const h = health(env);
    const provenance = env.image ? provenanceByImage[env.image] : undefined;
    const scStages = buildSupplyChainStages(provenance?.data, Boolean(provenance?.loading));
    // gitopsPrForEnv matches by target env regardless of PR state
    // (usePullRequests now also returns recently-merged PRs) - a merged PR
    // isn't a "pending" promotion any more, so this badge requires open
    // specifically rather than just "PR exists".
    const matchedPr = gitopsPrForEnv(gitopsPrs, env.env);
    const pendingPr = matchedPr?.state === 'open' ? matchedPr : undefined;
    // The source-repo PR that spawned this preview env, if this is one -
    // 2026-09-10 feedback ("let's add a link to the PR in the full card for
    // preview envs"). Matched by number (see previewPrNumber), not by
    // gitopsPrForEnv's target-env matching - a preview env's PR is a plain
    // source PR, never a gitops release PR.
    const previewPr = sourcePrs.find(pr => pr.number === previewPrNumber(env.env));
    return (
      <div key={env.key} className={`${classes.card} ${opts?.skipImage ? classes.trackCard : ''}`}>
        <div className={classes.cardHead}>
          <span className={classes.envName}>{env.env}</span>
          {isPreviewEnvName(env.env) && <span className={classes.previewBadge}>preview · own build</span>}
        </div>
        <span
          className={classes.pill}
          style={{ backgroundColor: t[STATUS_SOFT[h]] as string, color: t[STATUS_COLOR[h]] as string }}
        >
          <span className={classes.dot} style={{ backgroundColor: t[STATUS_COLOR[h]] as string }} />
          {HEALTH_LABEL[h]}
        </span>
        <div className={classes.flowRow}>
          <MiniFlow stages={scStages} />
        </div>
        {pendingPr && (
          <div className={classes.pendingPr}>
            <span className={classes.pendingPrLabel}>Promotion pending</span>
            <PrButton pr={pendingPr} />
          </div>
        )}
        {previewPr && (
          <div className={classes.pendingPr}>
            <span className={classes.previewPrLabel}>Pull request</span>
            <PrButton pr={previewPr} />
          </div>
        )}
        <div className={classes.kv}>
          <span className={classes.kvLabel}>Cluster / namespace</span>
          <span className={classes.kvValue}>
            {env.cluster} / {env.namespace}
          </span>
        </div>
        {!opts?.skipImage && (
          <div className={classes.kv}>
            <span className={classes.kvLabel}>Image</span>
            <span className={classes.kvValue}>{imageTag(env.image)}</span>
          </div>
        )}
        <div className={classes.kv}>
          <span className={classes.kvLabel}>Replicas</span>
          <span className={classes.kvValue}>
            {env.availableReplicas ?? '—'} / {env.desiredReplicas ?? '—'}
          </span>
        </div>
        <div className={classes.kv}>
          <span className={classes.kvLabel}>Strategy</span>
          <span className={classes.kvValue}>{env.strategy ?? '—'}</span>
        </div>
        {env.ingressUrl && (
          <div className={classes.kv}>
            <span className={classes.kvLabel}>Route</span>
            <a
              className={classes.kvLink}
              href={env.ingressUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {env.ingressUrl}
            </a>
          </div>
        )}
        <div className={classes.kv} style={{ borderBottom: 'none' }}>
          <span className={classes.kvLabel}>Deployed</span>
          <span className={classes.kvValue} title={formatDateTime(lastDeployedAt(env, deployHistory.data))}>
            {relativeTime(lastDeployedAt(env, deployHistory.data))}
          </span>
        </div>
        {/* Preview envs aren't part of the CD panel's promotion order at all
            (isPreviewEnvName filters them out of cdEnvs there) - this link
            would jump to a CI/CD tab env selector that has no such env to
            select (2026-09-12 bug). */}
        {!isPreviewEnvName(env.env) && env.workload?.kind === 'Rollout' && env.workload.canaryProgress && (
          <button type="button" className={classes.rolloutLink} onClick={() => goToRollout(env.env)}>
            <span>
              View rollout
              {env.workload.canaryProgress.currentStepIndex !== undefined &&
                ` · step ${Math.min(env.workload.canaryProgress.currentStepIndex + 1, env.workload.canaryProgress.steps.length)}/${env.workload.canaryProgress.steps.length}`}
            </span>
            {env.workload.canaryProgress.currentWeight !== undefined && (
              <span className={classes.rolloutLinkPct}>{env.workload.canaryProgress.currentWeight}% traffic &rarr;</span>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div>
      {recentCount > 0 && (
        <div
          className={classes.notifCard}
          role="button"
          tabIndex={0}
          onClick={goToNotifications}
          onKeyDown={ev => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              goToNotifications();
            }
          }}
        >
          <div className={classes.notifLeft}>
            <span className={classes.notifDot} />
            <span className={classes.notifText}>
              {recentCount} new notification{recentCount === 1 ? '' : 's'} from Glidepath
            </span>
          </div>
          <span className={classes.notifLink}>View →</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <RefreshButton onClick={refresh} />
      </div>
      <div className={classes.metaCard}>
        <div className={classes.metaItem}>
          <span className={classes.metaLabel}>Source repo</span>
          {sourceUrl ? (
            <a className={classes.metaLink} href={sourceUrl} target="_blank" rel="noopener noreferrer">
              {sourceRepo!.owner}/{sourceRepo!.repo}
            </a>
          ) : (
            <span className={classes.metaValue}>—</span>
          )}
        </div>
        <div className={classes.metaItem}>
          <span className={classes.metaLabel}>GitOps repo</span>
          {gitopsUrl ? (
            <a className={classes.metaLink} href={gitopsUrl} target="_blank" rel="noopener noreferrer">
              gitops-{appName}
            </a>
          ) : (
            <span className={classes.metaValue}>—</span>
          )}
        </div>
        <div className={classes.metaItem}>
          <span className={classes.metaLabel}>Owner</span>
          <span className={classes.metaValue}>{(entity.spec?.owner as string | undefined) ?? '—'}</span>
        </div>
        <div className={classes.metaItem}>
          <span className={classes.metaLabel}>System</span>
          <span className={classes.metaValue}>{(entity.spec?.system as string | undefined) ?? '—'}</span>
        </div>
        <div className={classes.metaItem}>
          <span className={classes.metaLabel}>Lifecycle</span>
          <span className={classes.metaValue}>{(entity.spec?.lifecycle as string | undefined) ?? '—'}</span>
        </div>
      </div>

      {pipelineEnvs.length === 0 ? (
        <TowerEmptyState
          title="Nothing deployed yet"
          description="This app hasn't shipped its first build to any environment yet - Tower reads Rollouts, Deployments and Pods live from each configured cluster, so there's nothing to show here until it has. This is expected for a freshly onboarded app, not an error."
        />
      ) : (
      <div className={classes.grid} ref={setGridEl}>
        {computeReleaseTracks(pipelineEnvs).map(run => {
          // A track band's whole point is naming the image tag that's live
          // here - meaningless for an ungroupable env (no image at all,
          // e.g. still bootstrapping), so those alone skip it. A real image
          // tag gets the band even when it's currently live in only one env
          // - previously gated on `run.envs.length < 2`, which meant a tag
          // that just hadn't been promoted anywhere else yet rendered with
          // no band at all, inconsistent with every other card on this page
          // (confirmed live, 2026-09-11: checkout-api's staging-only
          // 0.3.27-f0c4c85 build showed no band while its neighboring
          // 2-env tracks did).
          if (!run.image) {
            return renderEnvCard(run.envs[0]);
          }
          const n = run.envs.length;
          const nickname = nicknameForImageTag(imageTag(run.image), pipelineRuns);
          return (
            <div key={run.envs[0].key} className={classes.track}>
              {trackRows(run.envs, gridWidth).map(rowEnvs => (
                <div key={rowEnvs[0].key} className={classes.trackRow}>
                <button
                  type="button"
                  className={classes.trackLabel}
                  title={`View ${imageTag(run.image)} in the Images tab`}
                  onClick={() => goToImage(imageTag(run.image))}
                >
                  {imageTag(run.image)}
                  {nickname && (
                    <span
                      className={classes.trackNickname}
                      style={{
                        color: `hsl(${slugHue(nickname)}, 65%, 60%)`,
                        borderColor: `hsl(${slugHue(nickname)}, 65%, 60%)`,
                        backgroundColor: `hsla(${slugHue(nickname)}, 65%, 60%, 0.12)`,
                      }}
                    >
                      {nickname}
                    </span>
                  )}
                  {' '}· live in {n} env{n === 1 ? '' : 's'}
                </button>
                  {rowEnvs.map(env => renderEnvCard(env, { skipImage: true }))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      )}

      {previewEnvs.length > 0 && (
        <>
          <Typography className={classes.sectionTitle}>Preview environments</Typography>
          <div className={classes.previewRow}>
            {previewEnvs.map(env => {
              const h = health(env);
              const isOpen = expandedPreview.has(env.key);
              return (
                <div key={env.key} className={classes.previewItem}>
                  <button
                    type="button"
                    className={classes.previewChip}
                    onClick={() => togglePreview(env.key)}
                    aria-expanded={isOpen}
                  >
                    <span className={classes.dot} style={{ backgroundColor: t[STATUS_COLOR[h]] as string }} />
                    {env.env}
                    <span className={classes.previewBadge}>preview</span>
                    {isOpen ? <ExpandLessIcon style={{ fontSize: 16 }} /> : <ExpandMoreIcon style={{ fontSize: 16 }} />}
                  </button>
                  {isOpen && renderEnvCard(env)}
                </div>
              );
            })}
          </div>
        </>
      )}

      <RecentActivityPanel
        notifications={notifications}
        loading={notifLoading}
        goToImage={goToImage}
        goToRun={goToRun}
        goToEnv={goToEnv}
        goToTopology={goToTopology}
        pipelineOrder={pipelineOrder}
        pipelineRuns={pipelineRuns}
        deployHistory={deployHistory.data}
        onViewAll={goToNotifications}
      />

      <Typography className={classes.sectionTitle}>Monitoring</Typography>
      <div className={classes.monitoringCard}>
        <Typography className={classes.monitoringNote}>
          No per-app dashboards exist yet - this app's live metrics aren't embedded here, but
          each environment's cluster runs a real Grafana instance you can explore directly.
        </Typography>
        <div className={classes.monitoringLinks}>
          {[...new Set(pipelineEnvs.map(env => env.cluster))]
            .map(cluster => ({ cluster, host: GRAFANA_HOST_BY_CLUSTER[cluster] }))
            .filter((c): c is { cluster: string; host: string } => Boolean(c.host))
            .map(({ cluster, host }) => (
              <a
                key={cluster}
                className={classes.monitoringLink}
                href={`http://${host}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Grafana ({cluster}) ↗
              </a>
            ))}
        </div>
      </div>
    </div>
  );
}

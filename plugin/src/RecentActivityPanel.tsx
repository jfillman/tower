import { useMemo, useRef, useState, type ComponentType, type SVGProps } from 'react';
import { preventFocusScroll, scrollPanelIntoView } from './preventFocusScroll';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import type {
  Notification,
  NotificationSeverity,
} from '@backstage/plugin-notifications-common';
import { relativeTime, formatDateTime } from '../shared/format';
import {
  fontDisplay,
  fontMono,
  useHangarTokens,
  type HangarTokens,
} from '../brand/tokens';
import { renderNotificationDescription } from './notificationFormatting';
import {
  ConfigIcon,
  EnvIcon,
  ImageIcon,
  PreviewIcon,
  ReleaseIcon,
  SloIcon,
  SyncIcon,
} from './activityIcons';
import { CUSTOM_ROW_RENDERERS } from './activityRowRenderers';
import type { DeployHistoryEntry } from './types';
import type { PipelineRunSummary } from './tekton/types';

// Overview tab's "Recent Activity" panel (Concept 2 - Grouped Timeline, see
// the published mockup artifact) - a typed, per-app, day-grouped read of the
// same Notifications feed NotificationsTab.tsx already renders in full,
// filtered down to the 6 activity signals this panel is meant to surface
// (2026-09-13: image publish, deploy/release, env/preview-env
// create/delete, config change, SLO transition) rather than every pipeline
// stage (a bare "Test Succeeded" is pipeline noise here, not one of the six
// - still visible in the full Notifications tab, just not duplicated here).
// This is deliberately a second *view* over one event store, not a second
// pipeline - see notificationFormatting.tsx's own header for why the
// description-parsing logic is shared rather than forked.
//
// 2026-09-14 feedback: borrow the "Story cards" mockup's icon-badge/chip
// look for each row (was a plain colored dot + bordered-text topic label) -
// per-category icons from activityIcons.tsx, a colored icon badge in place
// of the dot, and the topic label rendered as an icon+text chip rather than
// plain uppercase text. Deliberately NOT the story-card *behavior*
// (bundling several related events into one narrative card) - that needs
// real event-correlation logic the mockup itself flagged as the most
// speculative/highest-effort of the five concepts; this only reuses its
// visual vocabulary inside the existing chronological, day-grouped list.

type Category =
  | 'all'
  | 'images'
  | 'releases'
  | 'environments'
  | 'config'
  | 'slos';

const CATEGORY_TOPICS: Record<Exclude<Category, 'all'>, string[]> = {
  images: ['build'],
  // 'deploying'/'release-outcome' (2026-09-14 release-flow redesign) join
  // 'release' here rather than getting their own category - all three are
  // the same release's lifecycle, just at different stages (see
  // activityRowRenderers.tsx's renderReleaseRow/renderDeployingRow/
  // renderReleaseOutcomeRow). 'release-outcome' was previously missing from
  // every category entirely - a real, pre-existing gap: the one notification
  // that reflects a confirmed deploy outcome was invisible in this panel
  // before this fix, silently filtered out by KNOWN_TOPICS below.
  releases: ['deploy', 'release', 'deploying', 'release-outcome'],
  environments: ['env', 'preview-env'],
  config: ['config'],
  slos: ['slo'],
};

// Every topic this panel knows how to render - anything else (e.g. 'test')
// is pipeline noise for this particular panel and is filtered out below,
// not shown as an "unknown" fallback row.
const KNOWN_TOPICS = new Set(Object.values(CATEGORY_TOPICS).flat());

interface CategoryMeta {
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}

// 2026-09-14 feedback: the filter row was plain bordered text - should be
// the same colored icon pills as the rows themselves. 'all' stays a plain
// (icon-less, neutral) toggle since it has no single color/icon of its own;
// every other filter's color comes from categoryColor() below, not a static
// field here - environments/slos need the local violet/teal accents that
// depend on light/dark, which a plain const map can't express.
const CATEGORY_META: Record<Category, CategoryMeta> = {
  all: { label: 'All' },
  images: { label: 'Images', icon: ImageIcon },
  releases: { label: 'Releases', icon: ReleaseIcon },
  environments: { label: 'Environments', icon: EnvIcon },
  config: { label: 'Config', icon: ConfigIcon },
  slos: { label: 'SLOs', icon: SloIcon },
};

// 2026-09-15 feedback: "give the environments type a unique color... the
// slo type a unique color too" - both had been reusing neutral gray (env/
// preview-env) or the same green as Releases (slo's resting/no-severity
// state), so neither actually read as its own lane. The shared Hangar Brand
// System only defines 4 hues (amber/sky/good/bad), already spoken for by
// config/images/releases-and-failures - all 4 are taken before
// environments or slo get a turn. These two are local, supplementary
// accents (violet, teal) scoped to this file rather than added to
// brand/tokens.ts's shared HangarTokens: same desaturated "calm cockpit"
// tone as the 4 brand hues, picked to sit at a clearly different point on
// the hue wheel so they read as distinct lanes rather than contradicting
// the brand's own restraint. Worth folding into the shared token set later
// if they turn out to earn a permanent place there.
const LOCAL_ACCENT = {
  environments: {
    light: { fg: '#6E5FA8', bg: '#EAE6F6' },
    dark: { fg: '#B3A6E0', bg: '#292140' },
  },
  slo: {
    light: { fg: '#1E7F91', bg: '#DCEEF1' },
    dark: { fg: '#6FC7D6', bg: '#15292D' },
  },
} as const;

function localAccent(kind: keyof typeof LOCAL_ACCENT, isDark: boolean): { fg: string; bg: string } {
  return isDark ? LOCAL_ACCENT[kind].dark : LOCAL_ACCENT[kind].light;
}

// Filter-pill color - a category's resting identity, independent of any one
// notification's severity (unlike rowColor below, which still lets an
// individual SLO row go good/bad by health state - that per-row signal is
// more specific than this button's own always-on color and isn't being
// replaced by it).
function categoryColor(c: Category, t: HangarTokens, isDark: boolean): { fg: string; bg: string } | undefined {
  switch (c) {
    case 'images':
      return { fg: t.sky, bg: t.skySoft };
    case 'releases':
      return { fg: t.good, bg: t.goodSoft };
    case 'environments':
      return localAccent('environments', isDark);
    case 'config':
      return { fg: t.amber, bg: t.amberSoft };
    case 'slos':
      return localAccent('slo', isDark);
    default:
      return undefined;
  }
}

interface TopicMeta {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  dashed?: boolean;
}

const TOPIC_META: Record<string, TopicMeta> = {
  build: { label: 'Image', icon: ImageIcon },
  deploy: { label: 'Deploy', icon: ReleaseIcon },
  release: { label: 'Release', icon: ReleaseIcon },
  deploying: { label: 'Deploying', icon: SyncIcon },
  'release-outcome': { label: 'Release', icon: ReleaseIcon },
  env: { label: 'Environment', icon: EnvIcon },
  'preview-env': { label: 'Preview env', icon: PreviewIcon, dashed: true },
  config: { label: 'Config', icon: ConfigIcon },
  slo: { label: 'SLO', icon: SloIcon },
};

// 2026-09-14 feedback ("everything looks monochrome... I like the different
// colors for each type"): color is keyed off TOPIC first, same fixed
// category palette the Story cards mockup used (image=sky, release=good,
// config=amber; env/preview-env=violet and slo=teal joined this palette
// 2026-09-15, see LOCAL_ACCENT below) - not severity, which had collapsed
// almost every row to the same "normal -> sky" color since most activity is
// routine. severity still gets the final say for a topic whose whole point
// IS a good/bad state: 'slo' (healthy vs burning - see
// sloTransitionPoll.ts's own severity choice) always colors off severity,
// and any OTHER topic still escalates to bad on a real failure (severity
// 'high'/'critical' - notify-backstage.yaml sets this for a failed pipeline
// stage) so a failed build doesn't read identically to a successful one.
const TOPIC_COLOR: Record<
  string,
  { fg: keyof HangarTokens; bg: keyof HangarTokens }
> = {
  build: { fg: 'sky', bg: 'skySoft' },
  deploy: { fg: 'good', bg: 'goodSoft' },
  release: { fg: 'good', bg: 'goodSoft' },
  // Sky, not good - Syncing is routine/in-progress (severity: normal, see
  // notify-backstage.yaml), not a success state to celebrate yet. Escalates
  // to bad automatically via isAttentionSeverity below if this ever changes.
  deploying: { fg: 'sky', bg: 'skySoft' },
  'release-outcome': { fg: 'good', bg: 'goodSoft' },
  config: { fg: 'amber', bg: 'amberSoft' },
  // env/preview-env aren't here - both use the local 'environments' accent
  // (see LOCAL_ACCENT above), handled as their own branch in rowColor below
  // since it's a raw hex pair, not a HangarTokens key.
};

function isAttentionSeverity(
  severity: NotificationSeverity | undefined,
): boolean {
  return severity === 'high' || severity === 'critical';
}

function rowColor(
  topic: string,
  severity: NotificationSeverity | undefined,
  t: HangarTokens,
  isDark: boolean,
): { fg: string; bg: string } {
  if (topic === 'slo') {
    return isAttentionSeverity(severity)
      ? { fg: t.bad, bg: t.badSoft }
      : { fg: t.good, bg: t.goodSoft };
  }
  if (isAttentionSeverity(severity)) {
    return { fg: t.bad, bg: t.badSoft };
  }
  if (topic === 'env' || topic === 'preview-env') {
    return localAccent('environments', isDark);
  }
  const base = TOPIC_COLOR[topic];
  if (!base) return { fg: t.textFaint, bg: t.panelAlt };
  return { fg: t[base.fg] as string, bg: t[base.bg] as string };
}

function dayBucket(created: string | Date): string {
  const d = new Date(created);
  const now = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// 2026-09-15 feedback, round 2: 8 (the first size cut) turned out too small
// - not enough real history to be useful. Raised back up, with the height
// problem solved differently this time: a bounded, scrollable row area
// (see the `scrollArea` class) instead of a hard row-count ceiling, so the
// panel's own footprint on the Overview page stays fixed regardless of how
// many rows there are to scroll through.
const MAX_ROWS = 20;

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  card: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: '14px 18px',
    // 2026-09-14 feedback: this panel sat directly against the Preview
    // environments section above it with no breathing room - a plain
    // section-title gap (24px, see OverviewTab's sectionTitle) wasn't
    // enough to read as a new section since there's no title row above this
    // card the way "Monitoring" gets one below it. Deliberately more than
    // that 24px baseline so it reads as clearly separated, not just aligned
    // to the same rhythm as everything else on the page.
    marginTop: 36,
    marginBottom: 20,
  },
  headRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 15,
    color: ({ t }) => t.textHi,
  },
  viewAll: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  filters: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  filterBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '4px 10px',
    borderRadius: 100,
    border: '1px solid transparent',
    cursor: 'pointer',
  },
  // Unselected: the category's own color (background tint + icon/text in
  // its fg color, set inline per-button since it varies by category).
  // Selected overrides that with the same solid-inverted treatment the
  // plain text filters used before - stays visually "selected" instead of
  // just "this category's normal color", which the tinted background alone
  // wouldn't read as clearly.
  filterBtnActive: {
    backgroundColor: ({ t }) => t.textHi,
    color: ({ t }) => t.bg,
    borderColor: ({ t }) => t.textHi,
  },
  // 2026-09-15 feedback ("the panel is really large"): tightened every
  // dimension in this row/badge/body cluster alongside MAX_ROWS above -
  // smaller badge (26->22), less vertical padding per row, tighter body gap.
  day: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: ({ t }) => t.textFaint,
    margin: '12px 0 6px',
    paddingLeft: 34,
  },
  row: {
    display: 'flex',
    gap: 10,
    position: 'relative',
    paddingLeft: 34,
    paddingBottom: 10,
  },
  rowLine: {
    position: 'absolute',
    left: 11,
    top: 24,
    bottom: -3,
    width: 1,
    backgroundColor: ({ t }) => t.lineSoft,
  },
  // Icon badge replaces the earlier plain colored dot - a small rounded-
  // square swatch (same shape language as the mockup's ".icat" chips) with
  // the topic's own icon inside, colored by severity like the dot was.
  iconBadge: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 22,
    height: 22,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid transparent',
  },
  iconBadgeDashed: { borderStyle: 'dashed' },
  body: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    paddingTop: 1,
  },
  rowHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  rowTitle: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 13,
    color: ({ t }) => t.textHi,
    lineHeight: 1.4,
  },
  time: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    whiteSpace: 'nowrap',
  },
  chipRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  // The topic "chip" - an icon + label pill, replacing the earlier plain
  // bordered-text badge, same pill vocabulary the mockup's story-card steps
  // used (".story-step").
  topicChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '3px 9px 3px 7px',
    borderRadius: 100,
  },
  description: {
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.textLo,
    whiteSpace: 'pre-wrap',
  },
  // The chained-pills second line custom row renderers use (activityRowRenderers.tsx) -
  // timestamp first, then arrow-separated pills, wrapping to a second line
  // on narrow viewports rather than overflowing.
  pillChain: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    rowGap: 3,
    flexWrap: 'wrap',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '3px 9px 3px 7px',
    borderRadius: 100,
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'none',
    '&:hover': { filter: 'brightness(0.93)' },
  },
  // A non-interactive info tag (e.g. a Ground/Flight tier or cluster name
  // with no real place to link to) - same pill shape as `pill` but no
  // cursor/hover affordance, so it doesn't look clickable when it isn't.
  pillStatic: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '3px 9px 3px 7px',
    borderRadius: 100,
  },
  chainArrow: { color: ({ t }) => t.textFaint, fontSize: 11 },
  // Nested sub-timeline inside a release-outcome row's own body (2026-09-14:
  // "don't touch/remove the older requested and deployed events... pull in
  // the past events to display the consolidated event") - a smaller-scale
  // echo of the page-level row/rowLine dot-and-connector language, not a
  // boxed/bordered card of its own, so the resolved row still reads as one
  // more entry in the same continuous timeline rather than a lifted-out
  // component. The two earlier rows it summarizes stay exactly where they
  // already are, untouched - this only ever adds.
  subSteps: { marginTop: 2, display: 'flex', flexDirection: 'column' },
  subStep: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    position: 'relative',
    padding: '3px 0 3px 16px',
  },
  subStepDot: {
    position: 'absolute',
    left: 0,
    top: 8,
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: ({ t }) => t.good,
  },
  subStepLine: {
    position: 'absolute',
    left: 2.5,
    top: 14,
    bottom: -3,
    width: 1,
    backgroundColor: ({ t }) => t.lineSoft,
  },
  subStepLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textLo,
  },
  // 2026-09-15 feedback: this used to be marginLeft: 'auto', which shoved
  // it all the way to the panel's right edge - now sits right after
  // subStepLabel instead, spaced only by subStep's own flex `gap`, matching
  // every other timestamp in this panel (always immediately after its
  // label, never pushed to an edge).
  subStepTime: {
    fontFamily: fontMono,
    fontSize: 9.5,
    color: ({ t }) => t.textFaint,
    whiteSpace: 'nowrap',
  },
  // Lighter-weight than `pill` - secondary attribution (e.g. "opened by
  // <user>"), not the row's own primary structured metadata.
  authorLink: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    textDecoration: 'none',
    '&:hover': { textDecoration: 'underline', color: ({ t }) => t.sky },
  },
  inlineTagLink: {
    font: 'inherit',
    fontFamily: fontMono,
    fontWeight: 700,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    '&:hover': { textDecoration: 'underline' },
  },
  link: {
    font: 'inherit',
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textDecoration: 'none',
    '&:hover': { textDecoration: 'underline' },
  },
  empty: {
    fontSize: 12.5,
    fontStyle: 'italic',
    color: ({ t }) => t.textFaint,
    padding: '8px 0',
  },
  // 2026-09-15 feedback: raising MAX_ROWS back up (see its own comment)
  // needed a way to not just make the card tall again - a fixed-height,
  // internally-scrolling row area keeps the panel's footprint on the
  // Overview page constant regardless of row count, the same pattern a
  // GitHub/Slack activity feed uses. Thin scrollbar styling (Firefox's
  // scrollbar-width + the WebKit pseudo-elements) so it doesn't default to
  // a chunky OS scrollbar that clashes with everything else here.
  scrollArea: {
    maxHeight: 380,
    overflowY: 'auto',
    paddingRight: 4,
    scrollbarWidth: 'thin',
    '&::-webkit-scrollbar': { width: 6 },
    '&::-webkit-scrollbar-track': { background: 'transparent' },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: ({ t }) => t.line,
      borderRadius: 3,
    },
  },
}));

export function RecentActivityPanel({
  notifications,
  loading,
  goToImage,
  goToRun,
  goToEnv,
  goToTopology,
  pipelineOrder,
  pipelineRuns,
  deployHistory,
  onViewAll,
}: {
  notifications: Notification[];
  loading: boolean;
  goToImage: (tag: string) => void;
  goToRun: (runName: string) => void;
  goToEnv: (env: string) => void;
  goToTopology: (env: string) => void;
  pipelineOrder: { lower?: string[]; upper?: string[] } | undefined;
  pipelineRuns: PipelineRunSummary[];
  deployHistory: Record<string, DeployHistoryEntry[]> | undefined;
  onViewAll: () => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const isDark = useTheme().palette.type === 'dark';
  const [category, setCategory] = useState<Category>('all');

  const panelRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    return notifications
      .filter(n => n.payload.topic && KNOWN_TOPICS.has(n.payload.topic))
      .filter(
        n =>
          category === 'all' ||
          CATEGORY_TOPICS[category].includes(n.payload.topic!),
      )
      .slice(0, MAX_ROWS);
  }, [notifications, category]);

  // Notifications already arrive newest-first (useAppNotifications sorts
  // sort: 'created', sortOrder: 'desc') - group runs of consecutive rows
  // sharing a day bucket rather than re-sorting, so this panel's ordering
  // never disagrees with the Notifications tab it's a view over.
  const groups = useMemo(() => {
    const out: { day: string; items: Notification[] }[] = [];
    filtered.forEach(n => {
      const day = dayBucket(n.created);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(n);
      else out.push({ day, items: [n] });
    });
    return out;
  }, [filtered]);

  // Always rendered, even for a brand-new app with nothing to show yet (2026-09-24: "for a
  // brand new app, the Recent Activity panel doesn't appear") - it used to return null
  // until the first known-topic notification existed, so the panel (and its filters)
  // only popped into existence after activity.
  let emptyText = 'Nothing to show for this filter yet.';
  if (loading) emptyText = 'Loading…';
  else if (notifications.length === 0) {
    emptyText = 'No activity yet - builds, deployments and releases for this app will show up here.';
  }

  return (
    <div className={classes.card} ref={panelRef} style={{ scrollMarginTop: 16, scrollMarginBottom: 16 }}>
      <div className={classes.headRow}>
        <Typography className={classes.title}>Recent activity</Typography>
        <button type="button" className={classes.viewAll} onClick={onViewAll}>
          View all in Notifications →
        </button>
      </div>
      <div className={classes.filters}>
        {(Object.keys(CATEGORY_META) as Category[]).map(c => {
          const meta = CATEGORY_META[c];
          const active = category === c;
          const CategoryIcon = meta.icon;
          const catColor = categoryColor(c, t, isDark);
          let style:
            | { color: string; backgroundColor: string; borderColor?: string }
            | undefined;
          if (!active) {
            style = catColor
              ? { color: catColor.fg, backgroundColor: catColor.bg }
              : {
                  color: t.textLo,
                  backgroundColor: t.panel,
                  borderColor: t.line,
                };
          }
          return (
            <button
              key={c}
              type="button"
              className={`${classes.filterBtn} ${
                active ? classes.filterBtnActive : ''
              }`}
              style={style}
              onMouseDown={preventFocusScroll}
              onClick={() => {
                setCategory(c);
                // Keep the WHOLE panel in view after a filter change (2026-09-24: "don't
                // fully focus on the entire panel when clicking on the filter label") -
                // the row list re-renders at a different height, which used to leave the
                // panel's bottom off-screen. 'nearest' only scrolls if it isn't already
                // fully visible.
                scrollPanelIntoView(() => panelRef.current, 60, 'nearest');
              }}
            >
              {CategoryIcon && <CategoryIcon width={11} height={11} />}
              {meta.label}
            </button>
          );
        })}
      </div>

      <div className={classes.scrollArea}>
      {groups.length === 0 ? (
        <Typography className={classes.empty}>
          {emptyText}
        </Typography>
      ) : (
        groups.map((group, gi) => (
          <div key={`${group.day}-${gi}`}>
            <div className={classes.day}>{group.day}</div>
            {group.items.map((n, i) => {
              const topic = n.payload.topic!;
              const meta = TOPIC_META[topic];
              const Icon = meta.icon;
              const { fg, bg } = rowColor(topic, n.payload.severity, t, isDark);
              const isLast =
                gi === groups.length - 1 && i === group.items.length - 1;
              return (
                <div key={n.id} className={classes.row}>
                  {!isLast && <span className={classes.rowLine} />}
                  <span
                    className={`${classes.iconBadge} ${
                      meta.dashed ? classes.iconBadgeDashed : ''
                    }`}
                    style={{
                      backgroundColor: bg,
                      color: fg,
                      borderColor: meta.dashed ? fg : 'transparent',
                    }}
                  >
                    <Icon width={13} height={13} />
                  </span>
                  <div className={classes.body}>
                    {CUSTOM_ROW_RENDERERS[topic] ? (
                      CUSTOM_ROW_RENDERERS[topic]!(n, {
                        goToImage,
                        goToRun,
                        goToEnv,
                        goToTopology,
                        pipelineOrder,
                        pipelineRuns,
                        deployHistory,
                        fg,
                        bg,
                        // Unfiltered/unsliced (not `filtered`/MAX_ROWS-cut) -
                        // renderReleaseOutcomeRow looks its own Triggered/
                        // Deploying siblings up by chain-id in here, and a
                        // sibling should still be found even if the current
                        // category filter or MAX_ROWS would otherwise have
                        // excluded it from this render pass.
                        allNotifications: notifications,
                        // Picked individually rather than passing `classes`
                        // wholesale - makeStyles's return type here doesn't
                        // preserve its literal key union well enough for TS
                        // to structurally match ActivityRowClasses's named
                        // properties in one shot, even though every key it
                        // needs is really present at runtime.
                        classes: {
                          rowTitle: classes.rowTitle,
                          inlineTagLink: classes.inlineTagLink,
                          pillChain: classes.pillChain,
                          pill: classes.pill,
                          pillStatic: classes.pillStatic,
                          chainArrow: classes.chainArrow,
                          authorLink: classes.authorLink,
                          time: classes.time,
                          subSteps: classes.subSteps,
                          subStep: classes.subStep,
                          subStepDot: classes.subStepDot,
                          subStepLine: classes.subStepLine,
                          subStepLabel: classes.subStepLabel,
                          subStepTime: classes.subStepTime,
                        },
                      })
                    ) : (
                      <>
                        <div className={classes.rowHead}>
                          <Typography className={classes.rowTitle}>
                            {n.payload.title}
                          </Typography>
                          <span
                            className={classes.time}
                            title={formatDateTime(String(n.created))}
                          >
                            {relativeTime(n.created)}
                          </span>
                        </div>
                        <div className={classes.chipRow}>
                          <span
                            className={classes.topicChip}
                            style={{ backgroundColor: bg, color: fg }}
                          >
                            <Icon width={11} height={11} />
                            {meta.label}
                          </span>
                        </div>
                        {n.payload.description && (
                          <Typography
                            className={classes.description}
                            component="div"
                          >
                            {renderNotificationDescription(
                              n.payload.description,
                              goToImage,
                              classes.link,
                            )}
                          </Typography>
                        )}
                        {n.payload.link && (
                          <a
                            className={classes.link}
                            href={n.payload.link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View →
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
      </div>
    </div>
  );
}

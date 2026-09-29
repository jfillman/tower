import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useRef, useMemo } from 'react';
import { preventFocusScroll, scrollPanelIntoView } from './preventFocusScroll.esm.js';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { relativeTime, formatDateTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { renderNotificationDescription } from './notificationFormatting.esm.js';
import { SloIcon, ConfigIcon, EnvIcon, ReleaseIcon, ImageIcon, PreviewIcon, SyncIcon } from './activityIcons.esm.js';
import { CUSTOM_ROW_RENDERERS } from './activityRowRenderers.esm.js';

const CATEGORY_TOPICS = {
  images: ["build"],
  // 'deploying'/'release-outcome' (2026-09-14 release-flow redesign) join
  // 'release' here rather than getting their own category - all three are
  // the same release's lifecycle, just at different stages (see
  // activityRowRenderers.tsx's renderReleaseRow/renderDeployingRow/
  // renderReleaseOutcomeRow). 'release-outcome' was previously missing from
  // every category entirely - a real, pre-existing gap: the one notification
  // that reflects a confirmed deploy outcome was invisible in this panel
  // before this fix, silently filtered out by KNOWN_TOPICS below.
  releases: ["deploy", "release", "deploying", "release-outcome"],
  environments: ["env", "preview-env"],
  config: ["config"],
  slos: ["slo"]
};
const KNOWN_TOPICS = new Set(Object.values(CATEGORY_TOPICS).flat());
const CATEGORY_META = {
  all: { label: "All" },
  images: { label: "Images", icon: ImageIcon },
  releases: { label: "Releases", icon: ReleaseIcon },
  environments: { label: "Environments", icon: EnvIcon },
  config: { label: "Config", icon: ConfigIcon },
  slos: { label: "SLOs", icon: SloIcon }
};
const LOCAL_ACCENT = {
  environments: {
    light: { fg: "#6E5FA8", bg: "#EAE6F6" },
    dark: { fg: "#B3A6E0", bg: "#292140" }
  },
  slo: {
    light: { fg: "#1E7F91", bg: "#DCEEF1" },
    dark: { fg: "#6FC7D6", bg: "#15292D" }
  }
};
function localAccent(kind, isDark) {
  return isDark ? LOCAL_ACCENT[kind].dark : LOCAL_ACCENT[kind].light;
}
function categoryColor(c, t, isDark) {
  switch (c) {
    case "images":
      return { fg: t.sky, bg: t.skySoft };
    case "releases":
      return { fg: t.good, bg: t.goodSoft };
    case "environments":
      return localAccent("environments", isDark);
    case "config":
      return { fg: t.amber, bg: t.amberSoft };
    case "slos":
      return localAccent("slo", isDark);
    default:
      return void 0;
  }
}
const TOPIC_META = {
  build: { label: "Image", icon: ImageIcon },
  deploy: { label: "Deploy", icon: ReleaseIcon },
  release: { label: "Release", icon: ReleaseIcon },
  deploying: { label: "Deploying", icon: SyncIcon },
  "release-outcome": { label: "Release", icon: ReleaseIcon },
  env: { label: "Environment", icon: EnvIcon },
  "preview-env": { label: "Preview env", icon: PreviewIcon, dashed: true },
  config: { label: "Config", icon: ConfigIcon },
  slo: { label: "SLO", icon: SloIcon }
};
const TOPIC_COLOR = {
  build: { fg: "sky", bg: "skySoft" },
  deploy: { fg: "good", bg: "goodSoft" },
  release: { fg: "good", bg: "goodSoft" },
  // Sky, not good - Syncing is routine/in-progress (severity: normal, see
  // notify-backstage.yaml), not a success state to celebrate yet. Escalates
  // to bad automatically via isAttentionSeverity below if this ever changes.
  deploying: { fg: "sky", bg: "skySoft" },
  "release-outcome": { fg: "good", bg: "goodSoft" },
  config: { fg: "amber", bg: "amberSoft" }
  // env/preview-env aren't here - both use the local 'environments' accent
  // (see LOCAL_ACCENT above), handled as their own branch in rowColor below
  // since it's a raw hex pair, not a HangarTokens key.
};
function isAttentionSeverity(severity) {
  return severity === "high" || severity === "critical";
}
function rowColor(topic, severity, t, isDark) {
  if (topic === "slo") {
    return isAttentionSeverity(severity) ? { fg: t.bad, bg: t.badSoft } : { fg: t.good, bg: t.goodSoft };
  }
  if (isAttentionSeverity(severity)) {
    return { fg: t.bad, bg: t.badSoft };
  }
  if (topic === "env" || topic === "preview-env") {
    return localAccent("environments", isDark);
  }
  const base = TOPIC_COLOR[topic];
  if (!base) return { fg: t.textFaint, bg: t.panelAlt };
  return { fg: t[base.fg], bg: t[base.bg] };
}
function dayBucket(created) {
  const d = new Date(created);
  const now = /* @__PURE__ */ new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 864e5);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(void 0, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}
const MAX_ROWS = 20;
const useStyles = makeStyles(() => ({
  card: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: "14px 18px",
    // 2026-09-14 feedback: this panel sat directly against the Preview
    // environments section above it with no breathing room - a plain
    // section-title gap (24px, see OverviewTab's sectionTitle) wasn't
    // enough to read as a new section since there's no title row above this
    // card the way "Monitoring" gets one below it. Deliberately more than
    // that 24px baseline so it reads as clearly separated, not just aligned
    // to the same rhythm as everything else on the page.
    marginTop: 36,
    marginBottom: 20
  },
  headRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 10
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 15,
    color: ({ t }) => t.textHi
  },
  viewAll: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0
  },
  filters: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 },
  filterBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "4px 10px",
    borderRadius: 100,
    border: "1px solid transparent",
    cursor: "pointer"
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
    borderColor: ({ t }) => t.textHi
  },
  // 2026-09-15 feedback ("the panel is really large"): tightened every
  // dimension in this row/badge/body cluster alongside MAX_ROWS above -
  // smaller badge (26->22), less vertical padding per row, tighter body gap.
  day: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: ({ t }) => t.textFaint,
    margin: "12px 0 6px",
    paddingLeft: 34
  },
  row: {
    display: "flex",
    gap: 10,
    position: "relative",
    paddingLeft: 34,
    paddingBottom: 10
  },
  rowLine: {
    position: "absolute",
    left: 11,
    top: 24,
    bottom: -3,
    width: 1,
    backgroundColor: ({ t }) => t.lineSoft
  },
  // Icon badge replaces the earlier plain colored dot - a small rounded-
  // square swatch (same shape language as the mockup's ".icat" chips) with
  // the topic's own icon inside, colored by severity like the dot was.
  iconBadge: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 22,
    height: 22,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1.5px solid transparent"
  },
  iconBadgeDashed: { borderStyle: "dashed" },
  body: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
    paddingTop: 1
  },
  rowHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap"
  },
  rowTitle: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 13,
    color: ({ t }) => t.textHi,
    lineHeight: 1.4
  },
  time: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    whiteSpace: "nowrap"
  },
  chipRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  // The topic "chip" - an icon + label pill, replacing the earlier plain
  // bordered-text badge, same pill vocabulary the mockup's story-card steps
  // used (".story-step").
  topicChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "3px 9px 3px 7px",
    borderRadius: 100
  },
  description: {
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.textLo,
    whiteSpace: "pre-wrap"
  },
  // The chained-pills second line custom row renderers use (activityRowRenderers.tsx) -
  // timestamp first, then arrow-separated pills, wrapping to a second line
  // on narrow viewports rather than overflowing.
  pillChain: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    rowGap: 3,
    flexWrap: "wrap"
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "3px 9px 3px 7px",
    borderRadius: 100,
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    "&:hover": { filter: "brightness(0.93)" }
  },
  // A non-interactive info tag (e.g. a Ground/Flight tier or cluster name
  // with no real place to link to) - same pill shape as `pill` but no
  // cursor/hover affordance, so it doesn't look clickable when it isn't.
  pillStatic: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "3px 9px 3px 7px",
    borderRadius: 100
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
  subSteps: { marginTop: 2, display: "flex", flexDirection: "column" },
  subStep: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    position: "relative",
    padding: "3px 0 3px 16px"
  },
  subStepDot: {
    position: "absolute",
    left: 0,
    top: 8,
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: ({ t }) => t.good
  },
  subStepLine: {
    position: "absolute",
    left: 2.5,
    top: 14,
    bottom: -3,
    width: 1,
    backgroundColor: ({ t }) => t.lineSoft
  },
  subStepLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textLo
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
    whiteSpace: "nowrap"
  },
  // Lighter-weight than `pill` - secondary attribution (e.g. "opened by
  // <user>"), not the row's own primary structured metadata.
  authorLink: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    textDecoration: "none",
    "&:hover": { textDecoration: "underline", color: ({ t }) => t.sky }
  },
  inlineTagLink: {
    font: "inherit",
    fontFamily: fontMono,
    fontWeight: 700,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    "&:hover": { textDecoration: "underline" }
  },
  link: {
    font: "inherit",
    color: ({ t }) => t.sky,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "none",
    "&:hover": { textDecoration: "underline" }
  },
  empty: {
    fontSize: 12.5,
    fontStyle: "italic",
    color: ({ t }) => t.textFaint,
    padding: "8px 0"
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
    overflowY: "auto",
    paddingRight: 4,
    scrollbarWidth: "thin",
    "&::-webkit-scrollbar": { width: 6 },
    "&::-webkit-scrollbar-track": { background: "transparent" },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: ({ t }) => t.line,
      borderRadius: 3
    }
  }
}));
function RecentActivityPanel({
  notifications,
  loading,
  goToImage,
  goToRun,
  goToEnv,
  goToTopology,
  pipelineOrder,
  pipelineRuns,
  deployHistory,
  onViewAll
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const isDark = useTheme().palette.type === "dark";
  const [category, setCategory] = useState("all");
  const panelRef = useRef(null);
  const filtered = useMemo(() => {
    return notifications.filter((n) => n.payload.topic && KNOWN_TOPICS.has(n.payload.topic)).filter(
      (n) => category === "all" || CATEGORY_TOPICS[category].includes(n.payload.topic)
    ).slice(0, MAX_ROWS);
  }, [notifications, category]);
  const groups = useMemo(() => {
    const out = [];
    filtered.forEach((n) => {
      const day = dayBucket(n.created);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(n);
      else out.push({ day, items: [n] });
    });
    return out;
  }, [filtered]);
  let emptyText = "Nothing to show for this filter yet.";
  if (loading) emptyText = "Loading\u2026";
  else if (notifications.length === 0) {
    emptyText = "No activity yet - builds, deployments and releases for this app will show up here.";
  }
  return /* @__PURE__ */ jsxs("div", { className: classes.card, ref: panelRef, style: { scrollMarginTop: 16, scrollMarginBottom: 16 }, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.headRow, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Recent activity" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.viewAll, onClick: onViewAll, children: "View all in Notifications \u2192" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: classes.filters, children: Object.keys(CATEGORY_META).map((c) => {
      const meta = CATEGORY_META[c];
      const active = category === c;
      const CategoryIcon = meta.icon;
      const catColor = categoryColor(c, t, isDark);
      let style;
      if (!active) {
        style = catColor ? { color: catColor.fg, backgroundColor: catColor.bg } : {
          color: t.textLo,
          backgroundColor: t.panel,
          borderColor: t.line
        };
      }
      return /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: `${classes.filterBtn} ${active ? classes.filterBtnActive : ""}`,
          style,
          onMouseDown: preventFocusScroll,
          onClick: () => {
            setCategory(c);
            scrollPanelIntoView(() => panelRef.current, 60, "nearest");
          },
          children: [
            CategoryIcon && /* @__PURE__ */ jsx(CategoryIcon, { width: 11, height: 11 }),
            meta.label
          ]
        },
        c
      );
    }) }),
    /* @__PURE__ */ jsx("div", { className: classes.scrollArea, children: groups.length === 0 ? /* @__PURE__ */ jsx(Typography, { className: classes.empty, children: emptyText }) : groups.map((group, gi) => /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: classes.day, children: group.day }),
      group.items.map((n, i) => {
        const topic = n.payload.topic;
        const meta = TOPIC_META[topic];
        const Icon = meta.icon;
        const { fg, bg } = rowColor(topic, n.payload.severity, t, isDark);
        const isLast = gi === groups.length - 1 && i === group.items.length - 1;
        return /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
          !isLast && /* @__PURE__ */ jsx("span", { className: classes.rowLine }),
          /* @__PURE__ */ jsx(
            "span",
            {
              className: `${classes.iconBadge} ${meta.dashed ? classes.iconBadgeDashed : ""}`,
              style: {
                backgroundColor: bg,
                color: fg,
                borderColor: meta.dashed ? fg : "transparent"
              },
              children: /* @__PURE__ */ jsx(Icon, { width: 13, height: 13 })
            }
          ),
          /* @__PURE__ */ jsx("div", { className: classes.body, children: CUSTOM_ROW_RENDERERS[topic] ? CUSTOM_ROW_RENDERERS[topic](n, {
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
              subStepTime: classes.subStepTime
            }
          }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("div", { className: classes.rowHead, children: [
              /* @__PURE__ */ jsx(Typography, { className: classes.rowTitle, children: n.payload.title }),
              /* @__PURE__ */ jsx(
                "span",
                {
                  className: classes.time,
                  title: formatDateTime(String(n.created)),
                  children: relativeTime(n.created)
                }
              )
            ] }),
            /* @__PURE__ */ jsx("div", { className: classes.chipRow, children: /* @__PURE__ */ jsxs(
              "span",
              {
                className: classes.topicChip,
                style: { backgroundColor: bg, color: fg },
                children: [
                  /* @__PURE__ */ jsx(Icon, { width: 11, height: 11 }),
                  meta.label
                ]
              }
            ) }),
            n.payload.description && /* @__PURE__ */ jsx(
              Typography,
              {
                className: classes.description,
                component: "div",
                children: renderNotificationDescription(
                  n.payload.description,
                  goToImage,
                  classes.link
                )
              }
            ),
            n.payload.link && /* @__PURE__ */ jsx(
              "a",
              {
                className: classes.link,
                href: n.payload.link,
                target: "_blank",
                rel: "noopener noreferrer",
                children: "View \u2192"
              }
            )
          ] }) })
        ] }, n.id);
      })
    ] }, `${group.day}-${gi}`)) })
  ] });
}

export { RecentActivityPanel };
//# sourceMappingURL=RecentActivityPanel.esm.js.map

import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { useSearchParams } from 'react-router-dom';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { relativeTime } from '../shared/format.esm.js';
import { fontDisplay, fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { TowerEmptyState } from '../TowerEmptyState.esm.js';
import { PageHeader } from '../ui/index.esm.js';
import { useAppNotifications, isRecentNotification } from '../useAppNotifications.esm.js';
import { renderNotificationDescription } from '../notificationFormatting.esm.js';

const useStyles = makeStyles(() => ({
  section: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 16
  },
  row: {
    display: "flex",
    gap: 12,
    padding: "14px 20px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    borderLeft: "3px solid transparent"
  },
  newRow: {
    backgroundColor: ({ t }) => t.amberSoft,
    borderLeftColor: ({ t }) => t.amber
  },
  dot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0, marginTop: 6 },
  body: { flex: 1, minWidth: 0 },
  head: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  title: { fontFamily: fontDisplay, fontWeight: 400, fontSize: 13.5, color: ({ t }) => t.textLo },
  titleNew: { fontWeight: 700, color: ({ t }) => t.textHi },
  time: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, whiteSpace: "nowrap" },
  link: {
    display: "inline-block",
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.sky,
    textDecoration: "none",
    marginTop: 6,
    "&:hover": { textDecoration: "underline" }
  },
  // Inline within a description line (2026-09-12: "any image should take you
  // to the image in the Images tab, a PR should link you to the actual PR,
  // any repo should link you to the repo/commit") - unlike `link` above,
  // this has no marginTop/display:block, since it sits mid-line next to
  // plain text rather than on its own row. Doubles as a <button> reset for
  // the Image case (an in-app tab jump, not a real href) so it matches the
  // <a> cases' look exactly.
  inlineLink: {
    font: "inherit",
    color: ({ t }) => t.sky,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "none",
    "&:hover": { textDecoration: "underline" }
  },
  description: {
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.textLo,
    whiteSpace: "pre-wrap",
    marginTop: 4
  },
  topic: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "1px 6px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textFaint,
    marginRight: 8
  },
  sectionHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    padding: "14px 20px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`
  },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  sectionSub: { fontSize: 12, color: ({ t }) => t.textFaint },
  note: { fontSize: 12.5, fontStyle: "italic", padding: "14px 20px", color: ({ t }) => t.textLo }
}));
function NotificationRow({
  n,
  isNew,
  classes,
  t,
  goToImage
}) {
  return /* @__PURE__ */ jsxs("div", { className: `${classes.row} ${isNew ? classes.newRow : ""}`, children: [
    /* @__PURE__ */ jsx("span", { className: classes.dot, style: { backgroundColor: isNew ? t.amber : t.textFaint } }),
    /* @__PURE__ */ jsxs("div", { className: classes.body, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
        /* @__PURE__ */ jsx(Typography, { className: `${classes.title} ${isNew ? classes.titleNew : ""}`, children: n.payload.title }),
        /* @__PURE__ */ jsx("span", { className: classes.time, children: relativeTime(n.created) })
      ] }),
      n.payload.topic && /* @__PURE__ */ jsx("span", { className: classes.topic, children: n.payload.topic }),
      n.payload.description && /* @__PURE__ */ jsx(Typography, { className: classes.description, component: "div", children: renderNotificationDescription(n.payload.description, goToImage, classes.inlineLink) })
    ] })
  ] });
}
function NotificationsTab() {
  const { entity } = useEntity();
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [, setSearchParams] = useSearchParams();
  const projectSlug = entity.metadata.annotations?.["github.com/project-slug"];
  const appName = projectSlug ? projectSlug.split("/")[1] : entity.metadata.name;
  const { notifications, loading, error } = useAppNotifications(appName);
  const goToImage = (tag) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("tab", "images");
    next.set("imageTag", tag);
    return next;
  });
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  if (notifications.length === 0) {
    return /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx(PageHeader, { title: "Notifications", subtitle: `Build, test, deploy and release results Glidepath posted for ${appName}.` }),
      /* @__PURE__ */ jsx(
        TowerEmptyState,
        {
          title: "No notifications yet",
          description: `Nothing from Glidepath's pipelines has landed here for ${appName}. Enable notifications.backstage in this app's cicd.yaml to start receiving build/test/deploy/release results here.`
        }
      )
    ] });
  }
  const recent = notifications.filter((n) => isRecentNotification(n));
  const earlier = notifications.filter((n) => !isRecentNotification(n));
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(PageHeader, { title: "Notifications", subtitle: `Build, test, deploy and release results Glidepath posted for ${appName}.` }),
    /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
        /* @__PURE__ */ jsx("span", { className: classes.sectionTitle, children: "New" }),
        /* @__PURE__ */ jsx("span", { className: classes.sectionSub, children: "last hour" })
      ] }),
      recent.length === 0 ? /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "Nothing new in the last hour." }) : recent.map((n) => /* @__PURE__ */ jsx(NotificationRow, { n, isNew: true, classes, t, goToImage }, n.id))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
        /* @__PURE__ */ jsx("span", { className: classes.sectionTitle, children: "Earlier" }),
        /* @__PURE__ */ jsxs("span", { className: classes.sectionSub, children: [
          earlier.length,
          " shown"
        ] })
      ] }),
      earlier.length === 0 ? /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "Nothing older yet." }) : earlier.map((n) => /* @__PURE__ */ jsx(NotificationRow, { n, isNew: false, classes, t, goToImage }, n.id))
    ] })
  ] });
}

export { NotificationsTab };
//# sourceMappingURL=NotificationsTab.esm.js.map

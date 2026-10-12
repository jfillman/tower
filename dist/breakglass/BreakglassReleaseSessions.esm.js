import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { EmptyNote, StatusChip, TextLink } from '../ui/index.esm.js';
import { useBreakglassSessions, shortUser } from '../tabs/topology/breakglassShared.esm.js';

const useStyles = makeStyles(() => ({
  list: { display: "flex", flexDirection: "column", gap: 6 },
  row: { display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontFamily: fontMono, fontSize: 11 },
  meta: { color: ({ t }) => t.textFaint }
}));
function releaseWindow(record, others, env) {
  const own = record.deployments.find((d) => d.env === env);
  if (!own) return void 0;
  const later = others.filter((r) => r.id !== record.id).flatMap((r) => r.deployments.filter((d) => d.env === env && Date.parse(d.deployedAt) > Date.parse(own.deployedAt))).sort((a, b) => Date.parse(a.deployedAt) - Date.parse(b.deployedAt));
  return { from: own.deployedAt, ...later[0] ? { to: later[0].deployedAt } : {} };
}
function sessionsInWindow(sessions, window) {
  return sessions.filter((s) => {
    if (!s.startedAt) return false;
    const t = Date.parse(s.startedAt);
    return t >= Date.parse(window.from) && (!window.to || t < Date.parse(window.to));
  });
}
function EnvSessions({ appName, env, window, onOpen }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { sessions, info } = useBreakglassSessions(appName, env);
  const inWindow = sessionsInWindow(sessions, window);
  if (info.error) return /* @__PURE__ */ jsxs(EmptyNote, { children: [
    env,
    ": ",
    info.error
  ] });
  if (inWindow.length === 0) return /* @__PURE__ */ jsxs(EmptyNote, { children: [
    env,
    ": none while this release ran here."
  ] });
  return /* @__PURE__ */ jsx("div", { className: classes.list, "data-testid": `breakglass-release-${env}`, children: inWindow.map((s) => /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
    /* @__PURE__ */ jsx("span", { className: classes.meta, children: env }),
    /* @__PURE__ */ jsx("span", { title: formatDateTime(s.startedAt), children: relativeTime(s.startedAt) }),
    /* @__PURE__ */ jsxs("span", { children: [
      /* @__PURE__ */ jsx("b", { children: shortUser(s.requester) }),
      " \xB7 ",
      s.mode,
      s.processAccess ? " + process access" : "",
      s.volumeAccess ? " + volume access" : "",
      " on ",
      s.pod
    ] }),
    s.glassBroken && /* @__PURE__ */ jsx(StatusChip, { tone: "bad", children: "glass broken" }),
    s.sensitive && /* @__PURE__ */ jsx(StatusChip, { tone: "warn", children: "sensitive" }),
    s.reviewState === "due" && /* @__PURE__ */ jsx(StatusChip, { tone: "warn", children: "review due" }),
    /* @__PURE__ */ jsxs("span", { className: classes.meta, title: s.reason, children: [
      "\u201C",
      s.reason.length > 50 ? `${s.reason.slice(0, 50)}\u2026` : s.reason,
      "\u201D"
    ] }),
    onOpen && /* @__PURE__ */ jsx(TextLink, { onClick: () => onOpen(s), children: "open" })
  ] }, s.id)) });
}
function BreakglassReleaseSessions({ appName, record, others, onOpen }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (!appName) return null;
  const windows = record.deployments.map((d) => ({ env: d.env, window: releaseWindow(record, others, d.env) })).filter((x) => !!x.window);
  if (windows.length === 0) return /* @__PURE__ */ jsx(EmptyNote, { children: "No deployment to look at." });
  return /* @__PURE__ */ jsx("div", { className: classes.list, children: windows.map((w) => /* @__PURE__ */ jsx(EnvSessions, { appName, env: w.env, window: w.window, onOpen }, w.env)) });
}

export { BreakglassReleaseSessions, releaseWindow, sessionsInWindow };
//# sourceMappingURL=BreakglassReleaseSessions.esm.js.map

import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { relativeTime } from '../../shared/format.esm.js';
import { Panel, SectionLabel, HEALTH_LABEL, StatusDot, Chip } from '../../ui/index.esm.js';
import { PrRef } from '../../ui/PrRef.esm.js';
import { useUi } from '../../ui/styles.esm.js';

const useStyles = makeStyles(() => ({
  stack: { padding: 16, display: "flex", flexDirection: "column", gap: 12, marginTop: 16 },
  entry: { display: "flex", flexDirection: "column", gap: 6, borderTop: ({ t }) => `1px solid ${t.line}`, paddingTop: 10 },
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  health: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: ({ t }) => t.textHi },
  detail: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textLo, overflowWrap: "anywhere" },
  command: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textHi,
    background: ({ t }) => t.panelAlt,
    padding: "4px 8px",
    borderRadius: 4,
    overflowWrap: "anywhere",
    userSelect: "all"
  }
}));
function previewHealth(h) {
  switch (h) {
    case "Healthy":
      return "healthy";
    case "Progressing":
      return "progressing";
    case "Suspended":
      return "paused";
    case "Degraded":
    case "Missing":
      return "degraded";
    default:
      return "unknown";
  }
}
function PreviewRow({ p }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const health = previewHealth(p.health);
  const tag = p.image?.split(":").pop();
  return /* @__PURE__ */ jsxs("div", { className: c.entry, "data-testid": "preview", children: [
    /* @__PURE__ */ jsxs("div", { className: c.head, children: [
      p.prUrl ? /* @__PURE__ */ jsx(PrRef, { pr: { url: p.prUrl, title: `PR #${p.pr}` }, size: "inline", label: "PR" }) : /* @__PURE__ */ jsxs("span", { children: [
        "PR #",
        p.pr
      ] }),
      /* @__PURE__ */ jsxs("span", { className: c.health, children: [
        /* @__PURE__ */ jsx(StatusDot, { health }),
        p.health === "Missing" ? "Missing" : HEALTH_LABEL[health]
      ] }),
      /* @__PURE__ */ jsx(Chip, { tone: p.sync === "Synced" ? "ok" : "neutral", children: p.sync })
    ] }),
    /* @__PURE__ */ jsxs("span", { className: c.detail, children: [
      p.namespace,
      tag ? ` \xB7 ${tag}` : "",
      " \xB7 created ",
      relativeTime(p.createdAt)
    ] }),
    p.portForward && /* @__PURE__ */ jsx("code", { className: c.command, "aria-label": `Port-forward to PR ${p.pr}'s preview`, children: p.portForward })
  ] });
}
function PreviewsPanel({ state }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  if (state.previews.length === 0 && !state.error) return null;
  return /* @__PURE__ */ jsxs(Panel, { className: c.stack, role: "region", "aria-label": "Preview environments", children: [
    /* @__PURE__ */ jsx(SectionLabel, { children: "Previews" }),
    state.error && /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
      "Previews could not be read: ",
      state.error
    ] }),
    state.previews.map((p) => /* @__PURE__ */ jsx(PreviewRow, { p }, p.application)),
    state.previews.length > 0 && /* @__PURE__ */ jsx("div", { className: ui.note, children: "A preview ends when its PR closes or the preview label comes off." })
  ] });
}

export { PreviewsPanel, previewHealth };
//# sourceMappingURL=PreviewsPanel.esm.js.map

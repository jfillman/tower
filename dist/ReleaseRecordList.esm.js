import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { formatDateTime } from './shared/format.esm.js';
import { fontDisplay, fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { TowerEmptyState } from './TowerEmptyState.esm.js';
import { downloadReleaseRecordHtml } from './ReleaseRecordExport.esm.js';
import { NicknameChip } from './tabs/deployments/ImageTagPill.esm.js';
import { StatusChip, IconButton } from './ui/index.esm.js';

const useStyles = makeStyles(() => ({
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto auto auto",
    alignItems: "center",
    gap: 18,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    borderRadius: 8,
    padding: "14px 18px",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    font: "inherit",
    "@media (max-width: 860px)": { gridTemplateColumns: "1fr", gap: 8 }
  },
  cardCurrent: {
    borderColor: ({ t }) => t.amberLine,
    background: ({ t }) => `linear-gradient(180deg, ${t.amberSoft} 0%, ${t.panel} 46px)`
  },
  score: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    borderRadius: 8,
    padding: "6px 12px"
  },
  scoreNum: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 18 },
  scoreLbl: { fontSize: 10, color: ({ t }) => t.textFaint, lineHeight: 1.2 },
  ver: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  tagMono: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, marginLeft: 6 },
  sub: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 2 },
  date: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, whiteSpace: "nowrap" },
  actions: { display: "flex", alignItems: "center", gap: 6 },
  chevron: { color: ({ t }) => t.textFaint, fontSize: 16, lineHeight: 1 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 8 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  countNote: { fontSize: 12, color: ({ t }) => t.textFaint }
}));
function confidenceColor(t, confidence) {
  if (confidence >= 80) return t.good;
  if (confidence >= 50) return t.amberInk;
  return t.bad;
}
function statusPill(record) {
  if (record.current) {
    if (record.status === "degraded") return { label: "degraded", tone: "bad" };
    return { label: "current", tone: "warn" };
  }
  return { label: "superseded", tone: "ok" };
}
function ReleaseRecordList({
  records,
  totalKnown,
  onOpen
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (records.length === 0) {
    return /* @__PURE__ */ jsx(
      TowerEmptyState,
      {
        title: "No release records yet",
        description: "A Release Record is generated once an image reaches a Flight-tier (prod) environment. Nothing in this app's recent releases has reached one yet."
      }
    );
  }
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Release records" }),
      /* @__PURE__ */ jsxs(Typography, { className: classes.countNote, children: [
        records.length,
        " of this app's ",
        totalKnown,
        " recent release",
        totalKnown === 1 ? "" : "s",
        " reached Flight"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: classes.list, children: records.map((record) => {
      const pill = statusPill(record);
      const prAuthor = record.pullRequests[0]?.author;
      return /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: `${classes.card} ${record.current ? classes.cardCurrent : ""}`,
          onClick: () => onOpen(record.id),
          children: [
            /* @__PURE__ */ jsxs("div", { className: classes.score, children: [
              /* @__PURE__ */ jsx("span", { className: classes.scoreNum, style: { color: confidenceColor(t, record.confidence) }, children: record.confidence }),
              /* @__PURE__ */ jsx("span", { className: classes.scoreLbl, children: "confidence" })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsxs("span", { className: classes.ver, children: [
                record.version ?? record.imageTag,
                record.nickname && /* @__PURE__ */ jsx("span", { style: { marginLeft: 8 }, children: /* @__PURE__ */ jsx(NicknameChip, { nickname: record.nickname }) }),
                /* @__PURE__ */ jsx("span", { className: classes.tagMono, children: record.imageDigest ? record.imageDigest.slice(0, 19) : record.imageTag })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: classes.sub, children: [
                record.pullRequests.length,
                " PR",
                record.pullRequests.length === 1 ? "" : "s",
                prAuthor ? ` \xB7 ${prAuthor}` : "",
                record.status === "degraded" && record.current ? " \xB7 currently degraded" : ""
              ] })
            ] }),
            /* @__PURE__ */ jsx(StatusChip, { tone: pill.tone, dot: true, children: pill.label }),
            /* @__PURE__ */ jsx("span", { className: classes.date, children: formatDateTime(record.createdAt) }),
            /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
              /* @__PURE__ */ jsx(
                IconButton,
                {
                  "aria-label": "Download HTML",
                  title: "Download HTML",
                  onClick: (e) => {
                    e.stopPropagation();
                    downloadReleaseRecordHtml(record);
                  },
                  children: "\u2913"
                }
              ),
              /* @__PURE__ */ jsx("span", { className: classes.chevron, children: "\u203A" })
            ] })
          ]
        },
        record.id
      );
    }) })
  ] });
}

export { ReleaseRecordList, confidenceColor, statusPill };
//# sourceMappingURL=ReleaseRecordList.esm.js.map

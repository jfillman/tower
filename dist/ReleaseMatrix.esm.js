import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useRef, useEffect } from 'react';
import { scrollPanelIntoView, preventFocusScroll } from './preventFocusScroll.esm.js';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import CheckIcon from '@material-ui/icons/Check';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import RoomIcon from '@material-ui/icons/Room';
import AddIcon from '@material-ui/icons/Add';
import { relativeTime, formatDateTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { PipelineFlow, buildSupplyChainStages } from './PipelineFlow.esm.js';
import { PrButton } from './PrButton.esm.js';
import { slugHue } from './PipelineRunList.esm.js';
import { TextLink, Button } from './ui/index.esm.js';

const useStyles = makeStyles(() => ({
  wrap: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    marginBottom: 24,
    overflow: "hidden"
  },
  head: {
    padding: "14px 20px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`
  },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  sub: { fontSize: 12, color: ({ t }) => t.textLo, marginTop: 2 },
  scroll: { overflowX: "auto", padding: "4px 20px 18px" },
  table: { borderCollapse: "collapse", width: "100%", minWidth: 480 },
  colHead: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: ({ t }) => t.textLo,
    textAlign: "center",
    padding: "0 6px 8px"
  },
  rowHead: {
    textAlign: "left",
    fontFamily: fontMono,
    fontSize: 11.5,
    fontWeight: 600,
    color: ({ t }) => t.textHi,
    padding: "9px 10px 9px 0",
    whiteSpace: "nowrap"
  },
  rowHeadLink: {
    font: "inherit",
    color: "inherit",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    "&:hover": { color: ({ t }) => t.sky, textDecoration: "underline" }
  },
  nicknameChip: {
    display: "inline-block",
    marginLeft: 8,
    fontFamily: fontMono,
    fontWeight: 400,
    fontSize: 10,
    padding: "1px 7px",
    borderRadius: 8,
    border: "1px solid",
    whiteSpace: "nowrap"
  },
  row: { borderTop: ({ t }) => `1px solid ${t.lineSoft}` },
  rowCurrent: { backgroundColor: ({ t }) => t.skySoft },
  rowCurrentHead: { color: ({ t }) => t.sky },
  cellWrap: { display: "flex", justifyContent: "center", padding: "7px 3px" },
  cell: {
    width: 24,
    height: 24,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    border: "1px solid transparent"
  },
  cellDeployed: { backgroundColor: ({ t }) => t.goodSoft, color: ({ t }) => t.good },
  cellPending: {
    backgroundColor: ({ t }) => t.amberSoft,
    color: ({ t }) => t.amberInk,
    borderColor: ({ t }) => t.amberLine,
    cursor: "pointer"
  },
  cellClickable: { cursor: "pointer" },
  cellNone: { backgroundColor: ({ t }) => t.panelAlt, color: ({ t }) => t.textFaint },
  cellPromotable: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
    borderColor: ({ t }) => t.skyLine,
    color: ({ t }) => t.sky,
    cursor: "pointer"
  },
  expand: {
    margin: "4px 20px 18px",
    paddingTop: 14,
    borderTop: ({ t }) => `1px dashed ${t.line}`
  },
  expandHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  expandTag: { fontFamily: fontMono, fontSize: 13, fontWeight: 700, color: ({ t }) => t.textHi },
  expandArrow: { color: ({ t }) => t.textFaint, fontSize: 13 },
  expandEnv: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "2px 8px",
    borderRadius: 12,
    border: "1px solid"
  },
  close: {
    marginLeft: "auto",
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    cursor: "pointer",
    background: "none",
    border: "none"
  },
  prRow: { marginBottom: 10 },
  fact: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 6 }
}));
function CellIcon({ status }) {
  if (status === "deployed") return /* @__PURE__ */ jsx(CheckIcon, { fontSize: "inherit" });
  if (status === "pending") return /* @__PURE__ */ jsx(AutorenewIcon, { style: { fontSize: 13 } });
  if (status === "promotable") return /* @__PURE__ */ jsx(AddIcon, { style: { fontSize: 14 } });
  if (status === "pinned") return /* @__PURE__ */ jsx(RoomIcon, { style: { fontSize: 13 } });
  return /* @__PURE__ */ jsx("span", { children: "\xB7" });
}
function ReleaseMatrix({
  releases,
  totalCount,
  environments,
  provenanceByImage,
  onPromote
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [open, setOpen] = useState(null);
  const expandRef = useRef(null);
  useEffect(() => {
    if (open) scrollPanelIntoView(() => expandRef.current, 350);
  }, [open?.tag, open?.env]);
  const [, setSearchParams] = useSearchParams();
  if (releases.length === 0) {
    return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
        /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Release matrix" }),
        /* @__PURE__ */ jsx(Typography, { className: classes.sub, children: "Rows are recent releases, newest first \xB7 columns are environments in promotion order. Read a column for what's live right now, a row for one release's full journey." })
      ] }),
      /* @__PURE__ */ jsx("div", { className: classes.scroll, children: /* @__PURE__ */ jsxs("table", { className: classes.table, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", {}),
          environments.map((env) => /* @__PURE__ */ jsx("th", { className: classes.colHead, children: env.env }, env.key))
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: environments.length + 1, style: { padding: "20px 0", textAlign: "center" }, children: /* @__PURE__ */ jsx(Typography, { className: classes.sub, children: "No releases recorded yet." }) }) }) })
      ] }) })
    ] });
  }
  const goToImage = (tag) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "images");
      next.set("imageTag", tag);
      return next;
    });
  };
  const openRow = open ? releases.find((r) => r.imageTag === open.tag) : void 0;
  const openCell = openRow && open ? openRow.cells[open.env] : void 0;
  const openProvenance = openRow?.image ? provenanceByImage[openRow.image] : void 0;
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Release matrix" }),
      /* @__PURE__ */ jsxs(Typography, { className: classes.sub, children: [
        "Rows are recent releases, newest first \xB7 columns are environments in promotion order. Read a column for what's live right now, a row for one release's full journey.",
        totalCount > releases.length ? ` Showing the latest ${releases.length} of ${totalCount} known releases.` : ""
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: classes.scroll, children: /* @__PURE__ */ jsxs("table", { className: classes.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", {}),
        environments.map((env) => /* @__PURE__ */ jsx("th", { className: classes.colHead, children: env.env }, env.key))
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: releases.map((row) => /* @__PURE__ */ jsxs("tr", { className: `${classes.row} ${row.current ? classes.rowCurrent : ""}`, children: [
        /* @__PURE__ */ jsxs("th", { className: `${classes.rowHead} ${row.current ? classes.rowCurrentHead : ""}`, children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: classes.rowHeadLink,
              onClick: () => goToImage(row.imageTag),
              title: `View ${row.imageTag} in the Images tab`,
              children: row.imageTag
            }
          ),
          row.nickname && /* @__PURE__ */ jsx(
            "span",
            {
              className: classes.nicknameChip,
              style: {
                color: `hsl(${slugHue(row.nickname)}, 65%, 60%)`,
                borderColor: `hsl(${slugHue(row.nickname)}, 65%, 60%)`,
                backgroundColor: `hsla(${slugHue(row.nickname)}, 65%, 60%, 0.12)`
              },
              title: "This release's build flow, from the CI/CD tab",
              children: row.nickname
            }
          )
        ] }),
        environments.map((env) => {
          const cell = row.cells[env.env] ?? { status: "none" };
          const clickable = cell.status !== "none";
          const isOpen = open?.tag === row.imageTag && open.env === env.env;
          return /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("div", { className: classes.cellWrap, children: /* @__PURE__ */ jsx(
            "div",
            {
              role: clickable ? "button" : void 0,
              tabIndex: clickable ? 0 : void 0,
              className: [
                classes.cell,
                cell.status === "deployed" ? classes.cellDeployed : "",
                cell.status === "pending" || cell.status === "pinned" ? classes.cellPending : "",
                cell.status === "promotable" ? classes.cellPromotable : "",
                cell.status === "none" ? classes.cellNone : "",
                clickable ? classes.cellClickable : ""
              ].join(" "),
              style: isOpen ? { outline: `2px solid ${t.skyLine}`, outlineOffset: 1 } : void 0,
              onMouseDown: clickable ? preventFocusScroll : void 0,
              onClick: clickable ? () => setOpen(isOpen ? null : { tag: row.imageTag, env: env.env }) : void 0,
              onKeyDown: clickable ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(isOpen ? null : { tag: row.imageTag, env: env.env });
                }
              } : void 0,
              children: /* @__PURE__ */ jsx(CellIcon, { status: cell.status })
            }
          ) }) }, env.key);
        })
      ] }, row.imageTag)) })
    ] }) }),
    /* @__PURE__ */ jsx(Collapse, { in: Boolean(openRow && openCell && open), unmountOnExit: true, children: openRow && openCell && open && /* @__PURE__ */ jsxs("div", { className: classes.expand, ref: expandRef, style: { scrollMarginTop: 16 }, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.expandHead, children: [
        /* @__PURE__ */ jsx("span", { className: classes.expandTag, children: open.tag }),
        /* @__PURE__ */ jsx("span", { className: classes.expandArrow, children: "\u2192" }),
        /* @__PURE__ */ jsx("span", { className: classes.expandEnv, children: open.env }),
        openCell.status === "pending" && openCell.pr && /* @__PURE__ */ jsx("span", { className: classes.pill, style: { backgroundColor: t.amberSoft, borderColor: t.amberLine, color: t.amberInk }, children: "pending" }),
        openCell.status === "deployed" && /* @__PURE__ */ jsx("span", { className: classes.pill, style: { backgroundColor: t.goodSoft, borderColor: t.good, color: t.good }, children: "deployed" }),
        openCell.status === "pinned" && /* @__PURE__ */ jsx("span", { className: classes.pill, style: { backgroundColor: t.amberSoft, borderColor: t.amberLine, color: t.amberInk }, children: "pinned, not deployed" }),
        openCell.status === "promotable" && /* @__PURE__ */ jsx("span", { className: classes.pill, style: { backgroundColor: t.skySoft, borderColor: t.skyLine, color: t.sky }, children: "not yet promoted" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.close, onClick: () => setOpen(null), children: "close \u2715" })
      ] }),
      openCell.status === "pinned" && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Typography, { className: classes.fact, style: { marginTop: 0 }, children: [
          open.env,
          " is already pinned to this image (its pin PR merged), but no deploy of it has succeeded in",
          " ",
          open.env,
          " yet, so there is nothing to promote. The deploy runs on the Pipelines tab say why."
        ] }),
        /* @__PURE__ */ jsx(
          TextLink,
          {
            onClick: () => setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("tab", "pipelines");
              return next;
            }),
            children: "Open Pipelines \u2192"
          }
        )
      ] }),
      openCell.status === "promotable" && openCell.sourceEnv && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Typography, { className: classes.fact, style: { marginTop: 0 }, children: [
          "Currently live in ",
          openCell.sourceEnv,
          ", not yet in ",
          open.env,
          "."
        ] }),
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs(Button, { small: true, variant: "primary", onClick: () => onPromote({ env: openCell.sourceEnv }, open.env), children: [
          "Promote to ",
          open.env
        ] }) })
      ] }),
      openCell.status === "promotable" && !openCell.sourceEnv && openCell.sourceImage && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Typography, { className: classes.fact, style: { marginTop: 0 }, children: [
          "Not yet deployed anywhere - this deploys it to ",
          open.env,
          " for the first time."
        ] }),
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs(Button, { small: true, variant: "primary", onClick: () => onPromote({ image: openCell.sourceImage }, open.env), children: [
          "Deploy to ",
          open.env
        ] }) })
      ] }),
      openCell.status === "pending" && openCell.pr && /* @__PURE__ */ jsxs("div", { className: classes.prRow, children: [
        /* @__PURE__ */ jsx(PrButton, { pr: openCell.pr }),
        /* @__PURE__ */ jsxs(Typography, { className: classes.fact, children: [
          "updated ",
          relativeTime(openCell.pr.updatedAt)
        ] })
      ] }),
      openCell.status === "deployed" && /* @__PURE__ */ jsxs(Typography, { className: classes.fact, style: { marginBottom: openProvenance ? 12 : 0 }, children: [
        "Deployed ",
        openCell.date ? formatDateTime(openCell.date) : "at an unrecorded time",
        openCell.sha ? ` \xB7 commit ${openCell.sha.slice(0, 7)}` : ""
      ] }),
      openProvenance && /* @__PURE__ */ jsx(PipelineFlow, { stages: buildSupplyChainStages(openProvenance.data, openProvenance.loading) }),
      !openProvenance && openCell.status === "deployed" && !openRow.image && /* @__PURE__ */ jsx(Typography, { className: classes.fact, style: { fontStyle: "italic" }, children: "This release is no longer live in any environment, so its supply-chain record isn't held in memory here - only what deploy history recorded above." })
    ] }) })
  ] });
}

export { ReleaseMatrix };
//# sourceMappingURL=ReleaseMatrix.esm.js.map

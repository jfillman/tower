import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import CheckIcon from '@material-ui/icons/Check';
import { MissingAnnotationEmptyState, Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { STALE_THRESHOLD_MS, relativeTime } from '../shared/format.esm.js';
import { usePullRequests } from '../pullRequests/usePullRequests.esm.js';
import { parseGitopsPrTitle } from '../useReleaseContext.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { PageHeader } from '../ui/index.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';

const MERGED_DISPLAY_CAP = 10;
const SOURCE_DISPLAY_CAP = 12;
function hasPreviewLabel(pr) {
  return pr.labels.some((l) => l.toLowerCase() === "preview");
}
function curateSourcePrs(prs) {
  const shown = prs.slice(0, SOURCE_DISPLAY_CAP);
  const overflowCount = Math.max(0, prs.length - SOURCE_DISPLAY_CAP);
  return { shown, overflowCount };
}
const useStyles = makeStyles(() => ({
  section: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    marginBottom: 16,
    overflow: "hidden"
  },
  sectionHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    padding: "14px 20px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`
  },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  sectionSub: { fontSize: 12, color: ({ t }) => t.textFaint },
  chip: {
    fontFamily: fontMono,
    fontSize: 10.5,
    marginLeft: 8,
    padding: "2px 7px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: ({ t }) => t.textFaint,
    padding: "10px 20px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`
  },
  row: {
    cursor: "pointer",
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  td: {
    padding: "10px 20px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    fontSize: 13,
    color: ({ t }) => t.textHi
  },
  mono: { fontFamily: fontMono, fontSize: 12 },
  prNum: { color: ({ t }) => t.sky },
  targetPill: {
    display: "inline-flex",
    alignItems: "center",
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    padding: "2px 8px",
    borderRadius: 3,
    backgroundColor: ({ t }) => t.skySoft,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    color: ({ t }) => t.sky,
    marginRight: 8
  },
  imageTagText: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textFaint },
  stale: { opacity: 0.6 },
  draftChip: {
    fontSize: 10.5,
    marginLeft: 8,
    padding: "2px 6px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textFaint
  },
  note: { fontSize: 12.5, fontStyle: "italic", padding: "14px 20px", color: ({ t }) => t.textLo },
  overflowNote: { fontSize: 12.5, padding: "10px 20px" },
  link: { color: ({ t }) => t.sky, textDecoration: "none" },
  repoBadge: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    padding: "2px 6px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textFaint,
    marginRight: 8
  },
  mergedMark: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color: ({ t }) => t.good
  }
}));
function GitopsTitle({ pr, classes }) {
  if (pr.releasePin) {
    const tag = pr.title.match(/^Release \S+ (\S+) to /)?.[1] ?? pr.title.match(/ to (\S+)$/)?.[1];
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("span", { className: classes.targetPill, children: pr.releasePin }),
      /* @__PURE__ */ jsxs("span", { className: classes.imageTagText, children: [
        pr.title.startsWith("Roll back") ? "roll back to " : "@ ",
        tag ?? pr.title,
        " \xB7 pin"
      ] })
    ] });
  }
  const parsed = parseGitopsPrTitle(pr.title);
  if (!parsed) return /* @__PURE__ */ jsx(Fragment, { children: pr.title });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("span", { className: classes.targetPill, children: parsed.targetEnv }),
    /* @__PURE__ */ jsxs("span", { className: classes.imageTagText, children: [
      "@ ",
      parsed.imageTag
    ] })
  ] });
}
function PrTable({
  prs,
  emptyMessage,
  variant,
  classes,
  showPreviewChip = true
}) {
  if (prs.length === 0) return /* @__PURE__ */ jsx(Typography, { className: classes.note, children: emptyMessage });
  return /* @__PURE__ */ jsxs("table", { className: classes.table, children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "#" }),
      /* @__PURE__ */ jsx("th", { className: classes.th, children: variant === "gitops" ? "Target" : "Title" }),
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "Author" }),
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "Updated" })
    ] }) }),
    /* @__PURE__ */ jsx("tbody", { children: prs.map((pr) => {
      const stale = Date.now() - new Date(pr.updatedAt).getTime() > STALE_THRESHOLD_MS;
      return /* @__PURE__ */ jsxs(
        "tr",
        {
          className: `${classes.row} ${stale ? classes.stale : ""}`,
          onClick: () => window.open(pr.url, "_blank", "noopener,noreferrer"),
          children: [
            /* @__PURE__ */ jsxs("td", { className: `${classes.td} ${classes.mono} ${classes.prNum}`, children: [
              "#",
              pr.number
            ] }),
            /* @__PURE__ */ jsxs("td", { className: classes.td, children: [
              variant === "gitops" ? /* @__PURE__ */ jsx(GitopsTitle, { pr, classes }) : pr.title,
              pr.draft && /* @__PURE__ */ jsx("span", { className: classes.draftChip, children: "draft" }),
              showPreviewChip && hasPreviewLabel(pr) && /* @__PURE__ */ jsx("span", { className: classes.draftChip, children: "preview" })
            ] }),
            /* @__PURE__ */ jsx("td", { className: `${classes.td} ${classes.mono}`, children: pr.author ?? "\u2014" }),
            /* @__PURE__ */ jsxs("td", { className: classes.td, children: [
              relativeTime(pr.updatedAt),
              stale && " \xB7 stale"
            ] })
          ]
        },
        `${pr.repo}-${pr.number}`
      );
    }) })
  ] });
}
function MergedPrTable({ prs, classes }) {
  if (prs.length === 0) return /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "Nothing merged recently." });
  return /* @__PURE__ */ jsxs("table", { className: classes.table, children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "#" }),
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "Title" }),
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "Author" }),
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "Merged" })
    ] }) }),
    /* @__PURE__ */ jsx("tbody", { children: prs.map((pr) => /* @__PURE__ */ jsxs(
      "tr",
      {
        className: classes.row,
        onClick: () => window.open(pr.url, "_blank", "noopener,noreferrer"),
        children: [
          /* @__PURE__ */ jsxs("td", { className: `${classes.td} ${classes.mono} ${classes.prNum}`, children: [
            "#",
            pr.number
          ] }),
          /* @__PURE__ */ jsxs("td", { className: classes.td, children: [
            /* @__PURE__ */ jsx("span", { className: classes.repoBadge, children: pr.repo }),
            pr.repo === "gitops" || pr.releasePin ? /* @__PURE__ */ jsx(GitopsTitle, { pr, classes }) : pr.title
          ] }),
          /* @__PURE__ */ jsx("td", { className: `${classes.td} ${classes.mono}`, children: pr.author ?? "\u2014" }),
          /* @__PURE__ */ jsx("td", { className: classes.td, children: /* @__PURE__ */ jsxs("span", { className: classes.mergedMark, children: [
            /* @__PURE__ */ jsx(CheckIcon, { style: { fontSize: 14 } }),
            " ",
            relativeTime(pr.mergedAt ?? pr.updatedAt)
          ] }) })
        ]
      },
      `${pr.repo}-${pr.number}`
    )) })
  ] });
}
function PullRequestsTab() {
  const { entity } = useEntity();
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const projectSlug = entity.metadata.annotations?.["github.com/project-slug"];
  const [owner, appName] = projectSlug ? projectSlug.split("/") : [void 0, void 0];
  const [refreshNonce, setRefreshNonce] = useState(0);
  const prs = usePullRequests(owner && appName ? { owner, appName } : void 0, refreshNonce);
  if (!projectSlug || !owner || !appName) {
    return /* @__PURE__ */ jsx(MissingAnnotationEmptyState, { annotation: "github.com/project-slug" });
  }
  if (prs.loading) return /* @__PURE__ */ jsx(Progress, {});
  if (prs.error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(prs.error) });
  const all = prs.data ?? [];
  const openPrs = all.filter((pr) => pr.state === "open");
  const gitopsPrs = openPrs.filter((pr) => pr.repo === "gitops" || Boolean(pr.releasePin)).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const sourceOpenPrs = openPrs.filter((pr) => pr.repo === "source" && !pr.releasePin).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const previewPrs = sourceOpenPrs.filter(hasPreviewLabel);
  const sourcePrsRaw = sourceOpenPrs.filter((pr) => !hasPreviewLabel(pr));
  const { shown: sourcePrs, overflowCount } = curateSourcePrs(sourcePrsRaw);
  const mergedPrs = all.filter((pr) => pr.state === "merged").sort(
    (a, b) => new Date(b.mergedAt ?? b.updatedAt).getTime() - new Date(a.mergedAt ?? a.updatedAt).getTime()
  ).slice(0, MERGED_DISPLAY_CAP);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(
      PageHeader,
      {
        title: "Pull requests",
        subtitle: "Open release, preview and source pull requests, and what merged recently.",
        actions: /* @__PURE__ */ jsx(RefreshButton, { onClick: () => setRefreshNonce((n) => n + 1) })
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
        /* @__PURE__ */ jsxs("span", { className: classes.sectionTitle, children: [
          "Release PRs",
          /* @__PURE__ */ jsx("span", { className: classes.chip, children: gitopsPrs.some((pr) => pr.releasePin) ? `${appName} pins` : `gitops-${appName}` })
        ] }),
        /* @__PURE__ */ jsxs("span", { className: classes.sectionSub, children: [
          gitopsPrs.length,
          " open"
        ] })
      ] }),
      /* @__PURE__ */ jsx(PrTable, { prs: gitopsPrs, emptyMessage: "No open release PRs.", variant: "gitops", classes })
    ] }),
    previewPrs.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
        /* @__PURE__ */ jsxs("span", { className: classes.sectionTitle, children: [
          "Preview PRs",
          /* @__PURE__ */ jsx("span", { className: classes.chip, children: "ephemeral env" })
        ] }),
        /* @__PURE__ */ jsxs("span", { className: classes.sectionSub, children: [
          previewPrs.length,
          " open"
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        PrTable,
        {
          prs: previewPrs,
          emptyMessage: "No open preview PRs.",
          variant: "source",
          classes,
          showPreviewChip: false
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
        /* @__PURE__ */ jsxs("span", { className: classes.sectionTitle, children: [
          "Source PRs",
          /* @__PURE__ */ jsx("span", { className: classes.chip, children: appName })
        ] }),
        /* @__PURE__ */ jsxs("span", { className: classes.sectionSub, children: [
          sourcePrsRaw.length,
          " open"
        ] })
      ] }),
      /* @__PURE__ */ jsx(PrTable, { prs: sourcePrs, emptyMessage: "No open source PRs.", variant: "source", classes }),
      overflowCount > 0 && /* @__PURE__ */ jsx("div", { className: classes.overflowNote, children: /* @__PURE__ */ jsxs(
        "a",
        {
          className: classes.link,
          href: `https://github.com/${owner}/${appName}/pulls`,
          target: "_blank",
          rel: "noopener noreferrer",
          children: [
            "+",
            overflowCount,
            " more open PR",
            overflowCount === 1 ? "" : "s",
            " on GitHub"
          ]
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
        /* @__PURE__ */ jsx("span", { className: classes.sectionTitle, children: "Recently merged" }),
        /* @__PURE__ */ jsxs("span", { className: classes.sectionSub, children: [
          mergedPrs.length,
          " shown"
        ] })
      ] }),
      /* @__PURE__ */ jsx(MergedPrTable, { prs: mergedPrs, classes })
    ] })
  ] });
}

export { PullRequestsTab };
//# sourceMappingURL=PullRequestsTab.esm.js.map

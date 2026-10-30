import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { appRepos, appTypeOf } from '../appRepos.esm.js';
import { makeStyles } from '@material-ui/core/styles';
import CheckIcon from '@material-ui/icons/Check';
import { MissingAnnotationEmptyState } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { STALE_THRESHOLD_MS, relativeTime } from '../shared/format.esm.js';
import { usePullRequests } from '../pullRequests/usePullRequests.esm.js';
import { parseGitopsPrTitle } from '../useReleaseContext.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { PageHeader, Section, Chip, Hint, TextLink, useTableKit, EmptyNote, StatusChip } from '../ui/index.esm.js';
import { prWord, prFromSummary } from '../ui/PrRef.esm.js';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { TabSkeleton, TabError } from '../ui/LoadState.esm.js';

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
  body: { display: "flex", flexDirection: "column", gap: 16 },
  chipGap: { marginRight: 8 },
  chipGapLeft: { marginLeft: 8 },
  mono: { fontFamily: fontMono, fontSize: 12 },
  prNum: { color: ({ t }) => t.sky },
  imageTagText: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textFaint },
  stale: { opacity: 0.6 },
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
      /* @__PURE__ */ jsx(Chip, { tone: "sky", className: classes.chipGap, children: pr.releasePin }),
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
    /* @__PURE__ */ jsx(Chip, { tone: "sky", className: classes.chipGap, children: parsed.targetEnv }),
    /* @__PURE__ */ jsxs("span", { className: classes.imageTagText, children: [
      parsed.kind === "rollback" ? "roll back to " : "@ ",
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
  const tc = useTableKit();
  if (prs.length === 0) return /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: emptyMessage });
  return /* @__PURE__ */ jsxs("table", { className: tc.table, children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { className: tc.th, children: "#" }),
      /* @__PURE__ */ jsx("th", { className: tc.th, children: variant === "gitops" ? "Target" : "Title" }),
      /* @__PURE__ */ jsx("th", { className: tc.th, children: "Author" }),
      /* @__PURE__ */ jsx("th", { className: tc.th, children: "Updated" })
    ] }) }),
    /* @__PURE__ */ jsx("tbody", { children: prs.map((pr) => {
      const stale = Date.now() - new Date(pr.updatedAt).getTime() > STALE_THRESHOLD_MS;
      return /* @__PURE__ */ jsxs(
        "tr",
        {
          className: `${tc.rowLink} ${stale ? classes.stale : ""}`,
          onClick: () => window.open(pr.url, "_blank", "noopener,noreferrer"),
          children: [
            /* @__PURE__ */ jsxs("td", { className: `${tc.td} ${classes.mono} ${classes.prNum}`, children: [
              "#",
              pr.number
            ] }),
            /* @__PURE__ */ jsxs("td", { className: tc.td, children: [
              variant === "gitops" ? /* @__PURE__ */ jsx(GitopsTitle, { pr, classes }) : pr.title,
              /* @__PURE__ */ jsx(PrWordChip, { pr }),
              showPreviewChip && hasPreviewLabel(pr) && /* @__PURE__ */ jsx(Chip, { className: classes.chipGapLeft, children: "preview" })
            ] }),
            /* @__PURE__ */ jsx("td", { className: `${tc.td} ${classes.mono}`, children: pr.author ?? "\u2014" }),
            /* @__PURE__ */ jsxs("td", { className: tc.td, children: [
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
function PrWordChip({ pr }) {
  const word = prWord(prFromSummary(pr));
  return word ? /* @__PURE__ */ jsx(StatusChip, { tone: word.tone, children: word.text }) : null;
}
function MergedPrTable({ prs, classes }) {
  const tc = useTableKit();
  if (prs.length === 0) return /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "Nothing merged recently." });
  return /* @__PURE__ */ jsxs("table", { className: tc.table, children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { className: tc.th, children: "#" }),
      /* @__PURE__ */ jsx("th", { className: tc.th, children: "Title" }),
      /* @__PURE__ */ jsx("th", { className: tc.th, children: "Author" }),
      /* @__PURE__ */ jsx("th", { className: tc.th, children: "Merged" })
    ] }) }),
    /* @__PURE__ */ jsx("tbody", { children: prs.map((pr) => /* @__PURE__ */ jsxs(
      "tr",
      {
        className: tc.rowLink,
        onClick: () => window.open(pr.url, "_blank", "noopener,noreferrer"),
        children: [
          /* @__PURE__ */ jsxs("td", { className: `${tc.td} ${classes.mono} ${classes.prNum}`, children: [
            "#",
            pr.number
          ] }),
          /* @__PURE__ */ jsxs("td", { className: tc.td, children: [
            /* @__PURE__ */ jsx(Chip, { className: classes.chipGap, children: pr.repo }),
            pr.repo === "gitops" || pr.releasePin ? /* @__PURE__ */ jsx(GitopsTitle, { pr, classes }) : pr.title
          ] }),
          /* @__PURE__ */ jsx("td", { className: `${tc.td} ${classes.mono}`, children: pr.author ?? "\u2014" }),
          /* @__PURE__ */ jsx("td", { className: tc.td, children: /* @__PURE__ */ jsxs("span", { className: classes.mergedMark, children: [
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
  const repos = appName ? appRepos(appName, appTypeOf(entity)) : void 0;
  const prs = usePullRequests(owner && appName ? { owner, appName, appType: repos?.type } : void 0, refreshNonce);
  if (!projectSlug || !owner || !appName) {
    return /* @__PURE__ */ jsx(MissingAnnotationEmptyState, { annotation: "github.com/project-slug" });
  }
  if (prs.loading) return /* @__PURE__ */ jsx(TabSkeleton, {});
  if (prs.error) return /* @__PURE__ */ jsx(TabError, { error: prs.error, what: "pull requests" });
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
    /* @__PURE__ */ jsxs("div", { className: classes.body, children: [
      /* @__PURE__ */ jsx(
        Section,
        {
          framed: true,
          title: "Release PRs",
          meta: /* @__PURE__ */ jsx(Chip, { tone: "sky", children: gitopsPrs.some((pr) => pr.releasePin) ? `${appName} pins` : repos?.gitopsRepo }),
          count: `${gitopsPrs.length} open`,
          children: /* @__PURE__ */ jsx(PrTable, { prs: gitopsPrs, emptyMessage: "No open release PRs.", variant: "gitops", classes })
        }
      ),
      previewPrs.length > 0 && /* @__PURE__ */ jsx(
        Section,
        {
          framed: true,
          title: "Preview PRs",
          meta: /* @__PURE__ */ jsx(Chip, { tone: "sky", children: "ephemeral env" }),
          count: `${previewPrs.length} open`,
          children: /* @__PURE__ */ jsx(
            PrTable,
            {
              prs: previewPrs,
              emptyMessage: "No open preview PRs.",
              variant: "source",
              classes,
              showPreviewChip: false
            }
          )
        }
      ),
      repos?.sourceRepo && /* @__PURE__ */ jsxs(Section, { framed: true, title: "Source PRs", meta: /* @__PURE__ */ jsx(Chip, { tone: "sky", children: repos.sourceRepo }), count: `${sourcePrsRaw.length} open`, children: [
        /* @__PURE__ */ jsx(PrTable, { prs: sourcePrs, emptyMessage: "No open source PRs.", variant: "source", classes }),
        overflowCount > 0 && /* @__PURE__ */ jsx(Hint, { inset: true, children: /* @__PURE__ */ jsxs(TextLink, { href: `https://github.com/${owner}/${appName}/pulls`, children: [
          "+",
          overflowCount,
          " more open PR",
          overflowCount === 1 ? "" : "s",
          " on GitHub"
        ] }) })
      ] }),
      /* @__PURE__ */ jsx(Section, { framed: true, title: "Recently merged", count: `${mergedPrs.length} shown`, children: /* @__PURE__ */ jsx(MergedPrTable, { prs: mergedPrs, classes }) })
    ] })
  ] });
}

export { PullRequestsTab };
//# sourceMappingURL=PullRequestsTab.esm.js.map

import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { useReleaseContext, nicknameForImageTag } from '../useReleaseContext.esm.js';
import { useImageVersions, useProvenanceMap } from '../useReleaseData.esm.js';
import { RefreshButton } from '../RefreshButton.esm.js';
import { PageHeader, FilterBar, FilterChips, TextLink } from '../ui/index.esm.js';
import { TowerEmptyState } from '../TowerEmptyState.esm.js';
import { buildSupplyChainStages, PipelineFlow } from '../PipelineFlow.esm.js';
import { ImageTagPill } from './deployments/ImageTagPill.esm.js';
import { isPreviewEnvName, parseGhcrOwnerRepo, classifyGhcrVersion } from '../types.esm.js';

const useStyles = makeStyles(() => ({
  list: { display: "flex", flexDirection: "column", gap: 12 },
  panel: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    overflow: "hidden"
  },
  panelHighlighted: {
    outline: ({ t }) => `2px solid ${t.skyLine}`,
    outlineOffset: -2,
    backgroundColor: ({ t }) => t.skySoft
  },
  panelHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    padding: "14px 20px"
  },
  tagsRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  untagged: { fontSize: 12, fontStyle: "italic", color: ({ t }) => t.textFaint },
  metaRow: { display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8 },
  metaItem: { display: "flex", flexDirection: "column", gap: 2 },
  metaLabel: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: ({ t }) => t.textFaint
  },
  metaValue: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi },
  hintRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 },
  hint: {
    display: "inline-flex",
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "2px 8px",
    borderRadius: 3,
    border: "1px solid"
  },
  hintPresent: { borderColor: ({ t }) => t.line, color: ({ t }) => t.textLo, backgroundColor: ({ t }) => t.panelAlt },
  hintAbsent: { borderColor: ({ t }) => t.lineSoft, color: ({ t }) => t.textFaint, backgroundColor: "transparent" },
  expandRow: { padding: "10px 20px 14px" },
  detailBody: {
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`
  },
  detailNote: { fontSize: 12.5, fontStyle: "italic", padding: "14px 20px", color: ({ t }) => t.textLo },
  countNote: { fontSize: 12, color: ({ t }) => t.textFaint },
  note: { fontSize: 12.5, fontStyle: "italic", padding: "14px 20px", color: ({ t }) => t.textLo },
  footer: {
    padding: "10px 20px",
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.textFaint
  }
}));
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const TAG_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "tagged", label: "Tagged" },
  { value: "untagged", label: "Untagged" }
];
function ImagesTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { environments, loading, error, pipelineRuns, owner, appName } = useReleaseContext();
  const [searchParams] = useSearchParams();
  const highlightTag = searchParams.get("imageTag") ?? void 0;
  if (loading) return /* @__PURE__ */ jsx(Progress, {});
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  const image = environments.find((e) => e.image && !isPreviewEnvName(e.env))?.image ?? environments.find((e) => e.image)?.image;
  const ownerRepo = (image ? parseGhcrOwnerRepo(image) : void 0) ?? (owner && appName ? { owner, repo: appName } : void 0);
  return /* @__PURE__ */ jsx(
    ImagesTable,
    {
      ownerRepo,
      pipelineRuns,
      classes,
      highlightTag
    }
  );
}
function hasSiblingVersion(all, imageDigest, suffix) {
  const hex = imageDigest.startsWith("sha256:") ? imageDigest.slice(7) : imageDigest;
  const tag = `sha256-${hex}${suffix}`;
  return all.some((v) => v.tags.includes(tag));
}
function ImagesTable({
  ownerRepo,
  pipelineRuns,
  classes,
  highlightTag
}) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const versions = useImageVersions(ownerRepo, refreshNonce);
  const highlightedRowRef = useRef(null);
  const [pageSize, setPageSize] = useState(25);
  const [tagFilter, setTagFilter] = useState("all");
  useEffect(() => {
    if (highlightTag && versions.data) {
      highlightedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightTag, versions.data]);
  if (!ownerRepo) {
    return /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx(PageHeader, { title: "Images", subtitle: "Every image this service pushed, with its signature, provenance and SBOM." }),
      /* @__PURE__ */ jsx(
        TowerEmptyState,
        {
          title: "No GHCR image found",
          description: "Tower couldn't find a live container image for this entity to look up on GHCR yet."
        }
      )
    ] });
  }
  const allVersions = versions.data ?? [];
  const imageEntries = allVersions.filter((v) => classifyGhcrVersion(v.tags) === "image");
  const filteredEntries = imageEntries.filter((v) => {
    if (tagFilter === "tagged") return v.tags.length > 0;
    if (tagFilter === "untagged") return v.tags.length === 0;
    return true;
  });
  const highlightIndex = highlightTag ? filteredEntries.findIndex((v) => v.tags.includes(highlightTag)) : -1;
  let visibleCount;
  if (pageSize === "all") {
    visibleCount = filteredEntries.length;
  } else if (highlightIndex >= 0) {
    visibleCount = Math.max(pageSize, highlightIndex + 1);
  } else {
    visibleCount = pageSize;
  }
  const visibleEntries = filteredEntries.slice(0, visibleCount);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(
      PageHeader,
      {
        title: "Images",
        subtitle: `ghcr.io/${ownerRepo.owner}/${ownerRepo.repo}: every image this service pushed, with its signature, provenance and SBOM.`,
        actions: /* @__PURE__ */ jsx(RefreshButton, { onClick: () => setRefreshNonce((n) => n + 1) })
      }
    ),
    /* @__PURE__ */ jsxs(FilterBar, { end: versions.data && /* @__PURE__ */ jsxs("span", { className: classes.countNote, children: [
      filteredEntries.length,
      " image",
      filteredEntries.length === 1 ? "" : "s"
    ] }), children: [
      /* @__PURE__ */ jsx(
        FilterChips,
        {
          label: "Tags",
          value: tagFilter,
          onChange: setTagFilter,
          options: TAG_FILTER_OPTIONS.map((o) => ({ id: o.value, label: o.label }))
        }
      ),
      /* @__PURE__ */ jsx(
        FilterChips,
        {
          label: "Show",
          value: String(pageSize),
          onChange: (v) => setPageSize(v === "all" ? "all" : Number(v)),
          options: [...PAGE_SIZE_OPTIONS.map((n) => ({ id: String(n), label: String(n) })), { id: "all", label: "All" }]
        }
      )
    ] }),
    versions.loading && /* @__PURE__ */ jsx(Progress, {}),
    versions.error && /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
      "Couldn't list image versions: ",
      versions.error
    ] }),
    versions.data && imageEntries.length === 0 && /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No package versions found for this repo on GHCR yet." }),
    versions.data && imageEntries.length > 0 && filteredEntries.length === 0 && /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
      "No ",
      tagFilter,
      " images - ",
      imageEntries.length,
      " total, hidden by the filter above."
    ] }),
    versions.data && filteredEntries.length > 0 && /* @__PURE__ */ jsx("div", { className: classes.list, children: visibleEntries.map((entry) => {
      const isHighlighted = Boolean(highlightTag) && entry.tags.includes(highlightTag);
      return /* @__PURE__ */ jsx(
        ImagePanel,
        {
          rowRef: isHighlighted ? highlightedRowRef : void 0,
          entry,
          hasProvenanceHint: hasSiblingVersion(allVersions, entry.digest, ".att"),
          hasSbomHint: hasSiblingVersion(allVersions, entry.digest, ""),
          hasSignatureHint: hasSiblingVersion(allVersions, entry.digest, ".sig"),
          ownerRepo,
          pipelineRuns,
          refreshNonce,
          isHighlighted,
          classes
        },
        entry.digest
      );
    }) }),
    versions.data && visibleEntries.length < filteredEntries.length && /* @__PURE__ */ jsxs(Typography, { className: classes.footer, children: [
      "Showing ",
      visibleEntries.length,
      " of ",
      filteredEntries.length,
      " \xB7",
      " ",
      /* @__PURE__ */ jsx(TextLink, { onClick: () => setPageSize("all"), children: "show all" })
    ] })
  ] });
}
function ImagePanel({
  entry,
  hasProvenanceHint,
  hasSbomHint,
  hasSignatureHint,
  ownerRepo,
  pipelineRuns,
  refreshNonce,
  isHighlighted,
  rowRef,
  classes
}) {
  const [expanded, setExpanded] = useState(isHighlighted);
  const [fetchEnabled, setFetchEnabled] = useState(isHighlighted);
  const imageRef = `ghcr.io/${ownerRepo.owner}/${ownerRepo.repo}@${entry.digest}`;
  const provenanceMap = useProvenanceMap(fetchEnabled ? [imageRef] : [], refreshNonce);
  const provenance = provenanceMap[imageRef];
  const stages = buildSupplyChainStages(provenance?.data, provenance?.loading ?? false);
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: rowRef,
      className: `${classes.panel} ${isHighlighted ? classes.panelHighlighted : ""}`,
      children: [
        /* @__PURE__ */ jsxs("div", { className: classes.panelHead, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: classes.tagsRow, children: entry.tags.length > 0 ? entry.tags.map((tag) => /* @__PURE__ */ jsx(ImageTagPill, { tag, nickname: nicknameForImageTag(tag, pipelineRuns) }, tag)) : /* @__PURE__ */ jsx("span", { className: classes.untagged, children: "untagged" }) }),
            /* @__PURE__ */ jsxs("div", { className: classes.metaRow, children: [
              /* @__PURE__ */ jsxs("div", { className: classes.metaItem, children: [
                /* @__PURE__ */ jsx("span", { className: classes.metaLabel, children: "Digest" }),
                /* @__PURE__ */ jsx("span", { className: classes.metaValue, children: entry.digest.startsWith("sha256:") ? `${entry.digest.slice(7, 19)}\u2026` : entry.digest })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: classes.metaItem, children: [
                /* @__PURE__ */ jsx("span", { className: classes.metaLabel, children: "Pushed" }),
                /* @__PURE__ */ jsx("span", { className: classes.metaValue, children: entry.createdAt ? relativeTime(entry.createdAt) : "\u2014" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: classes.metaItem, children: [
                /* @__PURE__ */ jsx("span", { className: classes.metaLabel, children: "Date" }),
                /* @__PURE__ */ jsx("span", { className: classes.metaValue, children: entry.createdAt ? formatDateTime(entry.createdAt) : "\u2014" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: classes.hintRow, children: [
              /* @__PURE__ */ jsxs("span", { className: `${classes.hint} ${hasProvenanceHint ? classes.hintPresent : classes.hintAbsent}`, children: [
                "provenance ",
                hasProvenanceHint ? "attached" : "not found"
              ] }),
              /* @__PURE__ */ jsxs("span", { className: `${classes.hint} ${hasSbomHint ? classes.hintPresent : classes.hintAbsent}`, children: [
                "SBOM ",
                hasSbomHint ? "attached" : "not found"
              ] }),
              /* @__PURE__ */ jsxs("span", { className: `${classes.hint} ${hasSignatureHint ? classes.hintPresent : classes.hintAbsent}`, children: [
                "signature ",
                hasSignatureHint ? "attached" : "not found"
              ] })
            ] })
          ] }),
          entry.htmlUrl && /* @__PURE__ */ jsx(TextLink, { href: entry.htmlUrl, children: "Open in registry \u2197" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: classes.expandRow, children: /* @__PURE__ */ jsx(
          TextLink,
          {
            expanded,
            onClick: () => {
              setExpanded((v) => !v);
              setFetchEnabled(true);
            },
            children: "Signature, provenance & SBOM"
          }
        ) }),
        expanded && /* @__PURE__ */ jsxs("div", { className: classes.detailBody, children: [
          provenance?.loading && /* @__PURE__ */ jsx(Progress, {}),
          provenance?.error && /* @__PURE__ */ jsxs(Typography, { className: classes.detailNote, children: [
            "Couldn't reach the registry for attestations: ",
            provenance.error
          ] }),
          provenance?.data && /* @__PURE__ */ jsx(PipelineFlow, { stages })
        ] })
      ]
    }
  );
}

export { ImagesTab };
//# sourceMappingURL=ImagesTab.esm.js.map

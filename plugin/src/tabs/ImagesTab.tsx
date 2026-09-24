import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { relativeTime, formatDateTime } from '../../shared/format';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { nicknameForImageTag, useReleaseContext } from '../useReleaseContext';
import { useImageVersions, useProvenanceMap } from '../useReleaseData';
import { RefreshButton } from '../RefreshButton';
import { TowerEmptyState } from '../TowerEmptyState';
import { buildSupplyChainStages, PipelineFlow } from '../PipelineFlow';
import { ImageTagPill } from './deployments/ImageTagPill';
import { classifyGhcrVersion, parseGhcrOwnerRepo, isPreviewEnvName, type ImageVersion } from '../types';
import type { PipelineRunSummary } from '../tekton/types';

// Reimplements GlidepathImagesPage (packages/app/src/modules/glidepath/
// GlidepathPage.tsx) in Tower's own visual language, per this module's
// established "reuse a plugin's backend route, reimplement its frontend"
// posture (see useReleaseData.ts). Reuses useReleaseContext exactly like
// every other tab for the environment list (zero new Kubernetes calls) -
// only useImageVersions (the GHCR-listing call itself) is new work here.
//
// Deliberately NOT keyed off a github.com/project-slug annotation, same as
// the original: kubernetes-ingestor's idp platform patch never sets that
// annotation on XR-backed app Components. The GHCR owner/repo this tab
// needs is fully knowable from the live image ref every environment already
// reports, with zero GitHub calls - the first environment with a resolved
// image is enough, since every environment is expected to share one GHCR
// owner/repo.
//
// 2026-09-16 redesign ("make the table image centric"): a real image push
// leaves up to 4 GHCR "versions" behind (the image manifest itself, a
// `.att` legacy provenance manifest, an OCI-1.1 referrers attestation index,
// and a classic `.sig` cosign image-signing tag - see classifyGhcrVersion's
// own comment) - the original table rendered all of these as separate rows,
// which read as unrelated artifacts rather than one image's own
// supply-chain evidence (2026-09-17 bug: the `.sig` tag specifically wasn't
// even recognized, so it got its own fake "image" row - classifyGhcrVersion
// didn't know about it until this fix). Now only real image manifests get a
// row; each row is a panel wide enough to hold real image detail plus a
// signature/provenance/SBOM section, using the exact same
// buildSupplyChainStages + PipelineFlow language OverviewTab and
// DeploymentsTab already show for an environment's *current* image - the
// difference here is this tab can show it for any past image in the
// registry, not just what's live right now.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  eyebrow: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.06em',
    color: ({ t }) => t.textFaint,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  panel: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    overflow: 'hidden',
  },
  panelHighlighted: {
    outline: ({ t }) => `2px solid ${t.skyLine}`,
    outlineOffset: -2,
    backgroundColor: ({ t }) => t.skySoft,
  },
  panelHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
    padding: '14px 20px',
  },
  tagsRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  untagged: { fontSize: 12, fontStyle: 'italic', color: ({ t }) => t.textFaint },
  metaRow: { display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8 },
  metaItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  metaLabel: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: ({ t }) => t.textFaint,
  },
  metaValue: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi },
  registryLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.sky,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    '&:hover': { textDecoration: 'underline' },
  },
  hintRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 },
  hint: {
    display: 'inline-flex',
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '2px 8px',
    borderRadius: 3,
    border: '1px solid',
  },
  hintPresent: { borderColor: ({ t }) => t.line, color: ({ t }) => t.textLo, backgroundColor: ({ t }) => t.panelAlt },
  hintAbsent: { borderColor: ({ t }) => t.lineSoft, color: ({ t }) => t.textFaint, backgroundColor: 'transparent' },
  expandToggle: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.03em',
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    padding: '10px 20px 14px',
    cursor: 'pointer',
    textAlign: 'left',
  },
  detailBody: {
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`,
  },
  detailNote: { fontSize: 12.5, fontStyle: 'italic', padding: '14px 20px', color: ({ t }) => t.textLo },
  note: { fontSize: 12.5, fontStyle: 'italic', padding: '14px 20px', color: ({ t }) => t.textLo },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 14 },
  pageSizeLabel: { display: 'flex', alignItems: 'center', gap: 6, fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  select: {
    fontFamily: fontMono,
    fontSize: 11.5,
    padding: '3px 8px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
  },
  footer: {
    padding: '10px 20px',
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.textFaint,
  },
  footerLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    font: 'inherit',
    color: ({ t }) => t.sky,
  },
}));

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number] | 'all';

type TagFilter = 'all' | 'tagged' | 'untagged';
const TAG_FILTER_OPTIONS: Array<{ value: TagFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'tagged', label: 'Tagged' },
  { value: 'untagged', label: 'Untagged' },
];

export function ImagesTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { environments, loading, error, pipelineRuns, owner, appName } = useReleaseContext();
  const [searchParams] = useSearchParams();
  const highlightTag = searchParams.get('imageTag') ?? undefined;

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;
  // Preview environments deliberately excluded here: this platform's
  // PR-validation builds push to their own "-pr" GHCR package suffix (see
  // glidepath's docs/admin/naming-conventions.md and build-image.yaml's
  // pull_request-triggered tagging), a genuinely different repo from the
  // app's real one. useReleaseContext's environments sort preview first
  // (envStageRank gives it rank -1), so picking the first environment with
  // any image at all silently landed on that "-pr" package instead - real
  // bug, caught live (checkout-api-pr showing up here instead of
  // checkout-api). Falls back to any environment's image only if the app
  // has never been promoted past preview, so the tab still shows something
  // rather than nothing.
  const image =
    environments.find(e => e.image && !isPreviewEnvName(e.env))?.image ??
    environments.find(e => e.image)?.image;
  // Falls back to the catalog's own owner + app name (ghcr.io/<owner>/<appName> is
  // this platform's image naming convention) when nothing is deployed anywhere yet
  // (2026-09-24 bug: a brand-new app, boarding-api, had built and pushed its first
  // image to GHCR but the tab only ever looked images up via a LIVE workload's
  // image, so it showed "No live workloads found" instead of the pushed image).
  const ownerRepo =
    (image ? parseGhcrOwnerRepo(image) : undefined) ?? (owner && appName ? { owner, repo: appName } : undefined);

  return (
    <ImagesTable
      ownerRepo={ownerRepo}
      pipelineRuns={pipelineRuns}
      classes={classes}
      highlightTag={highlightTag}
    />
  );
}

// A real image push leaves its provenance (.att), attestations-index, and
// classic signature (.sig) GHCR "versions" behind, tagged with the pushed
// image's own digest rather than a real release tag (see
// classifyGhcrVersion's comment for the exact convention) - correlating
// them here, from tags Tower already fetched, is enough to show
// "provenance/SBOM/signature attached" at zero extra cost, without waiting
// on the real (and much more expensive - live cosign/Fulcio/Rekor calls)
// /provenance lookup just to render a hint.
function hasSiblingVersion(all: ImageVersion[], imageDigest: string, suffix: string): boolean {
  const hex = imageDigest.startsWith('sha256:') ? imageDigest.slice(7) : imageDigest;
  const tag = `sha256-${hex}${suffix}`;
  return all.some(v => v.tags.includes(tag));
}

function ImagesTable({
  ownerRepo,
  pipelineRuns,
  classes,
  highlightTag,
}: {
  ownerRepo: { owner: string; repo: string } | undefined;
  pipelineRuns: PipelineRunSummary[];
  classes: ReturnType<typeof useStyles>;
  highlightTag: string | undefined;
}) {
  // Independent of useReleaseContext's own refreshNonce - ImagesTab is the
  // only caller of useImageVersions, so its own local re-fetch trigger is
  // enough (only one Tower tab is ever mounted at a time, see TowerPage.tsx).
  const [refreshNonce, setRefreshNonce] = useState(0);
  const versions = useImageVersions(ownerRepo, refreshNonce);
  const highlightedRowRef = useRef<HTMLDivElement | null>(null);

  // A fixed row-count picker (2026-09-11 ask) rather than an unconditional
  // full dump - even after collapsing each image down to one panel (see
  // this file's header comment), an actively-shipping app's history still
  // gets long fast.
  const [pageSize, setPageSize] = useState<PageSize>(25);

  // Defaults to 'all' - filtering out untagged images by default would
  // silently hide real, recently-pushed images (a build-only pipeline's
  // artifact, or one still awaiting its release tag) rather than just
  // decluttering old ones (2026-09-17 ask: "add a filter for tagged,
  // untagged, all images").
  const [tagFilter, setTagFilter] = useState<TagFilter>('all');

  // Scrolls to and highlights the image the release matrix's imageTag link
  // pointed at, once the GHCR listing has actually loaded - a plain CSS
  // :target anchor can't work here since panels aren't real page anchors,
  // and the panel we want doesn't exist in the DOM until versions.data
  // resolves.
  useEffect(() => {
    if (highlightTag && versions.data) {
      highlightedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightTag, versions.data]);

  if (!ownerRepo) {
    return (
      <TowerEmptyState
        title="No GHCR image found"
        description="Tower couldn't find a live container image for this entity to look up on GHCR yet."
      />
    );
  }

  // Only real image manifests get their own panel now - the .att/index/.sig
  // "versions" GHCR also lists are folded into whichever real image they
  // attest to (see hasSiblingVersion above), not shown as rows of their own.
  const allVersions = versions.data ?? [];
  const imageEntries = allVersions.filter(v => classifyGhcrVersion(v.tags) === 'image');
  const filteredEntries = imageEntries.filter(v => {
    if (tagFilter === 'tagged') return v.tags.length > 0;
    if (tagFilter === 'untagged') return v.tags.length === 0;
    return true;
  });

  // The highlighted entry (the release matrix's "jump to this image" link)
  // must always render regardless of the chosen page size, or the
  // scroll-into-view effect above would silently find nothing.
  const highlightIndex = highlightTag
    ? filteredEntries.findIndex(v => v.tags.includes(highlightTag))
    : -1;
  let visibleCount: number;
  if (pageSize === 'all') {
    visibleCount = filteredEntries.length;
  } else if (highlightIndex >= 0) {
    visibleCount = Math.max(pageSize, highlightIndex + 1);
  } else {
    visibleCount = pageSize;
  }
  const visibleEntries = filteredEntries.slice(0, visibleCount);

  return (
    <div>
      <div className={classes.toolbar}>
        <Typography className={classes.eyebrow}>
          ghcr.io/{ownerRepo.owner}/{ownerRepo.repo}
        </Typography>
        <div className={classes.toolbarRight}>
          <label className={classes.pageSizeLabel}>
            Filter
            <select
              className={classes.select}
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value as TagFilter)}
            >
              {TAG_FILTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className={classes.pageSizeLabel}>
            Show
            <select
              className={classes.select}
              value={pageSize}
              onChange={e => setPageSize(e.target.value === 'all' ? 'all' : (Number(e.target.value) as PageSize))}
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="all">All</option>
            </select>
          </label>
          <RefreshButton onClick={() => setRefreshNonce(n => n + 1)} />
        </div>
      </div>
      {versions.loading && <Progress />}
      {versions.error && (
        <Typography className={classes.note}>Couldn't list image versions: {versions.error}</Typography>
      )}
      {versions.data && imageEntries.length === 0 && (
        <Typography className={classes.note}>No package versions found for this repo on GHCR yet.</Typography>
      )}
      {versions.data && imageEntries.length > 0 && filteredEntries.length === 0 && (
        <Typography className={classes.note}>
          No {tagFilter} images - {imageEntries.length} total, hidden by the filter above.
        </Typography>
      )}
      {versions.data && filteredEntries.length > 0 && (
        <div className={classes.list}>
          {visibleEntries.map(entry => {
            const isHighlighted = Boolean(highlightTag) && entry.tags.includes(highlightTag as string);
            return (
              <ImagePanel
                key={entry.digest}
                rowRef={isHighlighted ? highlightedRowRef : undefined}
                entry={entry}
                hasProvenanceHint={hasSiblingVersion(allVersions, entry.digest, '.att')}
                hasSbomHint={hasSiblingVersion(allVersions, entry.digest, '')}
                hasSignatureHint={hasSiblingVersion(allVersions, entry.digest, '.sig')}
                ownerRepo={ownerRepo}
                pipelineRuns={pipelineRuns}
                refreshNonce={refreshNonce}
                isHighlighted={isHighlighted}
                classes={classes}
              />
            );
          })}
        </div>
      )}
      {versions.data && visibleEntries.length < filteredEntries.length && (
        <Typography className={classes.footer}>
          Showing {visibleEntries.length} of {filteredEntries.length} &middot;{' '}
          <button type="button" className={classes.footerLink} onClick={() => setPageSize('all')}>
            show all
          </button>
        </Typography>
      )}
    </div>
  );
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
  classes,
}: {
  entry: ImageVersion;
  hasProvenanceHint: boolean;
  hasSbomHint: boolean;
  hasSignatureHint: boolean;
  ownerRepo: { owner: string; repo: string };
  pipelineRuns: PipelineRunSummary[];
  refreshNonce: number;
  isHighlighted: boolean;
  rowRef: RefObject<HTMLDivElement> | undefined;
  classes: ReturnType<typeof useStyles>;
}) {
  // Defaults open for the panel the release matrix linked to - a visitor
  // who clicked "jump to this image" almost certainly wants its supply-chain
  // detail visible, not just scrolled into view. Every other panel starts
  // collapsed and un-fetched: the /provenance lookup does real live
  // cosign/Fulcio/Rekor verification per image, so eagerly firing it for
  // every visible row (up to the page-size cap) would be needlessly
  // expensive - fetched lazily, once, on first expand.
  const [expanded, setExpanded] = useState(isHighlighted);
  const [fetchEnabled, setFetchEnabled] = useState(isHighlighted);

  const imageRef = `ghcr.io/${ownerRepo.owner}/${ownerRepo.repo}@${entry.digest}`;
  const provenanceMap = useProvenanceMap(fetchEnabled ? [imageRef] : [], refreshNonce);
  const provenance = provenanceMap[imageRef];
  const stages = buildSupplyChainStages(provenance?.data, provenance?.loading ?? false);

  return (
    <div
      ref={rowRef}
      className={`${classes.panel} ${isHighlighted ? classes.panelHighlighted : ''}`}
    >
      <div className={classes.panelHead}>
        <div>
          <div className={classes.tagsRow}>
            {entry.tags.length > 0 ? (
              entry.tags.map(tag => (
                <ImageTagPill key={tag} tag={tag} nickname={nicknameForImageTag(tag, pipelineRuns)} />
              ))
            ) : (
              <span className={classes.untagged}>untagged</span>
            )}
          </div>
          <div className={classes.metaRow}>
            <div className={classes.metaItem}>
              <span className={classes.metaLabel}>Digest</span>
              <span className={classes.metaValue}>
                {entry.digest.startsWith('sha256:') ? `${entry.digest.slice(7, 19)}…` : entry.digest}
              </span>
            </div>
            <div className={classes.metaItem}>
              <span className={classes.metaLabel}>Pushed</span>
              <span className={classes.metaValue}>{entry.createdAt ? relativeTime(entry.createdAt) : '—'}</span>
            </div>
            <div className={classes.metaItem}>
              <span className={classes.metaLabel}>Date</span>
              <span className={classes.metaValue}>{entry.createdAt ? formatDateTime(entry.createdAt) : '—'}</span>
            </div>
          </div>
          <div className={classes.hintRow}>
            <span className={`${classes.hint} ${hasProvenanceHint ? classes.hintPresent : classes.hintAbsent}`}>
              provenance {hasProvenanceHint ? 'attached' : 'not found'}
            </span>
            <span className={`${classes.hint} ${hasSbomHint ? classes.hintPresent : classes.hintAbsent}`}>
              SBOM {hasSbomHint ? 'attached' : 'not found'}
            </span>
            <span className={`${classes.hint} ${hasSignatureHint ? classes.hintPresent : classes.hintAbsent}`}>
              signature {hasSignatureHint ? 'attached' : 'not found'}
            </span>
          </div>
        </div>
        {entry.htmlUrl && (
          <a href={entry.htmlUrl} target="_blank" rel="noopener noreferrer" className={classes.registryLink}>
            Open in registry <OpenInNewIcon style={{ fontSize: 13 }} />
          </a>
        )}
      </div>
      <button
        type="button"
        className={classes.expandToggle}
        onClick={() => {
          setExpanded(v => !v);
          setFetchEnabled(true);
        }}
      >
        {expanded ? '▾ Hide signature, provenance & SBOM' : '▸ View signature, provenance & SBOM'}
      </button>
      {expanded && (
        <div className={classes.detailBody}>
          {provenance?.loading && <Progress />}
          {provenance?.error && (
            <Typography className={classes.detailNote}>
              Couldn't reach the registry for attestations: {provenance.error}
            </Typography>
          )}
          {provenance?.data && <PipelineFlow stages={stages} />}
        </div>
      )}
    </div>
  );
}

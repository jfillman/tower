import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import CheckIcon from '@material-ui/icons/Check';
import { Progress, ResponseErrorPanel, MissingAnnotationEmptyState } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { STALE_THRESHOLD_MS, relativeTime } from '../../shared/format';
import { usePullRequests, type PullRequestSummary } from '../../pullRequests/usePullRequests';
import { parseGitopsPrTitle } from '../useReleaseContext';
import { RefreshButton } from '../RefreshButton';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';

const MERGED_DISPLAY_CAP = 10;

// Reimplements pullRequests/PullRequestsPage.tsx in Tower's own visual
// language, reusing that module's data hook directly (a plain fetch hook
// with no UI of its own, same posture as reusing shared/format.ts) rather
// than mounting its component - see HANDOFF-tower-module.md's dead-end on
// mounting other plugins' UI inside Tower's tabs.

const SOURCE_DISPLAY_CAP = 12;

function hasPreviewLabel(pr: PullRequestSummary): boolean {
  return pr.labels.some(l => l.toLowerCase() === 'preview');
}

// Preview PRs (a "preview" label on a source-repo PR - this platform's
// ephemeral-environment convention, see platform-cicd's pr-build synthesis)
// get pulled into their own section entirely rather than pinned to the top
// of the ordinary Source PRs table with a small chip: they're not "one more
// open source PR", they're a live ephemeral deploy with its own environment
// and lifecycle, and deserve to read that way rather than blend in.
function curateSourcePrs(prs: PullRequestSummary[]) {
  const shown = prs.slice(0, SOURCE_DISPLAY_CAP);
  const overflowCount = Math.max(0, prs.length - SOURCE_DISPLAY_CAP);
  return { shown, overflowCount };
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  section: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    padding: '14px 20px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
  },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  sectionSub: { fontSize: 12, color: ({ t }) => t.textFaint },
  chip: {
    fontFamily: fontMono,
    fontSize: 10.5,
    marginLeft: 8,
    padding: '2px 7px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: ({ t }) => t.textFaint,
    padding: '10px 20px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
  },
  row: {
    cursor: 'pointer',
    '&:hover': { backgroundColor: ({ t }) => t.panelAlt },
  },
  td: {
    padding: '10px 20px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    fontSize: 13,
    color: ({ t }) => t.textHi,
  },
  mono: { fontFamily: fontMono, fontSize: 12 },
  prNum: { color: ({ t }) => t.sky },
  targetPill: {
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    padding: '2px 8px',
    borderRadius: 3,
    backgroundColor: ({ t }) => t.skySoft,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    color: ({ t }) => t.sky,
    marginRight: 8,
  },
  imageTagText: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textFaint },
  stale: { opacity: 0.6 },
  draftChip: {
    fontSize: 10.5,
    marginLeft: 8,
    padding: '2px 6px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textFaint,
  },
  note: { fontSize: 12.5, fontStyle: 'italic', padding: '14px 20px', color: ({ t }) => t.textLo },
  overflowNote: { fontSize: 12.5, padding: '10px 20px' },
  link: { color: ({ t }) => t.sky, textDecoration: 'none' },
  repoBadge: {
    fontFamily: fontMono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    padding: '2px 6px',
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textFaint,
    marginRight: 8,
  },
  mergedMark: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    color: ({ t }) => t.good,
  },
}));

// gitops rows show the same fixed-format title
// (`Release: appName to targetEnv @ imageTag`) on every PR - as an opaque
// string it's just noise repeated row after row. Parsed with the same
// convention every other PR-matching function in Tower already relies on
// (see parseGitopsPrTitle), into the two facts that actually vary per row.
function GitopsTitle({ pr, classes }: { pr: PullRequestSummary; classes: ReturnType<typeof useStyles> }) {
  const parsed = parseGitopsPrTitle(pr.title);
  if (!parsed) return <>{pr.title}</>;
  return (
    <>
      <span className={classes.targetPill}>{parsed.targetEnv}</span>
      <span className={classes.imageTagText}>@ {parsed.imageTag}</span>
    </>
  );
}

function PrTable({
  prs,
  emptyMessage,
  variant,
  classes,
  showPreviewChip = true,
}: {
  prs: PullRequestSummary[];
  emptyMessage: string;
  variant: 'gitops' | 'source';
  classes: ReturnType<typeof useStyles>;
  showPreviewChip?: boolean;
}) {
  if (prs.length === 0) return <Typography className={classes.note}>{emptyMessage}</Typography>;
  return (
    <table className={classes.table}>
      <thead>
        <tr>
          <th className={classes.th}>#</th>
          <th className={classes.th}>{variant === 'gitops' ? 'Target' : 'Title'}</th>
          <th className={classes.th}>Author</th>
          <th className={classes.th}>Updated</th>
        </tr>
      </thead>
      <tbody>
        {prs.map(pr => {
          const stale = Date.now() - new Date(pr.updatedAt).getTime() > STALE_THRESHOLD_MS;
          return (
            <tr
              key={`${pr.repo}-${pr.number}`}
              className={`${classes.row} ${stale ? classes.stale : ''}`}
              onClick={() => window.open(pr.url, '_blank', 'noopener,noreferrer')}
            >
              <td className={`${classes.td} ${classes.mono} ${classes.prNum}`}>#{pr.number}</td>
              <td className={classes.td}>
                {variant === 'gitops' ? <GitopsTitle pr={pr} classes={classes} /> : pr.title}
                {pr.draft && <span className={classes.draftChip}>draft</span>}
                {showPreviewChip && hasPreviewLabel(pr) && <span className={classes.draftChip}>preview</span>}
              </td>
              <td className={`${classes.td} ${classes.mono}`}>{pr.author ?? '—'}</td>
              <td className={classes.td}>
                {relativeTime(pr.updatedAt)}
                {stale && ' · stale'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Both existing tables above are open-PRs-only by design (their own "N
// open" headers say so) - merged PRs get their own combined section instead
// of a third column bolted onto tables whose header/count text already
// commits to "open". One list across both repos (rather than two more
// gitops/source tables) since by the time a PR has merged, which repo it
// was on matters less than just "what happened recently".
function MergedPrTable({ prs, classes }: { prs: PullRequestSummary[]; classes: ReturnType<typeof useStyles> }) {
  if (prs.length === 0) return <Typography className={classes.note}>Nothing merged recently.</Typography>;
  return (
    <table className={classes.table}>
      <thead>
        <tr>
          <th className={classes.th}>#</th>
          <th className={classes.th}>Title</th>
          <th className={classes.th}>Author</th>
          <th className={classes.th}>Merged</th>
        </tr>
      </thead>
      <tbody>
        {prs.map(pr => (
          <tr
            key={`${pr.repo}-${pr.number}`}
            className={classes.row}
            onClick={() => window.open(pr.url, '_blank', 'noopener,noreferrer')}
          >
            <td className={`${classes.td} ${classes.mono} ${classes.prNum}`}>#{pr.number}</td>
            <td className={classes.td}>
              <span className={classes.repoBadge}>{pr.repo}</span>
              {pr.repo === 'gitops' ? <GitopsTitle pr={pr} classes={classes} /> : pr.title}
            </td>
            <td className={`${classes.td} ${classes.mono}`}>{pr.author ?? '—'}</td>
            <td className={classes.td}>
              <span className={classes.mergedMark}>
                <CheckIcon style={{ fontSize: 14 }} /> {relativeTime(pr.mergedAt ?? pr.updatedAt)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PullRequestsTab() {
  const { entity } = useEntity();
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const projectSlug = entity.metadata.annotations?.['github.com/project-slug'];
  const [owner, appName] = projectSlug ? projectSlug.split('/') : [undefined, undefined];
  // This tab's own re-fetch trigger - the only mounted caller of
  // usePullRequests for this app at a time, so no cross-instance sync is
  // needed (see TowerPage.tsx: only the active tab is ever mounted).
  const [refreshNonce, setRefreshNonce] = useState(0);
  const prs = usePullRequests(owner && appName ? { owner, appName } : undefined, refreshNonce);

  if (!projectSlug || !owner || !appName) {
    return <MissingAnnotationEmptyState annotation="github.com/project-slug" />;
  }
  if (prs.loading) return <Progress />;
  if (prs.error) return <ResponseErrorPanel error={new Error(prs.error)} />;

  const all = prs.data ?? [];
  // usePullRequests now also returns a bounded window of recently-merged
  // PRs (see packages/backend/src/pullRequests.ts) - the two tables below
  // are open-only by design (their headers say "N open"), so merged ones
  // are filtered out here rather than at the fetch layer, and shown in
  // their own section instead.
  const openPrs = all.filter(pr => pr.state === 'open');
  const gitopsPrs = openPrs
    .filter(pr => pr.repo === 'gitops')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const sourceOpenPrs = openPrs
    .filter(pr => pr.repo === 'source')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const previewPrs = sourceOpenPrs.filter(hasPreviewLabel);
  const sourcePrsRaw = sourceOpenPrs.filter(pr => !hasPreviewLabel(pr));
  const { shown: sourcePrs, overflowCount } = curateSourcePrs(sourcePrsRaw);
  const mergedPrs = all
    .filter(pr => pr.state === 'merged')
    .sort(
      (a, b) => new Date(b.mergedAt ?? b.updatedAt).getTime() - new Date(a.mergedAt ?? a.updatedAt).getTime(),
    )
    .slice(0, MERGED_DISPLAY_CAP);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <RefreshButton onClick={() => setRefreshNonce(n => n + 1)} />
      </div>
      <div className={classes.section}>
        <div className={classes.sectionHead}>
          <span className={classes.sectionTitle}>
            Release PRs
            <span className={classes.chip}>gitops-{appName}</span>
          </span>
          <span className={classes.sectionSub}>{gitopsPrs.length} open</span>
        </div>
        <PrTable prs={gitopsPrs} emptyMessage="No open release PRs." variant="gitops" classes={classes} />
      </div>

      {previewPrs.length > 0 && (
        <div className={classes.section}>
          <div className={classes.sectionHead}>
            <span className={classes.sectionTitle}>
              Preview PRs
              <span className={classes.chip}>ephemeral env</span>
            </span>
            <span className={classes.sectionSub}>{previewPrs.length} open</span>
          </div>
          <PrTable
            prs={previewPrs}
            emptyMessage="No open preview PRs."
            variant="source"
            classes={classes}
            showPreviewChip={false}
          />
        </div>
      )}

      <div className={classes.section}>
        <div className={classes.sectionHead}>
          <span className={classes.sectionTitle}>
            Source PRs
            <span className={classes.chip}>{appName}</span>
          </span>
          <span className={classes.sectionSub}>{sourcePrsRaw.length} open</span>
        </div>
        <PrTable prs={sourcePrs} emptyMessage="No open source PRs." variant="source" classes={classes} />
        {overflowCount > 0 && (
          <div className={classes.overflowNote}>
            <a
              className={classes.link}
              href={`https://github.com/${owner}/${appName}/pulls`}
              target="_blank"
              rel="noopener noreferrer"
            >
              +{overflowCount} more open PR{overflowCount === 1 ? '' : 's'} on GitHub
            </a>
          </div>
        )}
      </div>

      <div className={classes.section}>
        <div className={classes.sectionHead}>
          <span className={classes.sectionTitle}>Recently merged</span>
          <span className={classes.sectionSub}>{mergedPrs.length} shown</span>
        </div>
        <MergedPrTable prs={mergedPrs} classes={classes} />
      </div>
    </div>
  );
}

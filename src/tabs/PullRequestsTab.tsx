import { useState } from 'react';
import { appRepos, appTypeOf } from '../appRepos';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import CheckIcon from '@material-ui/icons/Check';
import { Progress, ResponseErrorPanel, MissingAnnotationEmptyState } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { STALE_THRESHOLD_MS, relativeTime } from '../shared/format';
import { usePullRequests, type PullRequestSummary } from '../pullRequests/usePullRequests';
import { parseGitopsPrTitle } from '../useReleaseContext';
import { RefreshButton } from '../RefreshButton';
import { Chip, EmptyNote, Hint, PageHeader, Section, StatusChip, TextLink, useTableKit } from '../ui';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';

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
  body: { display: 'flex', flexDirection: 'column', gap: 16 },
  chipGap: { marginRight: 8 },
  chipGapLeft: { marginLeft: 8 },
  mono: { fontFamily: fontMono, fontSize: 12 },
  prNum: { color: ({ t }) => t.sky },
  imageTagText: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textFaint },
  stale: { opacity: 0.6 },
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
  // A cloud Flight environment's release pin PR (glidepath ADR-0020) on the source repo: "Release <app> <tag> to
  // <env>" or "Roll back <app> <env> to <tag>".
  if (pr.releasePin) {
    const tag = pr.title.match(/^Release \S+ (\S+) to /)?.[1] ?? pr.title.match(/ to (\S+)$/)?.[1];
    return (
      <>
        <Chip tone="sky" className={classes.chipGap}>{pr.releasePin}</Chip>
        <span className={classes.imageTagText}>
          {pr.title.startsWith('Roll back') ? 'roll back to ' : '@ '}
          {tag ?? pr.title} · pin
        </span>
      </>
    );
  }
  const parsed = parseGitopsPrTitle(pr.title);
  if (!parsed) return <>{pr.title}</>;
  return (
    <>
      <Chip tone="sky" className={classes.chipGap}>{parsed.targetEnv}</Chip>
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
  const tc = useTableKit();
  if (prs.length === 0) return <EmptyNote inset>{emptyMessage}</EmptyNote>;
  return (
    <table className={tc.table}>
      <thead>
        <tr>
          <th className={tc.th}>#</th>
          <th className={tc.th}>{variant === 'gitops' ? 'Target' : 'Title'}</th>
          <th className={tc.th}>Author</th>
          <th className={tc.th}>Updated</th>
        </tr>
      </thead>
      <tbody>
        {prs.map(pr => {
          const stale = Date.now() - new Date(pr.updatedAt).getTime() > STALE_THRESHOLD_MS;
          return (
            <tr
              key={`${pr.repo}-${pr.number}`}
              className={`${tc.rowLink} ${stale ? classes.stale : ''}`}
              onClick={() => window.open(pr.url, '_blank', 'noopener,noreferrer')}
            >
              <td className={`${tc.td} ${classes.mono} ${classes.prNum}`}>#{pr.number}</td>
              <td className={tc.td}>
                {variant === 'gitops' ? <GitopsTitle pr={pr} classes={classes} /> : pr.title}
                {pr.draft && <StatusChip tone="neutral">draft</StatusChip>}
                {showPreviewChip && hasPreviewLabel(pr) && <Chip className={classes.chipGapLeft}>preview</Chip>}
              </td>
              <td className={`${tc.td} ${classes.mono}`}>{pr.author ?? '—'}</td>
              <td className={tc.td}>
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
  const tc = useTableKit();
  if (prs.length === 0) return <EmptyNote inset>Nothing merged recently.</EmptyNote>;
  return (
    <table className={tc.table}>
      <thead>
        <tr>
          <th className={tc.th}>#</th>
          <th className={tc.th}>Title</th>
          <th className={tc.th}>Author</th>
          <th className={tc.th}>Merged</th>
        </tr>
      </thead>
      <tbody>
        {prs.map(pr => (
          <tr
            key={`${pr.repo}-${pr.number}`}
            className={tc.rowLink}
            onClick={() => window.open(pr.url, '_blank', 'noopener,noreferrer')}
          >
            <td className={`${tc.td} ${classes.mono} ${classes.prNum}`}>#{pr.number}</td>
            <td className={tc.td}>
              <Chip className={classes.chipGap}>{pr.repo}</Chip>
              {pr.repo === 'gitops' || pr.releasePin ? <GitopsTitle pr={pr} classes={classes} /> : pr.title}
            </td>
            <td className={`${tc.td} ${classes.mono}`}>{pr.author ?? '—'}</td>
            <td className={tc.td}>
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
  const repos = appName ? appRepos(appName, appTypeOf(entity)) : undefined;
  const prs = usePullRequests(owner && appName ? { owner, appName, appType: repos?.type } : undefined, refreshNonce);

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
  // Release PRs: gitops release PRs, plus a cloud app's release pin PRs on its own repo (glidepath ADR-0020).
  const gitopsPrs = openPrs
    .filter(pr => pr.repo === 'gitops' || Boolean(pr.releasePin))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const sourceOpenPrs = openPrs
    .filter(pr => pr.repo === 'source' && !pr.releasePin)
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
      <PageHeader
        title="Pull requests"
        subtitle="Open release, preview and source pull requests, and what merged recently."
        actions={<RefreshButton onClick={() => setRefreshNonce(n => n + 1)} />}
      />
      <div className={classes.body}>
      <Section
        framed
        title="Release PRs"
        meta={<Chip tone="sky">{gitopsPrs.some(pr => pr.releasePin) ? `${appName} pins` : repos?.gitopsRepo}</Chip>}
        count={`${gitopsPrs.length} open`}
      >
        <PrTable prs={gitopsPrs} emptyMessage="No open release PRs." variant="gitops" classes={classes} />
      </Section>

      {previewPrs.length > 0 && (
        <Section
          framed
          title="Preview PRs"
          meta={<Chip tone="sky">ephemeral env</Chip>}
          count={`${previewPrs.length} open`}
        >
          <PrTable
            prs={previewPrs}
            emptyMessage="No open preview PRs."
            variant="source"
            classes={classes}
            showPreviewChip={false}
          />
        </Section>
      )}

      {repos?.sourceRepo && (
      <Section framed title="Source PRs" meta={<Chip tone="sky">{repos.sourceRepo}</Chip>} count={`${sourcePrsRaw.length} open`}>
        <PrTable prs={sourcePrs} emptyMessage="No open source PRs." variant="source" classes={classes} />
        {overflowCount > 0 && (
          <Hint inset>
            <TextLink href={`https://github.com/${owner}/${appName}/pulls`}>
              +{overflowCount} more open PR{overflowCount === 1 ? '' : 's'} on GitHub
            </TextLink>
          </Hint>
        )}
      </Section>
      )}

      <Section framed title="Recently merged" count={`${mergedPrs.length} shown`}>
        <MergedPrTable prs={mergedPrs} classes={classes} />
      </Section>
      </div>
    </div>
  );
}

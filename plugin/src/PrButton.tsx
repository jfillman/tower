import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import CheckIcon from '@material-ui/icons/Check';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import type { PullRequestSummary } from '../pullRequests/usePullRequests';
import { parseGitopsPrTitle } from './useReleaseContext';

// The Hangar Brand System mockup's PR-button design ("04 - Tower, in the
// flesh"), ported verbatim rather than left as three near-identical
// treatments (ReleaseCard's own .prBtn, ReleaseMatrix's inline pill+link,
// PullRequestsTab's plain table cell). Open state: sky "PR #N" + title.
// Merged state: whole button dims, the marker becomes a green checkmark -
// defaults from pr.state (usePullRequests now returns recently-merged PRs
// alongside open ones), so callers only need the explicit `merged` prop to
// override that default, not to opt in to the state existing at all.
const TITLE_TRUNCATE = 40;

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    maxWidth: '100%',
    fontFamily: fontMono,
    fontSize: 12,
    padding: '7px 12px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  merged: { color: ({ t }) => t.textFaint },
  num: { color: ({ t }) => t.sky, flexShrink: 0 },
  numMerged: {
    color: ({ t }) => t.good,
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  title: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  draft: { color: ({ t }) => t.textFaint, flexShrink: 0 },
  ciDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  reviewTag: { flexShrink: 0 },
}));

type CiState = NonNullable<PullRequestSummary['ci']>['state'];

const CI_DOT_COLOR: Record<CiState, keyof HangarTokens> = {
  success: 'good',
  failure: 'bad',
  pending: 'amber',
  unknown: 'textFaint',
};

export function PrButton({
  pr,
  merged = pr.state === 'merged',
  showTarget = false,
  className,
}: {
  pr: PullRequestSummary;
  merged?: boolean;
  showTarget?: boolean;
  className?: string;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const target = showTarget && pr.repo === 'gitops' ? parseGitopsPrTitle(pr.title)?.targetEnv : undefined;
  const title = pr.title.length > TITLE_TRUNCATE ? `${pr.title.slice(0, TITLE_TRUNCATE)}…` : pr.title;

  return (
    <a
      className={[classes.btn, merged ? classes.merged : '', className ?? ''].join(' ').trim()}
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {merged ? (
        <>
          <span className={classes.numMerged}>
            <CheckIcon style={{ fontSize: 13 }} />
          </span>
          PR #{pr.number} merged
        </>
      ) : (
        <>
          <span className={classes.num}>PR #{pr.number}</span>
          <span className={classes.title}>
            {title}
            {target ? ` → ${target}` : ''}
          </span>
        </>
      )}
      {pr.draft && <span className={classes.draft}>draft</span>}
      {!merged && pr.review && pr.review.state !== 'pending' && (
        <span
          className={classes.reviewTag}
          style={{ color: pr.review.state === 'approved' ? t.good : t.bad }}
        >
          {pr.review.state === 'approved' ? 'approved' : 'changes requested'}
        </span>
      )}
      {!merged && pr.ci && (
        <span
          className={classes.ciDot}
          style={{ backgroundColor: t[CI_DOT_COLOR[pr.ci.state]] as string }}
          title={`CI: ${pr.ci.passedChecks}/${pr.ci.totalChecks} checks passed (${pr.ci.state})`}
        />
      )}
    </a>
  );
}

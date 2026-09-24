import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { formatDateTime, relativeTime, STALE_THRESHOLD_MS } from '../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { imageTag, type DeployHistoryEntry, type EnvironmentSummary } from './types';
import { useRepoHead } from './useReleaseData';
import { extractShortShaFromImageTag } from './types';
import { gitopsPrForEnvAndImage } from './useReleaseContext';
import type { PullRequestSummary } from '../pullRequests/usePullRequests';

// Ported from GlidepathPage.tsx's ReleaseTimelinePanel + LeadTimePanel
// (2026-09-06, "Add Release Timeline and Lead Time panels, backed by real
// deploy history"), restyled to Hangar tokens - brought back per explicit
// feedback ("let's not forget our DORA metrics") after the first Tower pass
// shipped without them.

const TIMELINE_TAG_PALETTE_LIGHT = [
  '#3366CC', '#DC3912', '#109618', '#FF9900', '#990099',
  '#0099C6', '#DD4477', '#66AA00', '#B82E2E', '#316395',
];
const TIMELINE_TAG_PALETTE_DARK = [
  '#7FA8FF', '#FF8A80', '#69F0AE', '#FFC46B', '#E191E1',
  '#6FE3FF', '#FF8FC2', '#B2E673', '#FF9E9E', '#8FB8E0',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function colorForTag(tag: string, isDark: boolean): string {
  const palette = isDark ? TIMELINE_TAG_PALETTE_DARK : TIMELINE_TAG_PALETTE_LIGHT;
  return palette[hashString(tag) % palette.length];
}

// Exported for ReleaseLog.tsx's table view, which needs the exact same
// "how long did this release run before the next one" duration this panel's
// own segments already compute - one definition, not two.
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  card: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    padding: '16px 20px',
    marginBottom: 20,
  },
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  range: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  // 2026-09-15 feedback: env names are always lowercase at the Kubernetes
  // level (DNS-1123) - capitalizing/uppercasing them for display (this and
  // leadEnv below) invented a form the real resource doesn't have.
  rowLabel: { width: 84, flexShrink: 0, fontFamily: fontMono, fontSize: 11, textTransform: 'lowercase', color: ({ t }) => t.textLo },
  track: {
    position: 'relative',
    flex: 1,
    height: 20,
    borderRadius: 3,
    backgroundColor: ({ t }) => t.panelAlt,
  },
  seg: {
    position: 'absolute',
    top: 0,
    height: '100%',
    borderRadius: 3,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 6,
    fontFamily: fontMono,
    fontSize: 9.5,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    border: '1px solid transparent',
  },
  segStale: {
    borderStyle: 'dashed',
  },
  emptyTrack: {
    fontFamily: fontMono,
    fontSize: 10.5,
    fontStyle: 'italic',
    color: ({ t }) => t.textFaint,
    display: 'flex',
    alignItems: 'center',
    height: '100%',
    paddingLeft: 8,
  },
  legend: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: ({ t }) => t.textFaint },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  swatchStale: { backgroundColor: 'transparent', border: '2px dashed' },
  note: { fontSize: 12.5, fontStyle: 'italic', color: ({ t }) => t.textLo },
  leadGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 },
  leadCard: {
    backgroundColor: ({ t }) => t.panelAlt,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 5,
    padding: '12px 14px',
  },
  leadEnv: { fontFamily: fontMono, fontSize: 10.5, textTransform: 'lowercase', letterSpacing: '0.04em', color: ({ t }) => t.textFaint, marginBottom: 6 },
  leadValue: { fontFamily: fontMono, fontSize: 22, fontWeight: 600 },
  leadCaption: { fontSize: 11, color: ({ t }) => t.textFaint, marginTop: 4 },
}));

// Rows are a "recent activity" view, not a full history browser (same
// policy as ReleaseMatrix's MATRIX_ROW_CAP) - a fixed cap keeps the panel a
// predictable height regardless of how long an environment's real history
// is. 10, not the backend's own per_page=30 fetch cap (glidepathProvenance.ts's
// fetchDeployHistory) - that larger fetch is shared with the release matrix
// and lead-time panel, which both want more data than this panel displays;
// trimming here, not there, keeps this a display-only policy (2026-09-16:
// "update the release timeline so that it shows only the last 10 tracked
// promotions").
const TIMELINE_ROW_CAP = 10;

export function ReleaseTimelinePanel({
  environments,
  history,
}: {
  environments: EnvironmentSummary[];
  history: Record<string, DeployHistoryEntry[]>;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

  // Oldest-first (fetchDeployHistory's own ordering) - the last N array
  // entries are the N most recent promotions, so a plain slice(-N) is
  // correct without re-sorting.
  const recentHistory: Record<string, DeployHistoryEntry[]> = {};
  environments.forEach(e => {
    recentHistory[e.env] = (history[e.env] ?? []).slice(-TIMELINE_ROW_CAP);
  });

  // Every real environment gets a row, not just the ones with recorded
  // history - an env with none isn't invisible, it's a real fact ("nothing
  // promoted here yet") that used to be silently dropped instead of shown.
  // Same bug LeadTimePanel had below: its own "No recorded promotion yet"
  // branch was dead code because rows filtered those environments out
  // before ever reaching it.
  const withHistory = environments.filter(e => (recentHistory[e.env]?.length ?? 0) > 0);
  if (environments.length === 0) return null;

  const now = Date.now();
  const rangeStart =
    withHistory.length > 0
      ? Math.min(...withHistory.map(e => new Date(recentHistory[e.env][0].date).getTime()))
      : now - 60 * 60 * 1000;
  const rangeMs = Math.max(now - rangeStart, 60 * 60 * 1000);
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / rangeMs) * 100))}%`;

  const legendTags: string[] = [];
  const seenTags = new Set<string>();
  withHistory
    .flatMap(env => recentHistory[env.env])
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach(entry => {
      if (!seenTags.has(entry.imageTag)) {
        seenTags.add(entry.imageTag);
        legendTags.push(entry.imageTag);
      }
    });

  return (
    <div className={classes.card}>
      <div className={classes.headRow}>
        <Typography className={classes.title}>Release timeline</Typography>
        <span className={classes.range}>
          {withHistory.length > 0
            ? `${formatDateTime(new Date(rangeStart).toISOString())} – ${formatDateTime(new Date(now).toISOString())}`
            : 'no promotions recorded'}
        </span>
      </div>
      {environments.map(env => {
        const entries = recentHistory[env.env] ?? [];
        if (entries.length === 0) {
          return (
            <div key={env.env} className={classes.row}>
              <span className={classes.rowLabel}>{env.env}</span>
              <div className={classes.track}>
                <span className={classes.emptyTrack}>no promotions recorded yet</span>
              </div>
            </div>
          );
        }
        return (
          <div key={env.env} className={classes.row}>
            <span className={classes.rowLabel}>{env.env}</span>
            <div className={classes.track}>
              {entries.map((entry, i) => {
                const startMs = new Date(entry.date).getTime() - rangeStart;
                const endMs =
                  i + 1 < entries.length
                    ? new Date(entries[i + 1].date).getTime() - rangeStart
                    : now - rangeStart;
                const isLast = i === entries.length - 1;
                const stale = isLast && now - new Date(entry.date).getTime() > STALE_THRESHOLD_MS;
                const color = colorForTag(entry.imageTag, isDark);
                return (
                  <div
                    key={entry.sha}
                    className={`${classes.seg} ${stale ? classes.segStale : ''}`}
                    title={`${imageTag(entry.imageTag)} · deployed ${formatDateTime(entry.date)}${
                      stale ? ` · running ${relativeTime(entry.date)}` : ''
                    }`}
                    style={{
                      left: pct(startMs),
                      width: pct(endMs - startMs),
                      backgroundColor: color,
                      borderColor: stale ? t.amber : 'transparent',
                    }}
                  >
                    {imageTag(entry.imageTag)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className={classes.legend}>
        {legendTags.map(tag => (
          <div key={tag} className={classes.legendItem}>
            <span className={classes.swatch} style={{ backgroundColor: colorForTag(tag, isDark) }} />
            {imageTag(tag)}
          </div>
        ))}
        <div className={classes.legendItem}>
          <span className={`${classes.swatch} ${classes.swatchStale}`} style={{ borderColor: t.amber }} />
          stale (running &gt;3 days)
        </div>
      </div>
      <Typography className={classes.note} style={{ marginTop: 10 }}>
        Showing up to the last 10 tracked promotions per environment, not a fixed date window - an
        environment that promotes rarely may show a much longer span than one that promotes often.
      </Typography>
    </div>
  );
}

function LeadTimeCard({
  env,
  deployEntry,
  repoRef,
  gitopsPrs,
  classes,
}: {
  env: string;
  deployEntry?: DeployHistoryEntry;
  repoRef?: { owner: string; repo: string };
  gitopsPrs: PullRequestSummary[];
  classes: ReturnType<typeof useStyles>;
}) {
  const shortSha = deployEntry ? extractShortShaFromImageTag(deployEntry.imageTag) : undefined;
  const commit = useRepoHead(
    repoRef && shortSha ? { owner: repoRef.owner, repo: repoRef.repo, ref: shortSha } : undefined,
  );

  if (!deployEntry) {
    return (
      <div className={classes.leadCard}>
        <div className={classes.leadEnv}>{env}</div>
        <Typography className={classes.note}>No recorded promotion yet.</Typography>
      </div>
    );
  }

  const leadMs = commit.data
    ? new Date(deployEntry.date).getTime() - new Date(commit.data.pushedAt ?? deployEntry.date).getTime()
    : undefined;

  // Merge → deploy: how long this env's promotion PR sat merged before the
  // deploy actually landed (ArgoCD sync lag, gate wait, etc.) - a different
  // question from commit → deploy above, which also folds in review time on
  // the PR itself. Only upper envs have this at all (lower envs promote via
  // direct commit, no PR - see glidepathPromote.ts's tier split), so a miss
  // here is expected, not an error.
  const mergedPr = gitopsPrForEnvAndImage(gitopsPrs, env, imageTag(deployEntry.imageTag));
  const mergeToDeployMs =
    mergedPr?.state === 'merged' && mergedPr.mergedAt
      ? new Date(deployEntry.date).getTime() - new Date(mergedPr.mergedAt).getTime()
      : undefined;

  return (
    <div className={classes.leadCard}>
      <div className={classes.leadEnv}>{env}</div>
      {leadMs !== undefined && (
        <>
          <div className={classes.leadValue}>{formatDuration(leadMs)}</div>
          <div className={classes.leadCaption}>
            {shortSha} → deployed {relativeTime(deployEntry.date)}
          </div>
        </>
      )}
      {mergeToDeployMs !== undefined && (
        <div className={classes.leadCaption}>
          PR #{mergedPr!.number} merge → deploy: {formatDuration(mergeToDeployMs)}
        </div>
      )}
    </div>
  );
}

export function LeadTimePanel({
  environments,
  history,
  repoRef,
  gitopsPrs = [],
}: {
  environments: EnvironmentSummary[];
  history: Record<string, DeployHistoryEntry[]>;
  repoRef?: { owner: string; repo: string };
  gitopsPrs?: PullRequestSummary[];
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  // All real environments, not just the ones with recorded history - same
  // fix as ReleaseTimelinePanel above. LeadTimeCard already has a "No
  // recorded promotion yet" branch for a missing deployEntry; filtering
  // rows down first meant that branch could never actually run.
  if (environments.length === 0) {
    return (
      <div className={classes.card}>
        <div className={classes.headRow}>
          <Typography className={classes.title}>Lead time — commit to deploy</Typography>
        </div>
        <Typography className={classes.note}>No environments to measure yet.</Typography>
      </div>
    );
  }

  return (
    <div className={classes.card}>
      <div className={classes.headRow}>
        <Typography className={classes.title}>Lead time — commit to deploy</Typography>
      </div>
      <div className={classes.leadGrid}>
        {environments.map(env => {
          const entries = history[env.env] ?? [];
          return (
            <LeadTimeCard
              key={env.env}
              env={env.env}
              deployEntry={entries.length > 0 ? entries[entries.length - 1] : undefined}
              repoRef={repoRef}
              gitopsPrs={gitopsPrs}
              classes={classes}
            />
          );
        })}
      </div>
    </div>
  );
}

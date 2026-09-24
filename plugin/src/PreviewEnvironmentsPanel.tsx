import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { relativeTime } from '../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { TowerEmptyState } from './TowerEmptyState';
import { PrButton } from './PrButton';
import { health, imageTag, previewPrNumber, type EnvironmentSummary } from './types';
import type { PullRequestSummary } from '../pullRequests/usePullRequests';

// Preview/PR environments' own tab - the 2026-09-16 revamp's answer to
// "preview environments need to be relegated, not given equal billing":
// OverviewTab already split pipelineEnvs from previewEnvs and gave the
// latter a lighter, dashed-border treatment; the Releases tab now does the
// same thing structurally, one step further - preview envs get their own
// sub-tab instead of a matrix column or a full-weight card mixed in with
// dev/test/staging/pre-prod/prod.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 5, overflow: 'hidden' },
  head: { padding: '14px 20px', borderBottom: ({ t }) => `1px solid ${t.lineSoft}` },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi },
  sub: { fontSize: 12, color: ({ t }) => t.textLo, marginTop: 2 },
  card: {
    margin: '16px 20px',
    border: ({ t }) => `1px dashed ${t.skyLine}`,
    borderRadius: 5,
    padding: '14px 18px',
    backgroundColor: ({ t }) => t.panelAlt,
  },
  cardStale: { borderColor: ({ t }) => t.line, opacity: 0.75 },
  top: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  name: { fontFamily: fontMono, fontWeight: 700, fontSize: 13, color: ({ t }) => t.sky },
  nameStale: { color: ({ t }) => t.textFaint },
  meta: { fontSize: 11.5, color: ({ t }) => t.textFaint },
  facts: { marginTop: 8, fontSize: 11.5, color: ({ t }) => t.textLo },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 9px', borderRadius: 100, marginLeft: 'auto' },
  dot: { width: 6, height: 6, borderRadius: '50%' },
}));

const STALE_MS = 5 * 24 * 60 * 60 * 1000;

export function PreviewEnvironmentsPanel({
  previewEnvironments,
  sourcePrs,
}: {
  previewEnvironments: EnvironmentSummary[];
  sourcePrs: PullRequestSummary[];
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });

  if (previewEnvironments.length === 0) {
    return (
      <div className={classes.wrap}>
        <TowerEmptyState
          title="No preview environments running"
          description="Preview environments spin up automatically for open source PRs on repos configured for it."
        />
      </div>
    );
  }

  return (
    <div className={classes.wrap}>
      <div className={classes.head}>
        <Typography className={classes.title}>Preview environments</Typography>
        <Typography className={classes.sub}>
          Spawned per open source PR, not part of the promotion order - {previewEnvironments.length} running.
        </Typography>
      </div>
      {previewEnvironments.map(env => {
        const h = health(env);
        const stale = env.deployedAt && Date.now() - new Date(env.deployedAt).getTime() > STALE_MS;
        const pr = sourcePrs.find(p => p.number === previewPrNumber(env.env));
        return (
          <div key={env.key} className={`${classes.card} ${stale ? classes.cardStale : ''}`}>
            <div className={classes.top}>
              <span className={`${classes.name} ${stale ? classes.nameStale : ''}`}>{env.env}</span>
              <span className={classes.meta}>
                spun up {relativeTime(env.deployedAt)} · {imageTag(env.image)}
              </span>
              <span
                className={classes.pill}
                style={{ backgroundColor: t.panel, color: h === 'degraded' ? t.bad : t.good }}
              >
                <span className={classes.dot} style={{ backgroundColor: h === 'degraded' ? t.bad : t.good }} />
                {h}
              </span>
            </div>
            {pr && <div style={{ marginTop: 10 }}><PrButton pr={pr} /></div>}
            <Typography className={classes.facts}>
              {env.cluster} / {env.namespace}
              {stale ? ' · no traffic recently - a candidate for manual cleanup' : ' · cleans up automatically when the source PR merges or closes'}
            </Typography>
          </div>
        );
      })}
    </div>
  );
}

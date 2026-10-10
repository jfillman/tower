import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import SecurityIcon from '@material-ui/icons/Security';
import SyncIcon from '@material-ui/icons/Sync';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { relativeTime, formatDateTime } from '../../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { GateLedger, GitPrIcon, useSignalRailStyles } from '../../SignalRail';
import { CanaryRampChart } from '../../CanaryRampChart';
import { RolloutTopologyDag } from '../../RolloutTopologyDag';
import { RolloutControls } from './RolloutControls';
import type { CdDelivery, CdStepKey } from '../../useCdDelivery';
import type { ArgoResourceNode, CanaryProgress, EnvironmentSummary } from '../../types';
import type { PullRequestSummary } from '../../pullRequests/usePullRequests';
import { Button, StatusChip, TextLink } from '../../ui';

// Rollout controls (RolloutControls.tsx) sit in the "Rollout starts" and "Rollout completes" stage details, next
// to the canary chart they act on (2026-09-16: "I want the canary panel to be part of the 'Rollout Starts'
// stage"); restart and retry are meaningful once a rollout has finished or aborted, so both stages show them.
function rolloutControlsFor(env: EnvironmentSummary) {
  if (env.workload?.kind !== 'Rollout' || !env.argoAppName || !env.cluster || !env.namespace) return null;
  return (
    <RolloutControls cluster={env.cluster} argoAppName={env.argoAppName} namespace={env.namespace} rolloutName={env.workload.name} />
  );
}

// Ground Control's stage-detail panel (2026-09-16 feedback round 3: "what I
// actually want is a more graphical DAG with an attached details/activity
// section below the diagram. clicking on each stage... the bottom detail
// section should show the relevant information" - replacing the prior
// round's linear "play by play" list, which showed every stage's detail at
// once rather than letting the DAG itself drive which one is in focus).
// One panel, switched entirely by `selectedKey` - Rail (SignalRail.tsx) now
// owns the click/keyboard handling that sets it, this component only ever
// renders the one stage currently selected.

const PR_BODY_TRUNCATE = 700;

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  head: { display: 'flex', alignItems: 'center', gap: 9 },
  headIcon: { display: 'flex', color: ({ t }) => t.sky, flexShrink: 0 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14.5, color: ({ t }) => t.textHi },
  note: { fontSize: 12.5, fontStyle: 'italic', color: ({ t }) => t.textLo },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  prLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 13.5,
    color: ({ t }) => t.sky,
    textDecoration: 'none',
    '&:hover': { textDecoration: 'underline' },
  },
  body: { fontSize: 12.5, color: ({ t }) => t.textLo, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  chipPos: { alignSelf: 'flex-start' },
  '@keyframes livePulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
  // Amber + pulsing while the canary is live (2026-09-23 feedback).
  resourceList: { display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 },
  resourceRow: { display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', borderRadius: 6, backgroundColor: ({ t }) => t.panelAlt, fontFamily: fontMono, fontSize: 11.5 },
  resourceRowPinned: { border: ({ t }) => `1px solid ${t.skyLine}` },
  resourceDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  resourceKind: { color: ({ t }) => t.sky, fontWeight: 600, minWidth: 80, flexShrink: 0 },
  resourceName: { color: ({ t }) => t.textHi, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  resourceStatus: { color: ({ t }) => t.textFaint, flexShrink: 0 },
  resourceTag: { color: ({ t }) => t.amberInk, fontWeight: 700, flexShrink: 0 },
}));

function guardrailsFallbackNote(delivery: CdDelivery): string {
  if (delivery.pr?.state === 'merged') {
    return 'This PR has merged and is not the most recently merged release for this environment, so Tower no longer refreshes its check results - see the PR itself on GitHub for its check history.';
  }
  if (delivery.commit) {
    return 'Ground-tier environments deploy by direct commit - no release-gate PR to check.';
  }
  return 'Waiting on the release PR to open.';
}

function timeText(at: string | undefined): string {
  return at ? `${relativeTime(at)} · ${formatDateTime(at)}` : 'pending';
}

// GitHub's PR URL and merge-commit URL share the same repo path, just
// `/pull/<n>` vs `/commit/<sha>` - derived rather than a second field/fetch,
// since PullRequestSummary.url is already the exact real repo this commit
// lives in.
function mergeCommitUrl(pr: PullRequestSummary): string | undefined {
  if (!pr.mergeCommitSha) return undefined;
  return pr.url.replace(/\/pull\/\d+$/, `/commit/${pr.mergeCommitSha}`);
}

function reviewLabel(review: PullRequestSummary['review']): string | undefined {
  if (!review || review.state === 'pending') return undefined;
  return review.state === 'approved' ? 'approved' : 'changes requested';
}

function CreatedBody({
  delivery,
  step,
  classes,
}: {
  delivery: CdDelivery;
  step: CdDelivery['steps'][number] | undefined;
  classes: ReturnType<typeof useStyles>;
}) {
  if (delivery.pr) {
    return (
      <>
        <a className={classes.prLink} href={delivery.pr.url} target="_blank" rel="noopener noreferrer">
          <GitPrIcon fontSize={15} />
          PR #{delivery.pr.number}: {delivery.pr.title}
        </a>
        <Typography className={classes.meta}>
          {delivery.pr.author && `opened by ${delivery.pr.author} · `}
          {timeText(step?.at)}
        </Typography>
        {delivery.pr.body ? (
          <Typography className={classes.body}>
            {delivery.pr.body.length > PR_BODY_TRUNCATE ? `${delivery.pr.body.slice(0, PR_BODY_TRUNCATE)}…` : delivery.pr.body}
          </Typography>
        ) : (
          <Typography className={classes.note}>This PR has no description.</Typography>
        )}
      </>
    );
  }
  if (delivery.commit) {
    return (
      <>
        <Typography className={classes.note}>
          Ground-tier environments promote by pushing a commit straight to the gitops branch - there's no PR to show
          for this delivery.
        </Typography>
        <Typography className={classes.meta}>
          {delivery.commit.sha.slice(0, 7)} · {formatDateTime(delivery.commit.date)} · {delivery.commit.imageTag}
        </Typography>
      </>
    );
  }
  return <Typography className={classes.note}>No delivery recorded yet.</Typography>;
}

function MergedBody({
  delivery,
  step,
  gateCi,
  classes,
  onSelectStage,
}: {
  delivery: CdDelivery;
  step: CdDelivery['steps'][number] | undefined;
  gateCi: PullRequestSummary['ci'] | undefined;
  classes: ReturnType<typeof useStyles>;
  onSelectStage: (key: CdStepKey) => void;
}) {
  if (delivery.pr?.state === 'merged') {
    const commitUrl = mergeCommitUrl(delivery.pr);
    return (
      <>
        <TextLink href={delivery.pr.url}>
          <GitPrIcon fontSize={15} />
          PR #{delivery.pr.number} ↗
        </TextLink>
        <Typography className={classes.meta}>
          {timeText(step?.at)}
          {delivery.pr.author && ` · opened by ${delivery.pr.author}`}
        </Typography>
        {commitUrl && (
          <Typography className={classes.meta}>
            merge commit{' '}
            <TextLink href={commitUrl}>{delivery.pr.mergeCommitSha!.slice(0, 7)} ↗</TextLink>
          </Typography>
        )}
        {gateCi && (
          <>
            <StatusChip tone={gateCi.state === 'success' ? 'ok' : 'warn'} className={classes.chipPos}>
              {gateCi.passedChecks}/{gateCi.totalChecks} guardrails passed
            </StatusChip>
            <TextLink onClick={() => onSelectStage('guardrails')}>Guardrail results →</TextLink>
          </>
        )}
      </>
    );
  }
  if (delivery.pr) {
    return (
      <>
        <a className={classes.prLink} href={delivery.pr.url} target="_blank" rel="noopener noreferrer">
          <GitPrIcon fontSize={15} />
          PR #{delivery.pr.number}: {delivery.pr.title}
        </a>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {gateCi && (
            <StatusChip tone={gateCi.state === 'success' ? 'ok' : 'warn'}>
              {gateCi.passedChecks}/{gateCi.totalChecks} guardrails
            </StatusChip>
          )}
          {reviewLabel(delivery.pr.review) && (
            <StatusChip tone={delivery.pr.review?.state === 'approved' ? 'ok' : 'warn'}>{reviewLabel(delivery.pr.review)}</StatusChip>
          )}
        </div>
        <div>
          <Button
            small
            disabled
            title="Not yet available - merging a PR is a Tier 2 write action pending the authorization model in HANDOFF-tower-write-actions.md. Merge on GitHub directly for now."
          >
            Merge PR
          </Button>
        </div>
      </>
    );
  }
  return <Typography className={classes.note}>Not merged yet.</Typography>;
}

function healthyNote(step: CdDelivery['steps'][number] | undefined): string {
  if (step?.status === 'good') return `Healthy since ${timeText(step.at)}.`;
  if (step?.status === 'bad') return 'ArgoCD reports this degraded - see the banner above for detail.';
  return 'Not finished yet.';
}


export function StageDetail({
  delivery,
  selectedKey,
  gateCi,
  argoOperationMessage,
  argoResources,
  targetImageTag,
  env,
  rolloutProgress,
  onSelectStage,
}: {
  delivery: CdDelivery;
  selectedKey: CdStepKey;
  // Same PR.ci the DAG's guardrails gate-chip reads - real for an open
  // release PR, and now also for the single most recently merged one (see
  // packages/backend/src/pullRequests.ts's own comment on why only that
  // one) so guardrail results "retain even after the PR is merged"
  // (2026-09-16 feedback).
  gateCi: PullRequestSummary['ci'] | undefined;
  argoOperationMessage?: string;
  argoResources?: ArgoResourceNode[];
  targetImageTag?: string;
  // The env's own live workload - only consulted by the 'progressing'
  // branch, to render the canary ramp chart (2026-09-16: "I want the canary
  // panel to be part of the 'Rollout Starts' stage").
  env: EnvironmentSummary;
  rolloutProgress?: CanaryProgress;
  onSelectStage: (key: CdStepKey) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const railClasses = useSignalRailStyles({ t });
  const step = delivery.steps.find(s => s.key === selectedKey);

  if (selectedKey === 'created') {
    return (
      <>
        <div className={classes.head}>
          <span className={classes.headIcon}>
            <GitPrIcon fontSize={18} />
          </span>
          <Typography className={classes.title}>{delivery.pr ? 'PR created' : 'Direct commit'}</Typography>
        </div>
        <CreatedBody delivery={delivery} step={step} classes={classes} />
      </>
    );
  }

  if (selectedKey === 'guardrails') {
    return (
      <>
        <div className={classes.head}>
          <span className={classes.headIcon}>
            <SecurityIcon fontSize="small" />
          </span>
          <Typography className={classes.title}>Guardrails</Typography>
        </div>
        <Typography className={classes.meta}>{timeText(step?.at)}</Typography>
        {gateCi?.checks ? (
          <GateLedger ci={gateCi} classes={railClasses} t={t} />
        ) : (
          <Typography className={classes.note}>{guardrailsFallbackNote(delivery)}</Typography>
        )}
      </>
    );
  }

  if (selectedKey === 'merged') {
    return (
      <>
        <div className={classes.head}>
          <span className={classes.headIcon}>
            <GitPrIcon fontSize={18} />
          </span>
          <Typography className={classes.title}>PR merged</Typography>
        </div>
        <MergedBody delivery={delivery} step={step} gateCi={gateCi} classes={classes} onSelectStage={onSelectStage} />
      </>
    );
  }

  if (selectedKey === 'synced') {
    const resources = argoResources ?? [];
    const rollout = resources.find(r => r.kind === 'Rollout');
    const outOfSync = resources.filter(r => r.syncStatus && r.syncStatus !== 'Synced');
    const rest = resources.filter(r => r !== rollout && r.syncStatus && r.syncStatus !== 'Synced');
    return (
      <>
        <div className={classes.head}>
          <span className={classes.headIcon}>
            <SyncIcon fontSize="small" />
          </span>
          <Typography className={classes.title}>Application sync</Typography>
        </div>
        {step?.status === 'bad' && (
          <StatusChip tone="bad" className={classes.chipPos}>
            sync operation failed
          </StatusChip>
        )}
        <Typography className={classes.meta}>{timeText(step?.at)}</Typography>
        {targetImageTag && <Typography className={classes.meta}>target image: {targetImageTag}</Typography>}
        {argoOperationMessage && <Typography className={classes.body}>{argoOperationMessage}</Typography>}
        {resources.length === 0 && <Typography className={classes.note}>No resource tree reported yet.</Typography>}
        {resources.length > 0 && outOfSync.length === 0 && (
          <Typography className={classes.note}>All {resources.length} managed resources synced.</Typography>
        )}
        {resources.length > 0 && outOfSync.length > 0 && (
          <div className={classes.resourceList}>
            {rollout && (
              <div className={`${classes.resourceRow} ${classes.resourceRowPinned}`}>
                <span
                  className={classes.resourceDot}
                  style={{ backgroundColor: rollout.syncStatus === 'Synced' ? t.good : t.amber }}
                />
                <span className={classes.resourceKind}>{rollout.kind}</span>
                <span className={classes.resourceName}>{rollout.name}</span>
                {targetImageTag && <span className={classes.resourceTag}>→ {targetImageTag}</span>}
                <span className={classes.resourceStatus}>{rollout.syncStatus ?? 'Unknown'}</span>
              </div>
            )}
            {rest.map((r, i) => (
              <div key={`${r.kind}-${r.name}-${i}`} className={classes.resourceRow}>
                <span className={classes.resourceDot} style={{ backgroundColor: t.amber }} />
                <span className={classes.resourceKind}>{r.kind}</span>
                <span className={classes.resourceName}>{r.name}</span>
                <span className={classes.resourceStatus}>{r.syncStatus ?? 'Unknown'}</span>
              </div>
            ))}
            <Typography className={classes.note}>
              {outOfSync.length} of {resources.length} resources still out of sync - this list shrinks as ArgoCD
              applies them (refresh above for the latest read).
            </Typography>
          </div>
        )}
      </>
    );
  }

  if (selectedKey === 'progressing') {
    return (
      <>
        <div className={classes.head}>
          <span className={classes.headIcon}>
            <TrendingUpIcon fontSize="small" />
          </span>
          <Typography className={classes.title}>Rollout starts</Typography>
        </div>
        {rolloutControlsFor(env)}
        {rolloutProgress ? (
          <>
            <CanaryRampChart
              cluster={env.cluster}
              namespace={env.namespace}
              rolloutName={env.workload!.name}
              podHash={env.workload!.currentPodHash}
              progress={rolloutProgress}
            />
            <RolloutTopologyDag cluster={env.cluster} namespace={env.namespace} rolloutName={env.workload!.name} stepWeight={rolloutProgress.currentWeight} />
          </>
        ) : (
          <Typography className={classes.note}>
            This environment's workload isn't a canary Rollout (or has no canary steps configured) - nothing to chart
            here.
          </Typography>
        )}
      </>
    );
  }

  // selectedKey === 'healthy'
  return (
    <>
      <div className={classes.head}>
        <span className={classes.headIcon}>
          <CheckCircleIcon fontSize="small" />
        </span>
        <Typography className={classes.title}>Rollout completes</Typography>
      </div>
      <Typography className={classes.note}>{healthyNote(step)}</Typography>
      {rolloutControlsFor(env)}
    </>
  );
}

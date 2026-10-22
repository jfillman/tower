import { useState, type ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import SecurityIcon from '@material-ui/icons/Security';
import SyncIcon from '@material-ui/icons/Sync';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { relativeTime, formatDateTime } from '../../shared/format';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { GateLedger, GitPrIcon, useSignalRailStyles } from '../../SignalRail';
import { CanaryRampChart } from '../../CanaryRampChart';
import { RolloutTopologyDag } from '../../RolloutTopologyDag';
import { RolloutControls } from './RolloutControls';
import type { CdDelivery, CdStepKey } from '../../useCdDelivery';
import { imageTag, type ArgoResourceNode, type CanaryProgress, type EnvironmentSummary } from '../../types';
import type { PullRequestSummary } from '../../pullRequests/usePullRequests';
import { Button, EmptyNote, SectionTitle, StatusChip, TextLink } from '../../ui';
import { PrRef, prFromSummary } from '../../ui/PrRef';

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
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  body: { fontSize: 12, color: ({ t }) => t.textLo, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  chipPos: { alignSelf: 'flex-start' },
  '@keyframes livePulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
  // Amber + pulsing while the canary is live (2026-09-23 feedback).
  resourceList: { display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 },
  resourceRow: { display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', borderRadius: 6, backgroundColor: ({ t }) => t.panelAlt, fontFamily: fontMono, fontSize: 11 },
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
        <PrRef pr={prFromSummary(delivery.pr)} size="card" meta="" />
        <Typography className={classes.meta}>
          {delivery.pr.author && `opened by ${delivery.pr.author} · `}
          {timeText(step?.at)}
        </Typography>
        {delivery.pr.body ? (
          <Typography className={classes.body}>
            {delivery.pr.body.length > PR_BODY_TRUNCATE ? `${delivery.pr.body.slice(0, PR_BODY_TRUNCATE)}…` : delivery.pr.body}
          </Typography>
        ) : (
          <EmptyNote>This PR has no description.</EmptyNote>
        )}
      </>
    );
  }
  if (delivery.commit) {
    return (
      <>
        <EmptyNote>
          Ground-tier environments promote by pushing a commit straight to the gitops branch - there's no PR to show
          for this delivery.
        </EmptyNote>
        <Typography className={classes.meta}>
          {delivery.commit.sha.slice(0, 7)} · {formatDateTime(delivery.commit.date)} · {delivery.commit.imageTag}
        </Typography>
      </>
    );
  }
  return <EmptyNote>No delivery recorded yet.</EmptyNote>;
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
        <PrRef pr={prFromSummary(delivery.pr)} size="inline" />
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
        <PrRef pr={prFromSummary(delivery.pr)} size="card" meta="" />
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
  return <EmptyNote>Not merged yet.</EmptyNote>;
}

/**
 * When a release has not reached this stage yet: the earlier step it is waiting on, and the tag it is waiting to
 * replace. Undefined when the stage is reached, or when what runs now is already this release (2026-10-11: "Rollout
 * starts" showed the previous release's Rollout, unlabelled, while a new release waited for its merge or sync).
 */
export function notStartedFor(
  delivery: CdDelivery,
  stage: 'progressing' | 'healthy',
  releaseTag: string | undefined,
  runningTag: string | undefined,
): { waitingFor: string } | undefined {
  const idx = delivery.steps.findIndex(s => s.key === stage);
  const step = delivery.steps[idx];
  if (!step || step.status !== 'pending') return undefined;
  if (!releaseTag || releaseTag === runningTag) return undefined;
  const blocking = delivery.steps.slice(0, idx).find(s => s.status !== 'good');
  return { waitingFor: blocking?.label ?? 'the earlier steps' };
}

/** What runs now, folded away under a label naming it, when the selected release has not reached this stage. */
function NotStarted({
  releaseTag,
  runningTag,
  waitingFor,
  children,
}: {
  releaseTag: string;
  runningTag: string | undefined;
  waitingFor: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EmptyNote data-testid="stage-not-started">
        Not started for <span style={{ fontFamily: fontMono }}>{releaseTag}</span> yet: waiting for {waitingFor}.
        {runningTag ? (
          <>
            {' '}
            What is shown below is the release running now, <span style={{ fontFamily: fontMono }}>{runningTag}</span>.
          </>
        ) : null}
      </EmptyNote>
      <div>
        <TextLink expanded={open} onClick={() => setOpen(v => !v)}>
          {runningTag ? `Show what is running now (${runningTag})` : 'Show the current Rollout'}
        </TextLink>
      </div>
      {open && children}
    </>
  );
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
          <SectionTitle level={2}>{delivery.pr ? 'PR created' : 'Direct commit'}</SectionTitle>
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
          <SectionTitle level={2}>Guardrails</SectionTitle>
        </div>
        <Typography className={classes.meta}>{timeText(step?.at)}</Typography>
        {gateCi?.checks ? (
          <GateLedger ci={gateCi} classes={railClasses} t={t} />
        ) : (
          <EmptyNote>{guardrailsFallbackNote(delivery)}</EmptyNote>
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
          <SectionTitle level={2}>PR merged</SectionTitle>
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
          <SectionTitle level={2}>Application sync</SectionTitle>
        </div>
        {step?.status === 'bad' && (
          <StatusChip tone="bad" className={classes.chipPos}>
            sync operation failed
          </StatusChip>
        )}
        <Typography className={classes.meta}>{timeText(step?.at)}</Typography>
        {targetImageTag && <Typography className={classes.meta}>target image: {targetImageTag}</Typography>}
        {argoOperationMessage && <Typography className={classes.body}>{argoOperationMessage}</Typography>}
        {resources.length === 0 && <EmptyNote>No resource tree reported yet.</EmptyNote>}
        {resources.length > 0 && outOfSync.length === 0 && (
          <EmptyNote>All {resources.length} managed resources synced.</EmptyNote>
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
            <EmptyNote>
              {outOfSync.length} of {resources.length} resources still out of sync - this list shrinks as ArgoCD
              applies them (refresh above for the latest read).
            </EmptyNote>
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
          <SectionTitle level={2}>Rollout starts</SectionTitle>
        </div>
        {(() => {
          const runningTag = env.image ? imageTag(env.image) : undefined;
          const waiting = notStartedFor(delivery, 'progressing', targetImageTag, runningTag);
          const live = (
            <>
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
                  <RolloutTopologyDag
                    cluster={env.cluster}
                    namespace={env.namespace}
                    rolloutName={env.workload!.name}
                    stepWeight={rolloutProgress.currentWeight}
                  />
                </>
              ) : (
                <EmptyNote>
                  This environment's workload isn't a canary Rollout (or has no canary steps configured) - nothing to
                  chart here.
                </EmptyNote>
              )}
            </>
          );
          return waiting && targetImageTag ? (
            <NotStarted releaseTag={targetImageTag} runningTag={runningTag} waitingFor={waiting.waitingFor}>
              {live}
            </NotStarted>
          ) : (
            live
          );
        })()}
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
        <SectionTitle level={2}>Rollout completes</SectionTitle>
      </div>
      {(() => {
        const runningTag = env.image ? imageTag(env.image) : undefined;
        const waiting = notStartedFor(delivery, 'healthy', targetImageTag, runningTag);
        if (waiting && targetImageTag) {
          return (
            <NotStarted releaseTag={targetImageTag} runningTag={runningTag} waitingFor={waiting.waitingFor}>
              {rolloutControlsFor(env)}
            </NotStarted>
          );
        }
        return (
          <>
            <EmptyNote>{healthyNote(step)}</EmptyNote>
            {rolloutControlsFor(env)}
          </>
        );
      })()}
    </>
  );
}

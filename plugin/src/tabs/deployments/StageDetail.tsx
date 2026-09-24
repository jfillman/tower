import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import SecurityIcon from '@material-ui/icons/Security';
import SyncIcon from '@material-ui/icons/Sync';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import { relativeTime, formatDateTime } from '../../../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import { GateLedger, GitPrIcon, useSignalRailStyles } from '../../SignalRail';
import { CanaryRampChart } from '../../CanaryRampChart';
import { PodLogsView } from '../../PodLogsView';
import type { CdDelivery, CdStepKey } from '../../useCdDelivery';
import type { ArgoResourceNode, CanaryProgress, EnvironmentSummary, PodSummary } from '../../types';
import type { PullRequestSummary } from '../../../pullRequests/usePullRequests';

// Tier 2 rollout controls (Promote/Pause/Resume/...) - UI-ready but disabled
// pending the authorization model HANDOFF-tower-write-actions.md scopes;
// same roadmap-styled treatment as ArgoCommandPanel's Sync w/ Prune/Force
// Sync buttons. Lives here (not DeploymentsTab) now that the canary chart
// itself moved into the "Rollout starts" stage detail (2026-09-16: "I want
// the canary panel to be part of the 'Rollout Starts' stage").
const TIER2_ACTIONS = ['Promote', 'Promote full', 'Pause', 'Resume', 'Retry', 'Restart', 'Abort'];

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
  ctaBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 13,
    padding: '9px 16px',
    borderRadius: 8,
    backgroundColor: ({ t }) => t.skySoft,
    border: ({ t }) => `1px solid ${t.skyLine}`,
    color: ({ t }) => t.sky,
    textDecoration: 'none',
    '&:hover': { backgroundColor: ({ t }) => t.sky, color: ({ t }) => t.bg },
  },
  body: { fontSize: 12.5, color: ({ t }) => t.textLo, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  jumpBtn: {
    alignSelf: 'flex-start',
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    '&:hover': { textDecoration: 'underline' },
  },
  chip: { fontFamily: fontMono, fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 12, alignSelf: 'flex-start' },
  chipOk: { backgroundColor: ({ t }) => t.goodSoft, color: ({ t }) => t.good },
  chipBad: { backgroundColor: ({ t }) => t.badSoft, color: ({ t }) => t.bad },
  chipAmber: { backgroundColor: ({ t }) => t.amberSoft, color: ({ t }) => t.amberInk },
  '@keyframes livePulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
  // Amber + pulsing while the canary is live (2026-09-23 feedback).
  progressBig: { fontFamily: fontMono, fontSize: 20, fontWeight: 700, color: ({ t }) => t.amberInk, animation: '$livePulse 1.6s ease-in-out infinite' },
  resourceList: { display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 },
  resourceRow: { display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', borderRadius: 6, backgroundColor: ({ t }) => t.panelAlt, fontFamily: fontMono, fontSize: 11.5 },
  resourceRowPinned: { border: ({ t }) => `1px solid ${t.skyLine}` },
  resourceDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  resourceKind: { color: ({ t }) => t.sky, fontWeight: 600, minWidth: 80, flexShrink: 0 },
  resourceName: { color: ({ t }) => t.textHi, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  resourceStatus: { color: ({ t }) => t.textFaint, flexShrink: 0 },
  resourceTag: { color: ({ t }) => t.amberInk, fontWeight: 700, flexShrink: 0 },
  rolloutActions: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 4, paddingTop: 12, borderTop: ({ t }) => `1px solid ${t.lineSoft}` },
  btnRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  btn: {
    fontFamily: fontMono,
    fontSize: 11.5,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:disabled': { opacity: 0.5, cursor: 'default' },
  },
  btnRoadmap: { opacity: 0.55, borderStyle: 'dashed', cursor: 'default' },
  roadmapNote: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint },
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
        <a className={classes.ctaBtn} href={delivery.pr.url} target="_blank" rel="noopener noreferrer">
          <GitPrIcon fontSize={16} />
          View PR #{delivery.pr.number} ↗
        </a>
        <Typography className={classes.meta}>
          {timeText(step?.at)}
          {delivery.pr.author && ` · opened by ${delivery.pr.author}`}
        </Typography>
        {commitUrl && (
          <Typography className={classes.meta}>
            merge commit{' '}
            <a className={classes.jumpBtn} style={{ display: 'inline' }} href={commitUrl} target="_blank" rel="noopener noreferrer">
              {delivery.pr.mergeCommitSha!.slice(0, 7)} →
            </a>
          </Typography>
        )}
        {gateCi && (
          <>
            <span className={`${classes.chip} ${gateCi.state === 'success' ? classes.chipOk : classes.chipAmber}`}>
              {gateCi.passedChecks}/{gateCi.totalChecks} guardrails passed
            </span>
            <button type="button" className={classes.jumpBtn} onClick={() => onSelectStage('guardrails')}>
              view full guardrail results →
            </button>
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
            <span className={`${classes.chip} ${gateCi.state === 'success' ? classes.chipOk : classes.chipAmber}`}>
              {gateCi.passedChecks}/{gateCi.totalChecks} guardrails
            </span>
          )}
          {reviewLabel(delivery.pr.review) && (
            <span className={`${classes.chip} ${delivery.pr.review?.state === 'approved' ? classes.chipOk : classes.chipAmber}`}>
              {reviewLabel(delivery.pr.review)}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`${classes.btn} ${classes.btnRoadmap}`}
          disabled
          title="Not yet available - merging a PR is a Tier 2 write action pending the authorization model in HANDOFF-tower-write-actions.md. Merge on GitHub directly for now."
        >
          Merge PR
        </button>
      </>
    );
  }
  return <Typography className={classes.note}>Not merged yet.</Typography>;
}

function progressingNote(step: CdDelivery['steps'][number] | undefined): string {
  if (step?.status === 'good') return `Rollout began ${timeText(step.at)} - see Rollout completes for its current health.`;
  if (step?.status === 'bad') return 'ArgoCD reports this degraded - see the banner above for detail.';
  return 'Waiting for Application sync to finish.';
}

function healthyNote(step: CdDelivery['steps'][number] | undefined): string {
  if (step?.status === 'good') return `Healthy since ${timeText(step.at)}.`;
  if (step?.status === 'bad') return 'ArgoCD reports this degraded - see the banner above for detail.';
  return 'Not finished yet.';
}

// This platform's release-outcome ArgoCD resource hooks (PreSync/PostSync
// Jobs, see gitops-<app>'s own platform-outcome-presync.yaml/platform-
// outcome-postsync.yaml - argocd.argoproj.io/hook: PreSync|PostSync,
// reporting to the outcome-relay) - real objects ArgoCD's own resource tree
// already carries (Argo tracks hook resources the same as any other managed
// resource), so no new fetch, just a name match against the same
// `argoResources` list the rest of this stage already reads (2026-09-16:
// "there's a platform-outcome-presync job that runs... might be cool to
// surface that as part of the App sync stage" / postsync on Rollout
// completes). `hook-delete-policy: BeforeHookCreation` means the PREVIOUS
// sync's hook Job survives until the NEXT sync creates a new one, not
// forever - its absence here just means no sync has run since Tower last
// saw one, not that anything's wrong.
function findHookJob(resources: ArgoResourceNode[] | undefined, namePart: string): ArgoResourceNode | undefined {
  return resources?.find(r => r.kind === 'Job' && r.name.includes(namePart));
}

// A Job's own pods are named `<job-name>-<random-suffix>` by the Job
// controller - no label carried on ArgoCD's own resource-tree entry ties
// them together, so this is a best-effort name-prefix match against
// Tower's own already-fetched, namespace-wide pod list (env.pods - see
// useTowerEnvironments.ts's own podList, which is every pod in the
// namespace, not scoped to the main workload's selector) rather than a new
// fetch. Undefined whenever no pod currently exists for it (hook Jobs get
// pruned per hook-delete-policy, same as findHookJob's own comment).
function hookPod(jobName: string, pods: PodSummary[]): PodSummary | undefined {
  return pods.find(p => p.name.startsWith(`${jobName}-`));
}

function HookRow({
  label,
  job,
  classes,
  t,
  env,
}: {
  label: string;
  job: ArgoResourceNode | undefined;
  classes: ReturnType<typeof useStyles>;
  t: HangarTokens;
  env: EnvironmentSummary;
}) {
  const [showLog, setShowLog] = useState(false);
  if (!job) {
    return <Typography className={classes.note}>{label}: no hook run recorded since Tower's last ArgoCD read.</Typography>;
  }
  const ok = job.health === 'Healthy' || job.syncStatus === 'Synced';
  const pod = hookPod(job.name, env.pods);
  return (
    <div>
      <div className={classes.resourceRow}>
        <span className={classes.resourceDot} style={{ backgroundColor: ok ? t.good : t.amber }} />
        <span className={classes.resourceKind}>{label}</span>
        <span className={classes.resourceName}>{job.name}</span>
        <span className={classes.resourceStatus}>{job.health ?? job.syncStatus ?? 'Unknown'}</span>
      </div>
      {job.message && (
        <Typography className={classes.cellMessage ?? classes.note} style={{ padding: '2px 10px' }}>
          {job.message}
        </Typography>
      )}
      {pod && (
        <>
          <button type="button" className={classes.jumpBtn} style={{ margin: '4px 10px' }} onClick={() => setShowLog(v => !v)}>
            {showLog ? '▾ hide job log' : '▸ show job log'}
          </button>
          {showLog && (
            <div style={{ margin: '0 10px 6px' }}>
              <PodLogsView cluster={env.cluster} namespace={env.namespace} podName={pod.name} containers={pod.containers} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function StageDetail({
  delivery,
  selectedKey,
  gateCi,
  argoOperationMessage,
  argoResources,
  targetImageTag,
  liveProgress,
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
  liveProgress?: string;
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
    const presyncJob = findHookJob(resources, 'platform-outcome-presync');
    return (
      <>
        <div className={classes.head}>
          <span className={classes.headIcon}>
            <SyncIcon fontSize="small" />
          </span>
          <Typography className={classes.title}>Application sync</Typography>
        </div>
        {step?.status === 'bad' && <span className={`${classes.chip} ${classes.chipBad}`}>sync operation failed</span>}
        <Typography className={classes.meta}>{timeText(step?.at)}</Typography>
        {targetImageTag && <Typography className={classes.meta}>target image: {targetImageTag}</Typography>}
        {argoOperationMessage && <Typography className={classes.body}>{argoOperationMessage}</Typography>}
        <div className={classes.resourceList}>
          <HookRow label="PreSync hook" job={presyncJob} classes={classes} t={t} env={env} />
        </div>
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
        {liveProgress ? (
          <Typography className={classes.progressBig}>{liveProgress}</Typography>
        ) : (
          <Typography className={classes.note}>{progressingNote(step)}</Typography>
        )}
        {rolloutProgress ? (
          <>
            <CanaryRampChart
              cluster={env.cluster}
              namespace={env.namespace}
              rolloutName={env.workload!.name}
              podHash={env.workload!.currentPodHash}
              progress={rolloutProgress}
            />
            <div className={classes.rolloutActions}>
              <div className={classes.btnRow}>
                {TIER2_ACTIONS.map(label => (
                  <button key={label} type="button" className={`${classes.btn} ${classes.btnRoadmap}`} disabled>
                    {label}
                  </button>
                ))}
              </div>
              <span className={classes.roadmapNote}>
                Tier 2 — UI-ready, backend route not yet built (see HANDOFF-tower-write-actions.md)
              </span>
            </div>
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
  const postsyncJob = findHookJob(argoResources, 'platform-outcome-postsync');
  return (
    <>
      <div className={classes.head}>
        <span className={classes.headIcon}>
          <CheckCircleIcon fontSize="small" />
        </span>
        <Typography className={classes.title}>Rollout completes</Typography>
      </div>
      <Typography className={classes.note}>{healthyNote(step)}</Typography>
      <div className={classes.resourceList}>
        <HookRow label="PostSync hook" job={postsyncJob} classes={classes} t={t} env={env} />
      </div>
    </>
  );
}

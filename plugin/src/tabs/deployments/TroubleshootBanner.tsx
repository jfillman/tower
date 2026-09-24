import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import type { CdStep } from '../../useCdDelivery';
import type { EnvironmentSummary } from '../../types';

// The plain-language ArgoCD/Rollouts troubleshooting banner
// (HANDOFF-tower-cicd-redesign.md: "the state of the ArgoCD app, and how to
// fix any problem, must be understandable without deep ArgoCD knowledge...
// not just a raw status readout"). A small, ordered rules table - real
// signals only (ArgoCD sync/health, the delivery's own 6-step status, the
// Rollout's own live canary weight), never a fabricated detail like a
// countdown timer this platform has no live source for. First matching rule
// wins; rules are ordered worst/most-specific-first so a real failure is
// never masked by a more generic "looks fine" read further down the list.

export type BannerTone = 'ok' | 'info' | 'bad';

export interface Diagnosis {
  tone: BannerTone;
  title: string;
  body: string;
  // Real work is in flight right now - the banner pulses amber for it.
  live?: boolean;
}

function stepByKey(steps: CdStep[] | undefined, key: CdStep['key']): CdStep | undefined {
  return steps?.find(s => s.key === key);
}

export function diagnose(env: EnvironmentSummary, currentSteps: CdStep[] | undefined): Diagnosis {
  const guardrails = stepByKey(currentSteps, 'guardrails');
  if (guardrails?.status === 'bad') {
    return {
      tone: 'bad',
      title: 'A required guardrail failed',
      body: 'At least one release guardrail on this PR did not pass - see the Release gates panel below for which one and its report. This blocks the merge, so nothing has synced to this environment for this release yet.',
    };
  }

  // The Rollout's own live status.phase - checked directly, ahead of the
  // step-status rule below and the "sync is currently being applied" info
  // rule further down, rather than only inferred from the DAG's derived
  // step status (2026-09-17 bug: "checkout-api-pre-prod's rollout failed...
  // yet there was no notification to the Deployment tab, the canary
  // workflow just stalls" - confirmed live: ArgoCD's own operationPhase can
  // sit 'Running' long after the Rollout itself already went Degraded,
  // which both suppresses the 'progressing'/'healthy' step's own 'bad'
  // status - see useCdDelivery.ts's rolloutFailed comment - AND would
  // otherwise let the "a sync is currently being applied" info-tone rule
  // below mask a real failure as normal in-progress activity). This is the
  // one signal in this whole function that comes straight from Kubernetes,
  // not ArgoCD's Application object, so it can't be stuck the same way.
  if (env.rolloutPhase === 'Degraded') {
    // env.rolloutMessage - Argo Rollouts' own real "why" (status.message,
    // e.g. naming the specific metric/step that failed) - see
    // EnvironmentSummary.rolloutMessage's own comment (2026-09-18: "canary
    // error messages need to surface better" - knowing THAT it's Degraded
    // without knowing WHY was exactly the gap). Falls back to the same
    // generic explanation as before only when Argo Rollouts itself didn't
    // populate a message.
    return {
      tone: 'bad',
      title: 'The canary rollout failed',
      body: env.rolloutMessage
        ? `Argo Rollouts reports this Rollout as Degraded: ${env.rolloutMessage} ArgoCD's own sync status above may still read as still-applying while this settles - that's a separate, secondary symptom, not a different problem.`
        : "Argo Rollouts reports this Rollout as Degraded - the canary did not complete (e.g. a failed analysis run, or a step that never recovered). ArgoCD's own sync status above may still read as still-applying while this settles - that's a separate, secondary symptom, not a different problem. Check the Rollout starts stage below for the step graph and pod logs.",
    };
  }

  const progressing = stepByKey(currentSteps, 'progressing');
  const healthy = stepByKey(currentSteps, 'healthy');
  if (progressing?.status === 'bad' || healthy?.status === 'bad') {
    return {
      tone: 'bad',
      title: `ArgoCD reports this environment as ${env.argoHealthStatus ?? 'Degraded'}`,
      body: env.argoOperationMessage
        ? `Last operation: ${env.argoOperationMessage}`
        : 'This started after the current sync operation finished, so it is a real problem, not a normal mid-apply dip. Try Refresh to re-check live state, or Sync to re-apply.',
    };
  }

  // Checked BEFORE the "sync is currently being applied" rule below (2026-09-23
  // bug: "the info panel doesn't always provide the current canary steps as
  // the canary is progressing") - ArgoCD's sync operation stays phase
  // 'Running' for the whole canary whenever a PostSync hook is waiting on
  // the rollout to go Healthy, so that rule used to mask this one for the
  // entire canary and the live step/weight text below never showed.
  const weight = env.workload?.kind === 'Rollout' ? env.workload.canaryProgress?.currentWeight : undefined;
  const stepIndex = env.workload?.kind === 'Rollout' ? env.workload.canaryProgress?.currentStepIndex : undefined;
  const totalSteps = env.workload?.kind === 'Rollout' ? env.workload.canaryProgress?.steps.length : undefined;
  if (weight !== undefined && weight < 100) {
    const stepText =
      stepIndex !== undefined && totalSteps ? `step ${Math.min(stepIndex + 1, totalSteps)} of ${totalSteps}, ` : '';
    return {
      tone: 'info',
      live: true,
      title: `Canary rollout in progress - ${stepText}${weight}% traffic`,
      body: `The Rollout controller is mid-canary at ${weight}% traffic. ArgoCD reports Synced/Progressing${env.argoOperationPhase === 'Running' ? ' (and its sync operation stays open until the PostSync hook runs after the canary finishes)' : ''} because of this, not because anything failed. No action needed unless this has sat here far longer than the step's own pause/analysis window.`,
    };
  }

  // Only while the DAG itself still says the sync hasn't been applied (2026-09-24
  // bug: "once the canary completed and the 'rollout completes' stage finished,
  // the info panel didn't update. it still has the 'A sync is currently being
  // applied' message") - ArgoCD's operation phase can stay 'Running' well past
  // the point everything is applied (a PostSync hook still pending, or the
  // phase simply never being refreshed), so it can't be trusted alone; the
  // delivery steps already encode the "applied despite Running" evidence
  // (see useCdDelivery's appliedDespiteRunning).
  if (env.argoOperationPhase === 'Running' && stepByKey(currentSteps, 'synced')?.status !== 'good') {
    return {
      tone: 'info',
      live: true,
      title: 'A sync is currently being applied',
      body: "ArgoCD is actively applying this environment's manifests right now - sync/health status below may still read as the previous release's until this finishes.",
    };
  }

  if (env.argoSyncStatus === 'OutOfSync') {
    if (env.argoSyncPolicy?.automated) {
      return {
        tone: 'info',
        title: 'Out of sync, but automated sync is on',
        body: 'ArgoCD should self-heal this shortly on its own poll cycle. If it stays out of sync for more than a few minutes, check the last operation result in the ArgoCD application panel below.',
      };
    }
    return {
      tone: 'bad',
      title: 'Cluster state does not match what git declares',
      body: 'Automated sync is off for this environment, so ArgoCD will not apply this on its own - use Sync above to apply it manually.',
    };
  }

  if (env.argoHealthStatus === undefined && env.argoSyncStatus === undefined) {
    return {
      tone: 'info',
      title: "Couldn't reach ArgoCD for this environment",
      body: 'Sync/health facts elsewhere on this page may be stale rather than wrong - try Refresh, and if this persists it may be an RBAC or connectivity issue rather than a release problem.',
    };
  }

  // A release-outcome hook (platform-outcome-presync/postsync) can fail on
  // its OWN resource-level health while the Application's AGGREGATE sync/
  // health still reads Synced/Healthy - e.g. a PostSync hook that hit
  // DeadlineExceeded, superseded by a later sync that itself succeeded
  // fully, leaving the stale failed hook Job still sitting in the resource
  // tree (hook-delete-policy keeps it until the NEXT hook creation). Without
  // this, that real failure was invisible everywhere: checked here BEFORE
  // the "Synced and healthy" happy path below, so a real problem never gets
  // masked by an otherwise-true "nothing needs attention" (2026-09-16 bug
  // report: "the postsync hook failed with no indication... the app is
  // synced and healthy but the deployment stages don't indicate that").
  const failedHooks = (env.argoResources ?? []).filter(
    r => r.kind === 'Job' && r.name.includes('platform-outcome') && (r.health === 'Degraded' || r.health === 'Missing'),
  );
  if (failedHooks.length > 0) {
    const hook = failedHooks[0];
    return {
      tone: 'bad',
      title: `${hook.name} failed`,
      body:
        hook.message ??
        `ArgoCD reports this release-outcome hook as ${hook.health}. The Application's own aggregate sync/health can still read fine if a later sync has since succeeded - see its log in the Application sync (or Rollout completes) stage detail for what happened.`,
    };
  }

  if (env.argoHealthStatus === 'Healthy' && env.argoSyncStatus === 'Synced') {
    return {
      tone: 'ok',
      title: 'Synced and healthy',
      body: 'ArgoCD reports this environment matches git and every managed resource is healthy. Nothing needs attention right now.',
    };
  }

  return {
    tone: 'info',
    title: `Sync: ${env.argoSyncStatus ?? 'unknown'} · Health: ${env.argoHealthStatus ?? 'unknown'}`,
    body: 'No specific issue matched the rules above - see the ArgoCD application panel below for the full facts.',
  };
}

function toneColors(t: HangarTokens, tone: BannerTone, live = false): { border: string; bg: string; fg: string; icon: string } {
  // A live (in-flight) info banner goes amber, matching the DAG's own
  // current-step color, instead of the calm sky "info" tone.
  if (live && tone === 'info') return { border: t.amberLine, bg: t.amberSoft, fg: t.amberInk, icon: 'i' };
  switch (tone) {
    case 'ok':
      return { border: '#2c4a37', bg: t.goodSoft, fg: t.good, icon: '✓' };
    case 'bad':
      return { border: t.bad, bg: t.badSoft, fg: t.bad, icon: '!' };
    case 'info':
    default:
      return { border: t.skyLine, bg: t.skySoft, fg: t.sky, icon: 'i' };
  }
}

const useStyles = makeStyles<Theme, { t: HangarTokens; tone: BannerTone; live: boolean }>(() => ({
  '@keyframes livePulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
  livePulse: { animation: '$livePulse 1.6s ease-in-out infinite' },
  banner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '14px 18px',
    borderRadius: 10,
    border: ({ t, tone, live }) => `1px solid ${toneColors(t, tone, live).border}`,
    backgroundColor: ({ t, tone, live }) => toneColors(t, tone, live).bg,
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 12,
    color: ({ t }) => t.bg,
    backgroundColor: ({ t, tone, live }) => toneColors(t, tone, live).fg,
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 3,
    color: ({ t, tone, live }) => toneColors(t, tone, live).fg,
  },
  body: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, lineHeight: 1.55 },
}));

export function TroubleshootBanner({ env, currentSteps }: { env: EnvironmentSummary; currentSteps: CdStep[] | undefined }) {
  const t = useHangarTokens();
  const diagnosis = diagnose(env, currentSteps);
  const classes = useStyles({ t, tone: diagnosis.tone, live: Boolean(diagnosis.live) });
  const icon = toneColors(t, diagnosis.tone, diagnosis.live).icon;
  return (
    <div className={classes.banner}>
      <span className={classes.icon}>{icon}</span>
      <div>
        <Typography className={`${classes.title} ${diagnosis.live ? classes.livePulse : ''}`}>{diagnosis.title}</Typography>
        <Typography className={classes.body}>{diagnosis.body}</Typography>
      </div>
    </div>
  );
}

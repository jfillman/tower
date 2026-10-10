import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import type { CdStep } from '../../useCdDelivery';
import type { EnvironmentSummary } from '../../types';
import { podIssues, warningGroups, type PodIssue, type RawEvent, type RawPod, type WarningGroup } from '../../deployment/problems';
import { relativeTime } from '../../shared/format';
import { NamespaceEvents } from '../../NamespaceEvents';
import { useState } from 'react';

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

/** Warning reasons that stop a rollout on their own. Probe failures and back-offs are left out: they are noise during a normal rollout. */
const BLOCKING_WARNINGS = new Set(['FailedCreate', 'FailedScheduling', 'FailedMount', 'FailedAttachVolume', 'InvalidImageName', 'ErrImagePull']);
/** A blocking warning older than this is history, not the reason a rollout is stuck now. */
const BLOCKING_RECENT_MS = 10 * 60 * 1000;

export function diagnose(env: EnvironmentSummary, currentSteps: CdStep[] | undefined, issues: PodIssue[] = [], warnings: WarningGroup[] = [], now = Date.now()): Diagnosis {
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

  // Pods that cannot start (image pull errors, crash loops, unschedulable, missing config) while the Rollout is not Healthy.
  // None of the rules below can see this: a canary stuck on Pending pods is an ordinary Progressing Rollout, and ArgoCD reports
  // Progressing too, so it used to read as "canary in progress" (or nothing at all) for as long as it stayed stuck.
  if (issues.length > 0 && env.rolloutPhase !== 'Healthy') {
    const total = issues.reduce((n, i) => n + i.pods.length, 0);
    return {
      tone: 'bad',
      title: issues.length === 1 ? issues[0].title : `${issues.length} problems are keeping this environment's pods from running`,
      body: `${total === 1 ? '1 pod is affected' : `${total} pods are affected`}. What Kubernetes reports, and what to try first, is listed below.`,
    };
  }

  // No pod to inspect (a ReplicaSet that cannot create any, a quota, a missing ServiceAccount) but the namespace says why.
  const blocking = warnings.filter(w => BLOCKING_WARNINGS.has(w.reason) && now - w.lastSeen < BLOCKING_RECENT_MS);
  if (issues.length === 0 && blocking.length > 0 && env.rolloutPhase !== 'Healthy') {
    return {
      tone: 'bad',
      title: `Kubernetes is warning: ${blocking[0].reason}`,
      body: `${blocking[0].object}: ${blocking[0].message} ${blocking[0].hint ?? ''}`.trim(),
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
  // the canary is progressing") - an ArgoCD sync operation stays phase
  // 'Running' for the whole canary when the app has a PostSync hook waiting
  // on the rollout to go Healthy, so that rule used to mask this one. The
  // platform's own release-outcome hooks are gone (glidepath ADR-0021 phase
  // 3), but an app can still bring its own.
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
      body: `The Rollout controller is mid-canary at ${weight}% traffic. ArgoCD reports Synced/Progressing because of this, not because anything failed. No action needed unless this has sat here far longer than the step's own pause/analysis window.`,
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

const useDetailStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  details: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 },
  head: { fontFamily: fontMono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: ({ t }) => t.textLo, marginBottom: 4 },
  issue: { borderLeft: ({ t }) => `2px solid ${t.bad}`, paddingLeft: 10 },
  issueTitle: { fontWeight: 600, fontSize: 13, color: ({ t }) => t.textHi },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, lineHeight: 1.5, wordBreak: 'break-word' },
  hint: { fontSize: 12.5, color: ({ t }) => t.textHi, marginTop: 2 },
  warn: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, fontSize: 12, padding: '3px 0' },
  link: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.sky, '&:hover': { textDecoration: 'underline' } },
}));

/** What Kubernetes reports about the pods and the namespace, with a next step for each. */
function ProblemDetails({ env, issues, warnings }: { env: EnvironmentSummary; issues: PodIssue[]; warnings: WarningGroup[] }) {
  const t = useHangarTokens();
  const classes = useDetailStyles({ t });
  const [all, setAll] = useState(false);
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const shownWarnings = showAllWarnings ? warnings : warnings.slice(0, 5);
  return (
    <div className={classes.details} aria-label="What Kubernetes reports">
      {issues.length > 0 && (
        <div>
          <div className={classes.head}>Problems with the pods</div>
          {issues.map(i => (
            <div key={i.key} className={classes.issue} style={{ marginBottom: 8 }}>
              <div className={classes.issueTitle}>
                {i.title} <span className={classes.mono}>({i.pods.length} pod{i.pods.length === 1 ? '' : 's'}: {i.pods.slice(0, 2).join(', ')}{i.pods.length > 2 ? ', …' : ''})</span>
              </div>
              <div className={classes.mono}>{i.detail}</div>
              <div className={classes.hint}>{i.hint}</div>
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <div className={classes.head}>Warnings in the last 30 minutes</div>
          {shownWarnings.map(w => (
            <div key={`${w.reason}-${w.message}`} className={classes.warn}>
              <span className={classes.mono}>
                {w.reason}
                {w.count > 1 ? ` ×${w.count}` : ''}
                <br />
                {relativeTime(new Date(w.lastSeen).toISOString())}
              </span>
              <span>
                <span className={classes.mono}>{w.object}</span>: {w.message}
                {w.hint && <div className={classes.hint}>{w.hint}</div>}
              </span>
            </div>
          ))}
          {warnings.length > 5 && (
            <button type="button" className={classes.link} onClick={() => setShowAllWarnings(v => !v)}>
              {showAllWarnings ? 'Show fewer warnings' : `Show ${warnings.length - 5} more`}
            </button>
          )}
        </div>
      )}
      <div>
        <button type="button" className={classes.link} onClick={() => setAll(v => !v)} aria-expanded={all}>
          {all ? 'Hide all events' : `Show all events in ${env.namespace}`}
        </button>
        {all && <NamespaceEvents cluster={env.cluster} namespace={env.namespace} />}
      </div>
    </div>
  );
}

export function TroubleshootBanner({
  env,
  currentSteps,
  pods,
  events,
}: {
  env: EnvironmentSummary;
  currentSteps: CdStep[] | undefined;
  /** The environment's pods as the API returned them (for what each one is stuck on). */
  pods?: RawPod[];
  /** The namespace's events, or undefined when they could not be read. */
  events?: RawEvent[];
}) {
  const t = useHangarTokens();
  const now = Date.now();
  const issues = podIssues(pods ?? [], now);
  const warnings = warningGroups(events ?? [], now);
  const diagnosis = diagnose(env, currentSteps, issues, warnings, now);
  const classes = useStyles({ t, tone: diagnosis.tone, live: Boolean(diagnosis.live) });
  const icon = toneColors(t, diagnosis.tone, diagnosis.live).icon;
  // Details are for when something is wrong: with a calm "synced and healthy" nothing extra, even if an old warning is still listed.
  const showDetails = issues.length > 0 || (diagnosis.tone !== 'ok' && warnings.length > 0);
  return (
    <div className={classes.banner}>
      <span className={classes.icon}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography className={`${classes.title} ${diagnosis.live ? classes.livePulse : ''}`}>{diagnosis.title}</Typography>
        <Typography className={classes.body}>{diagnosis.body}</Typography>
        {showDetails && <ProblemDetails env={env} issues={issues} warnings={warnings} />}
      </div>
    </div>
  );
}

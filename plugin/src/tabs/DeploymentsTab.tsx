import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { nicknameForImageTag, useReleaseContext } from '../useReleaseContext';
import { useArgoActions } from '../useReleaseData';
import { useTektonPipelineRuns } from '../tekton/useTektonPipelineRuns';
import { RefreshButton } from '../RefreshButton';
import { PipelineFlow, buildSupplyChainStages } from '../PipelineFlow';
import { Rail, deliveryTag, useSignalRailStyles } from '../SignalRail';
import { EnvPicker, type EnvPickerGroup } from '../EnvPicker';
import { buildCdEnvDelivery, type CdDelivery, type CdStep, type CdStepKey } from '../useCdDelivery';
import { ArgoCommandPanel } from './deployments/ArgoCommandPanel';
import { TroubleshootBanner } from './deployments/TroubleshootBanner';
import { StageDetail } from './deployments/StageDetail';
import {
  envStageRank,
  envTierOf,
  health,
  imageTag as imageTagOf,
  isPreviewEnvName,
  isRolloutActive,
  type EnvironmentSummary,
  type EnvTier,
} from '../types';

// "Ground Control" - the Deployments tab (HANDOFF-tower-cicd-redesign.md,
// concept 6, selected 2026-09-16, reworked twice more same-day per live
// feedback: env picker grouped Ground/Flight with dynamic per-env
// image+slug pills, the ArgoCD panel condensed into an always-visible
// command panel above a notification banner and the DAG, a real timestamp
// fix on the DAG's Rollout starts/completes steps, and a click-driven
// StageDetail panel below the DAG (round 3) that replaced the round-2
// linear "play by play" list - clicking any DAG node now drives which
// stage's real detail shows below it, rather than showing every stage's
// detail at once).

// Ground before Flight (2026-09-16: "is there any way to show the ground
// env linking to the flight env with the arrows?") - matches the real
// promotion direction (dev/Ground promotes UP into staging/prod/Flight),
// so the connector drawn between the two rows (see tierConnector) reads
// top-to-bottom the same way the promotion actually flows. Deliberately
// local to this env picker, not ENV_TIER_DISPLAY_RANK (Topology tab's own
// highest-stakes-first ordering is a different, intentional choice for a
// different view).
const TIER_ORDER: EnvTier[] = ['lower', 'upper'];

// How long the detail panel lingers on a just-completed stage before following the DAG on.
const STAGE_DWELL_MS = 4000;

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  main: { display: 'flex', flexDirection: 'column', gap: 16 },
  // Just the env name (2026-09-16: "there's some redundant text in the
  // header above the argocd command panel... find a better way to indicate
  // which env we're looking at" - the picker above already shows env+
  // cluster+image, and the app name is the entity/page itself, so this is
  // now a single lightweight line, not a second full heading).
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 20, color: ({ t }) => t.textHi },
  // The DAG and its stage-detail panel are one connected unit (2026-09-16:
  // "should the stage details pane actually be connected to the DAG?
  // separated by a horizontal rule or something like that?") - a single
  // bordered container, not two separate cards, since clicking a DAG node
  // drives what's shown below it. dagInner keeps the Rail's own compact
  // padding; stageDetailInner supplies the flex/gap StageDetail's own
  // panel wrapper used to before this merge.
  dagCard: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 10, display: 'flex', flexDirection: 'column' },
  dagInner: { padding: '10px 12px 4px' },
  dagDivider: { border: 'none', borderTop: ({ t }) => `1px solid ${t.lineSoft}`, margin: 0 },
  stageDetailInner: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
  panel: { backgroundColor: ({ t }) => t.panel, border: ({ t }) => `1px solid ${t.line}`, borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 },
  panelTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  note: { fontSize: 12.5, fontStyle: 'italic', padding: '14px 20px', color: ({ t }) => t.textLo },
}));

// The pill's own real image state - the currently-live tag normally, or
// (2026-09-16: "for active deliveries, it changes to show the new image
// being deployed") the incoming release's tag the moment one is in
// flight for this env. `deliveryTag`/`imageTagOf` are the same real
// parsers every other Tower image display already uses - never a guess.
function envPillImage(
  env: EnvironmentSummary,
  delivery: { current?: CdDelivery },
  pipelineRuns: Parameters<typeof nicknameForImageTag>[1],
): { tag?: string; nickname?: string; incoming: boolean } {
  if (delivery.current) {
    const tag = deliveryTag(delivery.current);
    if (tag) return { tag, nickname: nicknameForImageTag(tag, pipelineRuns), incoming: true };
  }
  if (env.image) {
    const tag = imageTagOf(env.image);
    return { tag, nickname: nicknameForImageTag(tag, pipelineRuns), incoming: false };
  }
  return { incoming: false };
}

export function DeploymentsTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const railClasses = useSignalRailStyles({ t });
  const { environments, loading, error, appName, gitopsPrs, pipelineOrder, deployHistory, provenanceByImage, refresh } =
    useReleaseContext();

  const cdEnvs = useMemo(() => environments.filter(e => !isPreviewEnvName(e.env)), [environments]);

  const deliveries = useMemo(
    () =>
      cdEnvs.map(env => ({
        env,
        delivery: buildCdEnvDelivery(
          env.env,
          gitopsPrs,
          env.argoAppName
            ? {
                syncStatus: env.argoSyncStatus,
                healthStatus: env.argoHealthStatus,
                operationStartedAt: env.argoOperationStartedAt,
                operationFinishedAt: env.argoOperationFinishedAt,
                healthSince: env.argoHealthSince,
                operationPhase: env.argoOperationPhase,
                // So buildStepsCore can detect a failed hook resource
                // directly (see its own comment) - 2026-09-16 bug: "the
                // 'App sync' stage is still stuck, it pulses and never
                // sets its timestamp" - operationPhase itself can apparently
                // stay stuck 'Running' forever when a hook Job never
                // resolves cleanly (a real ArgoCD gap: a Kubernetes-level
                // Job deadline failure doesn't always get promptly reflected
                // in operationState.phase), so that alone isn't a reliable
                // failure signal - the Job's own live resource-tree health
                // is.
                resources: env.argoResources,
              }
            : undefined,
          deployHistory.data?.[env.env],
          isRolloutActive(env),
          // The Rollout's own live status.phase - see useCdDelivery.ts's
          // own comment on why a real Rollout-level failure needs to be a
          // distinct signal from ArgoCD's own (sometimes-stuck) operation
          // state (2026-09-17 bug: checkout-api-pre-prod's failed rollout
          // left the DAG stalled with no notification).
          env.rolloutPhase === 'Degraded',
        ),
      })),
    [cdEnvs, gitopsPrs, deployHistory.data],
  );

  // Sequenced in real promotion order (2026-09-16: "arranged sequentially...
  // showing the promotion order"), not just grouped by tier. Ranked off
  // `pipelineOrder.data` - the FULL flat sequence glidepathProvenance.ts's
  // fetchReleasePlan derives from actual pipeline step execution order
  // (or an explicit deploy.promotionOrder) - deliberately NOT
  // pipelineOrder.upper (2026-09-16 bug: "the promotion order is backwards
  // for the flight envs" - confirmed real: that field is literally
  // deploy.upperEnvironments as declared in cicd.yaml, which the backend's
  // own comment already flags as unreliable, e.g. "checkout-api's own copy
  // lists prod before staging"). An env this app's cicd.yaml doesn't
  // declare sorts to the end rather than being dropped.
  const tierGroups = useMemo(() => {
    // envStageRank (types.ts), not an ad hoc lookup against pipelineOrder.data
    // directly - that field arrives from its own separate fetch (usePipelineOrder)
    // and is still undefined for a moment after the tab first mounts. A raw
    // `order.findIndex` against an empty array ranks every env identically
    // (0), so .sort() falls back to whatever order `deliveries` happened to
    // arrive in from the API - not the real promotion order - and then jumps
    // to the correct order the instant pipelineOrder.data actually loads
    // (2026-09-17 bug: "the env picker renders out of order, then after a
    // delay it reorders itself"). envStageRank has its own real fallback
    // (FALLBACK_STAGE_ORDER: dev/staging/prod/production) for exactly this
    // window, matching the same fallback useReleaseContext.ts's own env sort
    // already relies on - so the picker's first render already guesses the
    // right order in the common case, and never visibly re-shuffles once the
    // real data lands (same rank either way for that case).
    const rank = (env: string) => envStageRank(env, pipelineOrder.data);
    return TIER_ORDER.map(tier => {
      return {
        tier,
        items: deliveries
          .filter(d => envTierOf(d.env.env, pipelineOrder) === tier)
          .sort((a, b) => rank(a.env.env) - rank(b.env.env)),
      };
    }).filter(g => g.items.length > 0);
  }, [deliveries, pipelineOrder]);

  const [searchParams] = useSearchParams();
  const linkedEnv = searchParams.get('env') ?? undefined;

  const [selectedEnv, setSelectedEnv] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (selectedEnv && deliveries.some(d => d.env.env === selectedEnv)) return;
    if (linkedEnv && deliveries.some(d => d.env.env === linkedEnv)) {
      setSelectedEnv(linkedEnv);
      return;
    }
    const active = deliveries.find(d => d.delivery.current || isRolloutActive(d.env));
    setSelectedEnv((active ?? deliveries[0])?.env.env);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveries, linkedEnv]);

  // Same "only poll while something's actually in flight" posture as the
  // old CiCdTab.tsx's CD panel - see useReleaseContext's own comment on the
  // real GitHub rate-limit incident this is protecting against.
  const hasActiveDelivery = deliveries.some(d => d.delivery.current);
  useEffect(() => {
    if (!hasActiveDelivery) return undefined;
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveDelivery]);

  const argoActions = useArgoActions();
  const pipelineRuns = useTektonPipelineRuns(appName);

  // The DAG's click-driven stage detail (2026-09-16 feedback round 3:
  // "clicking on each stage and during the deployment progression, the
  // bottom detail section should show the relevant information"; round 4:
  // "I actually want the DAG to dynamically move as the stages progress,
  // switching details as it moves along") - auto-follows whichever step is
  // currently 'current' (or the last step, once a delivery's fully done).
  // A manual click still jumps the detail panel to any stage on demand
  // (StageDetail's own guardrails "view full results" link relies on this),
  // but the next real progress change (a poll tick that moves `current` to
  // a new step) snaps the selection back to whatever's live - that IS "the
  // DAG dynamically moving," not a bug to guard against the way the prior
  // round's "don't reset on poll tick" posture treated it.
  const preSelected = deliveries.find(d => d.env.env === selectedEnv) ?? deliveries[0];
  const preActiveSteps: CdStep[] | undefined = preSelected?.delivery.current?.steps ?? preSelected?.delivery.previous?.steps;
  const liveCurrentKey = preActiveSteps?.find(s => s.status === 'current')?.key;
  const [selectedStepKey, setSelectedStepKey] = useState<CdStepKey | undefined>(undefined);
  const selectedStepKeyRef = useRef<CdStepKey | undefined>(undefined);
  selectedStepKeyRef.current = selectedStepKey;
  const followRef = useRef<{ env?: string; key?: CdStepKey }>({});
  useEffect(() => {
    const target = liveCurrentKey ?? preActiveSteps?.[preActiveSteps.length - 1]?.key;
    const prev = followRef.current;
    followRef.current = { env: selectedEnv, key: target };
    // Dwell (2026-09-23: "if that DAG item completes, pause there for a few
    // seconds before moving the focus to the next... i'd like to see the PR
    // merged info appear on the screen after the PR is merged") - only when
    // the user is actually looking at the step that just finished; anyone
    // viewing some other stage, or a freshly picked env, still snaps
    // immediately. A manual click during the pause wins over the timer.
    const dwell = prev.env === selectedEnv && prev.key !== undefined && prev.key !== target && selectedStepKeyRef.current === prev.key;
    if (!dwell) {
      setSelectedStepKey(target);
      return undefined;
    }
    const id = setTimeout(() => {
      if (selectedStepKeyRef.current === prev.key) setSelectedStepKey(target);
    }, STAGE_DWELL_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEnv, liveCurrentKey]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;
  if (cdEnvs.length === 0) {
    return (
      <div className={classes.main}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <RefreshButton onClick={refresh} />
        </div>
        <EnvPicker
          summary="0 envs"
          groups={TIER_ORDER.map(tier => ({ tier, items: [] }))}
        />
        <Typography className={classes.note}>No environments configured for this app yet.</Typography>
      </div>
    );
  }

  const selected = deliveries.find(d => d.env.env === selectedEnv) ?? deliveries[0];
  const env: EnvironmentSummary = selected.env;
  const delivery = selected.delivery;
  const activeSteps: CdStep[] | undefined = delivery.current?.steps ?? delivery.previous?.steps;

  // No longer gated on `.state === 'open'` - the backend now also enriches
  // the single most recently merged gitops PR with real ci status (see
  // packages/backend/src/pullRequests.ts), so guardrail results "retain
  // even after the PR is merged" (2026-09-16 feedback) rather than
  // vanishing the moment the DAG's own `merged` step goes green.
  const gateCi = (delivery.current ?? delivery.previous)?.pr?.ci;
  // The DAG's own dynamic "(x/8)" count, now on the stage's label itself
  // rather than a separate floating pill above it (2026-09-16: "remove the
  // small (x/8 guardrails) pill... move the x/8 part down to the stage name
  // and make it dynamic like the pill is today").
  const guardrailsLabel = activeSteps?.find(s => s.key === 'guardrails')?.label;
  const guardrailsLabelOverride =
    gateCi && guardrailsLabel ? { key: 'guardrails' as const, text: `${guardrailsLabel} (${gateCi.passedChecks}/${gateCi.totalChecks})` } : undefined;

  const image = env.image;
  const provenance = image ? provenanceByImage[image] : undefined;
  const supplyChainStages = buildSupplyChainStages(provenance?.data, provenance?.loading ?? false);
  const hasSupplyChain = Boolean(provenance) && (provenance!.loading || Boolean(provenance!.data));

  const rolloutProgress = env.workload?.kind === 'Rollout' ? env.workload.canaryProgress : undefined;
  const activeDelivery = delivery.current ?? delivery.previous;
  // Live vs. incoming, kept separate for the command panel (2026-09-24). While a
  // delivery is in flight the image that's LIVE is the one the previous
  // delivery put there (its release PR/commit's own tag - not env.image, which
  // can already read the incoming spec's image once ArgoCD has applied it), so
  // it stays visible until the new one completes; only once nothing's in flight
  // does env.image itself become the answer again.
  const incomingTag = delivery.current ? deliveryTag(delivery.current) : undefined;
  let liveTag: string | undefined;
  if (incomingTag) {
    const priorTag = delivery.previous ? deliveryTag(delivery.previous) : undefined;
    const runningTag = env.image ? imageTagOf(env.image) : undefined;
    liveTag = priorTag ?? (runningTag !== incomingTag ? runningTag : undefined);
  } else if (env.image) {
    liveTag = imageTagOf(env.image);
  }
  const liveImage = liveTag ? { tag: liveTag, nickname: nicknameForImageTag(liveTag, pipelineRuns.runs) } : undefined;
  const incomingImage = incomingTag ? { tag: incomingTag, nickname: nicknameForImageTag(incomingTag, pipelineRuns.runs) } : undefined;

  // Real "step X/Y · Z% now" text for StageDetail's progressing row - only
  // while useCdDelivery has itself already decided this delivery's own
  // "Rollout starts" step is the one currently in flight (status
  // 'current'), the same guard SignalRail's old currentProgressMeta used
  // to avoid showing a PREVIOUS release's canary progress against this
  // one's row.
  const progressingStep = delivery.current?.steps.find(s => s.key === 'progressing');
  const liveProgress =
    progressingStep?.status === 'current' &&
    rolloutProgress?.currentStepIndex !== undefined &&
    rolloutProgress.currentWeight !== undefined
      ? `step ${Math.min(rolloutProgress.currentStepIndex + 1, rolloutProgress.steps.length)}/${rolloutProgress.steps.length} · ${rolloutProgress.currentWeight}% now`
      : undefined;

  const summary = {
    total: cdEnvs.length,
    progressing: deliveries.filter(d => health(d.env) === 'progressing' || isRolloutActive(d.env)).length,
    blocked: deliveries.filter(d => health(d.env) === 'degraded' || d.delivery.current?.steps.some(s => s.status === 'bad'))
      .length,
  };

  const pickerGroups: EnvPickerGroup[] = tierGroups.map(g => ({
    tier: g.tier,
    items: g.items.map(({ env: e, delivery: d }) => {
      const pill = envPillImage(e, d, pipelineRuns.runs);
      return {
        key: e.env,
        envName: e.env,
        cluster: e.cluster,
        health: health(e),
        active: e.env === selectedEnv,
        imageTag: pill.tag,
        imageNickname: pill.nickname,
        incoming: pill.incoming,
        onClick: () => setSelectedEnv(e.env),
      };
    }),
  }));

  return (
    <div className={classes.main}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <RefreshButton onClick={refresh} />
      </div>

      <EnvPicker
        summary={`${summary.total} env${summary.total === 1 ? '' : 's'} · ${summary.progressing} progressing · ${summary.blocked} blocked`}
        groups={pickerGroups}
      />

      <Typography className={classes.title}>{env.env}</Typography>

      <ArgoCommandPanel env={env} argoActions={argoActions} currentImage={liveImage} incomingImage={incomingImage} />

      <TroubleshootBanner env={env} currentSteps={activeSteps} />

      <div className={classes.dagCard}>
        <div className={classes.dagInner}>
          {activeSteps && activeSteps.length > 0 ? (
            <Rail
              steps={activeSteps}
              classes={railClasses}
              t={t}
              labelOverride={guardrailsLabelOverride}
              metaOverride={liveProgress ? { key: 'progressing', text: liveProgress } : undefined}
              selectedKey={selectedStepKey}
              onSelectKey={setSelectedStepKey}
            />
          ) : (
            <Typography className={classes.note}>No delivery recorded for {env.env} yet.</Typography>
          )}
        </div>
        {activeDelivery && selectedStepKey ? (
          <>
            <hr className={classes.dagDivider} />
            <div className={classes.stageDetailInner}>
              <StageDetail
                delivery={activeDelivery}
                selectedKey={selectedStepKey}
                gateCi={gateCi}
                argoOperationMessage={env.argoOperationMessage}
                argoResources={env.argoResources}
                targetImageTag={deliveryTag(activeDelivery)}
                env={env}
                rolloutProgress={rolloutProgress}
                onSelectStage={setSelectedStepKey}
              />
            </div>
          </>
        ) : (
          <>
            <hr className={classes.dagDivider} />
            <div className={classes.stageDetailInner}>
              <Typography className={classes.panelTitle}>Deployment detail</Typography>
              <Typography className={classes.note}>No release PRs found yet for {env.env}.</Typography>
            </div>
          </>
        )}
      </div>

      {hasSupplyChain && (
        <div className={classes.panel}>
          <Typography className={classes.panelTitle}>Supply chain security</Typography>
          <PipelineFlow stages={supplyChainStages} />
          {provenance?.error && <Typography className={classes.note}>Couldn't load supply-chain data: {provenance.error}</Typography>}
        </div>
      )}
    </div>
  );
}

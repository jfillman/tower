import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Typography from '@material-ui/core/Typography';
import WarningRoundedIcon from '@material-ui/icons/WarningRounded';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useHangarTokens } from '../brand/tokens';
import { TowerEmptyState } from '../TowerEmptyState';
import { useReleaseContext } from '../useReleaseContext';
import { ConfigEditor } from '../values/ValuesForm';
import { EnvXrPanel, ConfigMapFilesPanel } from '../values/FlightPanels';
import { useComponentCatalog } from '../values/componentCatalog';
import { useFlightValuesSource } from '../values/sources';
import { useStyles } from '../values/styles';

// Tower's Config tab (2026-09-12, revised 2026-09-13). See glidepathConfig.
// ts's own top comment for the backend half of this design; the summary
// that matters here:
//
//  1. Everything renders/edits gitops-<app>/<cluster>/<env>/values.yaml -
//     this platform's real GitOps source of truth - never a live cluster
//     object. Every save is a real PR (never a direct commit, no exception
//     for any tier - unlike Promote, which does direct-commit lower envs).
//  2. Flight (upper) envs only (item 7) - the env picker below is built
//     from useReleaseContext's pipelineOrder.data.upper, not the full env
//     list Topology/Releases show. Which env is active is deliberately the
//     single most visually prominent thing on this tab (see EnvBanner) -
//     2026-09-13 feedback: "editing the wrong config by accident, despite
//     the PR gate, is problematic."
//  3. Common fields get real form controls, including (as of 2026-09-13)
//     liveness/readiness probes, the service account, and canary steps -
//     the fields that are genuinely open-ended k8s-resource shapes
//     (canaryAnalysis, blueGreen, custom AnalysisTemplates, configMaps/
//     secrets/volumes/jobs, extraManifests, ...) get a YamlBlockEditor with
//     live syntax checking and (for the trickier ones) a real example to
//     start from, instead of a hand-built form for every nested shape.
//  4. Nothing is submitted until every YAML block currently on screen
//     parses, a handful of the chart's own documented invariants hold, AND
//     (as of 2026-09-13) the assembled patch validates against the chart's
//     own real values.schema.json - see validateBeforeSubmit and
//     schemaValidate.ts. The hand-written invariant checks stay alongside
//     the schema check rather than being replaced by it: they exist to give
//     the *specific*, easy-to-fix message that the hand-rolled schema
//     validator doesn't always word as clearly (e.g. schema catches
//     "ingress.host must be at least 1 character" - the hand check catches
//     the same thing but phrases it as "Ingress is enabled but has no host
//     set", which is the message worth showing first).
//  5. The "Catalog resource" panel is this feature's answer to item 5's ask
//     to investigate editing a catalog XR's own spec, not just the Helm
//     values it bootstraps - ApplicationEnvironment's spec has exactly one
//     real (non-identity) field, configMapGenerator, so that's what's
//     wired up. NodeJSApplication (the other example item 5 named) is
//     deliberately NOT here: its spec (devCluster/nodeVersion/
//     packageManager/port/visibility) is app-onboarding state scoped to the
//     dev cluster, not to any one flight environment - out of item 7's
//     flight-only scope, not a gap in this pass.
//  6. Canary steps get a structured builder (Weight/Pause/Analysis rows,
//     reordering, the standard canary-hash args boilerplate generated
//     automatically) whenever the existing steps fit one of those three
//     plain shapes - see parseStepsSimple. A step using anything else
//     (setCanaryScale, experiment, custom args, ...) falls back to the raw
//     YAML editor instead of silently mangling something the builder can't
//     represent; either way is still just `rollout.steps` underneath.

function isProdEnv(env: string): boolean {
  return /^(prod|production)$/i.test(env);
}

export function ConfigTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { owner, appName, pipelineOrder, loading, error } = useReleaseContext();

  // Built directly from cicd.yaml's own declared upper environments
  // (pipelineOrder.upper/upperClusters), NOT by cross-referencing live
  // Kubernetes-discovered `environments` - Config's whole point is editing
  // gitops-<app>/<cluster>/<env>/values.yaml BEFORE anything is necessarily
  // deployed there (2026-09-16 bug: a freshly-declared upper env with
  // `rollout: null` - "I might not want to deploy a container, I might
  // just want to create a job" - has no live workload for Tower to
  // discover yet, so it silently never appeared in this picker at all).
  const flightEnvs = useMemo(() => {
    if (!pipelineOrder.upper) return [];
    return pipelineOrder.upper.map(name => ({
      env: name,
      cluster: pipelineOrder.upperClusters?.[name] ?? '',
    }));
  }, [pipelineOrder.upper, pipelineOrder.upperClusters]);

  // ?env=<name> (the Environments tab links here) preselects that environment.
  const [searchParams] = useSearchParams();
  const [selectedEnv, setSelectedEnv] = useState<string | undefined>(searchParams.get('env') ?? undefined);
  useEffect(() => {
    if (!selectedEnv && flightEnvs.length > 0) setSelectedEnv(flightEnvs[0].env);
  }, [flightEnvs, selectedEnv]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;
  if (!owner || !appName) {
    return (
      <TowerEmptyState
        title="Can't resolve this app's source repo"
        description="App Configuration needs a resolved GitHub owner/repo (from a promoted environment's provenance) to know which gitops-<app> repo to read."
      />
    );
  }
  // 2026-09-16 bug: "there seems to be a refresh/loading issue... it waits
  // a second or two, then reports no configs, then eventually presents all
  // the env's config". Root cause: usePipelineOrder only starts its fetch
  // once owner/appName resolve (both come from useReleaseContext's own
  // provenance-driven repoRef, which itself only settles after
  // `environments` finishes loading) - the render where `loading` above
  // first flips false and owner/appName first become truthy is the SAME
  // render pipelineOrder's effect gets its real (owner, repo) argument for
  // the first time, but React doesn't run that effect until AFTER this
  // paint - so for that one tick, pipelineOrder.loading reads false with no
  // data yet (its state object is still the stale `{loading:false}` from
  // when its argument was undefined). flightEnvs then briefly, wrongly
  // computed as empty before the real fetch had even started. Waiting for
  // pipelineOrder to have EITHER real data OR a real error (checked only
  // once owner/appName are confirmed resolved above, so this can't spin
  // forever if they never do) closes that gap.
  if (pipelineOrder.loading || (!pipelineOrder.data && !pipelineOrder.error)) return <Progress />;
  if (pipelineOrder.error) return <ResponseErrorPanel error={new Error(pipelineOrder.error)} />;
  if (flightEnvs.length === 0) {
    return (
      <TowerEmptyState
        title="No flight environments yet"
        description={`App Configuration only supports flight (upper) environments, and ${appName}'s cicd.yaml doesn't declare any yet. This is expected until CI/CD is set up for this app - it's not an error.`}
      />
    );
  }

  const active = flightEnvs.find(e => e.env === selectedEnv) ?? flightEnvs[0];
  const prod = isProdEnv(active.env);

  return (
    <div>
      {/* 2026-09-13: "it's not clear enough which env's config we're
          editing... editing the wrong config by accident, despite the PR
          gate, is problematic" - this banner (not a small toolbar row) is
          the single most prominent thing on the tab, red for anything named
          prod/production, amber for every other flight env, and the env
          picker itself lives inside it rather than off to the side. */}
      <div className={`${classes.envBanner} ${prod ? classes.envBannerProd : classes.envBannerOther}`}>
        <div className={classes.envBannerLeft}>
          {prod && <WarningRoundedIcon style={{ color: t.bad }} />}
          <Typography className={`${classes.envBannerTitle} ${prod ? classes.envBannerTitleProd : classes.envBannerTitleOther}`}>
            Editing {active.env.toUpperCase()}
          </Typography>
          <select className={classes.select} value={active.env} onChange={e => setSelectedEnv(e.target.value)}>
            {flightEnvs.map(e => (
              <option key={e.env} value={e.env}>
                {e.env} ({e.cluster})
              </option>
            ))}
          </select>
        </div>
        <Typography className={classes.envBannerPath}>
          gitops-{appName}/{active.cluster}/{active.env}/values.yaml
        </Typography>
      </div>
      <EnvXrPanel owner={owner} appName={appName} env={active.env} classes={classes} />
      <ConfigMapFilesPanel owner={owner} appName={appName} cluster={active.cluster} env={active.env} classes={classes} />
      <FlightValuesEditor owner={owner} appName={appName} cluster={active.cluster} env={active.env} prod={prod} />
    </div>
  );
}

function FlightValuesEditor({ owner, appName, cluster, env, prod }: { owner: string; appName: string; cluster: string; env: string; prod: boolean }) {
  const source = useFlightValuesSource({ owner, appName, cluster, env });
  const componentCatalog = useComponentCatalog(owner);
  return <ConfigEditor owner={owner} appName={appName} source={source} componentCatalog={componentCatalog} title={`${env.toUpperCase()} (${cluster})`} prod={prod} layout="side" />;
}

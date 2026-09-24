import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type { Entity } from '@backstage/catalog-model';
import { useTowerEnvironments } from './useTowerEnvironments';
import { useArgoStatusMap } from './useReleaseData';
import { envStageRank, type EnvironmentSummary } from './types';

// The fleet-wide counterpart to useReleaseContext.ts, deliberately narrower:
// only the data that's already "cheap and GitHub-free" (see TowerPage.tsx's
// own comment on useTowerEnvironments vs PR/provenance data) - live
// Kubernetes state (env health, image, replicas) plus live ArgoCD
// health/sync, merged the same way useReleaseContext.ts already does for a
// single app. Deliberately excludes PR status, cosign/SLSA provenance and
// deploy-history - all GitHub-backed and fetch-on-demand-only by design
// (see useReleaseContext.ts's own comment on the real rate-limit incident
// that decision came from). A wallboard meant to stay open indefinitely,
// polling every app in the fleet continuously, must not multiply that GitHub
// load by fleet size.
export interface FleetApp {
  entityRef: string;
  appName: string;
  owner?: string;
  environments: EnvironmentSummary[];
  loading: boolean;
}

// useTowerEnvironments/useArgoStatusMap both resolve via useEntity(), which
// only works inside an EntityProvider - today that's mounted exactly once,
// for whichever single app TowerAppShell has selected. Aggregating across
// every app means mounting one invisible EntityProvider-wrapped probe per
// catalog entity (the same pattern, just multiplied) rather than calling
// hooks in a loop, which the Rules of Hooks forbid outright.
function FleetAppProbe({
  entity,
  onData,
}: {
  entity: Entity;
  onData: (app: FleetApp) => void;
}) {
  return (
    <EntityProvider entity={entity}>
      <FleetAppProbeInner entity={entity} onData={onData} />
    </EntityProvider>
  );
}

function FleetAppProbeInner({
  entity,
  onData,
}: {
  entity: Entity;
  onData: (app: FleetApp) => void;
}) {
  const entityRef = stringifyEntityRef(entity);
  const appName =
    entity.metadata.annotations?.['github.com/project-slug']?.split('/')[1] ?? entity.metadata.name;
  const owner = entity.spec?.owner as string | undefined;
  const { environments: rawEnvironments, loading } = useTowerEnvironments();

  const argoStatusRaw = useArgoStatusMap(
    rawEnvironments.map(e => e.argoAppName).filter((n): n is string => Boolean(n)),
  );

  // Same merge useReleaseContext.ts performs for the single-app tabs (see
  // health()'s own comment on why it needs both the Rollout's own state and
  // ArgoCD's Application-wide health) - duplicated here rather than shared,
  // since useReleaseContext.ts also pulls in the GitHub-backed chain this
  // fleet path deliberately skips.
  const environments = useMemo(
    () =>
      rawEnvironments.map(e => ({
        ...e,
        argoHealthStatus: e.argoAppName ? argoStatusRaw[e.argoAppName]?.healthStatus : undefined,
        argoSyncStatus: e.argoAppName ? argoStatusRaw[e.argoAppName]?.syncStatus : undefined,
      })),
    [rawEnvironments, argoStatusRaw],
  );

  useEffect(() => {
    onData({ entityRef, appName, owner, environments, loading });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityRef, appName, owner, loading, environments]);

  // No visual output - this component exists purely to run the per-entity
  // hooks the EntityProvider context requires, and report the result up.
  return null;
}

export interface UseFleetEnvironmentsResult {
  apps: FleetApp[];
  loading: boolean;
  // Invisible probe components the caller must mount somewhere in the tree
  // (they render null) - without this, none of the per-entity hooks above
  // ever run.
  probes: ReactNode;
}

export function useFleetEnvironments(roster: Entity[]): UseFleetEnvironmentsResult {
  const [byRef, setByRef] = useState<Record<string, FleetApp>>({});

  const handleData = useCallback((app: FleetApp) => {
    setByRef(prev => ({ ...prev, [app.entityRef]: app }));
  }, []);

  const probes = (
    <>
      {roster.map(entity => (
        <FleetAppProbe key={stringifyEntityRef(entity)} entity={entity} onData={handleData} />
      ))}
    </>
  );

  const apps = useMemo(
    () =>
      roster
        .map(e => byRef[stringifyEntityRef(e)])
        .filter((a): a is FleetApp => Boolean(a)),
    [roster, byRef],
  );

  // Deliberately just "has every entity reported at least once", NOT "has
  // every entity's own useTowerEnvironments finished its full first load"
  // (apps.some(a => a.loading)) - tried live and reverted. That stronger
  // check hung the whole fleet dashboard indefinitely (confirmed: both
  // layouts stuck on the loading spinner past 90s) because at least one real
  // catalog entity in this sandbox never flips its own `loading` to false -
  // most likely one of useTowerEnvironments's 4 custom-resource watches
  // (Rollout/HTTPRoute/Gateway/PDB) sitting on a CRD that isn't installed on
  // whichever cluster that entity lives on, which this Kubernetes-plugin
  // version appears to treat as perpetually loading rather than a clean
  // empty/error result. The real cost of the simpler check below is only a
  // brief "0 environments" flash right after mount that self-corrects within
  // a few seconds as each app's real data actually arrives (byRef updates
  // trigger a re-render regardless of this loading flag) - far cheaper than
  // a dashboard that can hang forever on one straggler app.
  const loading = apps.length < roster.length;

  return { apps, loading, probes };
}

// The fleet dashboards' env columns: the UNION of environment names seen
// across every app, ordered by envStageRank's own generic fallback order
// (dev/staging/prod/production - see types.ts) since the real per-app
// promotionOrder is GitHub-backed (usePipelineOrder(repoRef) in
// useReleaseContext.ts) and deliberately not fetched fleet-wide. An app
// whose real pipeline uses env names outside that fallback (e.g. "test" or
// "pre-prod") still gets a column, just ranked by types.ts's own tie-break
// (alphabetical) rather than its true position - a disclosed simplification,
// not a bug, tracked as the reason this whole hook exists instead of just
// reusing useReleaseContext.ts.
export function fleetEnvColumns(apps: FleetApp[]): string[] {
  const names = new Set<string>();
  apps.forEach(app => app.environments.forEach(e => names.add(e.env)));
  return [...names].sort((a, b) => envStageRank(a) - envStageRank(b) || a.localeCompare(b));
}
